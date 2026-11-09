/** Main-process ownership, persistent storage partitions, and Host-authorized automation for Sidebar webview guests. */
import { createHash, randomUUID } from 'node:crypto'
import { app, session, type BrowserWindow, type Session, type WebContents } from 'electron'
import type { DesktopBrowserLeaseId, DesktopBrowserOpenRequest, DesktopBrowserReservation } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'
import { DESKTOP_IPC } from './ipc.ts'

/** Maximum automation script accepted by the broker, in UTF-8 bytes. */
export const MAX_AUTOMATION_SCRIPT_BYTES = 64 * 1024

/** Automation call deadline used when the Host supplies none. */
export const DEFAULT_AUTOMATION_TIMEOUT_MS = 3_000

/** Largest automation call deadline the Host may request; larger requests are clamped. */
export const MAX_AUTOMATION_TIMEOUT_MS = 5_000

/** Maximum JSON-encoded automation result size accepted by the broker, in UTF-8 bytes. */
export const MAX_AUTOMATION_RESULT_BYTES = 256 * 1024

/** Stable failure codes delivered to the Host for automation requests. */
export type AutomationErrorCode =
  | 'target/not-found'
  | 'target/ambiguous'
  | 'target/origin-denied'
  | 'target/closed'
  | 'script/too-large'
  | 'script/timeout'
  | 'result/not-json'
  | 'result/too-large'

/** One shell-attached automation target. */
export interface AutomationTarget {
  readonly targetId: DesktopBrowserLeaseId
  readonly url: string
}

/** Why a webview guest stopped serving automation targets. */
export type DesktopBrowserGuestEndReason = 'closed' | 'crashed'

/** Lifecycle notification forwarded to the Host when an automation target ends. */
export interface AutomationLifecycleEvent {
  readonly type: 'target-closed'
  readonly targetId: DesktopBrowserLeaseId
  readonly reason: DesktopBrowserGuestEndReason
}

/** Attach input; `allowOrigins` is validated here because the Host is a wire peer. */
export interface AutomationAttachInput {
  readonly allowOrigins: unknown
}

/** Eval input; every field is validated here because the Host is a wire peer. */
export interface AutomationEvalInput {
  readonly targetId: unknown
  readonly script: unknown
  readonly timeoutMs?: unknown
}

/** Failure of one automation request, carrying the code the Host receives. */
export class AutomationBrokerError extends Error {
  /**
   * @param code - stable failure code.
   * @param message - human-readable detail for the Host and diagnostics.
   */
  constructor(readonly code: AutomationErrorCode, message: string) {
    super(message)
    this.name = 'AutomationBrokerError'
  }
}

interface GuestLease {
  readonly owner: WebContents
  readonly partition: string
  readonly backgroundThrottling: boolean
  attached: boolean
  ended: boolean
  guest?: WebContents
  releaseInput?: () => void
}

interface GuestEndListener {
  (targetId: DesktopBrowserLeaseId, reason: DesktopBrowserGuestEndReason): void
}

interface OriginRule {
  readonly kind: 'origin' | 'suffix'
  readonly value: string
}

interface BrokerTarget {
  readonly allowOrigins: readonly OriginRule[]
  /** Tail of this target's serialized call chain; never rejects. */
  pending: Promise<void>
}

/** Bound the closed-target memory; it only distinguishes late calls from unknown targets. */
const MAX_REMEMBERED_CLOSED_TARGETS = 256

function assertWorkspaceKey(workspace: unknown): string {
  if (typeof workspace !== 'string' || workspace.length === 0 || workspace.length > 4096) {
    throw new Error('desktop browser: a workspace storage identity is required')
  }
  return workspace
}

function assertGuestOptions(options: unknown): boolean {
  if (options === undefined) return true
  if (typeof options !== 'object' || options === null) throw new Error('desktop browser: invalid guest options')
  const value = (options as { backgroundThrottling?: unknown }).backgroundThrottling
  if (value === undefined) return true
  if (typeof value !== 'boolean') throw new Error('desktop browser: backgroundThrottling must be boolean')
  return value
}

function assertTargetId(value: unknown): DesktopBrowserLeaseId {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
    throw new TypeError('desktop automation: a target identity is required')
  }
  return value as DesktopBrowserLeaseId
}

