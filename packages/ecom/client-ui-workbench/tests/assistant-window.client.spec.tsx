// @vitest-environment jsdom
/** Floating AI window and its injected Conversation-header actions. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ConsoleSnapshot } from '../src/client/ConsoleController.ts'
import type { AssistantWindowSnapshot } from '../src/client/assistant-state.ts'
import { AssistantWindow, type AssistantWindowProps } from '../src/client/AssistantWindow.tsx'
import { AssistantHeaderActions, type AssistantHeaderActionsProps } from '../src/client/AssistantHeaderActions.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const idleConsole: ConsoleSnapshot = {
  view: 'select', phase: 'idle', platformId: null, loginState: 'unknown', checking: false, url: undefined,
}
const liveConsole: ConsoleSnapshot = {
  view: 'console', phase: 'ready', platformId: 'douyin-shop', loginState: 'in', checking: false,
  url: 'https://fxg.jinritemai.com/ffa/content-tool/live/control',
}
const closed: AssistantWindowSnapshot = { open: false, rect: { x: 748, y: 168, width: 520, height: 640 } }
const open: AssistantWindowSnapshot = { open: true, rect: { x: 748, y: 168, width: 520, height: 640 } }

function windowProps(state: {
  readonly window?: AssistantWindowSnapshot
  readonly console?: ConsoleSnapshot
  readonly moveTo?: ReturnType<typeof vi.fn>
  readonly close?: ReturnType<typeof vi.fn>
  readonly jumpConsole?: ReturnType<typeof vi.fn>
} = {}): AssistantWindowProps {
  const window = state.window ?? open
  const consoleState = state.console ?? idleConsole
  return {
    ...{},
    useAssistant: <T,>(select: (value: AssistantWindowSnapshot) => T): T => select(window),
    useConsole: <T,>(select: (value: ConsoleSnapshot) => T): T => select(consoleState),
    hooks: {},
    close: state.close ?? vi.fn(),
    moveTo: state.moveTo ?? vi.fn(),
    jumpConsole: state.jumpConsole ?? vi.fn(),
    renderSlot: vi.fn(() => <div data-testid="embedded-conversation" />),
    t: makeTranslate(en),
  } as unknown as AssistantWindowProps
}

function actionProps(state: {
  readonly console?: ConsoleSnapshot
  readonly toggleAssistant?: ReturnType<typeof vi.fn>
  readonly jumpConsole?: ReturnType<typeof vi.fn>
} = {}): AssistantHeaderActionsProps {
  const consoleState = state.console ?? idleConsole
  return {
    useConsole: <T,>(select: (value: ConsoleSnapshot) => T): T => select(consoleState),
    hooks: {},
    toggleAssistant: state.toggleAssistant ?? vi.fn(),
    jumpConsole: state.jumpConsole ?? vi.fn(),
    t: makeTranslate(en),
  } as unknown as AssistantHeaderActionsProps
}

describe('AssistantWindow', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<AssistantWindow {...windowProps({ window: closed })} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the title and close control over the embedded conversation', () => {
    const close = vi.fn()
    render(<AssistantWindow {...windowProps({ close })} />)
    expect(screen.getByRole('region', { name: 'AI assistant' })).toBeTruthy()
    expect(screen.getByTestId('embedded-conversation')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('shows the console jump only while a platform is selected', () => {
    render(<AssistantWindow {...windowProps()} />)
    expect(screen.queryByRole('button', { name: 'Open console' })).toBeNull()
    cleanup()
    render(<AssistantWindow {...windowProps({ console: liveConsole })} />)
    expect(screen.getByRole('button', { name: 'Open console' })).toBeTruthy()
  })

  it('moves the window through pointer gestures and commits the rectangle', () => {
    const moveTo = vi.fn()
    render(<AssistantWindow {...windowProps({ moveTo })} />)
    const header = screen.getByRole('region', { name: 'AI assistant' }).querySelector('header')!
    fireEvent.pointerDown(header, { pointerId: 1, button: 0, clientX: 700, clientY: 700 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 560, clientY: 580 })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 560, clientY: 580 })
    expect(moveTo).toHaveBeenCalledOnce()
    const moved = moveTo.mock.calls[0]?.[0] as { x: number; y: number; width: number; height: number }
    expect(moved.width).toBe(520)
    expect(moved.height).toBe(640)
    expect(moved.x).toBeLessThanOrEqual(748)
    expect(moved.x).toBeGreaterThanOrEqual(12)
  })

  it('resizes from the south-east handle but never below the minimum', () => {
    const moveTo = vi.fn()
    render(<AssistantWindow {...windowProps({ moveTo })} />)
    const handle = screen.getByRole('region', { name: 'AI assistant' }).querySelector('[data-handle="se"]')!
    fireEvent.pointerDown(handle, { pointerId: 2, button: 0, clientX: 1000, clientY: 700 })
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 700, clientY: 300 })
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 900, clientY: 500 })
    expect(moveTo).toHaveBeenCalledOnce()
    expect(moveTo.mock.calls[0]?.[0]).toMatchObject({ width: 400, height: 440 })
  })
})

describe('AssistantHeaderActions', () => {
  it('toggles the floating window from the Conversation header', () => {
    const toggleAssistant = vi.fn()
    render(<AssistantHeaderActions {...actionProps({ toggleAssistant })} />)
    fireEvent.click(screen.getByRole('button', { name: 'AI assistant' }))
    expect(toggleAssistant).toHaveBeenCalledOnce()
  })

  it('hides the console jump until a platform is selected, then calls it', () => {
    render(<AssistantHeaderActions {...actionProps()} />)
    expect(screen.queryByRole('button', { name: 'Open console' })).toBeNull()
    cleanup()
    const jumpConsole = vi.fn()
    render(<AssistantHeaderActions {...actionProps({ console: liveConsole, jumpConsole })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open console' }))
    expect(jumpConsole).toHaveBeenCalledOnce()
  })
})
