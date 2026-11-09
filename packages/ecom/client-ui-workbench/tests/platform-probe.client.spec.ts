/** Broker login probe: attach/evaluate/release lifecycle and wire-result validation. */
import { describe, expect, it, vi, type Mock } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { WorkbenchEvalResult, WorkbenchTarget } from '@deepseek-ai/dsh-ecom-workbench-server/types'
import { createWorkbenchProbe, type WorkbenchProbeRemote } from '../src/client/platform-probe.ts'
import { douyinShop } from '../src/client/platforms.ts'

/** Attached guest the fake broker reports. */
const TARGET: WorkbenchTarget = { targetId: 'target-1', url: 'https://fxg.jinritemai.com/account/index' }

/** Snapshot the fake probe script collects. */
const PROBE = { url: 'https://fxg.jinritemai.com/account/index', title: '抖店', text: '直播中控' }

/** Remote methods a login probe calls, split into their recordable mocks. */
interface FakeProbeRemote {
  readonly remote: WorkbenchProbeRemote
  readonly attach: Mock<WorkbenchProbeRemote['attach']>
  readonly evaluate: Mock<WorkbenchProbeRemote['evaluate']>
  readonly detach: Mock<WorkbenchProbeRemote['detach']>
}

/** Implementations a test replaces; omitted methods answer the happy path. */
interface FakeProbeOptions {
  readonly attach?: WorkbenchProbeRemote['attach']
  readonly evaluate?: WorkbenchProbeRemote['evaluate']
  readonly detach?: WorkbenchProbeRemote['detach']
}

/**
 * Build a fake broker that records calls.
 * @param options - implementations to replace.
 * @returns the Remote face and the mocks behind it.
 */
function fakeRemote(options: FakeProbeOptions = {}): FakeProbeRemote {
  const attach = vi.fn<WorkbenchProbeRemote['attach']>(
    options.attach ?? (async () => ({ ok: true, value: TARGET })),
  )
  const evaluate = vi.fn<WorkbenchProbeRemote['evaluate']>(
    options.evaluate ?? (async () => evalResult(PROBE)),
  )
  const detach = vi.fn<WorkbenchProbeRemote['detach']>(
    options.detach ?? (async () => ({ ok: true, value: null })),
  )
  return { remote: { attach, evaluate, detach }, attach, evaluate, detach }
}

/**
 * @param payload - script value the guest returned.
 * @returns a successful wire result carrying its JSON encoding.
 */
function evalResult(payload: unknown): RemoteResult<WorkbenchEvalResult> {
  const json = JSON.stringify(payload)
  return { ok: true, value: { json, bytes: json.length } }
}

/**
 * @returns a signal for one probe run.
 */
function signalOf(): AbortSignal {
  return new AbortController().signal
}

describe('workbench login probe', () => {
  it('attaches on the platform origins, evaluates its script, and releases the guest', async () => {
    const fake = fakeRemote()
    const signal = signalOf()
    const probe = await createWorkbenchProbe(fake.remote)(douyinShop, signal)
    expect(fake.attach).toHaveBeenCalledWith({ allowOrigins: douyinShop.origins }, signal)
    expect(fake.evaluate).toHaveBeenCalledWith({ targetId: TARGET.targetId, script: douyinShop.probeScript }, signal)
    expect(fake.detach).toHaveBeenCalledWith({ targetId: TARGET.targetId })
    expect(probe).toEqual(PROBE)
  })

  it('reports an attach failure with its code and evaluates nothing', async () => {
    const fake = fakeRemote({
      attach: async () => ({ ok: false, error: new RemoteError('workbench/timeout', 'broker timed out', {}) }),
    })
    await expect(createWorkbenchProbe(fake.remote)(douyinShop, signalOf()))
      .rejects.toThrow('workbench/timeout: broker timed out')
    expect(fake.evaluate).not.toHaveBeenCalled()
    expect(fake.detach).not.toHaveBeenCalled()
  })

  it('reports an evaluate failure and still releases the guest', async () => {
    const fake = fakeRemote({
      evaluate: async () => ({ ok: false, error: new RemoteError('target/closed', 'guest closed', {}) }),
    })
    await expect(createWorkbenchProbe(fake.remote)(douyinShop, signalOf()))
      .rejects.toThrow('target/closed: guest closed')
    expect(fake.detach).toHaveBeenCalledOnce()
  })

  it('rejects probe JSON that is not an object', async () => {
    const fake = fakeRemote({ evaluate: async () => evalResult(null) })
    await expect(createWorkbenchProbe(fake.remote)(douyinShop, signalOf()))
      .rejects.toThrow('probe result is not an object')
  })

  it('rejects probe JSON that is not parseable', async () => {
    const fake = fakeRemote({
      evaluate: async () => ({ ok: true, value: { json: 'not-json', bytes: 8 } }),
    })
    await expect(createWorkbenchProbe(fake.remote)(douyinShop, signalOf()))
      .rejects.toThrow('probe result is not JSON')
  })

  it.each([
    ['a missing field', '{"url":"https://fxg.jinritemai.com/","title":"抖店"}'],
    ['a non-string field', '{"url":"https://fxg.jinritemai.com/","title":"抖店","text":42}'],
  ])('rejects probe JSON with %s', async (_label, json) => {
    const fake = fakeRemote({
      evaluate: async () => ({ ok: true, value: { json, bytes: json.length } }),
    })
    await expect(createWorkbenchProbe(fake.remote)(douyinShop, signalOf()))
      .rejects.toThrow('probe result must carry string url, title, and text')
  })

  it('clamps the guest text to the probe script length', async () => {
    const fake = fakeRemote({
      evaluate: async () => evalResult({ ...PROBE, text: 'a'.repeat(7_000) }),
    })
    const probe = await createWorkbenchProbe(fake.remote)(douyinShop, signalOf())
    expect(probe.text).toHaveLength(6_000)
  })

  it('keeps a successful probe when the release fails', async () => {
    const fake = fakeRemote({
      detach: async () => { throw new Error('release transport lost') },
    })
    const probe = await createWorkbenchProbe(fake.remote)(douyinShop, signalOf())
    expect(probe).toEqual(PROBE)
    expect(fake.detach).toHaveBeenCalledOnce()
  })

  it('keeps the probe error when the release also fails', async () => {
    const fake = fakeRemote({
      evaluate: async () => ({ ok: false, error: new RemoteError('workbench/disconnected', 'host detached', {}) }),
      detach: async () => ({ ok: false, error: new RemoteError('target/closed', 'guest already closed', {}) }),
    })
    await expect(createWorkbenchProbe(fake.remote)(douyinShop, signalOf()))
      .rejects.toThrow('workbench/disconnected: host detached')
  })
})