function compileAllowOrigins(input: unknown): readonly OriginRule[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new TypeError('desktop automation: allowOrigins must be a non-empty array')
  }
  const entries: readonly unknown[] = input
  if (entries.length > 64) throw new TypeError('desktop automation: allowOrigins has too many entries')
  return entries.map((entry) => {
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > 512) {
      throw new TypeError('desktop automation: every allowOrigins entry must be a non-empty string')
    }
    if (entry.startsWith('*.')) {
      const domain = entry.slice(2)
      let parsed: URL
      try { parsed = new URL(`https://${domain}`) } catch { throw new TypeError(`desktop automation: invalid allowed domain ${entry}`) }
      if (domain.startsWith('.') || domain.endsWith('.') || parsed.hostname !== domain.toLowerCase()) {
        throw new TypeError(`desktop automation: invalid allowed domain ${entry}`)
      }
      // Subdomains only: '*.example.com' matches 'a.example.com', never 'example.com'.
      return { kind: 'suffix', value: `.${parsed.hostname}` }
    }
    let parsed: URL
    try { parsed = new URL(entry) } catch { throw new TypeError(`desktop automation: invalid allowed origin ${entry}`) }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== entry.toLowerCase()
      || parsed.username !== '' || parsed.password !== '') {
      throw new TypeError(`desktop automation: invalid allowed origin ${entry}`)
    }
    return { kind: 'origin', value: parsed.origin }
  })
}

function originAllowed(value: string, rules: readonly OriginRule[]): boolean {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  // Opaque documents ('about:blank', 'data:') have origin 'null' and never match an allowlist entry.
  if (url.origin === 'null') return false
  return rules.some(rule => rule.kind === 'origin' ? url.origin === rule.value : url.hostname.endsWith(rule.value))
}

/** Owns workspace storage partitions independently from individual tab guests. */
export class DesktopBrowserGuests {
  private readonly configuredPartitions = new Set<string>()
  private readonly leases = new Map<DesktopBrowserLeaseId, GuestLease>()
  private readonly guestEndListeners = new Set<GuestEndListener>()

  /** @param hostUrl - current authenticated DSH Host, which guests cannot request. */
  constructor(private readonly hostUrl: () => string | undefined) {}

  /**
   * Reserve one guest in a workspace's persistent per-workspace partition.
   * @param owner - authenticated primary application WebContents.
   * @param workspace - workspace identity received over IPC.
   * @param options - optional guest throttle policy received over IPC.
   * @returns opaque lease and the persistent partition approved for it.
   */
  acquire(owner: WebContents, workspace: unknown, options: unknown = undefined): DesktopBrowserReservation {
    const key = assertWorkspaceKey(workspace)
    const backgroundThrottling = assertGuestOptions(options)
    const partition = this.partitionFor(key)
    if (!this.configuredPartitions.has(partition)) {
      this.configureSession(session.fromPartition(partition))
      this.configuredPartitions.add(partition)
    }
    const lease = randomUUID() as DesktopBrowserLeaseId
    this.leases.set(lease, { owner, partition, backgroundThrottling, attached: false, ended: false })
    return { lease, partition }
  }

  /**
   * Erase one workspace's guest storage; the workspace keeps the same persistent partition.
   * @param workspace - workspace identity received over IPC.
   * @returns completion after storage data and HTTP cache are cleared.
   */
  async clearStorage(workspace: unknown): Promise<void> {
    const browserSession = session.fromPartition(this.partitionFor(assertWorkspaceKey(workspace)))
    await browserSession.clearStorageData()
    await browserSession.clearCache()
  }

  /**
   * Release only a lease issued to this application window; workspace storage survives.
   * @param owner - authenticated IPC sender.
   * @param id - lease received over IPC.
   */
  async release(owner: WebContents, id: unknown): Promise<void> {
    if (typeof id !== 'string') throw new Error('desktop browser: invalid guest lease')
    const key = id as DesktopBrowserLeaseId
    const lease = this.leases.get(key)
    if (lease === undefined) return
    if (lease.owner !== owner) throw new Error('desktop browser: guest belongs to another window')
    lease.releaseInput?.()
    this.notifyGuestEnd(key, 'closed')
    this.leases.delete(key)
    const guest = lease.guest
    if (guest !== undefined && !guest.isDestroyed()) {
      const destroyed = new Promise<void>((resolve) => { guest.once('destroyed', resolve) })
      guest.close({ waitForBeforeUnload: false })
      await destroyed
    }
  }

