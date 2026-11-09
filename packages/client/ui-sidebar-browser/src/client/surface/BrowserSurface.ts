/** Generic main-area browser surface, independent from the right-Sidebar tab model. */
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { DesktopBrowserBridge } from '../../types.ts'
import { BROWSER_ZOOM, steppedBrowserZoom, type BrowserFrameState } from '../browser/BrowserFrame.ts'
import type { BrowserPage, BrowserPageOptions } from '../browser/BrowserPage.ts'
import { parseBrowserAddress } from '../browser/url.ts'
import { createElectronPage } from '../electron/pages.ts'

/** Construction inputs for one persistent workspace surface. */
export interface BrowserSurfaceOptions {
  /** Storage identity; a platform key such as `platform:douyin-shop:default` is valid. */
  readonly storageKey: string
  /** Optional first address loaded after the host mounts. */
  readonly initialUrl?: string
  /** Desktop guest throttle policy; false keeps the guest running while hidden. */
  readonly backgroundThrottling?: boolean
  /** Application origin used by the shared address parser. */
  readonly applicationOrigin: string
  /** Receives page-initiated new-window requests (target=_blank/window.open). */
  readonly openRequested?: (url: string) => void
}

/** Controlled embedded-page zoom over the surface's carrier. */
export interface BrowserZoom {
  /** Inclusive supported factor range. */
  readonly limits: { readonly minimum: number; readonly maximum: number }
  /**
   * Step the page zoom; 0 resets to the neutral factor.
   * @param direction - one step out, reset, or one step in.
   */
  step(direction: -1 | 0 | 1): void
}

/** A mounted webview surface with carrier-neutral navigation state. */
export interface BrowserSurface {
  /** Live URL, title, loading, error, zoom and target identity. */
  readonly state: HostObservable<BrowserFrameState>
  /** Embedded-page zoom; undefined when the carrier cannot zoom. */
  readonly zoom?: BrowserZoom
  /** @param host - stable DOM container; its id is used by the presentation. @returns detaches the page without disposing it. */
  mount(host: HTMLElement): () => void
  /** @param value - validated HTTP(S) address; throws on rejected input. */
  loadUrl(value: string): void
  /** Reload the current address without a new history entry. */
  reload(): void
  /** Clear this surface's persistent partition (logout). */
  clearStorage(): Promise<void>
  /** @returns after the page, listeners and pending initialization are released. */
  dispose(): Promise<void>
}

/** Browser surface capability exposed through Cordis. */
export interface BrowserSurfaceService {
  readonly available: boolean
  /** Present when `available` is false. */
  readonly reason?: 'desktop-required'
  /** @param options - storage identity, first address and throttle policy. */
  create(options: BrowserSurfaceOptions): BrowserSurface
}

/** Surface implementation over one BrowserPage. */
class SurfaceController implements BrowserSurface {
  /** Controlled zoom over the page carrier, absent for carriers without zoom. */
  readonly zoom?: BrowserZoom
  private readonly store: SnapshotStore<BrowserFrameState>
  private readonly unsubscribe: () => void
  private unmount: (() => void) | undefined
  private initialUrl: string | undefined
  private disposed = false
  private disposal: Promise<void> | undefined

  constructor(private readonly page: BrowserPage, private readonly options: BrowserSurfaceOptions,
    private readonly bridge: DesktopBrowserBridge | undefined) {
    this.initialUrl = options.initialUrl
    this.store = createSnapshotStore(page.frame.getSnapshot())
    const carrierZoom = page.frame.zoom
    if (carrierZoom !== undefined) {
      this.zoom = {
        limits: { minimum: BROWSER_ZOOM.minimum, maximum: BROWSER_ZOOM.maximum },
        step: (direction) => {
          if (this.disposed) return
          const current = this.store.getSnapshot().zoomFactor
          if (current === undefined) return
          carrierZoom.setFactor(direction === 0 ? BROWSER_ZOOM.neutral : steppedBrowserZoom(current, direction))
        },
      }
    }
    this.unsubscribe = page.frame.subscribe(() => {
      if (!this.disposed) this.store.set(page.frame.getSnapshot())
    })
  }

  /** @returns immutable carrier-neutral surface state. */
  get state(): HostObservable<BrowserFrameState> { return this.store }

  /** @param host - stable DOM container with an id. @returns physical detach only. */
  mount(host: HTMLElement): () => void {
    if (this.disposed) return () => {}
    if (host.id === '') host.id = 'browser-surface-host'
    this.unmount?.()
    this.unmount = this.page.presentation.mount(host.id)
    const initial = this.initialUrl
    this.initialUrl = undefined
    if (initial !== undefined) this.loadUrl(initial)
    return this.unmount
  }

  /** @param value - HTTP(S) address validated by the shared parser. */
  loadUrl(value: string): void {
    if (this.disposed) return
    const parsed = parseBrowserAddress(value, this.options.applicationOrigin)
    if (!parsed.ok) throw new Error(`browser surface rejected the address: ${parsed.reason}`)
    this.page.frame.loadUrl(parsed.target)
  }

  /** Reload the current address. */
  reload(): void {
    if (!this.disposed) this.page.frame.reload()
  }

  /** Clear the platform partition behind this surface. */
  async clearStorage(): Promise<void> {
    if (this.bridge !== undefined) await this.bridge.clearStorage(this.options.storageKey)
  }

  /** @returns after the page and its listeners are released. */
  dispose(): Promise<void> {
    if (this.disposal !== undefined) return this.disposal
    this.disposed = true
    this.unsubscribe()
    this.unmount?.()
    this.disposal = this.page.frame.dispose()
    return this.disposal
  }
}

/**
 * Wrap one prepared page as a workspace surface; used by the desktop service and tests.
 * @param page - navigation and presentation pair.
 * @param options - storage identity, first address and throttle policy.
 * @param bridge - optional partition-clearing bridge.
 * @returns the surface controller.
 */
export function createBrowserSurface(page: BrowserPage, options: BrowserSurfaceOptions,
  bridge?: DesktopBrowserBridge): BrowserSurface {
  return new SurfaceController(page, options, bridge)
}

/**
 * Build the desktop surface service over the shipped Electron page provider.
 * @param bridge - preload-exposed guest operations.
 * @returns the surface factory.
 */
export function createDesktopBrowserSurface(bridge: DesktopBrowserBridge): BrowserSurfaceService {
  return {
    available: true,
    create(options) {
      const pageOptions: BrowserPageOptions = {
        initial: undefined,
        persist: () => {},
        openRequested: (url) => { options.openRequested?.(url) },
        ...options.backgroundThrottling === undefined ? {} : { backgroundThrottling: options.backgroundThrottling },
      }
      const page = createElectronPage(pageOptions, bridge, () => Promise.resolve(options.storageKey))
      return createBrowserSurface(page, options, bridge)
    },
  }
}

/** Web shells expose the service but cannot host a persistent platform guest. */
export const unavailableBrowserSurface: BrowserSurfaceService = {
  available: false,
  reason: 'desktop-required',
  create() { throw new Error('browser surface requires the desktop shell') },
}
