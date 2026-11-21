// @vitest-environment jsdom
/** Console runtime: one live surface per platform, login probes, the one-time console transition, and view state. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BrowserFrameState, BrowserSurface, BrowserSurfaceOptions, BrowserSurfaceService,
} from '@deepseek-ai/dsh-client-ui-sidebar-browser/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { ConsoleController, type ConsoleSnapshot } from '../src/client/ConsoleController.ts'
import { buyin, douyinShop, type PlatformAdapter, type PlatformProbe } from '../src/client/platforms.ts'

/** One controllable surface handed out by the fake provider. */
interface FakeSurface extends BrowserSurface {
  readonly options: BrowserSurfaceOptions
  readonly hostIds: string[]
  frame: BrowserFrameState
  emit(patch: Partial<BrowserFrameState>): void
}

const EMPTY_FRAME: BrowserFrameState = {
  target: undefined, address: 'empty', loading: false, canGoBack: false, canGoForward: false,
  error: undefined, sandboxEnabled: undefined, zoomFactor: undefined, targetId: undefined,
}

/**
 * Build a surface whose frame the test drives directly.
 * @param options - construction inputs recorded for assertions.
 * @returns the fake surface.
 */
function fakeSurface(options: BrowserSurfaceOptions): FakeSurface {
  const listeners = new Set<() => void>()
  const surface: FakeSurface = {
    options,
    hostIds: [],
    frame: { ...EMPTY_FRAME },
    emit(patch) {
      surface.frame = { ...surface.frame, ...patch }
      for (const listener of [...listeners]) listener()
    },
    state: {
      getSnapshot: () => surface.frame,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    } satisfies HostObservable<BrowserFrameState>,
    mount(host) { surface.hostIds.push(host.id); return () => { surface.hostIds.push(`unmounted:${host.id}`) } },
    loadUrl: vi.fn(),
    reload: vi.fn(),
    zoom: { limits: { minimum: 0.5, maximum: 3 }, step: vi.fn() },
    clearStorage: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  }
  return surface
}

/** Surface provider that records creations and lets tests inspect them. */
function fakeProvider(available = true): { provider: BrowserSurfaceService; surfaces: FakeSurface[] } {
  const surfaces: FakeSurface[] = []
  const provider: BrowserSurfaceService = {
    available,
    ...available ? {} : { reason: 'desktop-required' as const },
    create(options) {
      const surface = fakeSurface(options)
      surfaces.push(surface)
      return surface
    },
  }
  return { provider, surfaces }
}

const page = (url: string): Partial<BrowserFrameState> => ({
  target: { kind: 'https', url, title: url }, address: 'observed', loading: false, targetId: 42,
})

const outProbe: PlatformProbe = { url: 'https://fxg.jinritemai.com/login', title: '登录抖店', text: '扫码登录' }
const inProbe: PlatformProbe = { url: 'https://fxg.jinritemai.com/', title: '抖店', text: '直播中控' }
const buyinInProbe: PlatformProbe = { url: 'https://buyin.jinritemai.com/dashboard/live', title: '巨量百应', text: '直播中控' }

/**
 * Build a controller over fresh fakes.
 * @param probe - login probe implementation.
 * @param available - whether the surface provider is usable.
 * @returns the controller with its fakes.
 */
function controllerFor(probe: (platform: PlatformAdapter, signal: AbortSignal) => Promise<PlatformProbe>,
  available = true): { controller: ConsoleController; surfaces: FakeSurface[] } {
  const { provider, surfaces } = fakeProvider(available)
  const controller = new ConsoleController({
    surface: provider, applicationOrigin: 'https://app.example', probe, probeIntervalMs: 1_000, probeRetryMs: 1_000,
  })
  return { controller, surfaces }
}

/**
 * @param controller - controller under test.
 * @returns its latest published snapshot.
 */