  /**
   * Install attachment checks before the application document can create a webview.
   * @param window - primary application window.
   * @param attachInput - attaches native input after guest ownership is verified and returns its disposer.
   */
  bind(window: BrowserWindow, attachInput: (guest: WebContents, name: DesktopBrowserLeaseId) => () => void): void {
    const owner = window.webContents
    owner.on('will-attach-webview', (event, preferences, params) => {
      const id = typeof params.src === 'string' && params.src.startsWith('about:blank#')
        ? params.src.slice('about:blank#'.length) : ''
      const lease = this.leases.get(id as DesktopBrowserLeaseId)
      if (lease === undefined || lease.owner !== owner || lease.attached || params.partition !== lease.partition) {
        event.preventDefault()
        return
      }
      lease.attached = true
      // Keep Electron's allowpopups dispatch flag; the guest handler still denies native windows.
      for (const key of Object.keys(preferences)) {
        if (key !== 'disablePopups') Reflect.deleteProperty(preferences, key)
      }
      Object.assign(preferences, {
        partition: lease.partition,
        backgroundThrottling: lease.backgroundThrottling,
        nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
        contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false,
        webviewTag: false, plugins: false, navigateOnDragDrop: false, disableDialogs: true,
        devTools: !app.isPackaged,
      })
      params.httpreferrer = ''
    })
    owner.on('did-attach-webview', (_event, guest) => {
      let attachedLease: DesktopBrowserLeaseId | undefined
      // The first document is an inert about:blank carrying the approved lease.
      // Bind on the main-process event before the renderer can navigate the ready guest.
      guest.once('dom-ready', () => {
        const url = guest.getURL()
        const id = (url.startsWith('about:blank#') ? url.slice('about:blank#'.length) : '') as DesktopBrowserLeaseId
        const lease = this.leases.get(id)
        if (lease === undefined || lease.owner !== owner || lease.guest !== undefined) {
          guest.close({ waitForBeforeUnload: false })
          return
        }
        lease.guest = guest
        attachedLease = id
        lease.releaseInput = attachInput(guest, id)
        guest.once('destroyed', () => {
          lease.releaseInput?.()
          this.notifyGuestEnd(id, 'closed')
          this.leases.delete(id)
        })
        guest.on('render-process-gone', () => { this.notifyGuestEnd(id, 'crashed') })
      })
      guest.setWindowOpenHandler(({ url, postBody }) => {
        const lease = attachedLease === undefined ? undefined : this.leases.get(attachedLease)
        if (attachedLease !== undefined && lease?.guest === guest && lease.owner === owner && !owner.isDestroyed()
          && postBody === undefined && this.allowedNavigation(url)) {
          const request: DesktopBrowserOpenRequest = { lease: attachedLease, url: new URL(url).href }
          owner.send(DESKTOP_IPC.browserOpenRequested, request)
        }
        return { action: 'deny' }
      })
      guest.on('will-frame-navigate', (event) => {
        if (event.isMainFrame && !this.allowedNavigation(event.url)) event.preventDefault()
      })
      guest.on('will-redirect', (event, url, _inPlace, mainFrame) => {
        if (mainFrame && !this.allowedNavigation(url)) event.preventDefault()
      })
      guest.on('will-attach-webview', (event) => { event.preventDefault() })
      guest.on('login', (event, _details, _authInfo, callback) => { event.preventDefault(); callback() })
    })
    const releaseAll = (): void => {
      for (const [id, lease] of this.leases) {
        if (lease.owner === owner) void this.release(owner, id).catch((error: unknown) => { console.error(error) })
      }
    }
    owner.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
      if (mainFrame && !inPlace) releaseAll()
    })
    owner.on('render-process-gone', releaseAll)
    owner.once('destroyed', releaseAll)
  }

  /**
   * @param listener - receives the lease identity and whether its guest closed or crashed.
   * @returns unsubscribe callback.
   */
  onGuestEnd(listener: GuestEndListener): () => void {
    this.guestEndListeners.add(listener)
    return () => { this.guestEndListeners.delete(listener) }
  }

  /**
   * Live guests the automation broker may target, in acquisition order.
   * @returns attached, undisturbed guest contents with their lease identities.
   */
  automationGuests(): readonly { readonly targetId: DesktopBrowserLeaseId; readonly guest: WebContents }[] {
    const guests: { targetId: DesktopBrowserLeaseId; guest: WebContents }[] = []
    for (const [targetId, lease] of this.leases) {
      const guest = lease.guest
      if (guest === undefined || lease.ended || guest.isDestroyed()) continue
      guests.push({ targetId, guest })
    }
    return guests
  }

  /**
   * @param targetId - lease identity issued by `acquire`.
   * @returns the lease's live guest, or undefined once it stopped serving automation.
   */
  automationGuest(targetId: DesktopBrowserLeaseId): WebContents | undefined {
    const lease = this.leases.get(targetId)
    if (lease === undefined || lease.ended) return undefined
    const guest = lease.guest
    if (guest === undefined || guest.isDestroyed()) return undefined
    return guest
  }

  private partitionFor(workspaceKey: string): string {
    // The hash keeps workspace identities out of Electron's partition directory names.
    return `persist:dsh-sidebar-browser-${createHash('sha256').update(workspaceKey, 'utf8').digest('hex')}`
  }

  private notifyGuestEnd(targetId: DesktopBrowserLeaseId, reason: DesktopBrowserGuestEndReason): void {
    const lease = this.leases.get(targetId)
    if (lease === undefined || lease.ended) return
    lease.ended = true
    for (const listener of [...this.guestEndListeners]) {
      try { listener(targetId, reason) } catch (error) {
        console.error('desktop browser guest-end listener failed', error)
      }
    }
  }

  private configureSession(browserSession: Session): void {
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => { callback(false) })
    browserSession.setPermissionCheckHandler(() => false)
    browserSession.setDevicePermissionHandler(() => false)
    browserSession.setDisplayMediaRequestHandler((_request, callback) => { callback({}) })
    browserSession.on('will-download', (event) => { event.preventDefault() })
    browserSession.webRequest.onBeforeRequest((details, callback) => {
      const url = new URL(details.url)
      const network = ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)
      callback({ cancel: network
        ? url.username !== '' || url.password !== '' || this.isApplicationHost(url)
        : !['about:', 'data:', 'blob:'].includes(url.protocol) })
    })
  }

  private allowedNavigation(value: string): boolean {
    if (!URL.canParse(value)) return false
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && url.username === '' && url.password === ''
      && !this.isApplicationHost(url)
  }

  private isApplicationHost(url: URL): boolean {
    const value = this.hostUrl()
    if (value === undefined) return false
    const host = new URL(value)
    return url.port === host.port
      && (url.hostname === host.hostname || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  }
}

