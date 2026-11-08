// @vitest-environment jsdom
/** Live-console DOM: event rows, empty state, disconnection, and reconnection. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowAllAccess, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkbenchEvent } from '@deepseek-ai/dsh-ecom-workbench-server/types'
import type { EventsSnapshot, StatusSnapshot } from '../src/client/source.ts'
import { LiveConsoleTab, LiveConsoleTitle, type LiveConsoleTabProps, type LiveConsoleTitleProps } from '../src/client/LiveConsoleTab.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const SESSION = SessionId('session-live')

const connectedStatus: StatusSnapshot = {
  phase: 'ready',
  disconnected: false,
  status: {
    automation: { enabled: true, available: true, connected: true, targets: 1 },
    yunying: { configured: false },
  },
}

function consoleProps(
  status: StatusSnapshot,
  events: EventsSnapshot,
  overrides: Partial<LiveConsoleTabProps> = {},
): LiveConsoleTabProps {
  return {
    ...allowAllAccess,
    sessionId: SESSION,
    useSession: <T,>(select: (value: object) => T): T => select({}),
    useProjection: () => undefined,
    useAccess: () => true,
    useTabInfo: () => undefined,
    useStatus: <T,>(select: (value: StatusSnapshot) => T): T => select(status),
    useEvents: <T,>(select: (value: EventsSnapshot) => T): T => select(events),
    reconnect: vi.fn(),
    refreshStatus: vi.fn(),
    t: makeTranslate(en),
    ...overrides,
  } as LiveConsoleTabProps
}

const history: readonly WorkbenchEvent[] = [
  { type: 'run-started', at: 1_000, runId: 'run-1', operation: 'evaluate', targetId: 'lease-1' },
  { type: 'run-finished', at: 2_000, runId: 'run-1', operation: 'evaluate', ok: false, durationMs: 5, targetId: 'lease-1', code: 'target/closed' },
  { type: 'target-closed', at: 3_000, targetId: 'lease-1', reason: 'crashed' },
  { type: 'channel', at: 4_000, available: true, connected: false },
]

describe('workbench live console', () => {
  it('renders the retained history newest first with operation and target details', () => {
    render(<LiveConsoleTab {...consoleProps(connectedStatus, { events: history, disconnected: false })} />)
    expect(screen.getByText('Browser target crashed')).toBeTruthy()
    expect(screen.getByText('evaluate failed (target/closed)')).toBeTruthy()
    expect(screen.getByText('Running evaluate…')).toBeTruthy()
    expect(screen.getByText('Disconnected')).toBeTruthy()
    expect(screen.getAllByText('Target lease-1')).toHaveLength(3)
    expect(screen.queryByText(en['console.empty'])).toBeNull()
  })

  it('shows the empty state before any automation activity', () => {
    render(<LiveConsoleTab {...consoleProps(connectedStatus, { events: [], disconnected: false })} />)
    expect(screen.getByText(en['console.empty'])).toBeTruthy()
  })

  it('reports a stopped stream and offers one reconnect action', () => {
    const props = consoleProps(connectedStatus, { events: [], disconnected: true, error: 'socket closed' })
    render(<LiveConsoleTab {...props} />)
    expect(screen.getByRole('alert').textContent).toBe('Event stream stopped: socket closed')
    fireEvent.click(screen.getByRole('button', { name: en['console.reconnect'] }))
    expect(props.reconnect).toHaveBeenCalledOnce()
  })

  it('reports a deployment that disabled automation', () => {
    render(<LiveConsoleTab {...consoleProps({
      phase: 'ready',
      disconnected: false,
      status: {
        automation: { enabled: false, available: false, connected: false, targets: null },
        yunying: { configured: false },
      },
    }, { events: [], disconnected: false })} />)
    expect(screen.getByText(en['panel.status.disabled'])).toBeTruthy()
  })

  it('refreshes status from the console', () => {
    const props = consoleProps(connectedStatus, { events: [], disconnected: false })
    render(<LiveConsoleTab {...props} />)
    fireEvent.click(screen.getByRole('button', { name: en['panel.quick.refresh'] }))
    expect(props.refreshStatus).toHaveBeenCalledOnce()
  })

  it('localizes the chip title', () => {
    const titleProps = {
      ...allowAllAccess,
      sessionId: SESSION,
      useSession: <T,>(select: (value: object) => T): T => select({}),
      useProjection: () => undefined,
      useAccess: () => true,
      useTabInfo: () => undefined,
      t: makeTranslate(en),
    } as LiveConsoleTitleProps
    render(<LiveConsoleTitle {...titleProps} />)
    expect(screen.getByText(en['console.title'])).toBeTruthy()
  })
})
