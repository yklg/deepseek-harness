import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { DesktopBrowserLeaseId, DesktopBrowserReservation } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'
import type { AutomationLifecycleEvent } from '../src/browser-guests.ts'

type SessionMock = {
  readonly setPermissionRequestHandler: ReturnType<typeof vi.fn>
  readonly setPermissionCheckHandler: ReturnType<typeof vi.fn>
  readonly setDevicePermissionHandler: ReturnType<typeof vi.fn>
  readonly setDisplayMediaRequestHandler: ReturnType<typeof vi.fn>
  readonly on: ReturnType<typeof vi.fn>
  readonly webRequest: { readonly onBeforeRequest: ReturnType<typeof vi.fn> }
  readonly clearStorageData: ReturnType<typeof vi.fn>
  readonly clearCache: ReturnType<typeof vi.fn>
}

const electron = vi.hoisted(() => {
  const sessions = new Map<string, SessionMock>()
  const fromPartition = vi.fn((partition: string): SessionMock => {
    let browserSession = sessions.get(partition)
    if (browserSession === undefined) {
      browserSession = {
        setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn(),
        setDevicePermissionHandler: vi.fn(), setDisplayMediaRequestHandler: vi.fn(), on: vi.fn(),
        webRequest: { onBeforeRequest: vi.fn() },
        clearStorageData: vi.fn(async () => {}), clearCache: vi.fn(async () => {}),
      }
      sessions.set(partition, browserSession)
    }
    return browserSession
  })
  return { sessions, fromPartition }
})
vi.mock('electron', () => ({ app: { isPackaged: true }, session: { fromPartition: electron.fromPartition } }))
const { AutomationBroker, DesktopBrowserGuests, createAutomationWorkbenchHandler } = await import('../src/browser-guests.ts')
afterEach(() => { vi.clearAllMocks() })

type ExecuteJavaScriptMock = Mock<(script: string, userGesture?: boolean) => Promise<unknown>>
type ContentsFixture = EventEmitter & {
  getURL(): string
  isDestroyed(): boolean
  executeJavaScript: ExecuteJavaScriptMock
  close: Mock<() => void>
  setWindowOpenHandler: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
}
type WindowFixture = EventEmitter & { webContents: ContentsFixture; isDestroyed(): boolean }
type GuestsFixture = {
  acquire(owner: ContentsFixture, workspace: unknown, options?: unknown): DesktopBrowserReservation
  release(owner: ContentsFixture, id: unknown): Promise<void>
  clearStorage(workspace: unknown): Promise<void>
  bind(window: WindowFixture, attachInput: (guest: ContentsFixture, name: DesktopBrowserLeaseId) => () => void): void
}

function contentsFixture(url = 'about:blank') {
  const state = { url, destroyed: false }
  const contents = Object.assign(new EventEmitter(), {
    getURL: () => state.url,
    isDestroyed: () => state.destroyed,
    executeJavaScript: vi.fn(async (_script: string, _userGesture?: boolean): Promise<unknown> => undefined),
    close: vi.fn(() => { state.destroyed = true; contents.emit('destroyed') }),
    setWindowOpenHandler: vi.fn(),
    send: vi.fn(),
  }) as ContentsFixture
  return { contents, state }
}

/**
 * Present the public lease methods through the fixture's EventEmitter doubles;
 * the assertions run the real implementation with only Electron replaced.
 */
function fixtureGuests(guests: InstanceType<typeof DesktopBrowserGuests>): GuestsFixture {
  return {
    acquire: (contents, workspace, options) => guests.acquire(contents as never, workspace as never, options as never),
    release: (contents, id) => guests.release(contents as never, id as never),
    clearStorage: workspace => guests.clearStorage(workspace as never),
    bind: (window, attachInput) => guests.bind(window as never, attachInput as never),
  }
}

function fixture() {
  const events: AutomationLifecycleEvent[] = []
  const guestOwner = new DesktopBrowserGuests(() => undefined)
  const guests = fixtureGuests(guestOwner)
  const owner = contentsFixture('dsh-app://app/')
  const window = Object.assign(new EventEmitter(), { webContents: owner.contents, isDestroyed: () => false })
  guests.bind(window, () => () => {})
  const broker = new AutomationBroker(guestOwner, (event) => { events.push(event) })
  return { guests, broker, owner, window, events }
}

type Fixture = ReturnType<typeof fixture>

function attachGuest(f: Fixture, workspace = 'workspace-a', url = 'https://buyin.jinritemai.com/dashboard') {
  const reservation = f.guests.acquire(f.owner.contents, workspace)
  const guest = contentsFixture(`about:blank#${reservation.lease}`)
  f.owner.contents.emit('will-attach-webview', { preventDefault: vi.fn() }, {},
    { src: `about:blank#${reservation.lease}`, partition: reservation.partition })
  f.owner.contents.emit('did-attach-webview', {}, guest.contents)
  guest.contents.emit('dom-ready')
  guest.state.url = url
  return { reservation, guest: guest.contents, state: guest.state }
}

