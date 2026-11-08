/**
 * Browser-side stores behind the launcher and live console: service status,
 * the Yunying overview, and a throttled fold of the Host automation stream.
 * Streams open only while a surface reads them.
 */

import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchEvent, WorkbenchStatus, YunyingOverview } from '@deepseek-ai/dsh-ecom-workbench-server/types'

/** One open Host event stream. */
export interface WorkbenchStream extends AsyncIterable<WorkbenchEvent> {
  /** Close the stream. */
  dispose(): void
}

/** What the status surface reads. */
export interface StatusSnapshot {
  /** Loading, ready, or failed. */
  readonly phase: 'loading' | 'ready' | 'failed'
  /** Last successful status. */
  readonly status?: WorkbenchStatus | undefined
  /** Failure detail for the failed phase. */
  readonly error?: string | undefined
  /** Whether the event stream is currently closed. */
  readonly disconnected: boolean
}

/** What the live console reads. */
export interface EventsSnapshot {
  /** Retained events, oldest first. */
  readonly events: readonly WorkbenchEvent[]
  /** Whether the Host stream ended while a surface still reads it. */
  readonly disconnected: boolean
  /** Why the stream ended, when it failed. */
  readonly error?: string | undefined
}

/** What the launcher reads for the Yunying card. */
export interface OverviewSnapshot {
  /** Idle before the first read, then loading, ready, or failed. */
  readonly phase: 'idle' | 'loading' | 'ready' | 'failed'
  /** Last successful overview. */
  readonly overview?: YunyingOverview | undefined
  /** Failure detail for the failed phase. */
  readonly error?: string | undefined
}

/** Stream opener, unary reads, and transport-reset subscription. */
export interface WorkbenchSourceDeps {
  /**
   * Open the Host event stream.
   * @param signal - aborts the stream.
   * @returns the stream.
   */
  readonly openEvents: (signal: AbortSignal) => WorkbenchStream
  /** Read the current Host service status. */
  readonly status: () => Promise<RemoteResult<WorkbenchStatus>>
  /** Read the Yunying overview. */
  readonly overview: () => Promise<RemoteResult<YunyingOverview>>
  /**
   * @param listener - called after a transport reset.
   * @returns unsubscribe callback.
   */
  readonly subscribeReset: (listener: () => void) => () => void
}

/** Stores shared by the launcher and live console. */
export interface WorkbenchSource {
  /** Snapshot sources; the renderer binds them as selector hooks. */
  readonly hooks: {
    readonly status: HostObservable<StatusSnapshot>
    readonly events: HostObservable<EventsSnapshot>
    readonly overview: HostObservable<OverviewSnapshot>
  }
  /** Re-read the Host status. */
  refreshStatus(): void
  /** Re-read the Yunying overview. */
  refreshOverview(): void
  /** Reopen the event stream after it ended. */
  reconnect(): void
  /** Close streams and drop subscribers. */
  close(): void
}

const MAX_EVENTS = 200
const EVENT_BATCH_MS = 100

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Create the shared workbench stores.
 * @param deps - stream opener, unary reads, and reset subscription.
 * @returns the stores and their manual actions.
 */
