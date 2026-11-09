/** Floating AI window geometry: default placement, viewport clamping, and edge snapping. */
import { movedRect, resizedRect } from '@deepseek-ai/dsh-client-ui-dockkit'

/** A viewport or window size in CSS pixels. */
export interface WindowSize {
  readonly width: number
  readonly height: number
}

/** A floating window rectangle in viewport coordinates. */
export interface WindowRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Default width of the assistant window. */
export const ASSISTANT_DEFAULT_WIDTH = 520

/** Default height of the assistant window. */
export const ASSISTANT_DEFAULT_HEIGHT = 640

/** Smallest usable assistant window width. */
export const ASSISTANT_MIN_WIDTH = 400

/** Smallest usable assistant window height. */
export const ASSISTANT_MIN_HEIGHT = 440

/** Viewport inset the float keeps from every edge. */
export const ASSISTANT_EDGE_MARGIN = 12

/** Distance from an edge at which a drag engages the snap. */
export const ASSISTANT_SNAP_ENGAGE = 20

/** Distance from an edge at which an engaged snap releases (hysteresis). */
export const ASSISTANT_SNAP_RELEASE = 28

/** Which axes currently hold a viewport-edge snap. */
export interface AssistantSnapState {
  readonly x: boolean
  readonly y: boolean
}

/** A snapped rectangle and the snap state that produced it. */
export interface AssistantSnapResult {
  readonly rect: WindowRect
  readonly snap: AssistantSnapState
}

/**
 * Place the window at its default size in the bottom-right corner.
 * @param viewport - current viewport size.
 * @returns the default window rectangle, anchored to the bottom-right corner.
 */
export function defaultAssistantRect(viewport: WindowSize): WindowRect {
  const available = {
    width: Math.max(ASSISTANT_MIN_WIDTH, viewport.width - 2 * ASSISTANT_EDGE_MARGIN),
    height: Math.max(ASSISTANT_MIN_HEIGHT, viewport.height - 96),
  }
  const width = Math.min(ASSISTANT_DEFAULT_WIDTH, available.width)
  const height = Math.min(ASSISTANT_DEFAULT_HEIGHT, available.height)
  return {
    x: Math.max(ASSISTANT_EDGE_MARGIN, viewport.width - width - ASSISTANT_EDGE_MARGIN),
    y: Math.max(ASSISTANT_EDGE_MARGIN, viewport.height - height - ASSISTANT_EDGE_MARGIN),
    width,
    height,
  }
}

/**
 * Keep a rectangle inside the viewport and at or above the minimum size.
 * @param rect - a candidate rectangle, possibly outside the viewport or below the minimum size.
 * @param viewport - current viewport size.
 * @returns the rectangle clamped to the minimum size and the viewport inset.
 */
export function clampAssistantRect(rect: WindowRect, viewport: WindowSize): WindowRect {
  const maxWidth = Math.max(1, viewport.width - 2 * ASSISTANT_EDGE_MARGIN)
  const maxHeight = Math.max(1, viewport.height - 2 * ASSISTANT_EDGE_MARGIN)
  const width = Math.min(Math.max(rect.width, ASSISTANT_MIN_WIDTH), maxWidth)
  const height = Math.min(Math.max(rect.height, ASSISTANT_MIN_HEIGHT), maxHeight)
  return {
    width,
    height,
    x: Math.min(Math.max(rect.x, ASSISTANT_EDGE_MARGIN), viewport.width - width - ASSISTANT_EDGE_MARGIN),
    y: Math.min(Math.max(rect.y, ASSISTANT_EDGE_MARGIN), viewport.height - height - ASSISTANT_EDGE_MARGIN),
  }
}

/**
 * Apply a pointer move delta to a rectangle.
 * @param rect - the rectangle after a pointer move.
 * @param dx - horizontal pointer travel.
 * @param dy - vertical pointer travel.
 * @returns the moved rectangle, before viewport clamping.
 */
export function moveAssistantRect(rect: WindowRect, dx: number, dy: number): WindowRect {
  return movedRect(rect, dx, dy)
}

/**
 * Apply a bottom-right resize delta, holding the minimum size.
 * @param rect - the rectangle after a resize gesture.
 * @param dx - horizontal pointer travel.
 * @param dy - vertical pointer travel.
 * @returns the resized rectangle, before viewport clamping.
 */
export function resizeAssistantRect(rect: WindowRect, dx: number, dy: number): WindowRect {
  return resizedRect(rect, dx, dy, { width: ASSISTANT_MIN_WIDTH, height: ASSISTANT_MIN_HEIGHT })
}

/**
 * Snap the window to the viewport edges with the documented hysteresis: engage at
 * `ASSISTANT_SNAP_ENGAGE`, release only past `ASSISTANT_SNAP_RELEASE`.
 * @param rect - clamped rectangle after drag or resize.
 * @param viewport - current viewport size.
 * @param state - axes already holding a snap in this gesture.
 * @returns the snapped rectangle and the updated per-axis snap state.
 */
export function snapAssistantRect(rect: WindowRect, viewport: WindowSize, state: AssistantSnapState): AssistantSnapResult {
  const x = snapAxis(rect.x, viewport.width - rect.width, ASSISTANT_EDGE_MARGIN, state.x)
  const y = snapAxis(rect.y, viewport.height - rect.height, ASSISTANT_EDGE_MARGIN, state.y)
  return {
    rect: {
      ...rect,
      x: x.position ?? rect.x,
      y: y.position ?? rect.y,
    },
    snap: { x: x.engaged, y: y.engaged },
  }
}

/**
 * @param start - rectangle origin on one axis.
 * @param maxStart - origin that puts the trailing edge at the viewport edge.
 * @param margin - viewport inset to snap to.
 * @param engaged - whether this axis already holds a snap.
 * @returns the snapped origin (absent when free) and the next engaged flag.
 */
function snapAxis(start: number, maxStart: number, margin: number, engaged: boolean): {
  readonly position: number | undefined
  readonly engaged: boolean
} {
  const nearStart = start - margin
  const nearEnd = start - (maxStart - margin)
  const distance = Math.min(Math.abs(nearStart), Math.abs(nearEnd))
  const threshold = engaged ? ASSISTANT_SNAP_RELEASE : ASSISTANT_SNAP_ENGAGE
  if (distance > threshold) return { position: undefined, engaged: false }
  return Math.abs(nearStart) <= Math.abs(nearEnd)
    ? { position: margin, engaged: true }
    : { position: maxStart - margin, engaged: true }
}
