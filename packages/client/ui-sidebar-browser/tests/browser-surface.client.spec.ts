// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import {
  createBrowserSurface, createDesktopBrowserSurface, unavailableBrowserSurface,
} from '../src/client/surface/BrowserSurface.ts'
import { electronFixture } from './electron-harness.client.ts'

const fixtures: ReturnType<typeof electronFixture>[] = []

afterEach(async () => {
  for (const h of fixtures.splice(0)) await h.dispose()
  vi.restoreAllMocks()
})

it('mounts a platform surface, reports its target and clears only that partition', async () => {
  const h = electronFixture()
  fixtures.push(h)
  const options = { storageKey: 'platform:douyin-shop:default', applicationOrigin: 'https://app.example',
    backgroundThrottling: false } as const
  const surface = createBrowserSurface(h, options, h.bridge)
  const unmount = surface.mount(h.host)
  surface.loadUrl('https://example.test/console')
  const guest = await h.guest()
  guest.state.url = 'https://example.test/console'
  guest.emit('dom-ready')

  expect(h.bridge.acquire).toHaveBeenCalledOnce()
  expect(surface.state.getSnapshot().target?.url).toBe('https://example.test/console')
  expect(surface.state.getSnapshot().targetId).toBe(guest.state.webContentsId)
  await surface.clearStorage()
  expect(h.bridge.clearStorage).toHaveBeenCalledExactlyOnceWith(options.storageKey)
  expect(() => { surface.loadUrl('javascript:alert(1)') }).toThrow('browser surface rejected the address')

  unmount()
  await surface.dispose()
  expect(h.bridge.release).toHaveBeenCalledOnce()
})

it('exposes a desktop factory and a Web unavailable service', async () => {
  const h = electronFixture()
  fixtures.push(h)
  const service = createDesktopBrowserSurface(h.bridge)
  expect(service.available).toBe(true)
  const host = document.createElement('div')
  host.id = 'browser-surface-service-host'
  document.body.append(host)
  const surface = service.create({ storageKey: 'platform:test:default', applicationOrigin: 'https://app.example',
    backgroundThrottling: false })
  try {
    surface.mount(host)
    surface.loadUrl('https://example.test/console')
    await vi.waitFor(() => {
      expect(h.bridge.acquire).toHaveBeenCalledExactlyOnceWith('platform:test:default',
        { backgroundThrottling: false })
    })
  } finally {
    await surface.dispose()
    host.remove()
  }
  expect(unavailableBrowserSurface.available).toBe(false)
  expect(() => unavailableBrowserSurface.create({
    storageKey: 'platform:test:default', applicationOrigin: 'https://app.example',
  })).toThrow('desktop shell')
})
