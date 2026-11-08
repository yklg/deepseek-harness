/** Automation authority: allowlist, per-target serialization, events, and degradation. */
import { describe, expect, it } from 'vitest'
import { WorkbenchAutomation } from '../src/automation.ts'
import type { WorkbenchChannel, WorkbenchChannelStatus } from '../src/channel.ts'
import { WorkbenchError } from '../src/errors.ts'
import type { WorkbenchEvent } from '../src/types.ts'

class FakeChannel implements WorkbenchChannel {
  status: WorkbenchChannelStatus = { available: true, connected: true }
  readonly calls: { readonly op: string; readonly params: Readonly<Record<string, unknown>> }[] = []
  handler: (op: string, params: Readonly<Record<string, unknown>>) => Promise<unknown> = async () => null
  readonly #events = new Set<(event: WorkbenchEvent) => void>()
  readonly #statuses = new Set<(status: WorkbenchChannelStatus) => void>()

  request(op: string, params: Readonly<Record<string, unknown>>): Promise<unknown> {
    this.calls.push({ op, params })
    return this.handler(op, params)
  }

  onEvent(listener: (event: WorkbenchEvent) => void): () => void {
    this.#events.add(listener)
    return () => { this.#events.delete(listener) }
  }

  onStatusChange(listener: (status: WorkbenchChannelStatus) => void): () => void {
    this.#statuses.add(listener)
    return () => { this.#statuses.delete(listener) }
  }

  dispose(): void {
    this.#events.clear()
    this.#statuses.clear()
  }

  emit(event: WorkbenchEvent): void {
    for (const listener of [...this.#events]) listener(event)
  }

  setStatus(status: WorkbenchChannelStatus): void {
    this.status = status
    for (const listener of [...this.#statuses]) listener(status)
  }
}

function automation(channel: FakeChannel, allowedHosts: readonly string[] = [], enabled = true): WorkbenchAutomation {
  let tick = 0
  return new WorkbenchAutomation(channel, { enabled, allowedHosts }, {
    now: () => { tick += 1; return tick },
    newRunId: () => `run-${String(tick)}`,
  })
}

function eventTypes(events: readonly WorkbenchEvent[]): string[] {
  return events.map(event => event.type)
}

describe('workbench automation', () => {
  it('attaches through the broker and reports the run', async () => {
    const channel = new FakeChannel()
    channel.handler = async () => ({ targetId: 'lease', url: 'https://example.com/live' })
    const subject = automation(channel)
    const events: WorkbenchEvent[] = []
    subject.onEvent((event) => { events.push(event) })
    await expect(subject.attach({ allowOrigins: ['https://example.com'] })).resolves.toEqual({
      targetId: 'lease', url: 'https://example.com/live',
    })
    expect(channel.calls).toEqual([{ op: 'automation/attach', params: { allowOrigins: ['https://example.com'] } }])
    expect(eventTypes(events)).toEqual(['run-started', 'run-finished'])
    expect(events[1]).toMatchObject({ type: 'run-finished', operation: 'attach', ok: true })
  })

  it('keeps every attach rule inside the deployment allowlist', async () => {
    const channel = new FakeChannel()
    channel.handler = async () => ({ targetId: 'lease', url: 'https://example.com' })
    const subject = automation(channel, ['buyin.jinritemai.com', '*.example.com'])
    for (const allowOrigins of [['https://buyin.jinritemai.com'], ['https://a.example.com'], ['*.sub.example.com']]) {
      await expect(subject.attach({ allowOrigins })).resolves.toMatchObject({ targetId: 'lease' })
    }
    expect(channel.calls).toHaveLength(3)
    channel.calls.length = 0
    for (const allowOrigins of [['https://example.com'], ['https://evil.test'], ['*.evil.test'], ['*.example.com.evil.test']]) {
      await expect(subject.attach({ allowOrigins })).rejects.toMatchObject({ code: 'workbench/origin-denied' })
    }
    expect(channel.calls).toEqual([])
  })

  it('rejects a malformed allowlist before reaching the broker', async () => {
    const channel = new FakeChannel()
    const subject = automation(channel)
    await expect(subject.attach({ allowOrigins: ['not a url'] })).rejects.toMatchObject({ code: 'workbench/invalid-request' })
    await expect(subject.attach({ allowOrigins: ['ftp://example.com'] })).rejects.toMatchObject({ code: 'workbench/invalid-request' })
    expect(channel.calls).toEqual([])
  })

  it('refuses every operation while the deployment disables automation', async () => {
    const channel = new FakeChannel()
    const subject = automation(channel, [], false)
    await expect(subject.attach({ allowOrigins: ['https://example.com'] })).rejects.toMatchObject({ code: 'workbench/disabled' })
    await expect(subject.targets()).rejects.toMatchObject({ code: 'workbench/disabled' })
    await expect(subject.evaluate({ targetId: 'lease', script: '1' })).rejects.toMatchObject({ code: 'workbench/disabled' })
    await expect(subject.detach({ targetId: 'lease' })).rejects.toMatchObject({ code: 'workbench/disabled' })
    expect(channel.calls).toEqual([])
  })

  it('serializes calls per target and lets another target proceed', async () => {
    const channel = new FakeChannel()
    const pending = new Map<string, (value: unknown) => void>()
    const order: string[] = []
    channel.handler = async (op, params) => {
      expect(op).toBe('automation/eval')
      const key = `${String(params.targetId)}-${String(order.filter(name => name.startsWith(String(params.targetId))).length)}`
      order.push(key)
      return await new Promise<unknown>((resolve) => { pending.set(key, resolve) })
    }
    const subject = automation(channel)
    const first = subject.evaluate({ targetId: 'a', script: '1' })
    const second = subject.evaluate({ targetId: 'a', script: '2' })
    const other = subject.evaluate({ targetId: 'b', script: '3' })
    await Promise.resolve()
    expect(order).toEqual(['a-0', 'b-0'])
    pending.get('a-0')?.(1)
    await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
    expect(order).toEqual(['a-0', 'b-0', 'a-1'])
    pending.get('a-1')?.(2)
    pending.get('b-0')?.(3)
    await expect(Promise.all([first, second, other])).resolves.toEqual([
      { json: '1', bytes: 1 }, { json: '2', bytes: 1 }, { json: '3', bytes: 1 },
    ])
  })

  it('runs a detach after calls already queued for the same target', async () => {
    const channel = new FakeChannel()
    const pending: (() => void)[] = []
    const order: string[] = []
    channel.handler = async (op) => {
      order.push(op)
      if (op === 'automation/eval') await new Promise<void>((resolve) => { pending.push(resolve) })
      return null
    }
    const subject = automation(channel)
    const evaluation = subject.evaluate({ targetId: 'a', script: '1' })
    const detachment = subject.detach({ targetId: 'a' })
    await Promise.resolve()
    expect(order).toEqual(['automation/eval'])
    for (const resolve of pending) resolve()
    await expect(evaluation).resolves.toMatchObject({ json: 'null' })
    await expect(detachment).resolves.toBeNull()
    expect(order).toEqual(['automation/eval', 'automation/detach'])
  })

  it('JSON-encodes results and rejects a non-JSON value', async () => {
    const channel = new FakeChannel()
    channel.handler = async () => ({ answer: 42 })
    const subject = automation(channel)
    await expect(subject.evaluate({ targetId: 'a', script: '1' })).resolves.toEqual({ json: '{"answer":42}', bytes: 13 })
    channel.handler = async () => undefined
    await expect(subject.evaluate({ targetId: 'a', script: '1' })).rejects.toMatchObject({ code: 'workbench/result-not-json' })
  })

  it('reports a failed run with its broker code', async () => {
    const channel = new FakeChannel()
    channel.handler = async () => { throw new WorkbenchError('target/closed', 'desktop automation: target is closed') }
    const subject = automation(channel)
    const events: WorkbenchEvent[] = []
    subject.onEvent((event) => { events.push(event) })
    await expect(subject.evaluate({ targetId: 'a', script: '1' })).rejects.toMatchObject({ code: 'target/closed' })
    expect(eventTypes(events)).toEqual(['run-started', 'run-finished'])
    expect(events[1]).toMatchObject({ type: 'run-finished', operation: 'evaluate', ok: false, code: 'target/closed', targetId: 'a' })
  })

  it('reads targets and forgets the cached count when a target closes', async () => {
    const channel = new FakeChannel()
    channel.handler = async () => [{ targetId: 'lease', url: 'https://example.com' }]
    const subject = automation(channel)
    const events: WorkbenchEvent[] = []
    subject.onEvent((event) => { events.push(event) })
    await expect(subject.targets()).resolves.toEqual([{ targetId: 'lease', url: 'https://example.com' }])
    expect(subject.status.targets).toBe(1)
    channel.emit({ type: 'target-closed', at: 1, targetId: 'lease', reason: 'closed' })
    expect(subject.status.targets).toBeNull()
    expect(events.at(-1)).toEqual({ type: 'target-closed', at: 1, targetId: 'lease', reason: 'closed' })
  })

  it('reports channel status changes as events', () => {
    const channel = new FakeChannel()
    const subject = automation(channel)
    const events: WorkbenchEvent[] = []
    subject.onEvent((event) => { events.push(event) })
    channel.setStatus({ available: true, connected: false })
    expect(subject.status.connected).toBe(false)
    expect(events).toEqual([{ type: 'channel', at: 1, available: true, connected: false }])
  })

  it('refreshes the target count without adding a console run', async () => {
    const channel = new FakeChannel()
    channel.handler = async () => [{ targetId: 'one', url: 'https://one.example' }, { targetId: 'two', url: 'https://two.example' }]
    const subject = automation(channel)
    const events: WorkbenchEvent[] = []
    subject.onEvent((event) => { events.push(event) })
    await expect(subject.refreshTargetCount()).resolves.toBe(2)
    expect(events).toEqual([])
    expect(subject.status.targets).toBe(2)
  })

  it('leaves the count unknown when a silent refresh fails', async () => {
    const channel = new FakeChannel()
    channel.handler = async () => { throw new WorkbenchError('workbench/timeout', 'timed out') }
    const subject = automation(channel)
    await expect(subject.refreshTargetCount()).resolves.toBeNull()
    expect(subject.status.targets).toBeNull()
  })

  it('rejects a malformed broker target list', async () => {
    const channel = new FakeChannel()
    channel.handler = async () => [{ targetId: 42 }]
    await expect(automation(channel).targets()).rejects.toMatchObject({ code: 'workbench/protocol' })
  })
})
