/** Private workbench channel: correlation, typed failures, events, and disconnect degradation. */
import { describe, expect, it, vi } from 'vitest'
import {
  createProcessWorkbenchChannel,
  type WorkbenchChannelStatus,
  type WorkbenchProcessHost,
} from '../src/channel.ts'
import { WorkbenchError } from '../src/errors.ts'
import type { WorkbenchEvent } from '../src/types.ts'

interface SentMessage {
  readonly message: unknown
  readonly callback: (error: Error | null) => void
}

class FakeProcessHost implements WorkbenchProcessHost {
  canSend = true
  connected = true
  readonly sent: SentMessage[] = []
  readonly #messageListeners = new Set<(message: unknown) => void>()
  readonly #disconnectListeners = new Set<() => void>()

  send(message: unknown, callback: (error: Error | null) => void): boolean {
    this.sent.push({ message, callback })
    return true
  }

  onMessage(listener: (message: unknown) => void): () => void {
    this.#messageListeners.add(listener)
    return () => { this.#messageListeners.delete(listener) }
  }

  onDisconnect(listener: () => void): () => void {
    this.#disconnectListeners.add(listener)
    return () => { this.#disconnectListeners.delete(listener) }
  }

  deliver(message: unknown): void {
    for (const listener of [...this.#messageListeners]) listener(message)
  }

  disconnect(): void {
    this.connected = false
    for (const listener of [...this.#disconnectListeners]) listener()
  }

  get listenerCount(): number {
    return this.#messageListeners.size + this.#disconnectListeners.size
  }
}

interface RequestShape {
  readonly requestId: string
  readonly op: string
  readonly params: object
}

function requestAt(host: FakeProcessHost, index: number): RequestShape {
  const entry = host.sent[index]
  if (entry === undefined) throw new Error(`no request at ${String(index)}`)
  const message = entry.message
  if (typeof message !== 'object' || message === null
    || !('requestId' in message) || typeof message.requestId !== 'string'
    || !('op' in message) || typeof message.op !== 'string'
    || !('params' in message) || typeof message.params !== 'object' || message.params === null
    || Array.isArray(message.params)) {
    throw new Error('malformed workbench request')
  }
  return { requestId: message.requestId, op: message.op, params: message.params }
}

function respond(host: FakeProcessHost, requestId: string, value: unknown): void {
  host.deliver({ type: 'workbench-response', requestId, ok: true, value })
}

function fail(host: FakeProcessHost, requestId: string, code: string, message: string): void {
  host.deliver({ type: 'workbench-response', requestId, ok: false, error: { code, message } })
}

describe('private workbench channel', () => {
  it('sends one correlated request and resolves its value', async () => {
    const host = new FakeProcessHost()
    const channel = createProcessWorkbenchChannel(host, { requestId: () => 'request-1' })
    const pending = channel.request('automation/targets', {})
    expect(requestAt(host, 0)).toEqual({ requestId: 'request-1', op: 'automation/targets', params: {} })
    respond(host, 'request-1', [{ targetId: 'lease', url: 'https://example.com' }])
    await expect(pending).resolves.toEqual([{ targetId: 'lease', url: 'https://example.com' }])
  })

  it('preserves a broker failure code and message', async () => {
    const host = new FakeProcessHost()
    const channel = createProcessWorkbenchChannel(host)
    const pending = channel.request('automation/eval', {})
    fail(host, requestAt(host, 0).requestId, 'target/closed', 'desktop automation: target is closed')
    await expect(pending).rejects.toMatchObject({ code: 'target/closed', message: 'desktop automation: target is closed' })
  })

  it('maps an unknown failure code to a protocol failure that names it', async () => {
    const host = new FakeProcessHost()
    const channel = createProcessWorkbenchChannel(host)
    const pending = channel.request('automation/eval', {})
    fail(host, requestAt(host, 0).requestId, 'target/future-code', 'newer broker failure')
    await expect(pending).rejects.toMatchObject({
      code: 'workbench/protocol',
      message: 'desktop automation failed with target/future-code: newer broker failure',
    })
  })

  it('rejects a malformed response without leaving the request pending', async () => {
    const host = new FakeProcessHost()
    const channel = createProcessWorkbenchChannel(host)
    const pending = channel.request('automation/eval', {})
    host.deliver({ type: 'workbench-response', requestId: requestAt(host, 0).requestId, ok: true })
    await expect(pending).rejects.toMatchObject({ code: 'workbench/protocol' })
  })

  it('fails a request at its deadline', async () => {
    const host = new FakeProcessHost()
    const channel = createProcessWorkbenchChannel(host, { deadlineMs: 5 })
    await expect(channel.request('automation/eval', {})).rejects.toMatchObject({
      code: 'workbench/timeout',
      details: { operation: 'automation/eval' },
    })
  })

  it('rejects every pending request when the parent disconnects and reports the status', async () => {
    const host = new FakeProcessHost()
    const channel = createProcessWorkbenchChannel(host)
    const statuses: WorkbenchChannelStatus[] = []
    channel.onStatusChange((status) => { statuses.push(status) })
    const pending = channel.request('automation/eval', {})
    host.disconnect()
    await expect(pending).rejects.toMatchObject({ code: 'workbench/disconnected' })
    expect(statuses).toEqual([{ available: true, connected: false }])
    await expect(channel.request('automation/eval', {})).rejects.toMatchObject({ code: 'workbench/disconnected' })
  })

  it('reports an absent sender and a disconnected parent distinctly', async () => {
    const absent = new FakeProcessHost()
    absent.canSend = false
    await expect(createProcessWorkbenchChannel(absent).request('automation/eval', {}))
      .rejects.toMatchObject({ code: 'workbench/unavailable' })

    const disconnected = new FakeProcessHost()
    disconnected.connected = false
    await expect(createProcessWorkbenchChannel(disconnected).request('automation/eval', {}))
      .rejects.toMatchObject({ code: 'workbench/disconnected' })
  })

  it('delivers validated lifecycle events and ignores malformed ones', () => {
    const host = new FakeProcessHost()
    const channel = createProcessWorkbenchChannel(host, { now: () => 42 })
    const events: WorkbenchEvent[] = []
    channel.onEvent((event) => { events.push(event) })
    host.deliver({ type: 'workbench-event', event: { type: 'target-closed', targetId: 'lease', reason: 'crashed' } })
    host.deliver({ type: 'workbench-event', event: { type: 'target-closed', targetId: '', reason: 'crashed' } })
    host.deliver({ type: 'workbench-event', event: { type: 'unknown', targetId: 'lease' } })
    host.deliver({ type: 'workbench-event' })
    expect(events).toEqual([{ type: 'target-closed', at: 42, targetId: 'lease', reason: 'crashed' }])
  })

  it('honours caller cancellation and ignores the late answer', async () => {
    const host = new FakeProcessHost()
    const channel = createProcessWorkbenchChannel(host)
    const controller = new AbortController()
    const reason = new Error('caller cancelled')
    const pending = channel.request('automation/eval', {}, controller.signal)
    host.sent[0]?.callback(null)
    controller.abort(reason)
    await expect(pending).rejects.toBe(reason)
    respond(host, requestAt(host, 0).requestId, 'late')
  })

  it('releases listeners and rejects pending requests on dispose', async () => {
    const host = new FakeProcessHost()
    const channel = createProcessWorkbenchChannel(host)
    const pending = channel.request('automation/eval', {})
    channel.dispose()
    await expect(pending).rejects.toBeInstanceOf(WorkbenchError)
    expect(host.listenerCount).toBe(0)
    await expect(channel.request('automation/eval', {})).rejects.toMatchObject({ code: 'workbench/disconnected' })
  })

  it('does not throw for a response to an unknown request', () => {
    const host = new FakeProcessHost()
    createProcessWorkbenchChannel(host)
    expect(() => { respond(host, 'unknown', 1) }).not.toThrow()
  })

  it('surfaces a synchronous send failure as a disconnected request', async () => {
    const host = new FakeProcessHost()
    host.send = (_message, callback) => {
      callback(new Error('channel closed'))
      return false
    }
    const channel = createProcessWorkbenchChannel(host)
    await expect(channel.request('automation/eval', {})).rejects.toMatchObject(
      { code: 'workbench/disconnected', message: 'channel closed' })
  })

  it('uses the wall clock for events by default', () => {
    const host = new FakeProcessHost()
    const channel = createProcessWorkbenchChannel(host)
    const listener = vi.fn<(event: WorkbenchEvent) => void>()
    channel.onEvent(listener)
    const before = Date.now()
    host.deliver({ type: 'workbench-event', event: { type: 'target-closed', targetId: 'lease', reason: 'closed' } })
    const event = listener.mock.calls[0]?.[0]
    expect(event?.type).toBe('target-closed')
    expect(event?.at).toBeGreaterThanOrEqual(before)
  })
})
