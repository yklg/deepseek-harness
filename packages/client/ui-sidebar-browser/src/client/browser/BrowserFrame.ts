/** Carrier-neutral page navigation and observable state. */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { BrowserTarget } from './url.ts'

/** A loading failure, optionally carrying the underlying browser's diagnostic. */
export interface BrowserLoadError {
  readonly code: number | undefined
  readonly description: string | undefined
}

/** State consumed by common browser chrome, without DOM or carrier identifiers. */
export interface BrowserFrameState {
  readonly target: BrowserTarget | undefined
  readonly address: 'empty' | 'requested' | 'observed' | 'unknown'
  readonly loading: boolean
  readonly canGoBack: boolean
  readonly canGoForward: boolean
  readonly error: BrowserLoadError | undefined
  /** Undefined when this provider does not expose a sandbox control. */
  readonly sandboxEnabled: boolean | undefined
  /** Effective page-zoom factor; undefined when this provider cannot zoom embedded content. */
  readonly zoomFactor: number | undefined
}

/** Optional iframe policy control, not an Electron process-sandbox switch. */
export interface BrowserSandboxControl {
  /** @param enabled - whether the provider's embedding sandbox is enforced. */
  setEnabled(enabled: boolean): void
}

/** Optional embedded-page zoom; page layout scales while the surrounding app stays fixed. */
export interface BrowserZoomControl {
  /** @param factor - requested factor; the provider clamps it and publishes the effective value. */
  setFactor(factor: number): void
}

/** Page-zoom limits, increment, and the neutral factor. */
export const BROWSER_ZOOM = { minimum: 0.5, maximum: 3, step: 0.1, neutral: 1 } as const

/**
 * Clamp a requested zoom factor to the supported range and centesimal precision.
 * @param factor - requested factor.
 * @returns the effective factor.
 */
export function clampBrowserZoom(factor: number): number {
  return Math.round(Math.min(BROWSER_ZOOM.maximum, Math.max(BROWSER_ZOOM.minimum, factor)) * 100) / 100
}

/**
 * Step a zoom factor without accumulating floating-point noise.
 * @param factor - current effective factor.
 * @param direction - one step in or out.
 * @returns the next effective factor.
 */
export function steppedBrowserZoom(factor: number, direction: -1 | 1): number {
  return clampBrowserZoom(factor + direction * BROWSER_ZOOM.step)
}

/**
 * Validate a saved factor from the persistence boundary.
 * @param factor - saved value, absent in records written before zoom existed.
 * @returns a clamped factor, or neutral when the saved value is unusable.
 */
export function savedBrowserZoom(factor: number | undefined): number {
  return factor === undefined || !Number.isFinite(factor) ? BROWSER_ZOOM.neutral : clampBrowserZoom(factor)
}

/** Navigation owns page lifetime; mounting and hiding belong to BrowserPresentation. */
export interface BrowserFrame extends HostObservable<BrowserFrameState> {
  readonly sandbox?: BrowserSandboxControl
  readonly zoom?: BrowserZoomControl
  /** @param target - validated HTTP(S) address; loading failures are published in state. */
  loadUrl(target: BrowserTarget): void
  /** Move backward when the provider reports an available entry. */
  goBack(): void
  /** Move forward when the provider reports an available entry. */
  goForward(): void
  /** Reload the current address without creating a new history entry. */
  reload(): void
  /** @returns after the page, listeners and pending initialization have been released; repeated calls join disposal. */
  dispose(): Promise<void>
}

/**
 * Create idle navigation state without a page target.
 * @returns state before any page has been requested.
 */
export function emptyBrowserFrame(): BrowserFrameState {
  return { target: undefined, address: 'empty', loading: false, canGoBack: false, canGoForward: false,
    error: undefined, sandboxEnabled: undefined, zoomFactor: undefined }
}
