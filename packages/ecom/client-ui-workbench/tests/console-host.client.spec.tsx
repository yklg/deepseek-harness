// @vitest-environment jsdom
/** Shell console host: persistent seat, platform top bar, status line, and viewport mounting. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowAllAccess, contextMenuHook, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { MainPanelId, SidebarInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ConsoleSnapshot } from '../src/client/ConsoleController.ts'
import { ConsoleHost, type ConsoleHostProps } from '../src/client/ConsoleHost.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

/** Main panel key whose selection shows the console. */
const PANEL_ID = 'ecom-workbench' as MainPanelId

/** Empty Session catalog the standard props need but the console host never reads. */
const sessions: SessionListState = { ids: [], byId: {}, projectionsBySession: {}, phase: 'ready' }

/** Empty workspace snapshot the standard props need but the console host never reads. */
const workspaces: WorkspaceSnapshot = {
  items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
}

/**
 * @param patch - console fields the test overrides.
 * @returns one console snapshot over the idle defaults.
 */
function snapshot(patch: Partial<ConsoleSnapshot> = {}): ConsoleSnapshot {
  return {
    view: 'select', phase: 'idle', platformId: null, loginState: 'unknown', checking: false, url: undefined, ...patch,
  }
}

/**
 * Build console host props over one snapshot.
 * @param current - snapshot the bound `useConsole` hook returns.
 * @param overrides - props the test replaces.
 * @returns the props.
 */
function hostProps(current: ConsoleSnapshot, overrides: Partial<ConsoleHostProps> = {}): ConsoleHostProps {
  return {
    ...allowAllAccess,
    useSessions: <T,>(select: (value: SessionListState) => T): T => select(sessions),
    useSessionStatus: <T,>(select: (value: ReadonlyMap<SessionId, string>) => T): T => select(new Map()),
    useSessionRetainInfo: (_sessionId: SessionId) => undefined,
    useSessionAccess: () => true,
    useWorkspaces: <T,>(select: (value: WorkspaceSnapshot) => T): T => select(workspaces),
    useWorkspaceAccess: () => true,
    usePanelInfo: <T,>(select: (value: { activePanelId: MainPanelId | null }) => T): T => select({ activePanelId: PANEL_ID }),
    useResource: () => { throw new Error('the console host loads no resources') },
    useContextMenu: contextMenuHook(),
    useConsole: <T,>(select: (value: ConsoleSnapshot) => T): T => select(current),
    useSidebar: <T,>(select: (value: SidebarInfo) => T): T => select({ collapsed: false }),
    attach: vi.fn((_element: HTMLElement) => () => {}),
    panelId: PANEL_ID,
    available: true,
    showSelection: vi.fn(),
    retry: vi.fn(),
    toggleSidebar: vi.fn(),
    refreshLogin: vi.fn(),
    toggleAssistant: vi.fn(),
    t: makeTranslate(en),
    ...overrides,
  } as ConsoleHostProps
}

/**
 * @param container - rendered host container.
 * @returns the persistent console seat element.
 */
function consoleSeat(container: HTMLElement): Element | null {
  return container.querySelector('[data-ecom-console-host]')
}