function snapshotOf(controller: ConsoleController): ConsoleSnapshot {
  return controller.state.getSnapshot()
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('ConsoleController', () => {
  it('creates a throttled platform surface on the platform partition and opens its login page', async () => {
    const { controller, surfaces } = controllerFor(async () => outProbe)
    const host = document.createElement('div')
    host.id = 'ecom-console-host'
    const unmount = controller.mount(host)
    await controller.open('douyin-shop')
    expect(surfaces).toHaveLength(1)
    expect(surfaces[0]?.options).toMatchObject({
      storageKey: 'platform:douyin-shop:default',
      initialUrl: 'https://fxg.jinritemai.com/login',
      backgroundThrottling: false,
      applicationOrigin: 'https://app.example',
    })
    expect(surfaces[0]?.hostIds).toEqual(['ecom-console-host'])
    expect(snapshotOf(controller)).toMatchObject({ view: 'console', phase: 'starting', platformId: 'douyin-shop' })
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/login'))
    expect(snapshotOf(controller)).toMatchObject({ phase: 'ready', url: 'https://fxg.jinritemai.com/login' })
    unmount()
    expect(surfaces[0]?.hostIds.at(-1)).toBe('unmounted:ecom-console-host')
    await controller.dispose()
  })

  it('restores a remembered console address instead of the login page', async () => {
    const { controller, surfaces } = controllerFor(async () => inProbe)
    await controller.open('buyin', 'https://buyin.jinritemai.com/dashboard/live')
    expect(surfaces[0]?.options.initialUrl).toBe('https://buyin.jinritemai.com/dashboard/live')
    await controller.dispose()
  })

  it('reads the login state from the settled page and refreshes it on the probe interval', async () => {
    let probe: PlatformProbe = outProbe
    const { controller, surfaces } = controllerFor(async () => probe)
    await controller.open('douyin-shop')
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/login'))
    await vi.advanceTimersByTimeAsync(0)
    expect(snapshotOf(controller)).toMatchObject({ loginState: 'out', checking: false })
    probe = inProbe
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/ffa/mshop/homepage/index'))
    await vi.advanceTimersByTimeAsync(1_000)
    expect(snapshotOf(controller).loginState).toBe('in')
    await controller.dispose()
  })

  it('keeps the last login state and retries after a probe failure', async () => {
    let fail = false
    const { controller, surfaces } = controllerFor(async (_platform, signal) => {
      signal.throwIfAborted()
      if (fail) throw new Error('automation unavailable')
      return inProbe
    })
    await controller.open('douyin-shop')
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/'))
    await vi.advanceTimersByTimeAsync(0)
    expect(snapshotOf(controller).loginState).toBe('in')
    fail = true
    await vi.advanceTimersByTimeAsync(1_000)
    expect(snapshotOf(controller)).toMatchObject({ loginState: 'in', checking: false })
    expect(snapshotOf(controller).probeError).toBe('automation unavailable')
    fail = false
    await vi.advanceTimersByTimeAsync(1_000)
    expect(snapshotOf(controller).probeError).toBeUndefined()
    await controller.dispose()
  })

  it('keeps the surface alive while the platform picker shows and replaces it on a platform switch', async () => {
    const { controller, surfaces } = controllerFor(async () => inProbe)
    const host = document.createElement('div')
    host.id = 'ecom-console-host'
    controller.mount(host)
    await controller.open('douyin-shop')
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/'))
    controller.showSelection()
    expect(snapshotOf(controller)).toMatchObject({ view: 'select', platformId: 'douyin-shop' })
    expect(surfaces[0]?.['dispose']).not.toHaveBeenCalled()
    await controller.open('buyin')
    expect(surfaces[0]?.['dispose']).toHaveBeenCalledOnce()
    expect(surfaces[1]?.options.storageKey).toBe('platform:buyin:default')
    expect(surfaces[1]?.hostIds).toEqual(['ecom-console-host'])
    expect(snapshotOf(controller)).toMatchObject({ view: 'console', platformId: 'buyin' })
    await controller.dispose()
  })

  it('reuses the existing surface when the active platform opens again', async () => {
    const { controller, surfaces } = controllerFor(async () => inProbe)
    await controller.open('douyin-shop')
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/'))
    controller.showSelection()
    await controller.open('douyin-shop')
    expect(surfaces).toHaveLength(1)
    expect(snapshotOf(controller).view).toBe('console')
    await controller.dispose()
  })

  it('reports an unavailable surface without throwing or leaving the console view', async () => {
    const { controller, surfaces } = controllerFor(async () => inProbe, false)
    expect(controller.available).toBe(false)
    await controller.open('douyin-shop')
    expect(surfaces).toHaveLength(0)
    expect(snapshotOf(controller)).toMatchObject({ view: 'select', phase: 'failed', platformId: null })
    await controller.dispose()
  })

  it('waits for the mounted guest identity before the first probe', async () => {
    let probes = 0
    const { controller, surfaces } = controllerFor(async () => { probes += 1; return inProbe })
    await controller.open('douyin-shop')
    surfaces[0]?.emit({ target: { kind: 'https', url: 'https://fxg.jinritemai.com/', title: '抖店' },
      address: 'observed', loading: false })
    await vi.advanceTimersByTimeAsync(10)
    expect(probes).toBe(0)
    surfaces[0]?.emit({ targetId: 42 })
    await vi.advanceTimersByTimeAsync(10)
    expect(probes).toBe(1)
    await controller.dispose()
  })

  it('reports a surface failure and retries through reload', async () => {
    const { controller, surfaces } = controllerFor(async () => inProbe)
    await controller.open('douyin-shop')
    surfaces[0]?.emit({ ...page('https://fxg.jinritemai.com/login'), error: { code: -105, description: 'NAME_NOT_RESOLVED' } })
    expect(snapshotOf(controller)).toMatchObject({ phase: 'failed', error: 'NAME_NOT_RESOLVED' })
    controller.retry()
    expect(surfaces[0]?.['reload']).toHaveBeenCalledOnce()
    await controller.dispose()
  })

  it('aborts the in-flight probe and releases the surface on dispose, joining repeated calls', async () => {
    let aborted = false
    const { controller, surfaces } = controllerFor((_platform, signal) => new Promise<PlatformProbe>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true
        reject(new Error('probe aborted'))
      })
    }))
    await controller.open('douyin-shop')
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/ffa/content-tool/live/control'))
    await vi.advanceTimersByTimeAsync(0)
    expect(snapshotOf(controller).checking).toBe(true)
    const first = controller.dispose()
    const second = controller.dispose()
    expect(second).toBe(first)
    await first
    expect(aborted).toBe(true)
    expect(surfaces[0]?.['dispose']).toHaveBeenCalledOnce()
  })

  it('keeps the platform adapters distinct when switching between them', async () => {
    const { controller, surfaces } = controllerFor(async () => inProbe)
    await controller.open('douyin-shop')
    await controller.open('buyin')
    await controller.open('douyin-shop')
    expect(surfaces.map(surface => surface.options.storageKey)).toEqual([
      douyinShop.storageKey('default'), buyin.storageKey('default'), douyinShop.storageKey('default'),
    ])
    await controller.dispose()
  })

  it('re-reads the login state immediately on demand', async () => {
    let probes = 0
    const { controller, surfaces } = controllerFor(async () => {
      probes += 1
      return inProbe
    })
    await controller.open('douyin-shop')
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/'))
    await vi.advanceTimersByTimeAsync(0)
    expect(probes).toBe(1)
    controller.refreshLogin()
    await vi.advanceTimersByTimeAsync(0)
    expect(probes).toBe(2)
    expect(snapshotOf(controller)).toMatchObject({ loginState: 'in', checking: false })
    await controller.dispose()
  })

  it('ignores a refresh request while starting, without a platform, or after disposal', async () => {
    let probes = 0
    const { controller, surfaces } = controllerFor(async () => {
      probes += 1
      return inProbe
    })
    controller.refreshLogin()
    await vi.advanceTimersByTimeAsync(0)
    expect(probes).toBe(0)
    await controller.open('douyin-shop')
    controller.refreshLogin()
    await vi.advanceTimersByTimeAsync(0)
    expect(probes).toBe(0)
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/'))
    await vi.advanceTimersByTimeAsync(0)
    expect(probes).toBe(1)
    await controller.dispose()
    controller.refreshLogin()
    await vi.advanceTimersByTimeAsync(0)
    expect(probes).toBe(1)
  })

  it('keeps one probe in flight across refresh requests', async () => {
    let calls = 0
    const resolvers: Array<(probe: PlatformProbe) => void> = []
    const { controller, surfaces } = controllerFor(() => {
      calls += 1
      return new Promise<PlatformProbe>((resolve) => { resolvers.push(resolve) })
    })
    await controller.open('douyin-shop')
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/'))
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toBe(1)
    controller.refreshLogin()
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toBe(1)
    resolvers[0]?.(inProbe)
    await vi.advanceTimersByTimeAsync(0)
    expect(snapshotOf(controller)).toMatchObject({ loginState: 'in', checking: false })
    controller.refreshLogin()
    await vi.advanceTimersByTimeAsync(0)
    expect(calls).toBe(2)
    resolvers[1]?.(inProbe)
    await vi.advanceTimersByTimeAsync(0)
    await controller.dispose()
  })

  it('navigates to the console once after the probe reports a signed-in guest', async () => {
    let probe: PlatformProbe = outProbe
    const { controller, surfaces } = controllerFor(async () => probe)
    await controller.open('douyin-shop')
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/login'))
    await vi.advanceTimersByTimeAsync(0)
    expect(snapshotOf(controller).loginState).toBe('out')
    expect(surfaces[0]?.['loadUrl']).not.toHaveBeenCalled()
    probe = inProbe
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/ffa/mshop/homepage/index'))
    await vi.advanceTimersByTimeAsync(0)
    expect(surfaces[0]?.['loadUrl']).toHaveBeenCalledExactlyOnceWith(douyinShop.consoleEntry.urls[0])
    // Periodic probes keep reporting sign-in, but this surface already navigated once.
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/ffa/mshop/homepage/index'))
    await vi.advanceTimersByTimeAsync(5_000)
    expect(surfaces[0]?.['loadUrl']).toHaveBeenCalledTimes(1)
    await controller.dispose()
  })

  it('leaves a signed-in guest that already reached a console destination alone', async () => {
    const { controller, surfaces } = controllerFor(async () => inProbe)
    await controller.open('douyin-shop')
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/ffa/content-tool/live/control?from=login'))
    await vi.advanceTimersByTimeAsync(0)
    expect(snapshotOf(controller).loginState).toBe('in')
    expect(surfaces[0]?.['loadUrl']).not.toHaveBeenCalled()
    await controller.dispose()
  })

  it('does not navigate while the login state stays out or unknown', async () => {
    let probe: PlatformProbe = outProbe
    const { controller, surfaces } = controllerFor(async () => probe)
    await controller.open('douyin-shop')
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/help'))
    probe = { url: '', title: '', text: '' }
    await vi.advanceTimersByTimeAsync(1_000)
    expect(snapshotOf(controller).loginState).toBe('unknown')
    expect(surfaces[0]?.['loadUrl']).not.toHaveBeenCalled()
    await controller.dispose()
  })

  it('keeps the console transition retryable when the surface rejects the address', async () => {
    const { controller, surfaces } = controllerFor(async () => inProbe)
    await controller.open('douyin-shop')
    const surface = surfaces[0]
    if (surface === undefined) throw new Error('expected a created surface')
    vi.mocked(surface['loadUrl']).mockImplementationOnce(() => { throw new Error('address rejected') })
    surface.emit(page('https://fxg.jinritemai.com/ffa/mshop/homepage/index'))
    await vi.advanceTimersByTimeAsync(0)
    expect(snapshotOf(controller)).toMatchObject({ loginState: 'in', probeError: 'address rejected' })
    expect(surface['loadUrl']).toHaveBeenCalledTimes(1)
    controller.refreshLogin()
    await vi.advanceTimersByTimeAsync(0)
    expect(surface['loadUrl']).toHaveBeenCalledTimes(2)
    expect(snapshotOf(controller).probeError).toBeUndefined()
    controller.refreshLogin()
    await vi.advanceTimersByTimeAsync(0)
    expect(surface['loadUrl']).toHaveBeenCalledTimes(2)
    await controller.dispose()
  })

  it('does not navigate when the probe resolves after disposal', async () => {
    const resolvers: Array<(probe: PlatformProbe) => void> = []
    const { controller, surfaces } = controllerFor(() => new Promise<PlatformProbe>((resolve) => {
      resolvers.push(resolve)
    }))
    await controller.open('douyin-shop')
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/ffa/mshop/homepage/index'))
    await vi.advanceTimersByTimeAsync(0)
    expect(snapshotOf(controller).checking).toBe(true)
    const disposal = controller.dispose()
    resolvers[0]?.(inProbe)
    await disposal
    await vi.advanceTimersByTimeAsync(0)
    expect(surfaces[0]?.['loadUrl']).not.toHaveBeenCalled()
  })

  it('allows one console navigation per surface across a platform switch', async () => {
    const { controller, surfaces } = controllerFor(async platform => platform.id === 'buyin' ? buyinInProbe : inProbe)
    await controller.open('douyin-shop')
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/ffa/mshop/homepage/index'))
    await vi.advanceTimersByTimeAsync(0)
    expect(surfaces[0]?.['loadUrl']).toHaveBeenCalledWith(douyinShop.consoleEntry.urls[0])
    await controller.open('buyin')
    surfaces[1]?.emit(page('https://buyin.jinritemai.com/dashboard/live'))
    await vi.advanceTimersByTimeAsync(0)
    expect(surfaces[1]?.['loadUrl']).toHaveBeenCalledExactlyOnceWith(buyin.consoleEntry.urls[0])
    await controller.dispose()
  })
})

