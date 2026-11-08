/** Workbench stores: lazy streams, throttled events, resets, and unary status. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { WorkbenchEvent, WorkbenchStatus, YunyingOverview } from '@deepseek-ai/dsh-ecom-workbench-server/types'
import { createWorkbenchSource, type WorkbenchStream } from '../src/client/source.ts'

const STATUS: WorkbenchStatus = {
  automation: { enabled: true, available: true, connected: true, targets: 2 },
  yunying: { configured: true },
}
const OVERVIEW: YunyingOverview = {
  configured: true,
  dashboard: { date: '2026-11-08', metrics: [{ key: 'viewers', label: 'Viewers', value: 10 }] },
}

class FakeStream implements WorkbenchStream {
  readonly queue: WorkbenchEvent[] = []
  disposed = 0
  done = false
  #wake: (() => void) | undefined

  push(event: WorkbenchEvent): void {
    this.queue.push(event)
    this.#wake?.()
    this.#wake = undefined
  }

  end(): void {
    this.done = true
    this.#wake?.()
    this.#wake = undefined
  }

  dispose(): void {
    this.disposed += 1
    this.end()
  }

  async *[Symbol.asyncIterator](): AsyncIterator<WorkbenchEvent> {
    while (true) {
      const next = this.queue.shift()
      if (next !== undefined) {
        yield next
        continue
      }
      if (this.done) return
      await new Promise<void>((resolve) => { this.#wake = resolve })
    }
  }
}

function result<T>(value: T): RemoteResult<T> {
  return { ok: true, value }
}

function failure<T>(message: string): RemoteResult<T> {
  return { ok: false, error: new RemoteError('workbench/unavailable', message, {}) }
}

interface Fixture {
  readonly streams: FakeStream[]
  readonly source: ReturnType<typeof createWorkbenchSource>
  readonly status: ReturnType<typeof vi.fn>
  readonly overview: ReturnType<typeof vi.fn>
  reset(): void
}

function fixture(options: { status?: RemoteResult<WorkbenchStatus>; overview?: RemoteResult<YunyingOverview> } = {}): Fixture {
  const streams: FakeStream[] = []
  let reset: (() => void) | undefined
  const status = vi.fn(async () => options.status ?? result(STATUS))
  const overview = vi.fn(async () => options.overview ?? result(OVERVIEW))
  const source = createWorkbenchSource({
    openEvents: () => {
      const stream = new FakeStream()
      streams.push(stream)
      return stream
    },
    status,
    overview,
    subscribeReset: (listener) => {
      reset = listener
      return () => { reset = undefined }
    },
  })
  return { streams, source, status, overview, reset: () => { reset?.() } }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('workbench source', () => {
  it('opens the stream and reads both unary surfaces on the first subscriber', async () => {
    const f = fixture()
    const unsubscribe = f.source.hooks.status.subscribe(() => undefined)
    expect(f.streams).toHaveLength(1)
    expect(f.status).toHaveBeenCalledTimes(1)
    expect(f.overview).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => { expect(f.source.hooks.status.getSnapshot().phase).toBe('ready') })
    expect(f.source.hooks.status.getSnapshot().status).toEqual(STATUS)
    await vi.waitFor(() => { expect(f.source.hooks.overview.getSnapshot().phase).toBe('ready') })
    unsubscribe()
    expect(f.streams[0]?.disposed).toBe(1)
  })

  it('leaves the stream closed while no surface subscribes', () => {
    const f = fixture()
    expect(f.streams).toHaveLength(0)
    expect(f.status).not.toHaveBeenCalled()
  })

  it('throttles stream frames into one published batch', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const unsubscribe = f.source.hooks.events.subscribe(() => undefined)
    const stream = f.streams[0]
    if (stream === undefined) throw new Error('expected a stream')
    stream.push({ type: 'run-started', at: 1, runId: 'run', operation: 'attach' })
    stream.push({ type: 'run-finished', at: 2, runId: 'run', operation: 'attach', ok: true, durationMs: 1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(f.source.hooks.events.getSnapshot().events).toEqual([])
    vi.advanceTimersByTime(100)
    expect(f.source.hooks.events.getSnapshot().events).toHaveLength(2)
    unsubscribe()
  })

  it('reports a stream that ended while a surface still reads it', async () => {
    const f = fixture()
    const unsubscribe = f.source.hooks.events.subscribe(() => undefined)
    f.streams[0]?.end()
    await vi.waitFor(() => { expect(f.source.hooks.events.getSnapshot().disconnected).toBe(true) })
    unsubscribe()
  })

  it('reconnects after a transport reset and after a manual reconnect', async () => {
    const f = fixture()
    const unsubscribe = f.source.hooks.events.subscribe(() => undefined)
    f.reset()
    expect(f.streams).toHaveLength(2)
    expect(f.status).toHaveBeenCalledTimes(2)
    f.streams[1]?.end()
    await vi.waitFor(() => { expect(f.source.hooks.events.getSnapshot().disconnected).toBe(true) })
    f.source.reconnect()
    expect(f.streams).toHaveLength(3)
    unsubscribe()
  })

  it('publishes a failed status without discarding the previous one', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const unsubscribe = f.source.hooks.status.subscribe(() => undefined)
    await vi.runAllTimersAsync()
    f.status.mockResolvedValueOnce(failure('host unreachable'))
    f.source.refreshStatus()
    await vi.runAllTimersAsync()
    expect(f.source.hooks.status.getSnapshot()).toMatchObject({
      phase: 'failed', error: 'host unreachable',
    })
    unsubscribe()
  })

  it('stops refreshing after the last subscriber leaves', async () => {
    const f = fixture()
    const unsubscribe = f.source.hooks.overview.subscribe(() => undefined)
    expect(f.status).toHaveBeenCalledTimes(1)
    unsubscribe()
    f.source.refreshStatus()
    expect(f.status).toHaveBeenCalledTimes(1)
    expect(f.source.hooks.events.getSnapshot().events).toEqual([])
  })
})
