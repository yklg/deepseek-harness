/** Existing browser-local navigation records, independent from live frame state. */
import type { BrowserAddressFailure, BrowserTarget } from './url.ts'

/** One retained address. */
export type BrowserHistoryEntry = BrowserTarget

/** Observability recorded for a controlled navigation. */
export type BrowserNavigationStatus =
  | { readonly status: 'empty' }
  | { readonly status: 'loading'; readonly revision: number }
  | { readonly status: 'known'; readonly revision: number }
  | { readonly status: 'unknown'; readonly revision: number }

/** Address refusal carried by existing browser-local records. */
export type BrowserFailure = { readonly kind: 'address'; readonly reason: BrowserAddressFailure }

/** Serializable record; providers retain the history they can restore. */
export interface BrowserTabState {
  readonly entries: readonly BrowserHistoryEntry[]
  readonly index: number
  readonly request: { readonly revision: number; readonly target: BrowserTarget } | undefined
  readonly navigation: BrowserNavigationStatus
  readonly failure: BrowserFailure | undefined
  /** Page-zoom factor; absent in records written before zoom existed. */
  readonly zoom?: number
}

/**
 * Read the selected address from a saved navigation record.
 * @param state - saved navigation.
 * @returns its last selected address, if any.
 */
export function currentBrowserTarget(state: BrowserTabState | undefined): BrowserTarget | undefined {
  return state === undefined || state.index < 0 ? undefined : state.entries[state.index]
}

/**
 * Checkpoint an observed address without serializing native history.
 * @param target - current address.
 * @param revision - navigation generation.
 * @param zoom - page-zoom factor to retain with the address.
 * @returns an address-only checkpoint.
 */
export function browserAddressCheckpoint(target: BrowserTarget, revision: number, zoom?: number): BrowserTabState {
  return { entries: [target], index: 0, request: { target, revision },
    navigation: { status: 'known', revision }, failure: undefined, ...zoom === undefined ? {} : { zoom } }
}

/**
 * Checkpoint a zoom change without disturbing a saved address.
 * @param target - saved address, when the tab has one.
 * @param revision - navigation generation.
 * @param zoom - page-zoom factor to retain.
 * @returns a checkpoint carrying the factor.
 */
export function browserZoomCheckpoint(target: BrowserTarget | undefined, revision: number, zoom: number): BrowserTabState {
  if (target !== undefined) return browserAddressCheckpoint(target, revision, zoom)
  return { entries: [], index: -1, request: undefined,
    navigation: { status: 'empty' }, failure: undefined, zoom }
}