describe('ConsoleController login recovery', () => {
  /** Mutable probe the fake port resolves; tests swap `value` to move the login state. */
  interface ProbePort { value: PlatformProbe }

  /**
   * Open Douyin Shop on a signed-in probe, then flip the probe signed out so the
   * login counts as expired.
   * @param result - controller and fake surfaces under test.
   * @param port - probe result holder the fake port reads.
   * @returns after the signed-out probe published.
   */
  async function expireLogin(
    result: { controller: ConsoleController; surfaces: FakeSurface[] },
    port: ProbePort,
  ): Promise<void> {
    port.value = inProbe
    await result.controller.open('douyin-shop')
    result.surfaces[0]?.emit(page(douyinShop.consoleEntry.urls[0] ?? ''))
    await vi.advanceTimersByTimeAsync(0)
    expect(snapshotOf(result.controller)).toMatchObject({ loginState: 'in', loginExpired: false })
    port.value = outProbe
    await vi.advanceTimersByTimeAsync(1_000)
    expect(snapshotOf(result.controller)).toMatchObject({ loginState: 'out', loginExpired: true })
  }

  it('marks the login expired only after a signed-in probe is followed by a signed-out one', async () => {
    const port: ProbePort = { value: inProbe }
    const result = controllerFor(async () => port.value)
    await expireLogin(result, port)
    port.value = inProbe
    await vi.advanceTimersByTimeAsync(1_000)
    expect(snapshotOf(result.controller)).toMatchObject({ loginState: 'in', loginExpired: false })
    await result.controller.dispose()
  })

  it('marks the login expired when a signed-in guest is returned to its sign-in page', async () => {
    const { controller, surfaces } = controllerFor(async () => inProbe)
    await controller.open('douyin-shop')
    surfaces[0]?.emit(page(douyinShop.consoleEntry.urls[0] ?? ''))
    await vi.advanceTimersByTimeAsync(0)
    expect(snapshotOf(controller)).toMatchObject({ loginState: 'in', loginExpired: false })
    // The platform flushed the session and redirected the guest before the next probe ran.
    surfaces[0]?.emit(page(douyinShop.loginUrl))
    expect(snapshotOf(controller)).toMatchObject({ loginState: 'out', loginExpired: true })
    controller.relogin()
    expect(snapshotOf(controller)).toMatchObject({ loginState: 'out', loginExpired: false })
    await controller.dispose()
  })

  it('does not mark a guest that never probed signed in as expired', async () => {
    const { controller, surfaces } = controllerFor(async () => outProbe)
    await controller.open('douyin-shop')
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/help'))
    await vi.advanceTimersByTimeAsync(0)
    expect(snapshotOf(controller)).toMatchObject({ loginState: 'out', loginExpired: false })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(snapshotOf(controller)).toMatchObject({ loginState: 'out', loginExpired: false })
    await controller.dispose()
  })

  it('does not treat a failed probe as an expired login', async () => {
    let fail = false
    const { controller, surfaces } = controllerFor(async () => {
      if (fail) throw new Error('automation unavailable')
      return inProbe
    })
    await controller.open('douyin-shop')
    surfaces[0]?.emit(page(douyinShop.consoleEntry.urls[0] ?? ''))
    await vi.advanceTimersByTimeAsync(0)
    expect(snapshotOf(controller).loginState).toBe('in')
    fail = true
    await vi.advanceTimersByTimeAsync(1_000)
    expect(snapshotOf(controller)).toMatchObject({
      loginState: 'in', loginExpired: false, probeError: 'automation unavailable',
    })
    await controller.dispose()
  })

  it('returns the expired guest to the sign-in entry and clears the notice on relogin', async () => {
    const port: ProbePort = { value: inProbe }
    const result = controllerFor(async () => port.value)
    await expireLogin(result, port)
    const surface = result.surfaces[0]
    if (surface === undefined) throw new Error('expected a created surface')
    vi.mocked(surface['loadUrl']).mockClear()
    result.controller.relogin()
    expect(surface['loadUrl']).toHaveBeenCalledExactlyOnceWith(douyinShop.loginUrl)
    expect(snapshotOf(result.controller)).toMatchObject({
      loginExpired: false, loginState: 'out', checking: false, probeError: undefined,
      pageIssue: undefined, blockedLink: undefined, logoutError: undefined,
    })
    // A signed-in probe after the fresh sign-in resumes the console transition.
    port.value = inProbe
    surface.emit(page('https://fxg.jinritemai.com/'))
    await vi.advanceTimersByTimeAsync(0)
    expect(surface['loadUrl']).toHaveBeenLastCalledWith(douyinShop.consoleEntry.urls[0])
    expect(snapshotOf(result.controller)).toMatchObject({ loginState: 'in', loginExpired: false })
    await result.controller.dispose()
  })

  it('clears the platform partition and returns to sign-in on sign-out', async () => {
    const port: ProbePort = { value: inProbe }
    const result = controllerFor(async () => port.value)
    await expireLogin(result, port)
    const surface = result.surfaces[0]
    if (surface === undefined) throw new Error('expected a created surface')
    await result.controller.logout()
    expect(surface['clearStorage']).toHaveBeenCalledOnce()
    expect(surface['loadUrl']).toHaveBeenLastCalledWith(douyinShop.loginUrl)
    expect(snapshotOf(result.controller)).toMatchObject({
      loginExpired: false, loginState: 'out', checking: false, probeError: undefined,
      pageIssue: undefined, blockedLink: undefined, logoutError: undefined,
    })
    await result.controller.dispose()
  })

  it('reports a failed partition clear and stays usable for a retry', async () => {
    const port: ProbePort = { value: inProbe }
    const result = controllerFor(async () => port.value)
    await expireLogin(result, port)
    const surface = result.surfaces[0]
    if (surface === undefined) throw new Error('expected a created surface')
    vi.mocked(surface['clearStorage']).mockRejectedValueOnce(new Error('partition busy'))
    vi.mocked(surface['loadUrl']).mockClear()
    await result.controller.logout()
    expect(snapshotOf(result.controller)).toMatchObject({
      loginExpired: true, loginState: 'out', logoutError: 'partition busy',
    })
    expect(surface['loadUrl']).not.toHaveBeenCalled()
    vi.mocked(surface['clearStorage']).mockResolvedValueOnce(undefined)
    await result.controller.logout()
    expect(snapshotOf(result.controller)).toMatchObject({ loginExpired: false, logoutError: undefined })
    expect(surface['loadUrl']).toHaveBeenLastCalledWith(douyinShop.loginUrl)
    await result.controller.dispose()
  })

  it('ignores sign-out without a surface, without a platform, and after disposal', async () => {
    const { controller, surfaces } = controllerFor(async () => inProbe)
    await controller.logout()
    controller.relogin()
    controller.navigateToLogin()
    expect(surfaces).toHaveLength(0)
    await controller.open('douyin-shop')
    const surface = surfaces[0]
    if (surface === undefined) throw new Error('expected a created surface')
    await controller.dispose()
    await controller.logout()
    expect(surface['clearStorage']).not.toHaveBeenCalled()
  })

  it('runs one partition clear for concurrent sign-out requests', async () => {
    const { controller, surfaces } = controllerFor(async () => inProbe)
    await controller.open('douyin-shop')
    const surface = surfaces[0]
    if (surface === undefined) throw new Error('expected a created surface')
    let release = (): void => {}
    vi.mocked(surface['clearStorage']).mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    const first = controller.logout()
    const second = controller.logout()
    await second
    expect(surface['clearStorage']).toHaveBeenCalledOnce()
    release()
    await first
    expect(surface['loadUrl']).toHaveBeenLastCalledWith(douyinShop.loginUrl)
    await controller.dispose()
  })

  it('resumes the console transition after the platform returns to its own sign-in page', async () => {
    const port: ProbePort = { value: inProbe }
    const result = controllerFor(async () => port.value)
    const { controller, surfaces } = result
    await controller.open('douyin-shop')
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/help'))
    await vi.advanceTimersByTimeAsync(0)
    // The signed-in probe sends the guest to the console once.
    expect(surfaces[0]?.['loadUrl']).toHaveBeenLastCalledWith(douyinShop.consoleEntry.urls[0])
    port.value = outProbe
    await vi.advanceTimersByTimeAsync(1_000)
    expect(snapshotOf(controller)).toMatchObject({ loginState: 'out', loginExpired: true })
    // The platform redirects the expired guest to its sign-in page; the banner stays.
    surfaces[0]?.emit(page(douyinShop.loginUrl))
    await vi.advanceTimersByTimeAsync(0)
    expect(snapshotOf(controller)).toMatchObject({ loginState: 'out', loginExpired: true })
    // A fresh sign-in lands on a platform page and the probe resumes the console transition.
    port.value = inProbe
    surfaces[0]?.emit(page('https://fxg.jinritemai.com/help'))
    await vi.advanceTimersByTimeAsync(0)
    expect(surfaces[0]?.['loadUrl']).toHaveBeenCalledTimes(2)
    expect(surfaces[0]?.['loadUrl']).toHaveBeenLastCalledWith(douyinShop.consoleEntry.urls[0])
    expect(snapshotOf(controller)).toMatchObject({ loginState: 'in', loginExpired: false })
    await controller.dispose()
  })

  it('clears the expiry history when another platform opens', async () => {
    const port: ProbePort = { value: inProbe }
    const result = controllerFor(async () => port.value)
    await expireLogin(result, port)
    port.value = outProbe
    await result.controller.open('buyin')
    expect(snapshotOf(result.controller)).toMatchObject({
      platformId: 'buyin', loginState: 'unknown', loginExpired: false,
    })
    result.surfaces[1]?.emit(page('https://buyin.jinritemai.com/dashboard'))
    await vi.advanceTimersByTimeAsync(0)
    expect(snapshotOf(result.controller)).toMatchObject({ loginState: 'out', loginExpired: false })
    await result.controller.dispose()
  })
})

