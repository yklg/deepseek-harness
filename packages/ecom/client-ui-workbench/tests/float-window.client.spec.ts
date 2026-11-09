import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_EDGE_MARGIN, ASSISTANT_MIN_HEIGHT, ASSISTANT_MIN_WIDTH, ASSISTANT_SNAP_ENGAGE, ASSISTANT_SNAP_RELEASE,
  clampAssistantRect, defaultAssistantRect, moveAssistantRect, resizeAssistantRect, snapAssistantRect,
} from '../src/client/float-window.ts'

const VIEWPORT = { width: 1280, height: 820 }
const FREE = { x: false, y: false }

describe('defaultAssistantRect', () => {
  it('lands at the bottom-right with the documented defaults', () => {
    expect(defaultAssistantRect(VIEWPORT)).toEqual({ x: 748, y: 168, width: 520, height: 640 })
  })

  it('shrinks height before width in a short viewport', () => {
    expect(defaultAssistantRect({ width: 1000, height: 560 })).toEqual({ x: 468, y: 84, width: 520, height: 464 })
  })

  it('keeps the minimum usable size and never leaves the viewport', () => {
    const rect = defaultAssistantRect({ width: 420, height: 460 })
    expect(rect.width).toBeGreaterThanOrEqual(ASSISTANT_MIN_WIDTH)
    expect(rect.height).toBeGreaterThanOrEqual(ASSISTANT_MIN_HEIGHT)
    expect(rect.x).toBeGreaterThanOrEqual(ASSISTANT_EDGE_MARGIN)
    expect(rect.y).toBeGreaterThanOrEqual(ASSISTANT_EDGE_MARGIN)
  })
})

describe('clampAssistantRect', () => {
  it('keeps a legal rectangle unchanged', () => {
    const rect = { x: 100, y: 100, width: 500, height: 600 }
    expect(clampAssistantRect(rect, VIEWPORT)).toEqual(rect)
  })

  it('clamps every edge to the 12px inset', () => {
    expect(clampAssistantRect({ x: -80, y: -80, width: 500, height: 500 }, VIEWPORT))
      .toMatchObject({ x: 12, y: 12 })
    expect(clampAssistantRect({ x: 1200, y: 800, width: 500, height: 500 }, VIEWPORT))
      .toMatchObject({ x: 768, y: 308 })
  })

  it('raises below-minimum sizes and caps oversized ones', () => {
    expect(clampAssistantRect({ x: 0, y: 0, width: 10, height: 10 }, VIEWPORT))
      .toMatchObject({ width: ASSISTANT_MIN_WIDTH, height: ASSISTANT_MIN_HEIGHT })
    expect(clampAssistantRect({ x: 0, y: 0, width: 4000, height: 4000 }, VIEWPORT))
      .toMatchObject({ width: 1256, height: 796 })
  })
})

describe('snapAssistantRect', () => {
  it('engages within 20px of an edge and lands on the 12px margin', () => {
    const result = snapAssistantRect({ x: 30, y: 300, width: 520, height: 260 }, VIEWPORT, FREE)
    expect(result.rect.x).toBe(ASSISTANT_EDGE_MARGIN)
    expect(result.snap.x).toBe(true)
    expect(snapAssistantRect({ x: 33, y: 300, width: 520, height: 260 }, VIEWPORT, FREE).snap.x).toBe(false)
  })

  it('holds an engaged snap until the pointer passes the release distance', () => {
    expect(snapAssistantRect({ x: 39, y: 300, width: 520, height: 260 }, VIEWPORT, { x: true, y: false }).snap.x).toBe(true)
    expect(snapAssistantRect({ x: 40, y: 300, width: 520, height: 260 }, VIEWPORT, { x: true, y: false }).snap.x).toBe(true)
    expect(snapAssistantRect({ x: 41, y: 300, width: 520, height: 260 }, VIEWPORT, { x: true, y: false }).snap.x).toBe(false)
  })

  it('snaps to the trailing edge within the same threshold', () => {
    const rect = { x: VIEWPORT.width - 520 - 30, y: 300, width: 520, height: 260 }
    expect(snapAssistantRect(rect, VIEWPORT, FREE).rect.x).toBe(VIEWPORT.width - 520 - ASSISTANT_EDGE_MARGIN)
  })

  it('resolves the two axes independently', () => {
    const result = snapAssistantRect({ x: 25, y: 790, width: 520, height: 20 }, VIEWPORT, FREE)
    expect(result.snap).toEqual({ x: true, y: true })
  })

  it('uses the documented thresholds in the module contract', () => {
    expect(ASSISTANT_SNAP_ENGAGE).toBe(20)
    expect(ASSISTANT_SNAP_RELEASE).toBe(28)
  })
})

describe('gesture helpers', () => {
  it('moves by the pointer delta', () => {
    expect(moveAssistantRect({ x: 100, y: 100, width: 520, height: 640 }, 15, -20))
      .toEqual({ x: 115, y: 80, width: 520, height: 640 })
  })

  it('resizes but never below the minimum', () => {
    expect(resizeAssistantRect({ x: 100, y: 100, width: 520, height: 640 }, -200, -300))
      .toMatchObject({ width: ASSISTANT_MIN_WIDTH, height: ASSISTANT_MIN_HEIGHT })
  })
})
