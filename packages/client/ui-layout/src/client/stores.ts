/**
 * Root-owned frame measurement, panel preferences, and presentation reports.
 * The registration supplies a fresh store and binds its actions to ctx.layout.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { MainPanelId } from './service.ts'
import {
  clampWidth, RIGHTBAR_DEFAULT_RATIO, RIGHTBAR_MAX_RATIO, RIGHTBAR_MIN,
  SIDEBAR_AUTO_COLLAPSE, SIDEBAR_DEFAULT, SIDEBAR_DRAWER_BREAKPOINT, SIDEBAR_MAX, SIDEBAR_MIN,
} from './columns.ts'

/** Storage port for the browser-rail width preference; the browser localStorage satisfies it. */
export interface LayoutStorage {
  /** @param key - preference key supplied by this package. @returns raw stored value or null. */
  getItem(key: string): string | null
  /** @param key - preference key supplied by this package. @param value - serialized width in px. */
  setItem(key: string, value: string): void
}

/** localStorage key holding the browser rail's last dragged width, in px. */
export const LAYOUT_RIGHTBAR_STORAGE_KEY = 'dsh.layout.rightbar'

/** Upper bound accepted from storage; the frame solve still clamps to the current viewport. */
const MAX_PERSISTED_RIGHTBAR = 10_000

/**
 * Read the optional storage port.
 * @returns the browser localStorage, or null when the environment prevents access.
 */
function defaultLayoutStorage(): LayoutStorage | null {
  try {
    return globalThis.localStorage
  } catch {
    return null
  }
}

/**
 * Read the persisted browser-rail width.
 * @param storage - layout storage port, or null when persistence is disabled.
 * @returns the stored width clamped to the rail's floor, or null without a usable value.
 */
function readPersistedRightbar(storage: LayoutStorage | null): number | null {
  if (storage === null) return null
  try {
    const raw = storage.getItem(LAYOUT_RIGHTBAR_STORAGE_KEY)
    if (raw === null) return null
    const width = Number(raw)
    if (!Number.isFinite(width) || width <= 0) return null
    return clampWidth(width, RIGHTBAR_MIN, MAX_PERSISTED_RIGHTBAR)
  } catch {
    return null
  }
}

/** Options for {@link createLayoutStore}. */
export interface LayoutStoreOptions {
  /**
   * Preference storage; defaults to the browser localStorage.
   * Pass null to keep the store fully in memory (tests, restricted environments).
   */
  readonly storage?: LayoutStorage | null
}

/**
 * Transient layout preferences. Responsive concessions never rewrite widths;
 * the right panel's expanded state belongs to its occupant.
 */
type LayoutState = {
  panelInfo: {
    /** Null selects the Conversation; global panels keep the current Session intact. */
    activePanelId: MainPanelId | null
  }
  layoutInfo: LayoutInfo
}

type LayoutInfo = {
  sidebar: number
  /** Last positive frame measurement; window width bootstraps the first render. */
  viewportWidth: number
  narrowExpanded: boolean
  /**
   * Saved right panel width in px, or null before its first opening. Resizing
   * the frame and closing the panel preserve this preference.
   */
  rightbar: number | null
  /**
   * Whether the right panel is drawn at all, in either presentation.
   *
   * Derived chrome, not a source of truth: whether the right surface is
   * expanded is a recorded fact owned by that surface, reported here so the
   * frame can place the panel's resize handle. The occupant reports it; nothing
   * else writes it.
   */
  rightbarShown: boolean
  /**
   * Whether the normal panel width reserves a grid track, including beneath
   * fullscreen. Reported by the occupant; always false while hidden.
   */
  rightbarTrack: boolean
  /** Reported fullscreen presentation; hides the outer resize handle. */
  rightbarFullscreen: boolean
  /** Suppress transitions for a fullscreen exit until another geometry action. */
  rightbarInstant: boolean
}

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type LayoutActions = {
  selectPanel: (draft: LayoutState, panelId: MainPanelId | null) => void
  retainMainPanels: (draft: LayoutState, panelIds: readonly string[]) => void
  setSidebar: (draft: LayoutState, px: number) => void
  setSidebarCollapsed: (draft: LayoutState, collapsed: boolean) => void
  toggleSidebar: (draft: LayoutState) => void
  setViewportWidth: (draft: LayoutState, width: number) => void
  setRightbar: (draft: LayoutState, px: number) => void
  openRightbar: (draft: LayoutState, track: boolean, fullscreen: boolean) => void
  closeRightbar: (draft: LayoutState) => void
}