/**
 * Host-authorized automation over already-attached webview guests.
 *
 * The broker never opens targets: the Host can only evaluate inside a guest whose
 * current origin matches the allowlist recorded by `attach`, and every call
 * re-validates the origin because the guest may navigate between calls.
 */
export class AutomationBroker {
  private readonly attachedTargets = new Map<DesktopBrowserLeaseId, BrokerTarget>()
  private readonly closedTargets = new Set<DesktopBrowserLeaseId>()
  private readonly stopListening: () => void

  /**
   * @param guests - lease owner that supplies live guest contents.
   * @param onEvent - receives target lifecycle events for forwarding to the Host; sink failures are logged.
   */
  constructor(
    private readonly guests: DesktopBrowserGuests,
    private readonly onEvent?: (event: AutomationLifecycleEvent) => void,
  ) {
    this.stopListening = guests.onGuestEnd((targetId, reason) => { this.guestEnded(targetId, reason) })
  }

  /**
   * Bind one live guest to an origin allowlist. Re-attaching a bound target replaces
   * its allowlist and keeps its serialized call queue.
   * @param input - Host-supplied allowlist; exact origins and '*.domain' suffix rules are accepted.
   * @returns the bound target identity and its current URL.
   * @throws AutomationBrokerError with `target/not-found` or `target/ambiguous`.
   */
  attach(input: AutomationAttachInput): AutomationTarget {
    const allowOrigins = compileAllowOrigins(input.allowOrigins)
    const matches = this.guests.automationGuests().filter(({ guest }) => originAllowed(guest.getURL(), allowOrigins))
    const match = matches[0]
    if (match === undefined) {
      throw new AutomationBrokerError('target/not-found', 'desktop automation: no guest origin matches the allowlist')
    }
    if (matches.length > 1) {
      throw new AutomationBrokerError('target/ambiguous', 'desktop automation: several guests match the allowlist')
    }
    const previous = this.attachedTargets.get(match.targetId)
    this.attachedTargets.set(match.targetId, { allowOrigins, pending: previous?.pending ?? Promise.resolve() })
    this.closedTargets.delete(match.targetId)
    return { targetId: match.targetId, url: match.guest.getURL() }
  }