export function createWorkbenchSource(deps: WorkbenchSourceDeps): WorkbenchSource {
  let active = false
  let subscribers = 0
  let statusSnapshot: StatusSnapshot = { phase: 'loading', disconnected: false }
  let eventsSnapshot: EventsSnapshot = { events: [], disconnected: false }
  let overviewSnapshot: OverviewSnapshot = { phase: 'idle' }
  const statusListeners = new Set<() => void>()
  const eventsListeners = new Set<() => void>()
  const overviewListeners = new Set<() => void>()
  let stream: { readonly controller: AbortController; readonly handle: WorkbenchStream } | undefined
  let stopReset: (() => void) | undefined
  let pendingEvents: WorkbenchEvent[] = []
  let publishTimer: ReturnType<typeof setTimeout> | undefined
  let statusToken = 0
  let overviewToken = 0

  const notify = (listeners: ReadonlySet<() => void>): void => {
    for (const listener of [...listeners]) listener()
  }

  const publishStatus = (next: StatusSnapshot): void => {
    statusSnapshot = next
    notify(statusListeners)
  }

  const publishEvents = (next: EventsSnapshot): void => {
    eventsSnapshot = next
    notify(eventsListeners)
  }

  const publishOverview = (next: OverviewSnapshot): void => {
    overviewSnapshot = next
    notify(overviewListeners)
  }

  const flushEvents = (): void => {
    if (publishTimer !== undefined) {
      clearTimeout(publishTimer)
      publishTimer = undefined
    }
    if (pendingEvents.length === 0) return
    const batch = pendingEvents
    pendingEvents = []
    publishEvents({
      ...eventsSnapshot,
      events: [...eventsSnapshot.events, ...batch].slice(-MAX_EVENTS),
    })
  }

  const queueEvent = (event: WorkbenchEvent): void => {
    pendingEvents.push(event)
    publishTimer ??= setTimeout(flushEvents, EVENT_BATCH_MS)
  }

  const stopStream = (): void => {
    const opened = stream
    stream = undefined
    opened?.controller.abort()
    opened?.handle.dispose()
  }

  const openStream = (): void => {
    const controller = new AbortController()
    const handle = deps.openEvents(controller.signal)
    const opened = { controller, handle }
    stream = opened
    if (eventsSnapshot.disconnected) {
      publishEvents({ ...eventsSnapshot, disconnected: false, error: undefined })
    }
    void (async () => {
      try {
        for await (const event of handle) {
          if (stream !== opened) return
          queueEvent(event)
        }
      } catch (error) {
        if (stream !== opened) return
        publishEvents({ ...eventsSnapshot, disconnected: true, error: messageOf(error) })
      }
      if (stream !== opened) return
      stream = undefined
      if (!controller.signal.aborted) publishEvents({ ...eventsSnapshot, disconnected: true })
    })()
  }

  const refreshStatus = (): void => {
    if (!active) return
    const token = ++statusToken
    if (statusSnapshot.status === undefined) publishStatus({ ...statusSnapshot, phase: 'loading' })
    void deps.status().then((result) => {
      if (token !== statusToken || !active) return
      if (result.ok) publishStatus({ phase: 'ready', status: result.value, disconnected: stream === undefined })
      else publishStatus({ phase: 'failed', error: result.error.message, disconnected: stream === undefined })
    }, (error: unknown) => {
      if (token !== statusToken || !active) return
      publishStatus({ phase: 'failed', error: messageOf(error), disconnected: stream === undefined })
    })
  }

  const refreshOverview = (): void => {
    if (!active) return
    const token = ++overviewToken
    publishOverview({ ...overviewSnapshot, phase: 'loading' })
    void deps.overview().then((result) => {
      if (token !== overviewToken || !active) return
      if (result.ok) publishOverview({ phase: 'ready', overview: result.value })
      else publishOverview({ phase: 'failed', error: result.error.message })
    }, (error: unknown) => {
      if (token !== overviewToken || !active) return
      publishOverview({ phase: 'failed', error: messageOf(error) })
    })
  }

  const start = (): void => {
    if (active) return
    active = true
    stopReset = deps.subscribeReset(() => {
      stopStream()
      if (!active) return
      openStream()
      refreshStatus()
      refreshOverview()
    })
    openStream()
    refreshStatus()
    refreshOverview()
  }

  const stop = (): void => {
    active = false
    stopReset?.()
    stopReset = undefined
    stopStream()
    flushEvents()
  }

  const observable = <T>(getSnapshot: () => T, listeners: Set<() => void>): HostObservable<T> => ({
    getSnapshot,
    subscribe(listener) {
      listeners.add(listener)
      subscribers += 1
      if (subscribers === 1) start()
      return () => {
        listeners.delete(listener)
        subscribers -= 1
        if (subscribers === 0) stop()
      }
    },
  })

  return {
    hooks: {
      status: observable(() => statusSnapshot, statusListeners),
      events: observable(() => eventsSnapshot, eventsListeners),
      overview: observable(() => overviewSnapshot, overviewListeners),
    },
    refreshStatus,
    refreshOverview,
    reconnect(): void {
      if (!active || stream !== undefined) return
      openStream()
      refreshStatus()
    },
    close(): void {
      stop()
      statusListeners.clear()
      eventsListeners.clear()
      overviewListeners.clear()
    },
  }
}
