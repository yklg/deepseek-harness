/**
 * Long-lived owner of the platform console: one browser surface per active
 * platform, its periodic read-only login probe, the one-time login-to-console
 * transition, and the workbench view that shows it. The controller lives for the
 * client plugin's lifetime, so switching the main panel away from the workbench
 * unmounts only the page, never the console guest.
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { BrowserSurface, BrowserSurfaceService } from '@deepseek-ai/dsh-client-ui-sidebar-browser/client'
import { platformById, type PlatformAdapter, type PlatformId, type PlatformLoginState, type PlatformProbe } from './platforms.ts'
import { decideConsoleTransition } from './platform-transition.ts'

/** Which view the workbench panel presents. */
export type ConsoleView = 'select' | 'console'

/** Lifecycle of the active platform surface. */
export type ConsolePhase = 'idle' | 'starting' | 'ready' | 'failed'

/** Workbench state derived from the active platform surface and its login probe. */
export interface ConsoleSnapshot {
  /** Which view the workbench shows; `select` keeps an alive platform in the background. */
  readonly view: ConsoleView
  /** Lifecycle of the active platform surface. */
  readonly phase: ConsolePhase
  /** Platform whose surface is alive, or null before the first open. */
  readonly platformId: PlatformId | null
  /** Login state from the latest successful probe. */
  readonly loginState: PlatformLoginState
  /** True while a login probe is in flight. */
  readonly checking: boolean
  /** Address the active surface currently shows, when it reported one. */
  readonly url: string | undefined
  /** Surface failure (creation, address, or navigation), when it failed. */
  readonly error?: string | undefined
  /** Failure of the latest login probe; the next probe retries automatically. */
  readonly probeError?: string | undefined
}

/**
 * Read one login probe from the platform guest.
 * @param platform - adapter whose probe script is evaluated.
 * @param signal - aborts the read when the platform changes or the controller disposes.
 * @returns the read-only page snapshot.
 */
export type ConsoleProbePort = (platform: PlatformAdapter, signal: AbortSignal) => Promise<PlatformProbe>

/** Construction inputs for {@link ConsoleController}. */
export interface ConsoleControllerOptions {
  /** Browser surface provider from `ctx.browserSurface`; Web shells expose an unavailable service. */
  readonly surface: BrowserSurfaceService
  /** Application origin used by the shared address parser. */
  readonly applicationOrigin: string
  /** Read-only login probe executed through the Host automation broker. */
  readonly probe: ConsoleProbePort
  /** Probe cadence once the surface settles; defaults to 90 seconds. */
  readonly probeIntervalMs?: number
  /** Delay before retrying after a failed probe; defaults to 5 seconds. */
  readonly probeRetryMs?: number
  /** Reserved account dimension; v1 keeps one account per platform. */
  readonly account?: string
}

/** Probe cadence kept inside the product's one-to-two-minute detection window. */
const DEFAULT_PROBE_INTERVAL_MS = 90_000

/** Retry delay after a failed probe so a transient attach failure recovers quickly. */
const DEFAULT_PROBE_RETRY_MS = 5_000

/** Single account shipped in v1; the storage key still carries the reserved dimension. */
const DEFAULT_ACCOUNT = 'default'

/**
 * @param error - failure raised by an asynchronous browser operation.
 * @returns its message, or the string form of a non-Error rejection.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Reusable platform console runtime: surface lifecycle, login probe, and view state. */
export class ConsoleController {
  /** Observable workbench state for the shell console host and the launcher page. */
  readonly state: HostObservable<ConsoleSnapshot>

  private readonly options: ConsoleControllerOptions
  private readonly listeners = new Set<() => void>()
  private snapshot: ConsoleSnapshot = {
    view: 'select', phase: 'idle', platformId: null, loginState: 'unknown', checking: false, url: undefined,
  }
  private surface: BrowserSurface | undefined
  private unsubscribeSurface: (() => void) | undefined
  private host: HTMLElement | undefined
  private unmount: (() => void) | undefined
  private probeAbort: AbortController | undefined
  private probeTimer: ReturnType<typeof setTimeout> | undefined
  private generation = 0
  private lastProbeFailed = false
  /** Whether the current surface already navigated from its login page to the console. */
  private navigatedAfterLogin = false
  private disposed: boolean = false
  private disposal: Promise<void> | undefined

  /**
   * @param options - surface provider, probe, address origin, and probe cadence.
   */
  constructor(options: ConsoleControllerOptions) {
    this.options = options
    this.state = {
      getSnapshot: () => this.snapshot,
      subscribe: (listener) => {
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
      },
    }
  }