describe('ConsoleController page classification', () => {
  it('opens the canonical Buyin sign-in entry and treats a portal page as an outside-platform issue', async () => {
    const probe = vi.fn(async () => buyinInProbe)
    const { controller, surfaces } = controllerFor(probe)
    await controller.open('buyin')
    expect(surfaces[0]?.options.initialUrl).toBe(buyin.loginUrl)
    surfaces[0]?.emit(page('https://www.douyinec.com/'))
    await vi.advanceTimersByTimeAsync(0)
    expect(snapshotOf(controller)).toMatchObject({
      phase: 'ready', pageIssue: 'left-platform', loginState: 'out', probeError: undefined,
    })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(probe).not.toHaveBeenCalled()
  })

  it('returns an outside-platform guest to the login entry', async () => {
    const { controller, surfaces } = controllerFor(async () => buyinInProbe)
    await controller.open('buyin')
    surfaces[0]?.emit(page('https://www.douyinec.com/'))
    await vi.advanceTimersByTimeAsync(0)
    controller.navigateToLogin()
    // oxlint-disable-next-line typescript/unbound-method -- vi mock assertion
    expect(surfaces[0]?.loadUrl).toHaveBeenCalledWith(buyin.loginUrl)
    expect(snapshotOf(controller).pageIssue).toBeUndefined()
  })

  it('follows platform links in the guest and blocks external new-window requests', async () => {
    const { controller, surfaces } = controllerFor(async () => buyinInProbe)
    await controller.open('buyin')
    surfaces[0]?.emit(page('https://buyin.jinritemai.com/mpa/account/login?log_out=1&type=24'))
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.followLink('https://buyin.jinritemai.com/mpa/account/login?log_out=1&type=24')).toBe(true)
    // oxlint-disable-next-line typescript/unbound-method -- vi mock assertion
    expect(surfaces[0]?.loadUrl).toHaveBeenCalledTimes(1)
    expect(controller.followLink('https://www.douyinec.com/')).toBe(false)
    // oxlint-disable-next-line typescript/unbound-method -- vi mock assertion
    expect(surfaces[0]?.loadUrl).toHaveBeenCalledTimes(1)
    expect(snapshotOf(controller).blockedLink).toBe(true)
  })
})