function browserSession(partition: string): SessionMock {
  const browserSession = electron.sessions.get(partition)
  if (browserSession === undefined) throw new Error(`missing fixture session ${partition}`)
  return browserSession
}

async function rejectedCode(pending: Promise<unknown>): Promise<string> {
  const error: unknown = await pending.then(() => undefined, (failure: unknown) => failure)
  expect(error).toBeInstanceOf(Error)
  expect(error).toHaveProperty('code')
  return (error as { code: string }).code
}

function thrownCode(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(Error)
    expect(error).toHaveProperty('code')
    return (error as { code: string }).code
  }
  throw new Error('expected the automation request to fail')
}

describe('persistent workspace partitions', () => {
  it('derives one persistent partition per workspace without exposing the workspace identity', () => {
    const f = fixture()
    const first = f.guests.acquire(f.owner.contents, 'workspace-alpha')
    const second = f.guests.acquire(f.owner.contents, 'workspace-alpha')
    const other = f.guests.acquire(f.owner.contents, 'workspace-beta')
    const digest = createHash('sha256').update('workspace-alpha', 'utf8').digest('hex')
    expect(first.partition).toBe(`persist:dsh-sidebar-browser-${digest}`)
    expect(second.partition).toBe(first.partition)
    expect(other.partition).not.toBe(first.partition)
    expect(first.partition).not.toContain('workspace-alpha')
  })

  it('applies the requested throttle policy only to that guest lease', () => {
    const f = fixture()
    const throttled = f.guests.acquire(f.owner.contents, 'platform:douyin-shop:default',
      { backgroundThrottling: false })
    const throttledPreferences: Record<string, unknown> = {}
    f.owner.contents.emit('will-attach-webview', { preventDefault: vi.fn() }, throttledPreferences,
      { src: `about:blank#${throttled.lease}`, partition: throttled.partition })
    expect(throttledPreferences.backgroundThrottling).toBe(false)

    const ordinary = f.guests.acquire(f.owner.contents, 'platform:buyin:default')
    const ordinaryPreferences: Record<string, unknown> = {}
    f.owner.contents.emit('will-attach-webview', { preventDefault: vi.fn() }, ordinaryPreferences,
      { src: `about:blank#${ordinary.lease}`, partition: ordinary.partition })
    expect(ordinaryPreferences.backgroundThrottling).toBe(true)
  })

  it('rejects malformed guest options before reserving a lease', () => {
    const f = fixture()
    expect(() => f.guests.acquire(f.owner.contents, 'platform:a', null)).toThrow('invalid guest options')
    expect(() => f.guests.acquire(f.owner.contents, 'platform:a',
      { backgroundThrottling: 'no' })).toThrow('backgroundThrottling must be boolean')
  })

  it('rejects workspace identities that cannot name a partition', () => {
    const f = fixture()
    expect(() => f.guests.acquire(f.owner.contents, '')).toThrow('workspace storage identity is required')
    expect(() => f.guests.acquire(f.owner.contents, 42)).toThrow('workspace storage identity is required')
    expect(() => f.guests.acquire(f.owner.contents, 'x'.repeat(4097))).toThrow('workspace storage identity is required')
  })

  it('clears storage and cache of the workspace partition and keeps reusing it', async () => {
    const f = fixture()
    const first = f.guests.acquire(f.owner.contents, 'workspace-alpha')
    const browserSessionOf = browserSession(first.partition)
    await f.guests.clearStorage('workspace-alpha')
    expect(browserSessionOf.clearStorageData).toHaveBeenCalledOnce()
    expect(browserSessionOf.clearCache).toHaveBeenCalledOnce()
    expect(f.guests.acquire(f.owner.contents, 'workspace-alpha').partition).toBe(first.partition)
  })

  it('clears only the requested workspace partition', async () => {
    const f = fixture()
    const alpha = browserSession(f.guests.acquire(f.owner.contents, 'workspace-alpha').partition)
    const beta = browserSession(f.guests.acquire(f.owner.contents, 'workspace-beta').partition)
    const cleared = await f.guests.clearStorage('workspace-alpha').then(() => {
      return { alpha: [alpha.clearStorageData.mock.calls.length, alpha.clearCache.mock.calls.length],
        beta: [beta.clearStorageData.mock.calls.length, beta.clearCache.mock.calls.length] }
    })
    expect(cleared).toEqual({ alpha: [1, 1], beta: [0, 0] })
  })
})

