/**
 * Host half of the ecom workbench bundle: the automation authority over the
 * Electron private channel, the read-only Yunying adapter, the model-facing
 * draft tools, and the Remote surface the browser launcher reads.
 * @module @deepseek-ai/dsh-ecom-workbench-server
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import { WorkbenchAutomation, validateAllowedHosts } from './automation.ts'
import { createProcessWorkbenchChannel } from './channel.ts'
import type { WorkbenchChannel } from './channel.ts'
import { YunyingClient } from './yunying.ts'
import { installApprovalPolicy, registerWorkbenchTools } from './tools.ts'
import type {
  WorkbenchAttachRequest,
  WorkbenchDetachRequest,
  WorkbenchEvalRequest,
  WorkbenchEvalResult,
  WorkbenchEvent,
  WorkbenchStatus,
  WorkbenchTarget,
  YunyingCommentPage,
  YunyingCommentsRequest,
  YunyingOverview,
  YunyingProductPage,
  YunyingProductsRequest,
} from './types.ts'

export type * from './types.ts'

/**
 * Workbench configuration grouped by the capability that consumes it.
 * Every group may be omitted from the row; a group that names a field states
 * all of its fields, and every field carries a default in the schema.
 */
export interface Config {
  /** Yunying operations-platform connection. */
  yunying: {
    /** Base URL of the operations platform, as an origin; empty leaves the capability unconfigured. */
    endpoint: string
    /** Operations-platform workspace whose records the workbench reads. */
    workspaceId: string
    /** Optional signing key identity sent with every read. */
    keyId: string
    /** Credential name holding the HMAC signing key. */
    signingKeyEnv: string
    /** Per-attempt deadline for one Yunying read, in milliseconds. */
    requestTimeoutMs: number
    /** Additional attempts after a failed Yunying read. */
    maxRetries: number
  }
  /** Embedded browser automation. */
  browser: {
    /** Whether the workbench may drive the product browser guest. */
    enabled: boolean
    /** Whether browser automation runs without showing its window. */
    headless: boolean
  }
  /** Automation scheduling defaults. */
  automation: {
    /** Maximum concurrently running workbench automations. */
    maxConcurrentRuns: number
    /** Default per-run timeout in seconds. */
    defaultTimeoutSeconds: number
  }
  /** AI assistance used by workbench features. */
  ai: {
    /** Model id the workbench assistants request; an empty value uses the profile default. */
    model: string
    /** Sampling temperature for workbench assistant requests. */
    temperature: number
  }
  /** Policy gates applied to every workbench action. */
  policy: {
    /** Whether actions require explicit user approval before they run. */
    requireApproval: boolean
    /** Hostnames or `*.domain` rules an automation allowlist must stay inside; empty accepts any hostname. */
    allowedHosts: string[]
  }
  /** Workbench record storage. */
  storage: {
    /** Directory holding workbench records; an empty value uses the profile home. */
    root: string
    /** Retention period for stored workbench records, in days. */
    retentionDays: number
  }
}

/** Deployment configuration for the workbench host row. */
export const Config = z.object({
  yunying: z.object({
    endpoint: z.string().default(''),
    workspaceId: z.string().default(''),
    keyId: z.string().default(''),
    signingKeyEnv: z.string().default('YUNYING_SIGNING_KEY'),
    requestTimeoutMs: z.natural().min(1).max(60_000).default(5_000),
    maxRetries: z.natural().min(0).max(5).default(2),
  }),
  browser: z.object({
    enabled: z.boolean().default(false),
    headless: z.boolean().default(true),
  }),
  automation: z.object({
    maxConcurrentRuns: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
    defaultTimeoutSeconds: z.natural().min(1).max(2_147_483_647).default(600),
  }),
  ai: z.object({
    model: z.string().default(''),
    temperature: z.number().min(0).max(2).default(0.2),
  }),
  policy: z.object({
    requireApproval: z.boolean().default(true),
    allowedHosts: z.array(z.string()).default([]),
  }),
  storage: z.object({
    root: z.string().default(''),
    retentionDays: z.natural().min(1).max(Number.MAX_SAFE_INTEGER).default(30),
  }),
})

interface LogEntry {
  readonly seq: number
  readonly event: WorkbenchEvent
}