describe('shell console host', () => {
  it('renders the stable hidden seat while the console is not shown', () => {
    const { container } = render(<ConsoleHost {...hostProps(snapshot())} />)
    const seat = consoleSeat(container)
    expect(seat).not.toBeNull()
    expect(seat?.id).toBe('ecom-console-host')
    expect(seat?.getAttribute('data-ecom-console-active')).toBe('false')
    expect(screen.queryByRole('button', { name: en['platform.switch'] })).toBeNull()
  })

  it('shows the platform top bar once the workbench panel displays the console', () => {
    const { container } = render(<ConsoleHost {...hostProps(snapshot({
      view: 'console', phase: 'ready', platformId: 'douyin-shop', loginState: 'in', url: 'https://fxg.jinritemai.com/',
    }))} />)
    expect(consoleSeat(container)?.getAttribute('data-ecom-console-active')).toBe('true')
    expect(screen.getByText(en['platform.douyinShop.title'])).toBeTruthy()
    expect(screen.getByText(en['platform.loginState.in'])).toBeTruthy()
    expect(screen.getByRole('button', { name: en['platform.switch'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: en['platform.aiAssistant'] })).toBeTruthy()
    expect(screen.queryByRole('button', { name: en['platform.login.refresh'] })).toBeNull()
    expect(screen.queryByRole('button', { name: en['platform.retry'] })).toBeNull()
  })

  it('reports an in-flight login check while the probe runs', () => {
    render(<ConsoleHost {...hostProps(snapshot({
      view: 'console', phase: 'ready', platformId: 'douyin-shop', loginState: 'unknown', checking: true,
    }))} />)
    expect(screen.getByText(en['platform.loginState.checking'])).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('reports an opening console while the surface starts', () => {
    render(<ConsoleHost {...hostProps(snapshot({
      view: 'console', phase: 'starting', platformId: 'douyin-shop', loginState: 'unknown',
    }))} />)
    expect(screen.getByRole('status').textContent).toBe(en['platform.console.opening'])
  })

  it('omits the failure line when the surface reports no message', () => {
    render(<ConsoleHost {...hostProps(snapshot({
      view: 'console', phase: 'failed', platformId: 'buyin', loginState: 'unknown',
    }))} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: en['platform.retry'] })).toBeTruthy()
  })

  it('routes the switch and retry controls through the injected actions', () => {
    const showSelection = vi.fn()
    const retry = vi.fn()
    render(<ConsoleHost {...hostProps(
      snapshot({ view: 'console', phase: 'failed', platformId: 'buyin', loginState: 'unknown', error: 'NAME_NOT_RESOLVED' }),
      { showSelection, retry },
    )} />)
    fireEvent.click(screen.getByRole('button', { name: en['platform.switch'] }))
    expect(showSelection).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: en['platform.retry'] }))
    expect(retry).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert').textContent)
      .toBe(en['platform.console.failed'].replace('{message}', 'NAME_NOT_RESOLVED'))
  })

  it('explains a deployment without desktop support and omits the platform bar', () => {
    render(<ConsoleHost {...hostProps(
      snapshot({ view: 'console', phase: 'failed', platformId: null }),
      { available: false },
    )} />)
    expect(screen.getByText(en['platform.desktopOnly'])).toBeTruthy()
    expect(screen.queryByRole('button', { name: en['platform.switch'] })).toBeNull()
    expect(screen.queryByText(en['platform.douyinShop.title'])).toBeNull()
  })

  it('mounts the live surface into the viewport and detaches it on unmount', () => {
    const detach = vi.fn()
    const attach = vi.fn((_element: HTMLElement) => detach)
    const { container, unmount } = render(<ConsoleHost {...hostProps(snapshot(), { attach })} />)
    const viewport = consoleSeat(container)?.lastElementChild
    expect(viewport?.tagName).toBe('DIV')
    expect(attach).toHaveBeenCalledOnce()
    expect(attach).toHaveBeenCalledWith(viewport)
    unmount()
    expect(detach).toHaveBeenCalledOnce()
  })

  it('stays hidden when another main panel is selected while the console stays alive', () => {
    const { container } = render(<ConsoleHost {...hostProps(
      snapshot({ view: 'console', phase: 'ready', platformId: 'douyin-shop', loginState: 'in' }),
      {
        usePanelInfo: <T,>(select: (value: { activePanelId: MainPanelId | null }) => T): T =>
          select({ activePanelId: null }),
      },
    )} />)
    expect(consoleSeat(container)?.getAttribute('data-ecom-console-active')).toBe('false')
    expect(screen.queryByText(en['platform.douyinShop.title'])).toBeNull()
  })

  it('shows the probe failure line instead of stacking further hints', () => {
    render(<ConsoleHost {...hostProps(snapshot({
      view: 'console', phase: 'ready', platformId: 'douyin-shop', loginState: 'in', probeError: 'automation unavailable',
    }))} />)
    expect(screen.getByRole('alert').textContent)
      .toBe(en['platform.probe.failed'].replace('{message}', 'automation unavailable'))
    expect(screen.queryByText(en['platform.login.required'])).toBeNull()
  })

  it('prompts for the official sign-in when the platform reports signed out', () => {
    render(<ConsoleHost {...hostProps(snapshot({
      view: 'console', phase: 'ready', platformId: 'douyin-shop', loginState: 'out',
    }))} />)
    expect(screen.getByText(en['platform.loginState.out'])).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe(en['platform.login.required'])
  })

  it('labels the navigation toggle from the sidebar state and routes the click', () => {
    const toggleSidebar = vi.fn()
    const active = snapshot({ view: 'console', phase: 'ready', platformId: 'douyin-shop', loginState: 'in' })
    const { rerender } = render(<ConsoleHost {...hostProps(active, { toggleSidebar })} />)
    fireEvent.click(screen.getByRole('button', { name: en['platform.nav.close'] }))
    expect(toggleSidebar).toHaveBeenCalledOnce()
    rerender(<ConsoleHost {...hostProps(active, {
      toggleSidebar,
      useSidebar: <T,>(select: (value: SidebarInfo) => T): T => select({ collapsed: true }),
    })} />)
    fireEvent.click(screen.getByRole('button', { name: en['platform.nav.open'] }))
    expect(toggleSidebar).toHaveBeenCalledTimes(2)
  })

  it('refreshes the sign-in state while the platform reports signed out', () => {
    const refreshLogin = vi.fn()
    render(<ConsoleHost {...hostProps(
      snapshot({ view: 'console', phase: 'ready', platformId: 'douyin-shop', loginState: 'out' }),
      { refreshLogin },
    )} />)
    fireEvent.click(screen.getByRole('button', { name: en['platform.login.refresh'] }))
    expect(refreshLogin).toHaveBeenCalledOnce()
  })

  it('routes the AI assistant control through the injected action', () => {
    const toggleAssistant = vi.fn()
    render(<ConsoleHost {...hostProps(
      snapshot({ view: 'console', phase: 'ready', platformId: 'douyin-shop', loginState: 'in' }),
      { toggleAssistant },
    )} />)
    fireEvent.click(screen.getByRole('button', { name: en['platform.aiAssistant'] }))
    expect(toggleAssistant).toHaveBeenCalledOnce()
  })
})