  /** Whether this deployment can host a persistent platform guest; resolved when read. */
  get available(): boolean {
    return this.options.surface.available
  }

  /**
   * Open a platform, reusing its live surface when one is already mounted.
   * @param platformId - registered platform identity.
   * @param entryUrl - remembered console address; without one a known signed-in platform opens its console, others their login page.
   * @returns after the previous surface is released and the new one is created.
   */
  async open(platformId: PlatformId, entryUrl?: string): Promise<void> {
    if (this.disposed) return
    const platform = platformById(platformId)
    if (platform === undefined) throw new Error(`console controller: unknown platform "${platformId}"`)
    if (!this.available) {
      this.publish({ view: 'select', phase: 'failed', platformId: null, loginState: 'unknown', checking: false,
        url: undefined, probeError: undefined })
      return
    }
    if (this.snapshot.platformId === platformId && this.surface !== undefined) {
      this.publish({ view: 'console' })
      this.probeNow()
      return
    }
    // A known signed-in session reopens directly on its console; otherwise the login page is the entry.
    const knownLoggedIn = this.snapshot.platformId === platformId && this.snapshot.loginState === 'in'
    const generation = ++this.generation
    this.stopProbe()
    this.publish({ view: 'console', phase: 'starting', platformId, loginState: 'unknown', checking: false,
      url: undefined, error: undefined, probeError: undefined })
    await this.releaseSurface()
    if (this.isStale(generation)) return
    let surface: BrowserSurface
    try {
      surface = this.options.surface.create({
        storageKey: platform.storageKey(this.options.account ?? DEFAULT_ACCOUNT),
        initialUrl: entryUrl
          ?? (knownLoggedIn ? platform.consoleEntry.urls[0] : undefined)
          ?? platform.loginUrl,
        backgroundThrottling: false,
        applicationOrigin: this.options.applicationOrigin,
      })
    } catch (error) {
      this.publish({ phase: 'failed', error: messageOf(error) })
      return
    }
    if (this.isStale(generation)) {
      await surface.dispose()
      return
    }
    this.surface = surface
    this.navigatedAfterLogin = false
    this.unsubscribeSurface = surface.state.subscribe(() => { this.readSurface() })
    this.readSurface()
    if (this.host !== undefined) this.unmount = surface.mount(this.host)
  }

  /**
   * Mount the live surface into a seat element; the seat may outlive surface replacements.
   * @param host - stable container owned by the shell console host.
   * @returns a detach callback that leaves the surface alive.
   */
  mount(host: HTMLElement): () => void {
    if (this.disposed) return () => {}
    this.unmount?.()
    this.unmount = undefined
    this.host = host
    if (this.surface !== undefined) this.unmount = this.surface.mount(host)
    return () => {
      if (this.host !== host) return
      this.unmount?.()
      this.unmount = undefined
      this.host = undefined
    }
  }

  /** Show the platform picker while keeping the current platform guest alive. */
  showSelection(): void {
    if (this.disposed || this.snapshot.platformId === null) return
    this.publish({ view: 'select' })
  }

  /** Re-read the login state when the console becomes visible or the window regains focus. */
  refreshLogin(): void {
    if (this.surface === undefined || this.snapshot.platformId === null || this.snapshot.phase === 'starting') return
    this.scheduleProbe(0)
  }

  /** Retry the failed surface and read the login state again. */
  retry(): void {
    if (this.disposed) return
    if (this.surface !== undefined) {
      this.surface.reload()
      this.probeNow()
      return
    }
    if (this.snapshot.platformId !== null) void this.open(this.snapshot.platformId, this.snapshot.url)
  }

  /**
   * Release the login probe, the live surface, its listeners, and the mounted host.
   * @returns after the probe, surface, listeners, and the mounted host are released; repeated calls join.
   */
  dispose(): Promise<void> {
    if (this.disposal !== undefined) return this.disposal
    this.disposed = true
    this.generation += 1
    this.stopProbe()
    this.disposal = (async () => {
      await this.releaseSurface()
      this.listeners.clear()
    })()
    return this.disposal
  }

  /**
   * @param generation - generation captured before awaiting a browser operation.
   * @param signal - optional cancellation checked together with the generation.
   * @returns whether a newer open or disposal superseded the captured generation.
   */
  private isStale(generation: number, signal?: AbortSignal): boolean {
    return this.disposed || generation !== this.generation || signal?.aborted === true
  }

  /** @param patch - fields to publish; listeners are notified once per publish. */
  private publish(patch: Partial<ConsoleSnapshot>): void {
    if (this.disposed) return
    this.snapshot = { ...this.snapshot, ...patch }
    for (const listener of [...this.listeners]) listener()
  }

