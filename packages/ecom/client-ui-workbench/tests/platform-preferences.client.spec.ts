/** Platform preference validation, persistence, and store publication. */
import { describe, expect, it } from 'vitest'
import {
  createPlatformPreferencesStore,
  PLATFORM_PREFERENCES_STORAGE_KEY,
  readPlatformPreferences,
  writePlatformPreferences,
} from '../src/client/platform-preferences.ts'
import type { PlatformPreferences, PlatformPreferencesStorage } from '../src/client/platform-preferences.ts'

const DEFAULTS: PlatformPreferences = { autoEnter: false, lastPlatform: null, lastConsoleUrl: null }

/** In-memory storage port used to assert the read/write pairing. */
class MemoryStorage implements PlatformPreferencesStorage {
  readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

/**
 * @param storage - memory storage to seed.
 * @param value - JSON value persisted under the preference key.
 * @returns nothing.
 */
function seed(storage: MemoryStorage, value: unknown): void {
  storage.setItem(PLATFORM_PREFERENCES_STORAGE_KEY, JSON.stringify(value))
}

/**
 * @param storage - memory storage holding the persisted preferences.
 * @returns the parsed persisted value, or null when nothing was written.
 */
function stored(storage: MemoryStorage): unknown {
  const raw = storage.getItem(PLATFORM_PREFERENCES_STORAGE_KEY)
  return raw === null ? null : JSON.parse(raw)
}

describe('readPlatformPreferences', () => {
  it('falls back to disabled auto-enter without a stored value', () => {
    expect(readPlatformPreferences(null)).toEqual(DEFAULTS)
    expect(readPlatformPreferences(new MemoryStorage())).toEqual(DEFAULTS)
  })

  it('reads a valid persisted selection back', () => {
    const storage = new MemoryStorage()
    seed(storage, { autoEnter: true, lastPlatform: 'buyin', lastConsoleUrl: 'https://buyin.jinritemai.com/dashboard/live' })
    expect(readPlatformPreferences(storage)).toEqual({
      autoEnter: true,
      lastPlatform: 'buyin',
      lastConsoleUrl: 'https://buyin.jinritemai.com/dashboard/live',
    })
  })

  it('ignores malformed JSON', () => {
    const storage = new MemoryStorage()
    storage.setItem(PLATFORM_PREFERENCES_STORAGE_KEY, '{not json')
    expect(readPlatformPreferences(storage)).toEqual(DEFAULTS)
  })

  it.each(['[]', 'null', '42', '"preferences"'])('ignores the non-object JSON value %s', (raw) => {
    const storage = new MemoryStorage()
    storage.setItem(PLATFORM_PREFERENCES_STORAGE_KEY, raw)
    expect(readPlatformPreferences(storage)).toEqual(DEFAULTS)
  })

  it('drops an unknown last platform and a non-boolean auto-enter', () => {
    const storage = new MemoryStorage()
    seed(storage, { autoEnter: 'yes', lastPlatform: 'group-buy' })
    expect(readPlatformPreferences(storage)).toEqual(DEFAULTS)
  })

  it('drops a console URL that is not an absolute http(s) URL', () => {
    for (const lastConsoleUrl of ['javascript:alert(1)', 'ftp://fxg.jinritemai.com/login', '/login', 42]) {
      const storage = new MemoryStorage()
      seed(storage, { autoEnter: true, lastPlatform: 'douyin-shop', lastConsoleUrl })
      expect(readPlatformPreferences(storage)).toEqual({
        autoEnter: true,
        lastPlatform: 'douyin-shop',
        lastConsoleUrl: null,
      })
    }
  })

  it('falls back to the defaults when the storage read throws', () => {
    const storage: PlatformPreferencesStorage = {
      getItem: () => { throw new Error('storage blocked') },
      setItem: () => undefined,
    }
    expect(readPlatformPreferences(storage)).toEqual(DEFAULTS)
  })
})

describe('writePlatformPreferences', () => {
  it('persists the preferences under the platform preference key', () => {
    const storage = new MemoryStorage()
    const value: PlatformPreferences = {
      autoEnter: true,
      lastPlatform: 'douyin-shop',
      lastConsoleUrl: 'https://fxg.jinritemai.com/ffa/mshop/homepage/index',
    }
    writePlatformPreferences(storage, value)
    expect(stored(storage)).toEqual(value)
  })

  it('stays silent without storage or when the storage write throws', () => {
    const blocked: PlatformPreferencesStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('storage blocked') },
    }
    expect(() => { writePlatformPreferences(null, DEFAULTS) }).not.toThrow()
    expect(() => { writePlatformPreferences(blocked, DEFAULTS) }).not.toThrow()
  })
})