describe('automation origin policy', () => {
  it('attaches the only guest matching an exact approved origin', () => {
    const f = fixture()
    const { reservation, state } = attachGuest(f)
    expect(f.broker.attach({ allowOrigins: ['https://buyin.jinritemai.com'] }))
      .toEqual({ targetId: reservation.lease, url: state.url })
  })

  it('matches subdomain wildcard rules but not the bare domain', () => {
    const f = fixture()
    attachGuest(f, 'workspace-a', 'https://shop.jinritemai.com/orders')
    expect(f.broker.attach({ allowOrigins: ['*.jinritemai.com'] }).url).toBe('https://shop.jinritemai.com/orders')

    const apex = fixture()
    attachGuest(apex, 'workspace-a', 'https://jinritemai.com/orders')
    expect(thrownCode(() => apex.broker.attach({ allowOrigins: ['*.jinritemai.com'] }))).toBe('target/not-found')
  })

  it('reports a missing target and an ambiguous target', () => {
    const missing = fixture()
    attachGuest(missing, 'workspace-a', 'https://example.com/')
    expect(thrownCode(() => missing.broker.attach({ allowOrigins: ['https://buyin.jinritemai.com'] })))
      .toBe('target/not-found')

    const ambiguous = fixture()
    attachGuest(ambiguous, 'workspace-a', 'https://buyin.jinritemai.com/first')
    attachGuest(ambiguous, 'workspace-b', 'https://buyin.jinritemai.com/second')
    expect(thrownCode(() => ambiguous.broker.attach({ allowOrigins: ['https://buyin.jinritemai.com'] })))
      .toBe('target/ambiguous')
  })

  it('rejects allowlists that are not origins or domain suffixes', () => {
    const f = fixture()
    attachGuest(f)
    expect(() => f.broker.attach({ allowOrigins: [] })).toThrow(TypeError)
    expect(() => f.broker.attach({ allowOrigins: ['https://buyin.jinritemai.com/path'] })).toThrow(TypeError)
    expect(() => f.broker.attach({ allowOrigins: ['*.jinritemai.com:8443'] })).toThrow(TypeError)
    expect(() => f.broker.attach({ allowOrigins: ['ftp://example.com'] })).toThrow(TypeError)
  })

  it('denies eval after the guest navigates away from the approved origin', async () => {
    const f = fixture()
    const { reservation, guest, state } = attachGuest(f)
    f.broker.attach({ allowOrigins: ['https://buyin.jinritemai.com'] })
    state.url = 'https://evil.example/phish'
    expect(await rejectedCode(f.broker.evaluate({ targetId: reservation.lease, script: 'return 1' })))
      .toBe('target/origin-denied')
    expect(guest.executeJavaScript).not.toHaveBeenCalled()
  })
})

describe('automation eval policy', () => {
  it('returns the evaluated value and grants a user gesture', async () => {
    const f = fixture()
    const { reservation, guest } = attachGuest(f)
    guest.executeJavaScript.mockResolvedValueOnce({ rows: 2 })
    f.broker.attach({ allowOrigins: ['https://buyin.jinritemai.com'] })
    await expect(f.broker.evaluate({ targetId: reservation.lease, script: 'return document.title' }))
      .resolves.toEqual({ rows: 2 })
    expect(guest.executeJavaScript).toHaveBeenCalledWith('return document.title', true)
  })

  it('rejects scripts above the byte limit before touching the guest', async () => {
    const f = fixture()
    const { reservation, guest } = attachGuest(f)
    f.broker.attach({ allowOrigins: ['https://buyin.jinritemai.com'] })
    expect(await rejectedCode(f.broker.evaluate({
      targetId: reservation.lease, script: 'x'.repeat(64 * 1024 + 1),
    }))).toBe('script/too-large')
    expect(guest.executeJavaScript).not.toHaveBeenCalled()
  })

  it('rejects a script that misses its deadline', async () => {
    const f = fixture()
    const { reservation, guest } = attachGuest(f)
    guest.executeJavaScript.mockReturnValueOnce(new Promise(() => {}))
    f.broker.attach({ allowOrigins: ['https://buyin.jinritemai.com'] })
    expect(await rejectedCode(f.broker.evaluate({
      targetId: reservation.lease, script: 'await new Promise(() => {})', timeoutMs: 20,
    }))).toBe('script/timeout')
  })

  it('rejects non-JSON results and results above the byte limit', async () => {
    const f = fixture()
    const { reservation, guest } = attachGuest(f)
    f.broker.attach({ allowOrigins: ['https://buyin.jinritemai.com'] })
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    guest.executeJavaScript.mockResolvedValueOnce(circular)
    expect(await rejectedCode(f.broker.evaluate({ targetId: reservation.lease, script: 'circular' })))
      .toBe('result/not-json')
    guest.executeJavaScript.mockResolvedValueOnce(undefined)
    expect(await rejectedCode(f.broker.evaluate({ targetId: reservation.lease, script: 'undefined' })))
      .toBe('result/not-json')
    guest.executeJavaScript.mockRejectedValueOnce(new Error('An object could not be cloned.'))
    expect(await rejectedCode(f.broker.evaluate({ targetId: reservation.lease, script: '() => {}' })))
      .toBe('result/not-json')
    guest.executeJavaScript.mockResolvedValueOnce('x'.repeat(256 * 1024 + 1))
    expect(await rejectedCode(f.broker.evaluate({ targetId: reservation.lease, script: 'large' })))
      .toBe('result/too-large')
  })

  it('serializes concurrent calls per target and continues after a failure', async () => {
    const f = fixture()
    const { reservation, guest } = attachGuest(f)
    const first = Promise.withResolvers<unknown>()
    const calls: string[] = []
    guest.executeJavaScript.mockImplementation((script: string) => {
      calls.push(script)
      return first.promise
    })
    f.broker.attach({ allowOrigins: ['https://buyin.jinritemai.com'] })
    const pending = f.broker.evaluate({ targetId: reservation.lease, script: 'first' })
    const queued = f.broker.evaluate({ targetId: reservation.lease, script: 'second' })
    await vi.waitFor(() => { expect(calls).toEqual(['first']) })
    expect(calls).toEqual(['first'])
    first.resolve('done')
    await expect(pending).resolves.toBe('done')
    expect(calls).toEqual(['first', 'second'])

    guest.executeJavaScript.mockImplementationOnce(() => Promise.reject(new Error('guest failed')))
    guest.executeJavaScript.mockResolvedValueOnce('recovered')
    await expect(f.broker.evaluate({ targetId: reservation.lease, script: 'explodes' })).rejects.toThrow('guest failed')
    await expect(f.broker.evaluate({ targetId: reservation.lease, script: 'after failure' })).resolves.toBe('recovered')
    expect(await queued).toBe('done')
  })
})

