import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_WINDOW_STORAGE_KEY, createAssistantWindowStore, type AssistantWindowStorage,
} from '../src/client/assistant-state.ts'

const VIEWPORT = { width: 1280, height: 820 }

function memoryStorage(initial: Record<string, string> = {}): AssistantWindowStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe('createAssistantWindowStore', () => {
  it('starts closed at the default rectangle', () => {
    const store = createAssistantWindowStore({ storage: null, viewport: () => VIEWPORT })
    expect(store.state.getSnapshot()).toEqual({ open: false, rect: { x: 748, y: 168, width: 520, height: 640 } })
  })

  it('toggles and closes without moving the rectangle', () => {
    const store = createAssistantWindowStore({ storage: null, viewport: () => VIEWPORT })
    store.toggle()
    expect(store.state.getSnapshot().open).toBe(true)
    store.moveTo({ x: 100, y: 100, width: 500, height: 600 })
    store.close()
    expect(store.state.getSnapshot()).toEqual({ open: false, rect: { x: 100, y: 100, width: 500, height: 600 } })
    store.toggle()
    expect(store.state.getSnapshot().open).toBe(true)
  })

  it('clamps and persists every move; a new store restores it', () => {
    const storage = memoryStorage()
    const first = createAssistantWindowStore({ storage, viewport: () => VIEWPORT })
    first.moveTo({ x: -50, y: 5000, width: 450, height: 500 })
    expect(first.state.getSnapshot().rect).toEqual({ x: 12, y: 308, width: 450, height: 500 })
    expect(storage.values.has(ASSISTANT_WINDOW_STORAGE_KEY)).toBe(true)
    const second = createAssistantWindowStore({ storage, viewport: () => VIEWPORT })
    expect(second.state.getSnapshot().rect).toEqual({ x: 12, y: 308, width: 450, height: 500 })
  })

  it('restores a saved rect clamped to a smaller viewport', () => {
    const storage = memoryStorage()
    const wide = createAssistantWindowStore({ storage, viewport: () => VIEWPORT })
    wide.moveTo({ x: 700, y: 500, width: 520, height: 640 })
    const narrow = createAssistantWindowStore({ storage, viewport: () => ({ width: 900, height: 600 }) })
    const rect = narrow.state.getSnapshot().rect
    expect(rect.x).toBeLessThanOrEqual(900 - 400 - 12)
    expect(rect.y).toBeLessThanOrEqual(600 - 440 - 12)
  })

  it.each([
    ['malformed JSON', '{not json'],
    ['old version', JSON.stringify({ version: 0, rect: { x: 1, y: 2, width: 3, height: 4 } })],
    ['non-finite rect', JSON.stringify({ version: 1, rect: { x: 1, y: 2, width: 3, height: Number.POSITIVE_INFINITY } })],
    ['missing rect', JSON.stringify({ version: 1 })],
  ])('falls back to the default for %s', (_label, value) => {
    const storage = memoryStorage({ [ASSISTANT_WINDOW_STORAGE_KEY]: value })
    const store = createAssistantWindowStore({ storage, viewport: () => VIEWPORT })
    expect(store.state.getSnapshot().rect).toEqual({ x: 748, y: 168, width: 520, height: 640 })
  })

  it('keeps the in-memory rect when storage throws', () => {
    const storage: AssistantWindowStorage = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('quota') },
    }
    const store = createAssistantWindowStore({ storage, viewport: () => VIEWPORT })
    store.moveTo({ x: 100, y: 100, width: 500, height: 600 })
    expect(store.state.getSnapshot().rect).toEqual({ x: 100, y: 100, width: 500, height: 600 })
  })

  it('re-clamps after a viewport change and only publishes when the rect moves', () => {
    let viewport = VIEWPORT
    const store = createAssistantWindowStore({ storage: null, viewport: () => viewport })
    let notifications = 0
    store.state.subscribe(() => { notifications += 1 })
    store.moveTo({ x: 748, y: 168, width: 520, height: 640 })
    store.reclamp()
    expect(notifications).toBe(1)
    viewport = { width: 900, height: 600 }
    store.reclamp()
    expect(store.state.getSnapshot().rect).toMatchObject({ width: 520, height: 576, x: 368, y: 12 })
    expect(notifications).toBe(2)
  })

  it('resets to the default placement', () => {
    const store = createAssistantWindowStore({ storage: memoryStorage(), viewport: () => VIEWPORT })
    store.moveTo({ x: 100, y: 100, width: 500, height: 600 })
    store.reset()
    expect(store.state.getSnapshot().rect).toEqual({ x: 748, y: 168, width: 520, height: 640 })
  })
})