/**
 * Create the layout panel store handle. For the sidebar the preference IS the
 * width, so closing it forgets its drag width — reopening restores the contract
 * default. The browser rail initializes from the persisted drag width (when
 * the storage port has one) or at 45% of the frame on first opening, and keeps
 * that px preference across resizes and close. Drag writes clamp to the current
 * frame's range and persist through the storage port. Narrow sidebar toggles
 * change only the expansion override; opening the right panel clears that
 * override.
 * @param options - storage port override; an explicit null keeps preferences in memory.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createLayoutStore(options: LayoutStoreOptions = {}): EngineStoreHandle<LayoutState, LayoutActions>  {
  const storage = options.storage === undefined ? defaultLayoutStorage() : options.storage
  const persistedRightbar = readPersistedRightbar(storage)
  const persistRightbar = (width: number): void => {
    if (storage === null) return
    try {
      storage.setItem(LAYOUT_RIGHTBAR_STORAGE_KEY, String(width))
    } catch {
      // A blocked or full storage degrades to an in-memory preference.
    }
  }
  const handle = defineStore({
    init: (): LayoutState => ({
      panelInfo: { activePanelId: null },
      layoutInfo: {
        sidebar: SIDEBAR_DEFAULT,
        viewportWidth: window.innerWidth,
        narrowExpanded: false,
        rightbar: persistedRightbar,
        rightbarShown: false,
        rightbarTrack: false,
        rightbarFullscreen: false,
        rightbarInstant: false,
      },
    }),
    actions: {
      selectPanel: (d, panelId: MainPanelId | null) => {
        d.panelInfo.activePanelId = panelId
        if (d.layoutInfo.viewportWidth < SIDEBAR_DRAWER_BREAKPOINT) d.layoutInfo.narrowExpanded = false
      },
      retainMainPanels: (d, panelIds: readonly string[]) => {
        if (d.panelInfo.activePanelId !== null && !panelIds.includes(d.panelInfo.activePanelId)) {
          d.panelInfo.activePanelId = null
        }
      },
      setSidebar: (d, px: number) => {
        d.layoutInfo.rightbarInstant = false
        d.layoutInfo.sidebar = clampWidth(px, SIDEBAR_MIN, SIDEBAR_MAX)
      },
      // The ecommerce console collapses the navigation while it owns the main
      // area; an explicit setter lets it restore the state it observed instead
      // of inferring a toggle count.
      setSidebarCollapsed: (d, collapsed) => {
        d.layoutInfo.rightbarInstant = false
        if (d.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE) d.layoutInfo.narrowExpanded = !collapsed
        else d.layoutInfo.sidebar = collapsed ? 0 : d.layoutInfo.sidebar === 0 ? SIDEBAR_DEFAULT : d.layoutInfo.sidebar
      },
      // Narrow toggles flip only the override: the width preference survives
      // untouched, so re-widening restores the pre-squeeze layout.
      toggleSidebar: (d) => {
        d.layoutInfo.rightbarInstant = false
        if (d.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE) d.layoutInfo.narrowExpanded = !d.layoutInfo.narrowExpanded
        else d.layoutInfo.sidebar = d.layoutInfo.sidebar === 0 ? SIDEBAR_DEFAULT : 0
      },
      // Crossing the breakpoint in either direction drops the override: the
      // narrow default is auto-collapsed, the wide state is the preference.
      setViewportWidth: (d, width: number) => {
        if (d.layoutInfo.viewportWidth === width) return
        d.layoutInfo.rightbarInstant = false
        if ((d.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE) !== (width < SIDEBAR_AUTO_COLLAPSE)
          || (d.layoutInfo.viewportWidth < SIDEBAR_DRAWER_BREAKPOINT) !== (width < SIDEBAR_DRAWER_BREAKPOINT)) {
          d.layoutInfo.narrowExpanded = false
        }
        d.layoutInfo.viewportWidth = width
      },
      setRightbar: (d, px: number) => {
        d.layoutInfo.rightbarInstant = false
        const width = clampWidth(px, RIGHTBAR_MIN, Math.max(RIGHTBAR_MIN, d.layoutInfo.viewportWidth * RIGHTBAR_MAX_RATIO))
        d.layoutInfo.rightbar = width
        persistRightbar(width)
      },
      openRightbar: (d, track: boolean, fullscreen: boolean) => {
        if (!d.layoutInfo.rightbarShown || d.layoutInfo.rightbarTrack !== track || d.layoutInfo.rightbarFullscreen !== fullscreen) {
          d.layoutInfo.rightbarInstant = d.layoutInfo.rightbarFullscreen && !fullscreen
        }
        if (!d.layoutInfo.rightbarShown && d.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE) d.layoutInfo.narrowExpanded = false
        d.layoutInfo.rightbar ??= Math.max(RIGHTBAR_MIN, Math.round(d.layoutInfo.viewportWidth * RIGHTBAR_DEFAULT_RATIO))
        d.layoutInfo.rightbarShown = true
        d.layoutInfo.rightbarTrack = track
        d.layoutInfo.rightbarFullscreen = fullscreen
      },
      closeRightbar: (d) => {
        if (d.layoutInfo.rightbarShown) d.layoutInfo.rightbarInstant = d.layoutInfo.rightbarFullscreen
        d.layoutInfo.rightbarShown = false
        d.layoutInfo.rightbarTrack = false
        d.layoutInfo.rightbarFullscreen = false
      },
    },
  })
  return handle
}