describe('automation target lifecycle', () => {
  it('reports a closed guest, keeps the closed identity, and notifies the Host', async () => {
    const f = fixture()
    const { reservation, guest } = attachGuest(f)
    f.broker.attach({ allowOrigins: ['https://buyin.jinritemai.com'] })
    guest.close()
    expect(f.events).toEqual([{ type: 'target-closed', targetId: reservation.lease, reason: 'closed' }])
    expect(f.broker.targets()).toEqual([])
    expect(await rejectedCode(f.broker.evaluate({ targetId: reservation.lease, script: 'return 1' })))
      .toBe('target/closed')
  })

  it('reports a crashed renderer and clears the target', () => {
    const f = fixture()
    const { reservation, guest } = attachGuest(f)
    f.broker.attach({ allowOrigins: ['https://buyin.jinritemai.com'] })
    guest.emit('render-process-gone', {}, { reason: 'crashed' })
    expect(f.events).toEqual([{ type: 'target-closed', targetId: reservation.lease, reason: 'crashed' }])
    expect(f.broker.targets()).toEqual([])
    expect(thrownCode(() => f.broker.attach({ allowOrigins: ['https://buyin.jinritemai.com'] })))
      .toBe('target/not-found')
  })

  it('detaches a target so later eval reports it as not attached', async () => {
    const f = fixture()
    const { reservation } = attachGuest(f)
    f.broker.attach({ allowOrigins: ['https://buyin.jinritemai.com'] })
    expect(f.broker.targets()).toEqual([{ targetId: reservation.lease, url: 'https://buyin.jinritemai.com/dashboard' }])
    f.broker.detach(reservation.lease)
    expect(f.broker.targets()).toEqual([])
    expect(await rejectedCode(f.broker.evaluate({ targetId: reservation.lease, script: 'return 1' })))
      .toBe('target/not-found')
    expect(() => { f.broker.detach('unknown-target') }).not.toThrow()
  })
})

describe('automation workbench handler', () => {
  it('routes Host operations to the broker and rejects unknown operations', async () => {
    const f = fixture()
    const { reservation, guest } = attachGuest(f)
    guest.executeJavaScript.mockResolvedValueOnce(7)
    const handle = createAutomationWorkbenchHandler(f.broker)
    await expect(handle('automation/attach', { allowOrigins: ['https://buyin.jinritemai.com'] }))
      .resolves.toEqual({ targetId: reservation.lease, url: 'https://buyin.jinritemai.com/dashboard' })
    await expect(handle('automation/eval', { targetId: reservation.lease, script: '7' })).resolves.toBe(7)
    await expect(handle('automation/targets', {})).resolves.toEqual(
      [{ targetId: reservation.lease, url: 'https://buyin.jinritemai.com/dashboard' }])
    await expect(handle('automation/detach', { targetId: reservation.lease })).resolves.toBeNull()
    await expect(handle('automation/unknown', {})).rejects.toThrow('unsupported operation')
  })
})