  /** Publish the current surface state and schedule the login probe once it settles. */
  private readSurface(): void {
    const surface = this.surface
    if (surface === undefined || this.disposed) return
    const frame = surface.state.getSnapshot()
    const url = frame.target?.url
    if (url !== this.snapshot.url) {
      this.publish({ url })
      // A clean navigation clears a failure that the previous page reported.
      if (frame.error === undefined && this.snapshot.phase === 'failed') this.publish({ phase: 'ready', error: undefined })
    }
    if (frame.error !== undefined) {
      this.publish({ phase: 'failed', error: frame.error.description ?? 'navigation failed' })
      return
    }
    if (url === undefined || frame.loading || frame.targetId === undefined) return
    if (this.snapshot.phase === 'starting') this.publish({ phase: 'ready' })
    this.scheduleProbe(0)
  }

  /** @param delayMs - delay before the next probe; zero reads the settled page immediately. */
  private scheduleProbe(delayMs: number): void {
    if (this.disposed) return
    if (this.probeTimer !== undefined) clearTimeout(this.probeTimer)
    this.probeTimer = setTimeout(() => {
      this.probeTimer = undefined
      void this.probeActive()
    }, delayMs)
  }

  /** Read the login probe once when the surface already settled. */
  private probeNow(): void {
    if (this.surface === undefined || this.snapshot.phase === 'starting') return
    this.scheduleProbe(0)
  }

  /** Run one serialized probe against the active platform. */
  private async probeActive(): Promise<void> {
    if (this.disposed || this.snapshot.checking) return
    const platform = platformById(this.snapshot.platformId ?? '')
    if (platform === undefined || this.surface === undefined) return
    const generation = this.generation
    const controller = new AbortController()
    this.probeAbort = controller
    this.publish({ checking: true })
    try {
      const probe = await this.options.probe(platform, controller.signal)
      if (this.isStale(generation, controller.signal)) return
      this.lastProbeFailed = false
      this.publish({ loginState: platform.loginState(probe), probeError: undefined })
      this.navigateToConsole(platform)
    } catch (error) {
      if (this.isStale(generation, controller.signal)) return
      this.lastProbeFailed = true
      this.publish({ probeError: messageOf(error) })
    } finally {
      if (!this.isStale(generation)) {
        this.probeAbort = undefined
        this.publish({ checking: false })
        this.scheduleProbe(this.lastProbeFailed
          ? this.options.probeRetryMs ?? DEFAULT_PROBE_RETRY_MS
          : this.options.probeIntervalMs ?? DEFAULT_PROBE_INTERVAL_MS)
      }
    }
  }

  /**
   * Execute at most one decided console navigation on the current surface.
   * The surface or probe must be settled; a rejected navigation stays retryable.
   * @param platform - adapter whose console destination the successful probe resolved.
   */
  private navigateToConsole(platform: PlatformAdapter): void {
    const surface = this.surface
    if (surface === undefined) return
    const transition = decideConsoleTransition({
      adapter: platform,
      currentUrl: this.snapshot.url,
      loginState: this.snapshot.loginState,
      navigatedAfterLogin: this.navigatedAfterLogin,
      // Only a settled surface may navigate; a failed surface retries through reload and its next probe.
      starting: this.snapshot.phase !== 'ready',
    })
    if (transition.kind === 'none') return
    if (transition.kind === 'error') {
      this.publish({ probeError: transition.reason === 'no-candidate'
        ? 'console transition: the platform declares no console destination'
        : 'console transition: no legal console destination' })
      return
    }
    try {
      surface.loadUrl(transition.url)
      this.navigatedAfterLogin = true
    } catch (error) {
      // The surface rejected the address before loading it; the one-shot marker stays clear so a refresh retries.
      this.publish({ probeError: messageOf(error) })
    }
  }

  /** Abort the in-flight probe and cancel the pending one. */
  private stopProbe(): void {
    this.probeAbort?.abort()
    this.probeAbort = undefined
    if (this.probeTimer !== undefined) {
      clearTimeout(this.probeTimer)
      this.probeTimer = undefined
    }
  }

  /** @returns after the current surface, its subscription, and its host mount are released. */
  private async releaseSurface(): Promise<void> {
    this.unsubscribeSurface?.()
    this.unsubscribeSurface = undefined
    this.unmount?.()
    this.unmount = undefined
    const surface = this.surface
    this.surface = undefined
    if (surface === undefined) return
    try {
      await surface.dispose()
    } catch (error) {
      // A guest that fails to release must not block the replacement surface; the old one is already detached.
      void error
    }
  }
}
