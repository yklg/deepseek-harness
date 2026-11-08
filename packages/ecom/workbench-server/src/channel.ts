/**
 * The Host side of Electron's private workbench channel: correlated requests
 * over Node IPC, lifecycle events in the opposite direction, and one typed
 * failure vocabulary. A deployment without that channel is represented by an
 * unavailable channel, so callers never branch on the process shape.
 */

import { randomUUID } from 'node:crypto'
import { WorkbenchError, isWorkbenchFailureCode } from './errors.ts'
import type { WorkbenchEvent } from './types.ts'

/** Whether the private channel can carry requests right now. */
export interface WorkbenchChannelStatus {
  /** A parent process installed the Electron IPC sender. */
  readonly available: boolean
  /** The channel is both available and still attached to that parent. */
  readonly connected: boolean
}

/** One private channel to the automation provider. */
export interface WorkbenchChannel {
  /** Current availability. */
  readonly status: WorkbenchChannelStatus
  /**
   * Send one correlated request.
   * @param operation - provider operation name.
   * @param params - JSON-serializable parameters.
   * @param signal - caller cancellation; a settled request ignores later responses.
   * @returns the provider's answer value.
   */
  request(operation: string, params: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<unknown>
  /**
   * @param listener - receives validated lifecycle events.
   * @returns unsubscribe callback.
   */
  onEvent(listener: (event: WorkbenchEvent) => void): () => void
  /**
   * @param listener - receives availability changes.
   * @returns unsubscribe callback.
   */
  onStatusChange(listener: (status: WorkbenchChannelStatus) => void): () => void
  /** Reject pending requests and release every listener. */
  dispose(): void
}

/** The process shape the default channel uses. */
export interface WorkbenchProcessHost {
  /** Whether a parent installed an IPC sender. */
  readonly canSend: boolean
  /** Whether the IPC channel still connects to that parent. */
  readonly connected: boolean
  /**
   * Send one message.
   * @param message - JSON-serializable message.
   * @param callback - receives the send failure, if any.
   * @returns the sender's backpressure answer.
   */
  send(message: unknown, callback: (error: Error | null) => void): boolean
  /**
   * @param listener - receives raw IPC messages.
   * @returns unsubscribe callback.
   */
  onMessage(listener: (message: unknown) => void): () => void
  /**
   * @param listener - notified when the parent disconnects.
   * @returns unsubscribe callback.
   */
  onDisconnect(listener: () => void): () => void
}

/** Deadline after which a request fails even if the provider never answered. */
export const WORKBENCH_CHANNEL_DEADLINE_MS = 20_000

/** How long the provider may take beyond the shell's own request deadline. */
export interface WorkbenchChannelOptions {
  /** Request deadline; defaults to {@link WORKBENCH_CHANNEL_DEADLINE_MS}. */
  readonly deadlineMs?: number
  /** Clock used for event timestamps; defaults to `Date.now`. */
  readonly now?: () => number
  /** Request identity generator; defaults to `crypto.randomUUID`. */
  readonly requestId?: () => string
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void
  readonly reject: (error: unknown) => void
  readonly timer: ReturnType<typeof setTimeout>
  readonly removeAbort: () => void
}

/**
 * The Electron Host process's Node IPC channel.
 * @returns a host that reports the current process's IPC state.
 */
export function createProcessWorkbenchHost(): WorkbenchProcessHost {
  return {
    // Only the Electron Node-mode Host owns the workbench protocol; another
    // parent with an IPC channel (a test runner, a supervisor) is not a shell.
    get canSend() { return process.env.ELECTRON_RUN_AS_NODE === '1' && typeof process.send === 'function' },
    get connected() { return process.connected },
    send(message, callback) {
      if (process.send === undefined) {
        callback(new WorkbenchError('workbench/unavailable', 'desktop automation channel is unavailable'))
        return false
      }
      try {
        return process.send.call(process, message, callback)
      } catch (error) {
        callback(error instanceof Error ? error : new Error('desktop automation send failed'))
        return false
      }
    },
    onMessage(listener) {
      process.on('message', listener)
      return () => { process.off('message', listener) }
    },
    onDisconnect(listener) {
      process.on('disconnect', listener)
      return () => { process.off('disconnect', listener) }
    },
  }
}

/**
 * Create one channel over a process-like host.
 * @param host - IPC transport; tests supply a fake.
 * @param options - deadline, clock, and request identity overrides.
 * @returns the channel.
 */
export function createProcessWorkbenchChannel(
  host: WorkbenchProcessHost = createProcessWorkbenchHost(),
  options: WorkbenchChannelOptions = {},
): WorkbenchChannel {
  const deadlineMs = options.deadlineMs ?? WORKBENCH_CHANNEL_DEADLINE_MS
  const now = options.now ?? (() => Date.now())
  const requestId = options.requestId ?? (() => randomUUID())
  const pending = new Map<string, PendingRequest>()
  const eventListeners = new Set<(event: WorkbenchEvent) => void>()
  const statusListeners = new Set<(status: WorkbenchChannelStatus) => void>()
  let disposed = false

  const status = (): WorkbenchChannelStatus => {
    const available = host.canSend
    return { available, connected: available && host.connected }
  }

  const publishStatus = (): void => {
    const current = status()
    for (const listener of [...statusListeners]) {
      try { listener(current) } catch (_error) {
        // A status observer cannot break the private channel.
      }
    }
  }

  const take = (id: string): PendingRequest | undefined => {
    const request = pending.get(id)
    if (request === undefined) return undefined
    pending.delete(id)
    clearTimeout(request.timer)
    request.removeAbort()
    return request
  }

  const resolveWith = (id: string, value: unknown): void => { take(id)?.resolve(value) }
  const rejectWith = (id: string, error: unknown): void => { take(id)?.reject(error) }

  const rejectAll = (error: unknown): void => {
    for (const id of [...pending.keys()]) rejectWith(id, error)
  }

  const publishEvent = (event: WorkbenchEvent): void => {
    for (const listener of [...eventListeners]) {
      try { listener(event) } catch (_error) {
        // A live-console observer cannot break the private channel.
      }
    }
  }

  const handleMessage = (message: unknown): void => {
    if (typeof message !== 'object' || message === null || !('type' in message)) return
    if (message.type === 'workbench-response') {
      if (!('requestId' in message) || typeof message.requestId !== 'string') return
      if (!pending.has(message.requestId)) return
      if (!('ok' in message)) {
        rejectWith(message.requestId, new WorkbenchError('workbench/protocol', 'desktop automation response has no outcome'))
        return
      }
      if (message.ok === true) {
        if (!('value' in message)) {
          rejectWith(message.requestId, new WorkbenchError('workbench/protocol', 'desktop automation response has no value'))
          return
        }
        resolveWith(message.requestId, message.value)
        return
      }
      if (message.ok !== false) {
        rejectWith(message.requestId, new WorkbenchError('workbench/protocol', 'desktop automation response has an invalid outcome'))
        return
      }
      const failure = 'error' in message ? message.error : undefined
      if (typeof failure !== 'object' || failure === null || !('code' in failure)
        || typeof failure.code !== 'string' || !('message' in failure) || typeof failure.message !== 'string') {
        rejectWith(message.requestId, new WorkbenchError('workbench/protocol', 'desktop automation response has no failure detail'))
        return
      }
      const error = isWorkbenchFailureCode(failure.code)
        ? new WorkbenchError(failure.code, failure.message)
        : new WorkbenchError('workbench/protocol', `desktop automation failed with ${failure.code}: ${failure.message}`)
      rejectWith(message.requestId, error)
      return
    }
    if (message.type !== 'workbench-event' || !('event' in message)) return
    const event = message.event
    if (typeof event !== 'object' || event === null || !('type' in event) || event.type !== 'target-closed') return
    if (!('targetId' in event) || typeof event.targetId !== 'string' || event.targetId.length === 0) return
    if (!('reason' in event) || (event.reason !== 'closed' && event.reason !== 'crashed')) return
    publishEvent({ type: 'target-closed', at: now(), targetId: event.targetId, reason: event.reason })
  }

  const stopMessages = host.onMessage(handleMessage)
  const stopDisconnect = host.onDisconnect(() => {
    rejectAll(new WorkbenchError('workbench/disconnected', 'desktop automation channel disconnected'))
    publishStatus()
  })

  const request: WorkbenchChannel['request'] = async (operation, params, signal) => {
    if (disposed) throw new WorkbenchError('workbench/disconnected', 'desktop automation channel is disposed')
    if (!host.canSend) throw new WorkbenchError('workbench/unavailable', 'desktop automation is unavailable')
    if (!host.connected) throw new WorkbenchError('workbench/disconnected', 'desktop automation channel disconnected')
    signal?.throwIfAborted()
    const id = requestId()
    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        rejectWith(id, new WorkbenchError('workbench/timeout', 'desktop automation request timed out',
          { operation }))
      }, Math.max(1, deadlineMs))
      const abort = (): void => { rejectWith(id, signal?.reason ?? new Error('desktop automation request cancelled')) }
      const removeAbort = (): void => { signal?.removeEventListener('abort', abort) }
      pending.set(id, { resolve, reject, timer, removeAbort })
      signal?.addEventListener('abort', abort, { once: true })
      try {
        host.send({ type: 'workbench-request', requestId: id, op: operation, params }, (error) => {
          if (error !== null) rejectWith(id, new WorkbenchError('workbench/disconnected', error.message, { operation }))
        })
      } catch (error) {
        rejectWith(id, error instanceof WorkbenchError
          ? error
          : new WorkbenchError('workbench/disconnected', error instanceof Error ? error.message : 'desktop automation send failed', { operation }))
      }
    })
  }

  return {
    get status() { return status() },
    request,
    onEvent(listener) {
      eventListeners.add(listener)
      return () => { eventListeners.delete(listener) }
    },
    onStatusChange(listener) {
      statusListeners.add(listener)
      return () => { statusListeners.delete(listener) }
    },
    dispose() {
      if (disposed) return
      disposed = true
      stopMessages()
      stopDisconnect()
      rejectAll(new WorkbenchError('workbench/disconnected', 'desktop automation channel is disposed'))
      eventListeners.clear()
      statusListeners.clear()
    },
  }
}
