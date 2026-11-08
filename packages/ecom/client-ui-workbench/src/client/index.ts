/**
 * Workbench plugin, browser half: the **Ecom workbench** entry of the sidebar,
 * the launcher page it opens in the main column, and the `live-console` tab of
 * the right Sidebar. The launcher and console read the Host's Remote surface;
 * the plugin mounts that generated contribution itself so the bundle carries
 * both halves.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import remote from '@deepseek-ai/dsh-ecom-workbench-server/remote'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the slot registry's Context merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the `sidebar.panellist` slot the launcher entry registers into.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: the `ctx.sidebarRightTabs` merge, navigation service, and keyed tab seats.
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { createWorkbenchSource } from './source.ts'
import { LiveConsoleTab, LiveConsoleTitle, type LiveConsoleInjected } from './LiveConsoleTab.tsx'
import { WorkbenchIcon } from './WorkbenchIcon.tsx'
import { WorkbenchPage, type WorkbenchPageInjected } from './WorkbenchPage.tsx'
import { en, ja, es, fr, de, ru, pt, zh } from './locales.ts'

/** Copy namespace owned by this plugin. */
const NS = 'ecomWorkbench'

/** Sidebar entry id and the keyed `main` panel it opens. */
const PANEL_ID = 'ecom-workbench' as MainPanelId

/** This implementation's identity in the right-Sidebar tab system; the key its body and title register under. */
const TAB_ID = '@deepseek-ai/dsh-client-ui-workbench'

/** Tab type discriminator; the type is a page opened by kind and claims no resource address. */
const LIVE_CONSOLE_KIND = 'live-console'

/** Required browser services: Remote transport, copy, slots, the right Sidebar, and session navigation. */
export const inject = ['remote', 'locale', 'slots', 'sidebarRightTabs', 'sidebarRight', 'uiSession', 'uiWorkspace', 'sessions']

/**
 * The `live-console` page type.
 * @param title - thunked chip title, read again on every use so a language change needs no re-registration.
 * @returns the definition to register.
 */
function liveConsoleDefinition(title: () => string): SidebarRightTabDefinition {
  return { id: TAB_ID, kind: LIVE_CONSOLE_KIND, priority: 'builtin', title }
}

/**
 * Pick the most recently updated listed conversation.
 * @param list - current Session catalog.
 * @returns the newest identity, or undefined when the catalog is empty.
 */
function mostRecentSession(list: SessionListState): SessionId | undefined {
  let best: { readonly id: SessionId; readonly updatedAt: number } | undefined
  for (const id of list.ids) {
    const updatedAt = list.byId[id]?.updatedAt ?? 0
    if (best === undefined || updatedAt > best.updatedAt) best = { id, updatedAt }
  }
  return best?.id
}

/**
 * Wait until the right Sidebar reports the requested conversation on screen.
 * @param mounted - the Sidebar's current session observable.
 * @param sessionId - conversation that must be mounted.
 * @returns whether it mounted before the deadline.
 */
function waitForMounted(mounted: HostObservable<SessionId | undefined>, sessionId: SessionId): Promise<boolean> {
  if (mounted.getSnapshot() === sessionId) return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (value: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unsubscribe()
      resolve(value)
    }
    const timer = setTimeout(() => { finish(false) }, 5_000)
    const unsubscribe = mounted.subscribe(() => {
      if (mounted.getSnapshot() === sessionId) finish(true)
    })
  })
}

/**
 * Register the dictionaries, sidebar entry, launcher page, and live-console
 * tab over one shared source.
 * @param ctx - client context carrying Remote, copy, slots, the right Sidebar, and session navigation.
 */
function registerUi(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  const source = createWorkbenchSource({
    openEvents: signal => ctx.remote.workbench.events(signal),
    status: () => ctx.remote.workbench.status(),
    overview: () => ctx.remote.workbench.overview(),
    subscribeReset: listener => ctx.on('connection/reset', listener),
  })
  ctx.effect(() => () => { source.close() }, 'client-ui-workbench: sources')
  // The launcher replaces the conversation in the main column, so the right
  // Sidebar has no mounted surface until navigation returns to the selected
  // Session. Reveal that conversation, wait for the Sidebar to see it, then open.
  const openTab = async (kind: string): Promise<boolean> => {
    const selected = ctx.uiSession.adapter.current.getSnapshot().key
    const sessionId = selected === undefined ? mostRecentSession(ctx.sessions.list.getSnapshot()) : SessionId(selected)
    if (sessionId === undefined) return false
    try {
      if (ctx.sidebarRight.mounted.getSnapshot() !== sessionId) {
        ctx.uiWorkspace.openSession(sessionId)
        if (!await waitForMounted(ctx.sidebarRight.mounted, sessionId)) return false
      }
      ctx.sidebarRight.openTab(kind)
      return true
    } catch (_error) {
      // Without a selected conversation the Sidebar has nowhere to place the tab.
      return false
    }
  }
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'client-ui-workbench: dictionaries')
  ctx.effect(() => ctx.sidebarRightTabs.register(liveConsoleDefinition(() => t('console.title'))), 'client-ui-workbench: live-console type')
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 10,
    locale: NS,
    label: () => t('panel.title'),
  }, WorkbenchIcon)), 'client-ui-workbench: sidebar entry')
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: (): WorkbenchPageInjected => ({
      hooks: { status: source.hooks.status, overview: source.hooks.overview },
      refreshStatus: () => { source.refreshStatus() },
      refreshOverview: () => { source.refreshOverview() },
      openLiveConsole: () => openTab(LIVE_CONSOLE_KIND),
      openBrowser: () => openTab('browser'),
    }),
  }, WorkbenchPage)), 'client-ui-workbench: launcher page')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TAB_ID,
    locale: NS,
    inject: (): LiveConsoleInjected => ({
      hooks: { status: source.hooks.status, events: source.hooks.events },
      reconnect: () => { source.reconnect() },
      refreshStatus: () => { source.refreshStatus() },
    }),
  }, LiveConsoleTab)), 'client-ui-workbench: live-console body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: TAB_ID,
    locale: NS,
  }, LiveConsoleTitle)), 'client-ui-workbench: live-console title')
}

/**
 * Mount the generated workbench Remote contribution, then the UI that calls it.
 * @param ctx - browser plugin context.
 * @returns the disposer that withdraws the UI before the Remote.
 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(remote)
  const ui = ctx.inject(['remote.workbench', 'locale', 'slots', 'sidebarRightTabs', 'sidebarRight', 'uiSession', 'uiWorkspace', 'sessions'], registerUi)
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await unmountRemote()
    throw error
  }
  return async () => {
    await ui.dispose()
    await unmountRemote()
  }
}