describe('createPlatformPreferencesStore', () => {
  it('seeds the snapshot from one storage read', () => {
    const storage = new MemoryStorage()
    seed(storage, { autoEnter: true, lastPlatform: 'douyin-shop' })
    const store = createPlatformPreferencesStore(storage)
    expect(store.state.getSnapshot()).toEqual({
      autoEnter: true,
      lastPlatform: 'douyin-shop',
      lastConsoleUrl: null,
    })
  })

  it('keeps the snapshot reference stable between changes', () => {
    const store = createPlatformPreferencesStore(new MemoryStorage())
    expect(store.state.getSnapshot()).toBe(store.state.getSnapshot())
  })

  it('publishes and persists an auto-enter change', () => {
    const storage = new MemoryStorage()
    const store = createPlatformPreferencesStore(storage)
    const published: PlatformPreferences[] = []
    const unsubscribe = store.state.subscribe(() => { published.push(store.state.getSnapshot()) })
    store.setAutoEnter(true)
    expect(published).toHaveLength(1)
    expect(published[0]?.autoEnter).toBe(true)
    expect(stored(storage)).toEqual({ autoEnter: true, lastPlatform: null, lastConsoleUrl: null })
    unsubscribe()
    store.setAutoEnter(false)
    expect(published).toHaveLength(1)
    expect(store.state.getSnapshot().autoEnter).toBe(false)
  })

  it('remembers the platform and console URL together and reads them back', () => {
    const storage = new MemoryStorage()
    const store = createPlatformPreferencesStore(storage)
    store.rememberSession('buyin', 'https://buyin.jinritemai.com/dashboard/live')
    expect(store.state.getSnapshot()).toEqual({
      autoEnter: false,
      lastPlatform: 'buyin',
      lastConsoleUrl: 'https://buyin.jinritemai.com/dashboard/live',
    })
    expect(stored(storage)).toEqual(store.state.getSnapshot())
    expect(createPlatformPreferencesStore(storage).state.getSnapshot()).toEqual(store.state.getSnapshot())
  })

  it('notifies subscribers when remembering a session', () => {
    const store = createPlatformPreferencesStore(null)
    let notifications = 0
    store.state.subscribe(() => { notifications += 1 })
    store.rememberSession('douyin-shop', 'https://fxg.jinritemai.com/ffa/mshop/homepage/index')
    expect(notifications).toBe(1)
  })

  it.each([null, 'not-a-url', 'javascript:alert(1)', 'https://buyin.jinritemai.com/dashboard/live'])(
    'drops the console URL %s that does not belong to the platform',
    (consoleUrl) => {
      const store = createPlatformPreferencesStore(new MemoryStorage())
      store.rememberSession('douyin-shop', consoleUrl)
      expect(store.state.getSnapshot()).toMatchObject({ lastPlatform: 'douyin-shop', lastConsoleUrl: null })
    },
  )

  it('works fully in memory without a storage port', () => {
    const store = createPlatformPreferencesStore(null)
    store.setAutoEnter(true)
    store.rememberSession('douyin-shop', 'https://fxg.jinritemai.com/ffa/mshop/homepage/index')
    expect(store.state.getSnapshot()).toEqual({
      autoEnter: true,
      lastPlatform: 'douyin-shop',
      lastConsoleUrl: 'https://fxg.jinritemai.com/ffa/mshop/homepage/index',
    })
  })

  it('keeps the in-memory preference when persistence fails', () => {
    const blocked: PlatformPreferencesStorage = {
      getItem: () => null,
      setItem: () => { throw new Error('storage blocked') },
    }
    const store = createPlatformPreferencesStore(blocked)
    expect(() => { store.setAutoEnter(true) }).not.toThrow()
    expect(store.state.getSnapshot().autoEnter).toBe(true)
  })
})