  /**
   * Evaluate one script inside an attached target.
   *
   * Calls for the same target run strictly one after another. A script that misses
   * its deadline fails the call, cannot be cancelled, and the queue continues with
   * the next call.
   * @param input - target, script, and optional deadline.
   * @returns the script result after JSON serializability and size validation.
   */
  async evaluate(input: AutomationEvalInput): Promise<unknown> {
    const targetId = assertTargetId(input.targetId)
    const script = input.script
    if (typeof script !== 'string') throw new TypeError('desktop automation: script must be a string')
    if (Buffer.byteLength(script, 'utf8') > MAX_AUTOMATION_SCRIPT_BYTES) {
      throw new AutomationBrokerError('script/too-large', `desktop automation: script exceeds ${String(MAX_AUTOMATION_SCRIPT_BYTES)} bytes`)
    }
    const timeoutMs = automationTimeout(input.timeoutMs)
    const target = this.attachedTargets.get(targetId)
    if (target === undefined) throw this.targetUnavailable(targetId)
    const execution = target.pending.then(
      () => this.execute(targetId, script, timeoutMs),
      // A failed call does not block the next one; the caller of that call received the failure.
      () => this.execute(targetId, script, timeoutMs),
    )
    target.pending = execution.then(
      () => undefined,
      (_error: unknown) => { /* Sequence only; the caller receives this failure. */ },
    )
    return execution
  }

  /**
   * Stop targeting one guest. Unknown identities are ignored so late cleanup is safe.
   * @param targetId - target identity supplied by the Host.
   */
  detach(targetId: unknown): void {
    this.attachedTargets.delete(assertTargetId(targetId))
  }

  /**
   * @returns every attached target with its current URL; eval still re-checks origins.
   */
  targets(): readonly AutomationTarget[] {
    const targets: AutomationTarget[] = []
    for (const targetId of this.attachedTargets.keys()) {
      const guest = this.guests.automationGuest(targetId)
      if (guest === undefined) {
        this.retireTarget(targetId)
        continue
      }
      targets.push({ targetId, url: guest.getURL() })
    }
    return targets
  }

  /** Stop observing guest lifecycle events and forget every target. */
  dispose(): void {
    this.stopListening()
    this.attachedTargets.clear()
    this.closedTargets.clear()
  }

  private async execute(targetId: DesktopBrowserLeaseId, script: string, timeoutMs: number): Promise<unknown> {
    const target = this.attachedTargets.get(targetId)
    if (target === undefined) throw this.targetUnavailable(targetId)
    const guest = this.guests.automationGuest(targetId)
    if (guest === undefined) {
      this.retireTarget(targetId)
      throw new AutomationBrokerError('target/closed', 'desktop automation: target is closed')
    }
    const url = guest.getURL()
    if (!originAllowed(url, target.allowOrigins)) {
      throw new AutomationBrokerError('target/origin-denied', 'desktop automation: target left the approved origins')
    }
    let value: unknown
    try {
      value = await executeWithin(guest.executeJavaScript(script, true), timeoutMs)
    } catch (error) {
      if (error instanceof AutomationBrokerError) throw error
      // Electron rejects a result that cannot cross the context bridge before
      // the value reaches assertSerializableResult; a script error stays a
      // script error and is not rewritten as a result contract failure.
      if (error instanceof Error && error.message.includes('An object could not be cloned')) {
        throw new AutomationBrokerError('result/not-json', 'desktop automation: script result is not JSON-serializable')
      }
      throw error
    }
    assertSerializableResult(value)
    return value
  }

