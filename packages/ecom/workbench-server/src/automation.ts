/**
 * Host-side automation authority: request validation, the deployment origin
 * allowlist, per-target serialization, and the event stream the live console
 * reads. It talks to the Electron broker through {@link WorkbenchChannel} and
 * never opens browser targets itself.
 */

import { randomUUID } from 'node:crypto'
import { WorkbenchError, workbenchFailureCode } from './errors.ts'
import type { WorkbenchChannel, WorkbenchChannelStatus } from './channel.ts'
import type {
  WorkbenchAttachRequest,
  WorkbenchAutomationStatus,
  WorkbenchDetachRequest,
  WorkbenchEvalRequest,
  WorkbenchEvalResult,
  WorkbenchEvent,
  WorkbenchOperation,
  WorkbenchTarget,
} from './types.ts'

/** Settings the automation authority applies to every request. */
export interface AutomationSettings {
  /** Whether the deployment lets the workbench drive browser guests. */
  readonly enabled: boolean
  /** Hostnames or `*.domain` suffix rules an attach allowlist must stay inside. */
  readonly allowedHosts: readonly string[]
}

/** Optional authorities for tests. */
export interface AutomationOptions {
  /** Clock used for event timestamps; defaults to `Date.now`. */
  readonly now?: () => number
  /** Run identity generator; defaults to `crypto.randomUUID`. */
  readonly newRunId?: () => string
}

interface RequestOrigin {
  readonly kind: 'origin' | 'suffix'
  readonly host: string
}

