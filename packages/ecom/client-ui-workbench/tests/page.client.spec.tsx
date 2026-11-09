// @vitest-environment jsdom
/** Product home page: top bar, platform hero tiles, console card, dashboard, and system strip. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowAllAccess, contextMenuHook, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ConsoleSnapshot } from '../src/client/ConsoleController.ts'
import type { PlatformPreferences } from '../src/client/platform-preferences.ts'
import type { OverviewSnapshot, StatusSnapshot } from '../src/client/source.ts'
import { WorkbenchPage, type WorkbenchPageProps } from '../src/client/WorkbenchPage.tsx'
import { de, en, es, fr, ja, pt, ru, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const sessions: SessionListState = { ids: [], byId: {}, projectionsBySession: {}, phase: 'ready' }
const workspaces: WorkspaceSnapshot = { items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null }

const idleConsole: ConsoleSnapshot = {
  view: 'select', phase: 'idle', platformId: null, loginState: 'unknown', checking: false, url: undefined,
}
const runningConsole: ConsoleSnapshot = {
  view: 'console',
  phase: 'ready',
  platformId: 'douyin-shop',
  loginState: 'in',
  checking: false,
  url: 'https://fxg.jinritemai.com/ffa/content-tool/live/control',
}
const signedOutConsole: ConsoleSnapshot = {
  view: 'console', phase: 'ready', platformId: 'douyin-shop', loginState: 'out', checking: false, url: undefined,
}
const defaultPreferences: PlatformPreferences = { autoEnter: false, lastPlatform: null, lastConsoleUrl: null }

/** Per-test console, preference, and sidebar snapshots layered over the defaults. */
interface PageState {
  readonly console?: ConsoleSnapshot
  readonly preferences?: PlatformPreferences
  readonly collapsed?: boolean
}

function pageProps(
  status: StatusSnapshot,
  overview: OverviewSnapshot,
  state: PageState = {},
  overrides: Partial<WorkbenchPageProps> = {},
): WorkbenchPageProps {
  const consoleSnapshot = state.console ?? idleConsole
  const preferences = state.preferences ?? defaultPreferences
  const sidebar = { collapsed: state.collapsed === true }
  return {
    ...allowAllAccess,
    useSessions: <T,>(select: (value: SessionListState) => T): T => select(sessions),
    useSessionStatus: <T,>(select: (value: ReadonlyMap<SessionId, string>) => T): T => select(new Map()),
    useSessionRetainInfo: (_sessionId: SessionId) => undefined,
    useSessionAccess: () => true,
    useWorkspaces: <T,>(select: (value: WorkspaceSnapshot) => T): T => select(workspaces),
    useWorkspaceAccess: () => true,
    usePanelInfo: <T,>(select: (value: { activePanelId: string | null }) => T): T => select({ activePanelId: null }),
    useResource: () => { throw new Error('the product home loads no resources') },
    useContextMenu: contextMenuHook(),
    useStatus: <T,>(select: (value: StatusSnapshot) => T): T => select(status),
    useOverview: <T,>(select: (value: OverviewSnapshot) => T): T => select(overview),
    useConsole: <T,>(select: (value: ConsoleSnapshot) => T): T => select(consoleSnapshot),
    usePlatformPreferences: <T,>(select: (value: PlatformPreferences) => T): T => select(preferences),
    useSidebar: <T,>(select: (value: { collapsed: boolean }) => T): T => select(sidebar),
    platformsAvailable: true,
    openPlatform: vi.fn(),
    setAutoEnter: vi.fn(),
    toggleAssistant: vi.fn(),
    toggleNavigation: vi.fn(),
    refreshStatus: vi.fn(),
    refreshOverview: vi.fn(),
    openLiveConsole: vi.fn(async () => true),
    openBrowser: vi.fn(async () => true),
    t: makeTranslate(en),
    ...overrides,
  } as WorkbenchPageProps
}

/**
 * @param title - localized platform title the tile leads with.
 * @returns the platform tile button whose accessible name starts with that title.
 */