  private targetUnavailable(targetId: DesktopBrowserLeaseId): AutomationBrokerError {
    return this.closedTargets.has(targetId)
      ? new AutomationBrokerError('target/closed', 'desktop automation: target is closed')
      : new AutomationBrokerError('target/not-found', 'desktop automation: target is not attached')
  }

  private retireTarget(targetId: DesktopBrowserLeaseId): void {
    this.attachedTargets.delete(targetId)
    this.rememberClosed(targetId)
  }

  private guestEnded(targetId: DesktopBrowserLeaseId, reason: DesktopBrowserGuestEndReason): void {
    const target = this.attachedTargets.get(targetId)
    this.attachedTargets.delete(targetId)
    this.rememberClosed(targetId)
    if (target === undefined) return
    try { this.onEvent?.({ type: 'target-closed', targetId, reason }) } catch (error) {
      console.error('desktop automation event sink failed', error)
    }
  }

  private rememberClosed(targetId: DesktopBrowserLeaseId): void {
    if (this.closedTargets.has(targetId)) return
    this.closedTargets.add(targetId)
    if (this.closedTargets.size <= MAX_REMEMBERED_CLOSED_TARGETS) return
    const oldest = this.closedTargets.values().next().value
    if (oldest !== undefined) this.closedTargets.delete(oldest)
  }
}

/** Host automation operations routed to one {@link AutomationBroker}. */
export const AUTOMATION_WORKBENCH_OPS = {
  attach: 'automation/attach',
  evaluate: 'automation/eval',
  detach: 'automation/detach',
  targets: 'automation/targets',
} as const

/**
 * Route Host automation requests to one broker.
 * @param broker - automation authority owned by the main process.
 * @returns handler suitable for the Host workbench protocol.
 */
export function createAutomationWorkbenchHandler(
  broker: AutomationBroker,
): (op: string, params: Readonly<Record<string, unknown>>) => Promise<unknown> {
  return async (op, params) => {
    switch (op) {
      case AUTOMATION_WORKBENCH_OPS.attach:
        return broker.attach({ allowOrigins: params['allowOrigins'] })
      case AUTOMATION_WORKBENCH_OPS.evaluate:
        return await broker.evaluate({
          targetId: params['targetId'],
          script: params['script'],
          timeoutMs: params['timeoutMs'],
        })
      case AUTOMATION_WORKBENCH_OPS.detach:
        broker.detach(params['targetId'])
        return null
      case AUTOMATION_WORKBENCH_OPS.targets:
        return broker.targets()
      default:
        throw new Error(`desktop automation: unsupported operation ${op}`)
    }
  }
}

function automationTimeout(value: unknown): number {
  if (value === undefined) return DEFAULT_AUTOMATION_TIMEOUT_MS
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError('desktop automation: timeoutMs must be a positive number')
  }
  return Math.min(MAX_AUTOMATION_TIMEOUT_MS, Math.max(1, Math.floor(value)))
}

async function executeWithin(pending: Promise<unknown>, timeoutMs: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new AutomationBrokerError('script/timeout', `desktop automation: script did not finish within ${String(timeoutMs)} ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

function assertSerializableResult(value: unknown): void {
  // JSON.stringify drops these top-level values instead of encoding them.
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
    throw new AutomationBrokerError('result/not-json', 'desktop automation: script result is not JSON-serializable')
  }
  let serialized: string
  try { serialized = JSON.stringify(value) } catch (_error) {
    // Circular references and BigInt have no JSON encoding; the Host receives a typed failure.
    throw new AutomationBrokerError('result/not-json', 'desktop automation: script result is not JSON-serializable')
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_AUTOMATION_RESULT_BYTES) {
    throw new AutomationBrokerError('result/too-large', `desktop automation: script result exceeds ${String(MAX_AUTOMATION_RESULT_BYTES)} bytes`)
  }
}
