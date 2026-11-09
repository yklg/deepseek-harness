/** Persistent open/rect state for the product AI assistant floating window. */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import {
  clampAssistantRect, defaultAssistantRect, moveAssistantRect, resizeAssistantRect, snapAssistantRect,
  type AssistantSnapState, type WindowRect, type WindowSize,
} from './float-window.ts'

export { moveAssistantRect, resizeAssistantRect, snapAssistantRect }
export type { AssistantSnapState }

/** Storage surface the assistant state persists through; a failure keeps the in-memory rect. */
export interface AssistantWindowStorage {
  /** @param key - preference key. @returns the stored value, or null. */
  getItem(key: string): string | null
  /** @param key - preference key. @param value - serialized value. */
  setItem(key: string, value: string): void
}

/** Published assistant window state. */
export interface AssistantWindowSnapshot {
  /** Whether the floating window is open. */
  readonly open: boolean
  /** Current window rectangle; always clamped to the current viewport. */
  readonly rect: WindowRect
}

/** Observable assistant state plus its actions. */
export interface AssistantWindowStore {
  readonly state: HostObservable<AssistantWindowSnapshot>
  /** Toggle visibility without changing the rectangle. */
  toggle(): void
  /** Close the window, keeping its rectangle for the next open. */
  close(): void
  /** @param rect - candidate rectangle after a gesture; clamped and persisted. */
  moveTo(rect: WindowRect): void
  /** Re-clamp after a viewport resize. */
  reclamp(): void
  /** Clear the persisted rectangle and restore the default placement. */
  reset(): void
}

/** Persistence key; versioned so a later schema can replace it safely. */
export const ASSISTANT_WINDOW_STORAGE_KEY = 'ecomWorkbench.assistantWindow.v1'

/** Snapshot schema version. */
const STORAGE_VERSION = 1

/** Persisted payload before validation. */
interface PersistedWindow {
  readonly version?: unknown
  readonly rect?: unknown
}

/**
 * @param value - untrusted persisted payload.
 * @returns the rect when every coordinate is finite and positive, otherwise undefined.
 */
function parseRect(value: unknown): WindowRect | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const rect = value as Record<string, unknown>
  const fields = ['x', 'y', 'width', 'height'] as const
  const parsed = {} as Record<(typeof fields)[number], number>
  for (const field of fields) {
    const number = rect[field]
    if (typeof number !== 'number' || !Number.isFinite(number)) return undefined
    parsed[field] = number
  }
  return { x: parsed.x, y: parsed.y, width: parsed.width, height: parsed.height }
}

/**
 * Create the AI assistant window state store.
 * @param options - persistence surface and a viewport snapshot reader.
 * @returns the state observable and its actions.
 */
export function createAssistantWindowStore(options: {
  readonly storage: AssistantWindowStorage | null
  readonly viewport: () => WindowSize
}): AssistantWindowStore {
  const listeners = new Set<() => void>()
  let snapshot: AssistantWindowSnapshot = { open: false, rect: defaultAssistantRect(options.viewport()) }
  const snapshotOf = (): AssistantWindowSnapshot => snapshot
  const publish = (patch: Partial<AssistantWindowSnapshot>): void => {
    snapshot = { ...snapshot, ...patch }
    for (const listener of [...listeners]) listener()
  }
  const persist = (): void => {
    if (options.storage === null) return
    try {
      options.storage.setItem(ASSISTANT_WINDOW_STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, rect: snapshot.rect }))
    } catch {
      // A denied or full storage keeps the in-memory rectangle; the next open restores it for this session.
    }
  }
  const restore = (): void => {
    if (options.storage === null) return
    try {
      const raw = options.storage.getItem(ASSISTANT_WINDOW_STORAGE_KEY)
      if (raw === null) return
      const parsed = JSON.parse(raw) as PersistedWindow
      if (parsed.version !== STORAGE_VERSION) return
      const rect = parseRect(parsed.rect)
      if (rect === undefined) return
      snapshot = { ...snapshot, rect: clampAssistantRect(rect, options.viewport()) }
    } catch {
      // Malformed JSON and denied storage both fall back to the default placement.
    }
  }
  restore()
  const state: HostObservable<AssistantWindowSnapshot> = {
    getSnapshot: snapshotOf,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
  return {
    state,
    toggle: () => { publish({ open: !snapshot.open }) },
    close: () => { if (snapshot.open) publish({ open: false }) },
    moveTo: (rect) => {
      const clamped = clampAssistantRect(rect, options.viewport())
      publish({ rect: clamped })
      persist()
    },
    reclamp: () => {
      const clamped = clampAssistantRect(snapshot.rect, options.viewport())
      if (clamped.x !== snapshot.rect.x || clamped.y !== snapshot.rect.y
        || clamped.width !== snapshot.rect.width || clamped.height !== snapshot.rect.height) {
        publish({ rect: clamped })
      }
    },
    reset: () => {
      publish({ rect: defaultAssistantRect(options.viewport()) })
      persist()
    },
  }
}
