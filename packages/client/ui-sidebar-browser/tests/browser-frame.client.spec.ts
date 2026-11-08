import { afterEach, describe, expect, it, vi } from 'vitest'
import { BROWSER_ZOOM, clampBrowserZoom, savedBrowserZoom, steppedBrowserZoom } from '../src/client/browser/BrowserFrame.ts'
import { IframeImpl } from '../src/client/browser/IframeImpl.ts'
import { IframePresentation } from '../src/client/view/IframePresentation.ts'

const frames: IframeImpl[] = []

afterEach(async () => {
  await Promise.all(frames.splice(0).map(frame => frame.dispose()))
})

describe('browser zoom factors', () => {
  it('clamps requests to the supported range and centesimal precision', () => {
    expect(clampBrowserZoom(0.1)).toBe(BROWSER_ZOOM.minimum)
    expect(clampBrowserZoom(5)).toBe(BROWSER_ZOOM.maximum)
    expect(clampBrowserZoom(1.234)).toBe(1.23)
    expect(clampBrowserZoom(1)).toBe(1)
  })

  it('steps without floating-point drift and stops at the bounds', () => {
    expect(steppedBrowserZoom(0.7, 1)).toBe(0.8)
    expect(steppedBrowserZoom(1, -1)).toBe(0.9)
    expect(steppedBrowserZoom(BROWSER_ZOOM.minimum, -1)).toBe(BROWSER_ZOOM.minimum)
    expect(steppedBrowserZoom(BROWSER_ZOOM.maximum, 1)).toBe(BROWSER_ZOOM.maximum)
  })

  it('accepts only a finite saved factor and clamps it', () => {
    expect(savedBrowserZoom(undefined)).toBe(BROWSER_ZOOM.neutral)
    expect(savedBrowserZoom(Number.NaN)).toBe(BROWSER_ZOOM.neutral)
    expect(savedBrowserZoom(Number.POSITIVE_INFINITY)).toBe(BROWSER_ZOOM.neutral)
    expect(savedBrowserZoom(2.5)).toBe(2.5)
    expect(savedBrowserZoom(99)).toBe(BROWSER_ZOOM.maximum)
  })
})

describe('IframeImpl', () => {
  it('owns transient sandbox mode and revision-scoped load state', async () => {
    const persist = vi.fn()
    const presentation = new IframePresentation({ loaded: vi.fn(), failed: vi.fn(), remounted: vi.fn() })
    const frame = new IframeImpl({ initial: undefined, persist, openRequested: vi.fn() }, presentation)
    frames.push(frame)
    const listener = vi.fn()
    const unsubscribe = frame.subscribe(listener)
    try {
      frame.handleLoaded(0)
      expect(frame.getSnapshot().address).toBe('empty')
      expect(frame.getSnapshot().zoomFactor).toBeUndefined()
      frame.sandbox.setEnabled(false)
      frame.sandbox.setEnabled(false)
      expect(frame.getSnapshot().sandboxEnabled).toBe(false)
      expect(frame.getSnapshot().target).toBeUndefined()

      const target = { kind: 'https' as const, url: 'https://example.test/', title: 'example.test' }
      frame.handleLoadFailed(1)
      expect(frame.getSnapshot().error).toBeUndefined()
      frame.loadUrl(target)
      frame.handleLoadFailed(0)
      expect(frame.getSnapshot().error).toBeUndefined()
      frame.handleLoadFailed(1)
      frame.handleLoadFailed(1)
      expect(frame.getSnapshot()).toMatchObject({ target, error: { code: undefined, description: undefined }, loading: false })
      frame.handleLoaded(1)
      expect(persist).toHaveBeenLastCalledWith(expect.objectContaining({ navigation: { status: 'known', revision: 1 } }))
      frame.reload()
      expect(frame.getSnapshot()).toMatchObject({ target, error: undefined, loading: true })
      frame.handleLoadFailed(1)
      expect(frame.getSnapshot().error).toBeUndefined()
      expect(listener).toHaveBeenCalled()

      await frame.dispose()
      const stopped = frame.getSnapshot()
      frame.handleLoadFailed(2)
      frame.handleLoaded(2)
      frame.reload()
      frame.loadUrl(target)
      frame.goBack()
      frame.goForward()
      frame.sandbox.setEnabled(true)
      expect(frame.getSnapshot()).toBe(stopped)
    } finally {
      unsubscribe()
    }
  })
})