/** Bounded run/event history the live console replays before live delivery. */
class WorkbenchEventLog {
  private readonly entries: LogEntry[] = []
  private readonly listeners = new Set<(entry: LogEntry) => void>()
  private seq = 0

  /**
   * @param maxEntries - retained history length.
   */
  constructor(private readonly maxEntries: number) {}

  /**
   * @param event - event to retain and deliver.
   */
  publish(event: WorkbenchEvent): void {
    const entry = { seq: ++this.seq, event }
    this.entries.push(entry)
    if (this.entries.length > this.maxEntries) this.entries.shift()
    for (const listener of [...this.listeners]) {
      try { listener(entry) } catch (_error) {
        // One live-console reader cannot break the others.
      }
    }
  }

  /** @returns a copy of the retained history, oldest first. */
  snapshot(): readonly LogEntry[] {
    return [...this.entries]
  }

  /**
   * @param listener - receives each later entry.
   * @returns unsubscribe callback.
   */
  subscribe(listener: (entry: LogEntry) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}

function resolveConfig(config: Config): Config {
  const resolved = Config(config)
  if (resolved.yunying.endpoint !== '') {
    let url: URL
    try { url = new URL(resolved.yunying.endpoint) } catch {
      throw new Error(`ecom-workbench: yunying.endpoint is not a URL: ${resolved.yunying.endpoint}`)
    }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
      || url.origin !== resolved.yunying.endpoint || url.username !== '' || url.password !== '') {
      throw new Error('ecom-workbench: yunying.endpoint must be an https origin (http only for loopback) without a path')
    }
    if (resolved.yunying.workspaceId === '') {
      throw new Error('ecom-workbench: yunying.endpoint requires yunying.workspaceId')
    }
    credentialRef(resolved.yunying.signingKeyEnv)
  } else if (resolved.yunying.workspaceId !== '') {
    throw new Error('ecom-workbench: yunying.workspaceId requires yunying.endpoint')
  }
  validateAllowedHosts(resolved.policy.allowedHosts)
  return resolved
}

/**
 * Workbench host service: `ctx.workbench` locally and `ctx.remote.workbench`
 * from the browser.
 */
export class WorkbenchService extends TypertRemoteService {
  static inject = ['tools']
  static Config = Config

  private readonly resolved: Config
  private readonly channel: WorkbenchChannel
  private readonly automation: WorkbenchAutomation
  private readonly yunying: YunyingClient
  private readonly log = new WorkbenchEventLog(100)

  /**
   * @param ctx - Host context.
   * @param config - resolved deployment configuration.
   * @param channel - private automation channel; tests supply a fake.
   */
  constructor(ctx: Context, config: Config = Config({}), channel: WorkbenchChannel = createProcessWorkbenchChannel()) {
    super(ctx, 'workbench')
    this.resolved = resolveConfig(config)
    this.channel = channel
    this.automation = new WorkbenchAutomation(this.channel, {
      enabled: this.resolved.browser.enabled,
      allowedHosts: this.resolved.policy.allowedHosts,
    })
    this.yunying = new YunyingClient({
      endpoint: this.resolved.yunying.endpoint,
      workspaceId: this.resolved.yunying.workspaceId,
      keyId: this.resolved.yunying.keyId,
      signingKeyEnv: this.resolved.yunying.signingKeyEnv,
      requestTimeoutMs: this.resolved.yunying.requestTimeoutMs,
      maxRetries: this.resolved.yunying.maxRetries,
    }, {
      fetch: globalThis.fetch,
      resolveSigningKey: () => this.resolveSigningKey(),
      logger: { warn: (message) => { this.ctx.logger.warn(message) } },
    })
    this.automation.onEvent((event) => { this.log.publish(event) })
    const status = this.automation.status
    this.log.publish({ type: 'channel', at: Date.now(), available: status.available, connected: status.connected })
  }

  protected [Service.init](): void {
    registerWorkbenchTools(this.ctx)
    installApprovalPolicy(this.ctx, this.resolved.policy.requireApproval)
    this.ctx.effect(() => () => {
      this.automation.dispose()
      this.channel.dispose()
    }, 'ecom-workbench: transport teardown')
  }

