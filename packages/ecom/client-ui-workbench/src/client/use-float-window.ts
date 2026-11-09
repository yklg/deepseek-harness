/** Pointer gestures for the product AI floating window: move, eight-way resize, edge snap. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  ASSISTANT_MIN_HEIGHT, ASSISTANT_MIN_WIDTH, clampAssistantRect, moveAssistantRect, resizeAssistantRect,
  snapAssistantRect, type AssistantSnapState, type WindowRect, type WindowSize,
} from './float-window.ts'

/** Handles the window exposes: the title bar plus eight resize directions. */
export type AssistantResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** Gesture mode stored for one pointer session. */
type GestureMode = 'move' | AssistantResizeHandle

/** Pointer session captured on pointerdown. */
interface Gesture {
  readonly mode: GestureMode
  readonly startX: number
  readonly startY: number
  readonly startRect: WindowRect
  readonly pointerId: number
  snap: AssistantSnapState
}

/** Live geometry and gesture callbacks for one assistant window. */
export interface FloatWindowController {
  /** Rectangle to render: the live gesture rect while dragging, otherwise the stored one. */
  readonly rect: WindowRect
  /** Whether a pointer gesture is active. */
  readonly dragging: boolean
  /** @param event - pointerdown from the title bar. */
  onMoveStart(event: ReactPointerEvent<HTMLElement>): void
  /** @param event - pointerdown from one resize handle. @param handle - its direction. */
  onResizeStart(event: ReactPointerEvent<HTMLElement>, handle: AssistantResizeHandle): void
}

/**
 * Drive one floating window from pointer events, reporting live previews and committing the result.
 * @param options - stored rectangle, committed move callback, and viewport reader.
 * @returns the live rectangle and pointerdown handlers.
 */
export function useFloatWindow(options: {
  readonly rect: WindowRect
  readonly moveTo: (rect: WindowRect) => void
  readonly viewport: () => WindowSize
}): FloatWindowController {
  const [preview, setPreview] = useState<WindowRect | undefined>(undefined)
  const [dragging, setDragging] = useState(false)
  const gesture = useRef<Gesture | undefined>(undefined)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const finish = useCallback((): void => {
    const active = gesture.current
    gesture.current = undefined
    if (active === undefined) return
    setDragging(false)
    setPreview((rect) => {
      if (rect !== undefined) optionsRef.current.moveTo(rect)
      return undefined
    })
  }, [])

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      const active = gesture.current
      if (active === undefined || event.pointerId !== active.pointerId) return
      const dx = event.clientX - active.startX
      const dy = event.clientY - active.startY
      const viewport = optionsRef.current.viewport()
      const desired = active.mode === 'move'
        ? moveAssistantRect(active.startRect, dx, dy)
        : resizeFrom(active.startRect, active.mode, dx, dy)
      const snapped = snapAssistantRect(clampAssistantRect(desired, viewport), viewport, active.snap)
      active.snap = snapped.snap
      setPreview(snapped.rect)
    }
    const end = (event: PointerEvent): void => {
      if (gesture.current !== undefined && event.pointerId !== gesture.current.pointerId) return
      finish()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
  }, [finish])

  const start = (event: ReactPointerEvent<HTMLElement>, mode: GestureMode): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    gesture.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startRect: optionsRef.current.rect,
      pointerId: event.pointerId,
      snap: { x: false, y: false },
    }
    setDragging(true)
    setPreview(optionsRef.current.rect)
  }

  return {
    rect: preview ?? options.rect,
    dragging,
    onMoveStart: (event) => { start(event, 'move') },
    onResizeStart: (event, handle) => { start(event, handle) },
  }
}

/**
 * Resize a rectangle from any edge or corner, holding the minimum size by moving the pinned side.
 * @param rect - gesture start rectangle.
 * @param handle - which edge/corner the pointer drags.
 * @param dx - horizontal pointer travel.
 * @param dy - vertical pointer travel.
 * @returns the resized rectangle, holding the minimum size by moving the pinned edge.
 */
export function resizeFrom(
  rect: WindowRect, handle: AssistantResizeHandle, dx: number, dy: number,
): WindowRect {
  const resized = resizeAssistantRect(rect, handle.includes('e') ? dx : 0, handle.includes('s') ? dy : 0)
  let { x, y, width, height } = resized
  if (handle.includes('w')) {
    const next = Math.max(ASSISTANT_MIN_WIDTH, rect.width - dx)
    x = rect.x + rect.width - next
    width = next
  }
  if (handle.includes('n')) {
    const next = Math.max(ASSISTANT_MIN_HEIGHT, rect.height - dy)
    y = rect.y + rect.height - next
    height = next
  }
  return { x, y, width, height }
}