describe('ConsoleController zoom', () => {
  it('publishes the carrier zoom factor and forwards zoom commands', async () => {
    const { controller, surfaces } = controllerFor(async () => buyinInProbe)
    await controller.open('buyin')
    expect(surfaces[0]?.options.initialZoom).toBe(0.8)
    surfaces[0]?.emit({ ...page('https://buyin.jinritemai.com/dashboard/live/control'), zoomFactor: 1 })
    await vi.advanceTimersByTimeAsync(0)
    expect(snapshotOf(controller).zoomFactor).toBe(1)
    expect(snapshotOf(controller).zoomLimits).toEqual({ minimum: 0.5, maximum: 3 })
    controller.zoomIn()
    // oxlint-disable-next-line typescript/unbound-method -- vi mock assertion
    expect(surfaces[0]?.zoom?.step).toHaveBeenCalledWith(1)
    controller.zoomOut()
    // oxlint-disable-next-line typescript/unbound-method -- vi mock assertion
    expect(surfaces[0]?.zoom?.step).toHaveBeenCalledWith(-1)
    controller.resetZoom()
    // oxlint-disable-next-line typescript/unbound-method -- vi mock assertion
    expect(surfaces[0]?.zoom?.step).toHaveBeenCalledWith(0)
    await controller.dispose()
    controller.zoomIn()
    // oxlint-disable-next-line typescript/unbound-method -- vi mock assertion
    expect(surfaces[0]?.zoom?.step).toHaveBeenCalledTimes(3)
  })
})