  /**
   * Read automation and Yunying availability.
   * @param signal - request cancellation.
   * @returns the current service status.
   */
  @Remote
  async status(signal: AbortSignal): Promise<WorkbenchStatus> {
    const upcoming = this.automation.status
    const targets = await this.automation.refreshTargetCount(signal)
    return {
      automation: { ...upcoming, targets },
      yunying: { configured: this.yunying.configured },
    }
  }

  /**
   * Read every attached automation target.
   * @param signal - request cancellation.
   * @returns the target list.
   */
  @Remote
  async targets(signal: AbortSignal): Promise<readonly WorkbenchTarget[]> {
    return await this.automation.targets(signal)
  }

  /**
   * Attach one browser guest whose origin matches the allowlist.
   * @param request - requested origin rules.
   * @param signal - request cancellation.
   * @returns the attached target.
   */
  @Remote
  async attach(request: WorkbenchAttachRequest, signal: AbortSignal): Promise<WorkbenchTarget> {
    return await this.automation.attach(request, signal)
  }

  /**
   * Evaluate one script in an attached target.
   * @param request - target, script, and optional broker deadline.
   * @param signal - request cancellation.
   * @returns the JSON-encoded result.
   */
  @Remote
  async evaluate(request: WorkbenchEvalRequest, signal: AbortSignal): Promise<WorkbenchEvalResult> {
    return await this.automation.evaluate(request, signal)
  }

  /**
   * Stop targeting one browser guest.
   * @param request - target identity.
   * @param signal - request cancellation.
   * @returns null after the broker acknowledged the detach.
   */
  @Remote
  async detach(request: WorkbenchDetachRequest, signal: AbortSignal): Promise<null> {
    return await this.automation.detach(request, signal)
  }

  /**
   * Stream the retained automation history, then live events.
   * @param signal - ends the stream.
   * @returns workbench events in publication order.
   */
  @Remote({ mode: 'stream' })
  async *events(signal: AbortSignal): AsyncIterable<WorkbenchEvent> {
    signal.throwIfAborted()
    const queue: LogEntry[] = []
    let lastSeq = 0
    let wake: (() => void) | undefined
    let stopped = false
    const stop = this.log.subscribe((entry) => {
      if (entry.seq <= lastSeq) return
      queue.push(entry)
      if (queue.length > 1_000) queue.shift()
      wake?.()
      wake = undefined
    })
    const abort = (): void => {
      stopped = true
      wake?.()
      wake = undefined
    }
    signal.addEventListener('abort', abort, { once: true })
    try {
      const history = this.log.snapshot()
      lastSeq = history.at(-1)?.seq ?? 0
      for (const entry of history) yield entry.event
      while (!stopped) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => { wake = resolve })
          continue
        }
        const entry = queue.shift()
        if (entry === undefined || entry.seq <= lastSeq) continue
        lastSeq = entry.seq
        yield entry.event
      }
    } finally {
      signal.removeEventListener('abort', abort)
      stop()
    }
  }

  /**
   * Read today's Yunying dashboard, when the deployment configured it.
   * @param signal - request cancellation.
   * @returns configured state and dashboard data.
   */
  @Remote
  async overview(signal: AbortSignal): Promise<YunyingOverview> {
    if (!this.yunying.configured) return { configured: false, dashboard: null }
    return await this.yunying.overview(signal)
  }

  /**
   * Read one page of Yunying products.
   * @param request - cursor and page size.
   * @param signal - request cancellation.
   * @returns the product page.
   */
  @Remote
  async products(request: YunyingProductsRequest, signal: AbortSignal): Promise<YunyingProductPage> {
    return await this.yunying.products(request, signal)
  }

  /**
   * Read one page of Yunying comments.
   * @param request - cursor and page size.
   * @param signal - request cancellation.
   * @returns the comment page.
   */
  @Remote
  async comments(request: YunyingCommentsRequest, signal: AbortSignal): Promise<YunyingCommentPage> {
    return await this.yunying.comments(request, signal)
  }

  private async resolveSigningKey(): Promise<string | undefined> {
    const name = this.resolved.yunying.signingKeyEnv
    if (name === '') return undefined
    const credentials = this.ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(credentialRef(name))
      if (hit !== undefined && hit.value.length > 0) return hit.value
    }
    const ambient = process.env[name]
    return ambient === undefined || ambient.length === 0 ? undefined : ambient
  }
}

export default WorkbenchService
