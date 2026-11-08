// @vitest-environment jsdom
/** Launcher DOM: status rows, Yunying metrics, and quick entries. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowAllAccess, contextMenuHook, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { OverviewSnapshot, StatusSnapshot } from '../src/client/source.ts'
import { WorkbenchPage, type WorkbenchPageProps } from '../src/client/WorkbenchPage.tsx'
import { de, en, es, fr, ja, pt, ru, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const sessions: SessionListState = { ids: [], byId: {}, projectionsBySession: {}, phase: 'ready' }
const workspaces: WorkspaceSnapshot = { items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }

function pageProps(status: StatusSnapshot, overview: OverviewSnapshot, overrides: Partial<WorkbenchPageProps> = {}): WorkbenchPageProps {
  return {
    ...allowAllAccess,
    useSessions: <T,>(select: (value: SessionListState) => T): T => select(sessions),
    useSessionStatus: <T,>(select: (value: ReadonlyMap<SessionId, string>) => T): T => select(new Map()),
    useSessionRetainInfo: (_sessionId: SessionId) => undefined,
    useSessionAccess: () => true,
    useWorkspaces: <T,>(select: (value: WorkspaceSnapshot) => T): T => select(workspaces),
    useWorkspaceAccess: () => true,
    usePanelInfo: <T,>(select: (value: { activePanelId: string | null }) => T): T => select({ activePanelId: null }),
    useResource: () => { throw new Error('the launcher loads no resources') },
    useContextMenu: contextMenuHook(),
    useStatus: <T,>(select: (value: StatusSnapshot) => T): T => select(status),
    useOverview: <T,>(select: (value: OverviewSnapshot) => T): T => select(overview),
    refreshStatus: vi.fn(),
    refreshOverview: vi.fn(),
    openLiveConsole: vi.fn(async () => true),
    openBrowser: vi.fn(async () => true),
    t: makeTranslate(en),
    ...overrides,
  } as WorkbenchPageProps
}

const ready: StatusSnapshot = {
  phase: 'ready',
  disconnected: false,
  status: {
    automation: { enabled: true, available: true, connected: true, targets: 2 },
    yunying: { configured: true },
  },
}
const overview: OverviewSnapshot = {
  phase: 'ready',
  overview: {
    configured: true,
    dashboard: { date: '2026-11-08', metrics: [{ key: 'viewers', label: 'Viewers', value: 1200, unit: 'people' }] },
  },
}

describe('workbench launcher page', () => {
  it('shows automation status, target count, and the Yunying dashboard', () => {
    render(<WorkbenchPage {...pageProps(ready, overview)} />)
    const status = screen.getByRole('region', { name: en['panel.status.heading'] })
    expect(within(status).getByText(en['panel.status.connected'])).toBeTruthy()
    expect(within(status).getByText('Attached targets: 2')).toBeTruthy()
    expect(within(status).getByText(en['panel.status.yunyingConfigured'])).toBeTruthy()
    const dashboard = screen.getByRole('region', { name: en['panel.yunying.heading'] })
    expect(within(dashboard).getByText('Business date: 2026-11-08')).toBeTruthy()
    expect(within(dashboard).getByText('Viewers')).toBeTruthy()
    expect(within(dashboard).getByText('1200 people')).toBeTruthy()
  })

  it('reports a disabled deployment and unconfigured Yunying', () => {
    render(<WorkbenchPage {...pageProps({
      phase: 'ready',
      disconnected: false,
      status: {
        automation: { enabled: false, available: false, connected: false, targets: null },
        yunying: { configured: false },
      },
    }, { phase: 'ready', overview: { configured: false, dashboard: null } })} />)
    expect(screen.getByText(en['panel.status.disabled'])).toBeTruthy()
    expect(screen.getByText(en['panel.status.yunyingUnconfigured'])).toBeTruthy()
    expect(screen.getByText(en['panel.yunying.unconfigured'])).toBeTruthy()
  })

  it('surfaces a failed status read with its message', () => {
    render(<WorkbenchPage {...pageProps(
      { phase: 'failed', error: 'host unreachable', disconnected: true },
      { phase: 'failed', error: 'gateway down' },
    )} />)
    expect(screen.getAllByText('Status unavailable: host unreachable')).toHaveLength(2)
    expect(screen.getByText('Dashboard unavailable: gateway down')).toBeTruthy()
  })

  it('opens the live console and browser through the injected actions', () => {
    const props = pageProps(ready, overview)
    render(<WorkbenchPage {...props} />)
    fireEvent.click(screen.getByRole('button', { name: en['panel.quick.console'] }))
    expect(props.openLiveConsole).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: en['panel.quick.browser'] }))
    expect(props.openBrowser).toHaveBeenCalledOnce()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('explains why a quick entry could not open a tab', async () => {
    render(<WorkbenchPage {...pageProps(ready, overview, { openLiveConsole: vi.fn(async () => false) })} />)
    fireEvent.click(screen.getByRole('button', { name: en['panel.quick.console'] }))
    await vi.waitFor(() => { expect(screen.getByRole('status').textContent).toBe(en['panel.quick.noSession']) })
  })

  it('refreshes both unary surfaces from their controls', () => {
    const props = pageProps(ready, overview)
    render(<WorkbenchPage {...props} />)
    fireEvent.click(screen.getByRole('button', { name: en['panel.yunying.refresh'] }))
    expect(props.refreshOverview).toHaveBeenCalledOnce()
    fireEvent.click(screen.getAllByRole('button', { name: en['panel.quick.refresh'] })[0]!)
    expect(props.refreshStatus).toHaveBeenCalledOnce()
  })

  it('keeps every shipped dictionary key-identical', () => {
    for (const dictionary of [en, ja, es, fr, de, ru, pt]) {
      expect(Object.keys(dictionary).sort()).toEqual(Object.keys(zh).sort())
    }
  })
})