interface HostRule {
  readonly kind: 'host' | 'suffix'
  readonly value: string
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

/**
 * Read one attached target from a broker answer.
 * @param value - broker value.
 * @param operation - operation named in the failure.
 * @returns the validated target.
 * @throws {@link WorkbenchError} `workbench/protocol` when the broker answered
 * with another object.
 */
export function parseTarget(value: unknown, operation: string): WorkbenchTarget {
  if (!isRecord(value) || typeof value.targetId !== 'string' || value.targetId.length === 0
    || typeof value.url !== 'string') {
    throw new WorkbenchError('workbench/protocol', 'desktop automation returned an invalid target', { operation })
  }
  return { targetId: value.targetId, url: value.url }
}

/**
 * Read the attached-target list from a broker answer.
 * @param value - broker value.
 * @returns the validated targets.
 * @throws {@link WorkbenchError} `workbench/protocol` when the broker answered
 * with another value.
 */
export function parseTargets(value: unknown): readonly WorkbenchTarget[] {
  if (!Array.isArray(value)) {
    throw new WorkbenchError('workbench/protocol', 'desktop automation returned an invalid target list', { operation: 'targets' })
  }
  const targets: WorkbenchTarget[] = []
  for (const entry of value as readonly unknown[]) targets.push(parseTarget(entry, 'targets'))
  return targets
}

function requestOrigin(entry: string): RequestOrigin {
  if (entry.startsWith('*.')) {
    const domain = entry.slice(2)
    let parsed: URL
    try { parsed = new URL(`https://${domain}`) } catch {
      throw new WorkbenchError('workbench/invalid-request', `automation allowOrigins entry ${entry} is invalid`)
    }
    if (domain.startsWith('.') || domain.endsWith('.') || parsed.hostname !== domain.toLowerCase()) {
      throw new WorkbenchError('workbench/invalid-request', `automation allowOrigins entry ${entry} is invalid`)
    }
    return { kind: 'suffix', host: parsed.hostname }
  }
  let parsed: URL
  try { parsed = new URL(entry) } catch {
    throw new WorkbenchError('workbench/invalid-request', `automation allowOrigins entry ${entry} is invalid`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== entry.toLowerCase()
    || parsed.username !== '' || parsed.password !== '') {
    throw new WorkbenchError('workbench/invalid-request', `automation allowOrigins entry ${entry} is invalid`)
  }
  return { kind: 'origin', host: parsed.hostname }
}

function hostRule(entry: string): HostRule {
  if (entry.startsWith('*.')) {
    const domain = entry.slice(2)
    let parsed: URL
    try { parsed = new URL(`https://${domain}`) } catch {
      throw new Error(`ecom-workbench: invalid allowed host ${entry}`)
    }
    if (domain.startsWith('.') || domain.endsWith('.') || parsed.hostname !== domain.toLowerCase()) {
      throw new Error(`ecom-workbench: invalid allowed host ${entry}`)
    }
    return { kind: 'suffix', value: parsed.hostname }
  }
  let parsed: URL
  try { parsed = new URL(`https://${entry}`) } catch {
    throw new Error(`ecom-workbench: invalid allowed host ${entry}`)
  }
  if (entry.includes('/') || entry.includes(':') || parsed.hostname !== entry.toLowerCase()) {
    throw new Error(`ecom-workbench: invalid allowed host ${entry}`)
  }
  return { kind: 'host', value: parsed.hostname }
}

function withinRule(origin: RequestOrigin, rule: HostRule): boolean {
  if (origin.kind === 'origin') {
    return rule.kind === 'host'
      ? origin.host === rule.value
      : origin.host.endsWith(`.${rule.value}`)
  }
  // A suffix request covers subdomains only, so an exact configured host never
  // covers it; the configured suffix must contain the whole requested subtree.
  return rule.kind === 'suffix' && (origin.host === rule.value || origin.host.endsWith(`.${rule.value}`))
}

/**
 * Validate one deployment allowlist entry at load.
 * @param entries - configured host rules to validate.
 */
export function validateAllowedHosts(entries: readonly string[]): void {
  for (const entry of entries) hostRule(entry)
}

/**
 * Owns automation requests against one provider channel.
 */
export class WorkbenchAutomation {
  private readonly listeners = new Set<(event: WorkbenchEvent) => void>()
  private readonly queues = new Map<string, Promise<void>>()
  private readonly rules: readonly HostRule[]
  private readonly now: () => number
  private readonly newRunId: () => string
  private targetCount: number | null = 0
  private channelStatus: WorkbenchChannelStatus
  private readonly stopEvents: () => void
  private readonly stopStatus: () => void

  /**
   * @param channel - private channel to the automation provider.
   * @param settings - deployment switch and origin allowlist.
   * @param options - clock and run identity overrides.
   */
  constructor(
    private readonly channel: WorkbenchChannel,
    private readonly settings: AutomationSettings,
    options: AutomationOptions = {},
  ) {
    this.rules = settings.allowedHosts.map(hostRule)
    this.now = options.now ?? (() => Date.now())
    this.newRunId = options.newRunId ?? (() => randomUUID())
    this.channelStatus = channel.status
    this.stopEvents = channel.onEvent((event) => {
      if (event.type === 'target-closed') this.targetCount = null
      this.publish(event)
    })
    this.stopStatus = channel.onStatusChange((status) => {
      this.channelStatus = status
      this.publish({ type: 'channel', at: this.now(), available: status.available, connected: status.connected })
    })
  }

  /** Current automation state, without the target count refresh. */
  get status(): WorkbenchAutomationStatus {
    return {
      enabled: this.settings.enabled,
      available: this.channelStatus.available,
      connected: this.channelStatus.connected,
      targets: this.targetCount,
    }
  }

  /**
   * Subscribe to automation lifecycle events.
   * @param listener - receives lifecycle events.
   * @returns unsubscribe callback.
   */
  onEvent(listener: (event: WorkbenchEvent) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Read the attached targets through the broker.
   * @param signal - request cancellation.
   * @returns the broker's targets.
   */
  async targets(signal?: AbortSignal): Promise<readonly WorkbenchTarget[]> {
    this.assertEnabled()
    return await this.run('targets', undefined, true, async () => {
      const value = await this.channel.request('automation/targets', {}, signal)
      const targets = parseTargets(value)
      this.targetCount = targets.length
      return targets
    })
  }

  /**
   * Attach one guest whose origin matches the requested allowlist.
   * @param request - origin allowlist.
   * @param signal - request cancellation.
   * @returns the attached target.
   */
  async attach(request: WorkbenchAttachRequest, signal?: AbortSignal): Promise<WorkbenchTarget> {
    this.assertEnabled()
    const allowOrigins = [...request.allowOrigins]
    const origins = allowOrigins.map(requestOrigin)
    for (const origin of origins) {
      if (this.rules.length > 0 && !this.rules.some(rule => withinRule(origin, rule))) {
        throw new WorkbenchError('workbench/origin-denied',
          `automation allowlist ${allowOrigins.join(', ')} leaves the deployment's allowed hosts`)
      }
    }
    signal?.throwIfAborted()
    return await this.run('attach', undefined, true, async () => {
      const value = await this.channel.request('automation/attach', { allowOrigins }, signal)
      const target = parseTarget(value, 'attach')
      this.targetCount = null
      return target
    })
  }

  /**
   * Evaluate one script inside an attached target. Calls for one target run
   * strictly one after another; a different target proceeds independently.
   * @param request - target, script, and optional broker deadline.
   * @param signal - request cancellation.
   * @returns the JSON-encoded result.
   */
  async evaluate(request: WorkbenchEvalRequest, signal?: AbortSignal): Promise<WorkbenchEvalResult> {
    this.assertEnabled()
    const targetId = request.targetId
    if (typeof targetId !== 'string' || targetId.length === 0) {
      throw new WorkbenchError('workbench/invalid-request', 'automation targetId is required')
    }
    if (typeof request.script !== 'string') {
      throw new WorkbenchError('workbench/invalid-request', 'automation script must be a string', { operation: 'evaluate', targetId })
    }
    if (request.timeoutMs !== undefined && (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)) {
      throw new WorkbenchError('workbench/invalid-request', 'automation timeoutMs must be a positive number', { operation: 'evaluate', targetId })
    }
    signal?.throwIfAborted()
    return await this.enqueue(targetId, () => this.run('evaluate', targetId, true, async () => {
      const value = await this.channel.request('automation/eval', {
        targetId,
        script: request.script,
        ...request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs },
      }, signal)
      return serializeResult(value)
    }))
  }

  /**
   * Stop targeting one guest after calls already queued for it.
   * @param request - target identity.
   * @param signal - request cancellation.
   * @returns null after the broker acknowledged the detach.
   */
  async detach(request: WorkbenchDetachRequest, signal?: AbortSignal): Promise<null> {
    this.assertEnabled()
    const targetId = request.targetId
    if (typeof targetId !== 'string' || targetId.length === 0) {
      throw new WorkbenchError('workbench/invalid-request', 'automation targetId is required', { operation: 'detach' })
    }
    signal?.throwIfAborted()
    await this.enqueue(targetId, () => this.run('detach', targetId, true, async () => {
      await this.channel.request('automation/detach', { targetId }, signal)
      this.targetCount = null
      return null
    }))
    return null
  }

  /**
   * Refresh the attached-target count without adding a live-console run.
   * @param signal - request cancellation.
   * @returns the count, or null when the broker could not be read.
   */
  async refreshTargetCount(signal?: AbortSignal): Promise<number | null> {
    if (!this.settings.enabled || !this.channel.status.available || !this.channel.status.connected) return this.targetCount
    try {
      const value = await this.channel.request('automation/targets', {}, signal)
      this.targetCount = parseTargets(value).length
    } catch (_error) {
      // A status read must not fail the launcher; the count stays unknown.
      this.targetCount = null
    }
    return this.targetCount
  }

  /** Release channel listeners; pending requests belong to the channel. */
  dispose(): void {
    this.stopEvents()
    this.stopStatus()
    this.listeners.clear()
  }

  private assertEnabled(): void {
    if (!this.settings.enabled) {
      throw new WorkbenchError('workbench/disabled', 'browser automation is disabled by the ecom workbench configuration')
    }
  }

  private publish(event: WorkbenchEvent): void {
    for (const listener of [...this.listeners]) {
      try { listener(event) } catch (_error) {
        // A live-console observer cannot break automation dispatch.
      }
    }
  }

  private enqueue<T>(targetId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(targetId) ?? Promise.resolve()
    const next = previous.then(task, task)
    this.queues.set(targetId, next.then(() => undefined, () => undefined))
    return next
  }

  private async run<T>(
    operation: WorkbenchOperation,
    targetId: string | undefined,
    announce: boolean,
    task: () => Promise<T>,
  ): Promise<T> {
    const runId = this.newRunId()
    const startedAt = this.now()
    if (announce) {
      this.publish({ type: 'run-started', at: startedAt, runId, operation,
        ...targetId === undefined ? {} : { targetId } })
    }
    try {
      const value = await task()
      if (announce) {
        this.publish({ type: 'run-finished', at: this.now(), runId, operation, ok: true,
          durationMs: Math.max(0, this.now() - startedAt), ...targetId === undefined ? {} : { targetId } })
      }
      return value
    } catch (error) {
      if (announce) {
        const code = workbenchFailureCode(error)
        this.publish({ type: 'run-finished', at: this.now(), runId, operation, ok: false,
          durationMs: Math.max(0, this.now() - startedAt),
          ...targetId === undefined ? {} : { targetId },
          ...code === undefined ? {} : { code } })
      }
      throw error
    }
  }
}

function serializeResult(value: unknown): WorkbenchEvalResult {
  if (value === undefined) {
    throw new WorkbenchError('workbench/result-not-json', 'automation result is not JSON-serializable', { operation: 'evaluate' })
  }
  let json: string
  try { json = JSON.stringify(value) } catch (_error) {
    // Circular values cannot cross the broker boundary; its own result check
    // has already rejected the call, so this is a defensive translation.
    throw new WorkbenchError('workbench/result-not-json', 'automation result is not JSON-serializable', { operation: 'evaluate' })
  }
  return { json, bytes: Buffer.byteLength(json, 'utf8') }
}
