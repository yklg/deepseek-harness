/** Platform selection preferences persisted across launches and shared with the console host. */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { isPlatformId, platformById } from './platforms.ts'
import type { PlatformId } from './platforms.ts'

/** Storage key holding the workbench's platform selection preferences. */
export const PLATFORM_PREFERENCES_STORAGE_KEY = 'dsh.ecom.platform-preferences'

/** Minimal synchronous storage port; the browser localStorage satisfies it. */
export interface PlatformPreferencesStorage {
  /**
   * @param key - storage key supplied by this package.
   * @returns the serialized value, or null when the key is absent.
   */
  getItem(key: string): string | null
  /**
   * @param key - storage key supplied by this package.
   * @param value - serialized value to persist.
   */
  setItem(key: string, value: string): void
}

/** Platform selection state remembered across launches. */
export interface PlatformPreferences {
  /** Whether a launch opens the last platform instead of the selection page. */
  readonly autoEnter: boolean
  /** Last platform the user entered; null when unknown or no longer shipped. */
  readonly lastPlatform: PlatformId | null
  /** Last console URL reached inside `lastPlatform`; null when unknown or not on that platform. */
  readonly lastConsoleUrl: string | null
}

/** Preferences store face consumed by the selection page and the console host. */
export interface PlatformPreferencesStore {
  /** Current preferences; a new snapshot is published after every change. */
  readonly state: HostObservable<PlatformPreferences>
  /**
   * @param autoEnter - whether a launch opens the last platform directly.
   */
  setAutoEnter(autoEnter: boolean): void
  /**
   * @param platformId - platform the user entered.
   * @param consoleUrl - console URL reached inside the platform, or null when unknown.
   */
  rememberSession(platformId: PlatformId, consoleUrl: string | null): void
}

/**
 * @returns the preferences used when no valid value is stored.
 */
function defaultPreferences(): PlatformPreferences {
  return { autoEnter: false, lastPlatform: null, lastConsoleUrl: null }
}

/**
 * @param value - untrusted candidate URL.
 * @returns the parsed URL when the value is an absolute http(s) URL, otherwise null.
 */
function httpUrl(value: unknown): URL | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/**
 * @param value - untrusted persisted value.
 * @returns the value when it is an absolute http(s) URL string, otherwise null.
 */
function httpUrlString(value: unknown): string | null {
  return typeof value === 'string' && httpUrl(value) !== null ? value : null
}

/**
 * @param value - parsed JSON value.
 * @returns whether the value is a plain JSON object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * @param platformId - platform expected to own the console page.
 * @param consoleUrl - console URL reported by the platform guest.
 * @returns the URL when it is absolute http(s) on one of the platform's origins, otherwise null.
 */
function platformConsoleUrl(platformId: PlatformId, consoleUrl: string | null): string | null {
  if (consoleUrl === null) return null
  const url = httpUrl(consoleUrl)
  if (url === null) return null
  const platform = platformById(platformId)
  return platform?.origins.includes(url.origin) === true ? consoleUrl : null
}

/**
 * Read the persisted platform selection preferences.
 * @param storage - storage port, or null when persistence is disabled.
 * @returns validated preferences; absent, malformed, or non-object values fall back to the defaults.
 */
export function readPlatformPreferences(storage: PlatformPreferencesStorage | null): PlatformPreferences {
  if (storage === null) return defaultPreferences()
  let raw: string | null
  try {
    raw = storage.getItem(PLATFORM_PREFERENCES_STORAGE_KEY)
  } catch {
    // Unavailable browser storage has no readable preferences.
    return defaultPreferences()
  }
  if (raw === null) return defaultPreferences()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    // Malformed JSON must not block the selection page.
    return defaultPreferences()
  }
  if (!isRecord(parsed)) return defaultPreferences()
  return {
    autoEnter: typeof parsed.autoEnter === 'boolean' ? parsed.autoEnter : false,
    lastPlatform: isPlatformId(parsed.lastPlatform) ? parsed.lastPlatform : null,
    lastConsoleUrl: httpUrlString(parsed.lastConsoleUrl),
  }
}

/**
 * Write the platform selection preferences, ignoring storage failures.
 * @param storage - storage port, or null when persistence is disabled.
 * @param value - preferences to persist.
 */
export function writePlatformPreferences(storage: PlatformPreferencesStorage | null, value: PlatformPreferences): void {
  if (storage === null) return
  try {
    storage.setItem(PLATFORM_PREFERENCES_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // A blocked or full storage degrades to the in-memory snapshot.
  }
}

/**
 * Create the platform preferences store, seeded from one storage read.
 * @param storage - storage port, or null when persistence is disabled.
 * @returns the store holding the current snapshot and the preference mutations.
 */
export function createPlatformPreferencesStore(storage: PlatformPreferencesStorage | null): PlatformPreferencesStore {
  let snapshot = readPlatformPreferences(storage)
  const listeners = new Set<() => void>()
  const publish = (next: PlatformPreferences): void => {
    snapshot = next
    for (const listener of [...listeners]) listener()
    writePlatformPreferences(storage, next)
  }
  return {
    state: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    setAutoEnter: (autoEnter) => { publish({ ...snapshot, autoEnter }) },
    rememberSession: (platformId, consoleUrl) => {
      publish({
        ...snapshot,
        lastPlatform: platformId,
        lastConsoleUrl: platformConsoleUrl(platformId, consoleUrl),
      })
    },
  }
}