function platformTile(title: string): HTMLButtonElement {
  return screen.getByRole('button', { name: new RegExp(title) }) as HTMLButtonElement
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

describe('workbench product home', () => {
  it('renders the product bar with assistant and navigation actions', () => {
    const props = pageProps(ready, overview)
    render(<WorkbenchPage {...props} />)
    expect(screen.getByText(en['panel.title'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: en['platform.aiAssistant'] }))
    expect(props.toggleAssistant).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: en['platform.nav.close'] }))
    expect(props.toggleNavigation).toHaveBeenCalledOnce()
  })

  it('introduces the workbench and offers both platforms plus the group-buy placeholder', () => {
    render(<WorkbenchPage {...pageProps(ready, overview)} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(en['platform.hero.title'])
    expect(screen.getByText(en['platform.hero.description'])).toBeTruthy()
    const picker = screen.getByRole('region', { name: en['platform.heading'] })
    const douyin = platformTile(en['platform.douyinShop.title'])
    const buyin = platformTile(en['platform.buyin.title'])
    expect(within(douyin).getByText(en['platform.douyinShop.description'])).toBeTruthy()
    expect(within(douyin).getByText(en['platform.open'])).toBeTruthy()
    expect(douyin.getAttribute('data-active')).toBe('false')
    expect(within(buyin).getByText(en['platform.buyin.description'])).toBeTruthy()
    expect(within(buyin).getByText(en['platform.open'])).toBeTruthy()
    const groupBuy = within(picker).getByRole('button', { name: new RegExp(en['platform.groupBuy.title']) })
    expect((groupBuy as HTMLButtonElement).disabled).toBe(true)
    expect(within(groupBuy).getByText(en['platform.groupBuy.soon'])).toBeTruthy()
    expect(within(groupBuy).getByText(en['platform.groupBuy.description'])).toBeTruthy()
  })

  it('opens the console for the platform tile the user picks', () => {
    const props = pageProps(ready, overview)
    render(<WorkbenchPage {...props} />)
    fireEvent.click(platformTile(en['platform.douyinShop.title']))
    expect(props.openPlatform).toHaveBeenCalledWith('douyin-shop')
    fireEvent.click(platformTile(en['platform.buyin.title']))
    expect(props.openPlatform).toHaveBeenCalledWith('buyin')
  })

  it('marks the active platform tile and leads with its console call-to-action', () => {
    const props = pageProps(ready, overview, { console: runningConsole })
    render(<WorkbenchPage {...props} />)
    const douyin = platformTile(en['platform.douyinShop.title'])
    expect(douyin.getAttribute('data-active')).toBe('true')
    expect(within(douyin).getByText(en['platform.loginState.in'])).toBeTruthy()
    expect(within(douyin).getByText(en['platform.enterConsole'])).toBeTruthy()
    expect(within(douyin).queryByText(en['platform.continueLogin'])).toBeNull()
    const buyin = platformTile(en['platform.buyin.title'])
    expect(buyin.getAttribute('data-active')).toBe('false')
    expect(within(buyin).queryByText(en['platform.loginState.in'])).toBeNull()
    expect(within(buyin).getByText(en['platform.open'])).toBeTruthy()
    fireEvent.click(douyin)
    expect(props.openPlatform).toHaveBeenCalledWith('douyin-shop')
  })

  it('asks a signed-out active platform to continue signing in', () => {
    render(<WorkbenchPage {...pageProps(ready, overview, { console: signedOutConsole })} />)
    const douyin = platformTile(en['platform.douyinShop.title'])
    expect(within(douyin).getByText(en['platform.loginState.out'])).toBeTruthy()
    expect(within(douyin).getByText(en['platform.continueLogin'])).toBeTruthy()
    expect(within(douyin).queryByText(en['platform.enterConsole'])).toBeNull()
  })

  it('shows the checking state on the active platform tile only', () => {
    render(<WorkbenchPage {...pageProps(ready, overview, {
      console: { ...idleConsole, platformId: 'buyin', loginState: 'unknown', checking: true },
    })} />)
    const buyin = platformTile(en['platform.buyin.title'])
    expect(within(buyin).getByText(en['platform.loginState.checking'])).toBeTruthy()
    expect(within(buyin).queryByText(en['platform.loginState.unknown'])).toBeNull()
    expect(within(platformTile(en['platform.douyinShop.title'])).queryByText(en['platform.loginState.checking'])).toBeNull()
  })

  it('summarizes the active platform and running console in the hero', () => {
    render(<WorkbenchPage {...pageProps(ready, overview, { console: runningConsole })} />)
    expect(screen.getAllByText(en['platform.loginState.in'])).toHaveLength(3)
    expect(screen.getAllByText(en['platform.console.running'])).toHaveLength(2)
  })

  it('persists the auto-enter choice in both directions', () => {
    const props = pageProps(ready, overview)
    const { rerender } = render(<WorkbenchPage {...props} />)
    const off = screen.getByRole('switch', { name: en['platform.autoEnter'] })
    expect(off.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(off)
    expect(props.setAutoEnter).toHaveBeenCalledWith(true)

    const enabled = pageProps(ready, overview, {
      preferences: { autoEnter: true, lastPlatform: 'buyin', lastConsoleUrl: null },
    })
    rerender(<WorkbenchPage {...enabled} />)
    const on = screen.getByRole('switch', { name: en['platform.autoEnter'] })
    expect(on.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(on)
    expect(enabled.setAutoEnter).toHaveBeenCalledWith(false)
  })

  it('relabels the navigation action for the collapsed sidebar', () => {
    const props = pageProps(ready, overview)
    const { rerender } = render(<WorkbenchPage {...props} />)
    fireEvent.click(screen.getByRole('button', { name: en['platform.nav.close'] }))
    expect(props.toggleNavigation).toHaveBeenCalledOnce()

    const collapsed = pageProps(ready, overview, { collapsed: true })
    rerender(<WorkbenchPage {...collapsed} />)
    fireEvent.click(screen.getByRole('button', { name: en['platform.nav.open'] }))
    expect(collapsed.toggleNavigation).toHaveBeenCalledOnce()
  })

  it('shows automation status, target count, and the Yunying dashboard', () => {
    render(<WorkbenchPage {...pageProps(ready, overview)} />)
    expect(screen.getByText(en['panel.status.automation'])).toBeTruthy()
    expect(screen.getByText(en['panel.status.connected'])).toBeTruthy()
    expect(screen.getByText(en['panel.status.targets'].replace('{count}', '2'))).toBeTruthy()
    expect(screen.getByText(en['panel.status.yunying'])).toBeTruthy()
    expect(screen.getByText(en['panel.status.yunyingConfigured'])).toBeTruthy()
    const dashboard = screen.getByRole('region', { name: en['panel.yunying.heading'] })
    expect(within(dashboard).getByText(en['panel.yunying.date'].replace('{date}', '2026-11-08'))).toBeTruthy()
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
    const unavailable = en['panel.status.failed'].replace('{message}', 'host unreachable')
    expect(screen.getAllByText(unavailable)).toHaveLength(2)
    expect(screen.getByText(en['panel.yunying.failed'].replace('{message}', 'gateway down'))).toBeTruthy()
  })

  it('refreshes both unary surfaces from their controls', () => {
    const props = pageProps(ready, overview)
    render(<WorkbenchPage {...props} />)
    fireEvent.click(screen.getByRole('button', { name: en['panel.yunying.refresh'] }))
    expect(props.refreshOverview).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: en['panel.quick.refresh'] }))
    expect(props.refreshStatus).toHaveBeenCalledOnce()
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
    render(<WorkbenchPage {...pageProps(ready, overview, {}, { openLiveConsole: vi.fn(async () => false) })} />)
    fireEvent.click(screen.getByRole('button', { name: en['panel.quick.console'] }))
    await vi.waitFor(() => { expect(screen.getByRole('status').textContent).toBe(en['panel.quick.noSession']) })
  })

  it('disables the platform tiles and explains desktop-only hosting', () => {
    render(<WorkbenchPage {...pageProps(ready, overview, {}, { platformsAvailable: false })} />)
    const picker = screen.getByRole('region', { name: en['platform.heading'] })
    expect(platformTile(en['platform.douyinShop.title']).disabled).toBe(true)
    expect(platformTile(en['platform.buyin.title']).disabled).toBe(true)
    expect(within(picker).getByRole('status').textContent).toBe(en['platform.desktopOnly'])
  })

  it('keeps the console and dashboard cards in one two-column grid container', () => {
    render(<WorkbenchPage {...pageProps(ready, overview)} />)
    const consoleCard = screen.getByRole('region', { name: en['console.title'] })
    const dashboard = screen.getByRole('region', { name: en['panel.yunying.heading'] })
    expect(consoleCard.tagName).toBe('SECTION')
    expect(dashboard.tagName).toBe('SECTION')
    expect(consoleCard.parentElement).toBe(dashboard.parentElement)
    expect(consoleCard.parentElement?.childElementCount).toBe(2)
  })

  it('restores the running console from its business card', () => {
    const props = pageProps(ready, overview, { console: runningConsole })
    render(<WorkbenchPage {...props} />)
    const card = screen.getByRole('region', { name: en['console.title'] })
    expect(within(card).getByText(en['platform.console.running'])).toBeTruthy()
    expect(within(card).getByText(en['platform.douyinShop.title'])).toBeTruthy()
    expect(within(card).getByText(en['platform.loginState.in'])).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: en['platform.enterConsole'] }))
    expect(props.openPlatform).toHaveBeenCalledWith('douyin-shop')
  })

  it('reports a failed console with its message', () => {
    const failedConsole: ConsoleSnapshot = {
      ...runningConsole, phase: 'failed', loginState: 'out', error: 'navigation failed',
    }
    render(<WorkbenchPage {...pageProps(ready, overview, { console: failedConsole })} />)
    const card = screen.getByRole('region', { name: en['console.title'] })
    expect(within(card).getByText(
      en['platform.console.failed'].replace('{message}', 'navigation failed'),
    )).toBeTruthy()
    expect(within(card).getByText(en['platform.continueLogin'])).toBeTruthy()
  })

  it('hints how to open the console before any platform is entered', () => {
    render(<WorkbenchPage {...pageProps(ready, overview)} />)
    const card = screen.getByRole('region', { name: en['console.title'] })
    expect(within(card).getByText(en['platform.description'])).toBeTruthy()
    expect(within(card).queryByRole('button')).toBeNull()
  })

  it('keeps every shipped dictionary key-identical', () => {
    for (const dictionary of [en, ja, es, fr, de, ru, pt]) {
      expect(Object.keys(dictionary).sort()).toEqual(Object.keys(zh).sort())
    }
  })
})
