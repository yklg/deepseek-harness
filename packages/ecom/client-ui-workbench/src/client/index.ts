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
import type { BrowserSurfaceService } from '@deepseek-ai/dsh-client-ui-sidebar-browser/client'
// Type-only: pulls the slot registry's Context merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the `sidebar.panellist` slot the launcher entry registers into.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: the `ctx.sidebarRightTabs` merge, navigation service, and keyed tab seats.
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: pulls the public `conversation.embedded` Factory declaration.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { createWorkbenchSource } from './source.ts'
import { LiveConsoleTab, LiveConsoleTitle, type LiveConsoleInjected } from './LiveConsoleTab.tsx'
import { WorkbenchIcon } from './WorkbenchIcon.tsx'
import { WorkbenchPage, type WorkbenchPageInjected } from './WorkbenchPage.tsx'
import { ConsoleHost, type ConsoleHostInjected } from './ConsoleHost.tsx'
import { AssistantConversationSurface, AssistantWindow, type AssistantWindowInjected } from './AssistantWindow.tsx'
import { AssistantHeaderActions, type AssistantHeaderActionsInjected } from './AssistantHeaderActions.tsx'
import { createAssistantWindowStore } from './assistant-state.ts'
import { ConsoleController } from './ConsoleController.ts'
import { createPlatformPreferencesStore, type PlatformPreferencesStorage } from './platform-preferences.ts'
import { createWorkbenchProbe } from './platform-probe.ts'
import { platformById, type PlatformId } from './platforms.ts'
import { startWorkbench } from './startup.ts'
import { en, ja, es, fr, de, ru, pt, zh } from './locales.ts'

/** Copy namespace owned by this plugin. */
const NS = 'ecomWorkbench'

/** Sidebar entry id and the keyed `main` panel it opens. */
const PANEL_ID = 'ecom-workbench' as MainPanelId

/** This implementation's identity in the right-Sidebar tab system; the key its body and title register under. */
const TAB_ID = '@deepseek-ai/dsh-client-ui-workbench'

/** Tab type discriminator; the type is a page opened by kind and claims no resource address. */
const LIVE_CONSOLE_KIND = 'live-console'

/** Required browser services: Remote transport, copy, slots, layout, the right Sidebar, and session navigation. */
export const inject = ['remote', 'locale', 'slots', 'sidebarRightTabs', 'sidebarRight', 'uiSession', 'uiWorkspace', 'sessions', 'layout']

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
 * Resolve the browser-surface provider when it is read, not when the UI registers.
 * The Web profile disables that provider row, so the workbench degrades to the
 * desktop-only notice instead of waiting for a service that never arrives.
 * @param ctx - client context that may carry the optional provider.
 * @returns a surface service facade backed by the current provider.
 */
function surfaceAccessor(ctx: ClientContext): BrowserSurfaceService {
  return {
    get available() { return ctx.get('browserSurface')?.available === true },
    create(options) {
      const provider = ctx.get('browserSurface')
      if (provider === undefined || !provider.available) throw new Error('console surface requires the desktop shell')
      return provider.create(options)
    },
  }
}

/**
 * Read the preference storage without failing a restricted document.
 * @returns the browser localStorage, or null when the environment denies access.
 */
function defaultPreferencesStorage(): PlatformPreferencesStorage | null {
  try {
    return globalThis.localStorage
  } catch {
    // A document that denies localStorage keeps preferences in memory for this session.
    return null
  }
}

/**
 * Register the dictionaries, sidebar entry, launcher page, console host, and
 * live-console tab over one shared source and one long-lived console controller.
 * @param ctx - client context carrying Remote, copy, slots, the right Sidebar, session navigation, and the console surface.
 */
function registerUi(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  const preferences = createPlatformPreferencesStore(defaultPreferencesStorage())
  const assistant = createAssistantWindowStore({
    storage: defaultPreferencesStorage(),
    viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
  })
  function followRequestedUrl(url: string): void {
    const platformId = controller.state.getSnapshot().platformId
    if (platformId === null) return
    controller.followLink(url)
  }
  const controller = new ConsoleController({
    surface: surfaceAccessor(ctx),
    applicationOrigin: globalThis.location.origin,
    probe: createWorkbenchProbe(ctx.remote.workbench),
    openRequested: followRequestedUrl,
  })
  // Registered first so the UI registrations below dispose before the guest does.
  ctx.effect(() => () => controller.dispose(), 'client-ui-workbench: console controller')
  const rememberPlatform = (platformId: PlatformId, consoleUrl: string | null): void => {
    const current = preferences.state.getSnapshot()
    const remembered = consoleUrl ?? (current.lastPlatform === platformId ? current.lastConsoleUrl : null)
    if (current.lastPlatform === platformId && current.lastConsoleUrl === remembered) return
    preferences.rememberSession(platformId, remembered)
  }
  const openPlatform = (platformId: PlatformId): void => {
    if (platformById(platformId) === undefined) return
    rememberPlatform(platformId, null)
    const current = preferences.state.getSnapshot()
    const entryUrl = current.lastPlatform === platformId ? current.lastConsoleUrl ?? undefined : undefined
    void controller.open(platformId, entryUrl)
  }
  const toggleNavigation = (): void => { ctx.layout.toggleSidebar() }
  const toggleAssistant = (): void => { assistant.toggle() }
  const jumpConsole = (): void => {
    assistant.close()
    // The console host only draws while the product panel is the active main
    // panel, so jumping from a floating window or the Conversation header also
    // returns navigation to the workbench before focusing the guest.
    ctx.layout.selectPanel(PANEL_ID)
    const platformId = controller.state.getSnapshot().platformId
    if (platformId !== null) void controller.open(platformId)
  }
  // The float keeps its rectangle inside the current viewport across resizes.
  ctx.effect(() => {
    const reclamp = (): void => { assistant.reclamp() }
    window.addEventListener('resize', reclamp)
    return () => { window.removeEventListener('resize', reclamp) }
  }, 'client-ui-workbench: reclamp assistant window')
  // A logged-in console address is the deep link the next launch restores.
  ctx.effect(() => controller.state.subscribe(() => {
    const snapshot = controller.state.getSnapshot()
    if (snapshot.platformId === null || snapshot.loginState !== 'in' || snapshot.url === undefined) return
    // Only a console address is a useful deep link; a login/portal page must not
    // become the restored entry point on the next launch.
    if (platformById(snapshot.platformId)?.classifyUrl(snapshot.url) !== 'console') return
    rememberPlatform(snapshot.platformId, snapshot.url)
  }), 'client-ui-workbench: remember console address')
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
  // The console guest keeps the platform session alive across window focus, so
  // its login state is re-read instead of waiting for the next probe interval.
  ctx.effect(() => {
    const refresh = (): void => { controller.refreshLogin() }
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, 'client-ui-workbench: refresh console sign-in')
  // Selecting any main panel hands the full width to the product surface;
  // reacting only to activePanelId changes leaves sidebar-internal clicks alone.
  ctx.effect(() => {
    let activePanelId = ctx.layout.panelInfo.getSnapshot().activePanelId
    return ctx.layout.panelInfo.subscribe(() => {
      const next = ctx.layout.panelInfo.getSnapshot().activePanelId
      if (next === activePanelId) return
      activePanelId = next
      if (!ctx.layout.sidebarInfo.getSnapshot().collapsed) ctx.layout.setSidebar(true)
    })
  }, 'client-ui-workbench: collapse navigation after panel selection')
  ctx.effect(() => ctx.locale.register(NS, { zh, en, ja, es, fr, de, ru, pt }), 'client-ui-workbench: dictionaries')
  ctx.effect(() => ctx.sidebarRightTabs.register(liveConsoleDefinition(() => t('console.title'))), 'client-ui-workbench: live-console type')
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 10,
    locale: NS,
    label: () => t('panel.title'),
  }, WorkbenchIcon)), 'client-ui-workbench: sidebar entry')
  // The workbench opens once at shell startup; the slot-inject callback runs
  // again when the frame remounts, so the latch keeps navigation single-shot.
  let started = false
  ctx.effect(() => ctx.slots.inject('main', () => {
    const dispose = ctx.slots.register({
      name: 'main',
      key: PANEL_ID,
      locale: NS,
      inject: (): WorkbenchPageInjected => ({
        hooks: {
          status: source.hooks.status,
          overview: source.hooks.overview,
          console: controller.state,
          platformPreferences: preferences.state,
          sidebar: ctx.layout.sidebarInfo,
        },
        platformsAvailable: controller.available,
        openPlatform,
        setAutoEnter: (autoEnter) => { preferences.setAutoEnter(autoEnter) },
        toggleAssistant,
        toggleNavigation,
        refreshStatus: () => { source.refreshStatus() },
        refreshOverview: () => { source.refreshOverview() },
        openLiveConsole: () => openTab(LIVE_CONSOLE_KIND),
        openBrowser: () => openTab('browser'),
      }),
    }, WorkbenchPage)
    if (!started) {
      started = true
      startWorkbench({
        panelId: PANEL_ID,
        layout: ctx.layout,
        preferences,
        available: () => controller.available,
        openPlatform,
        schedule: (task) => { requestAnimationFrame(task) },
      })
    }
    return dispose
  }), 'client-ui-workbench: launcher page')
  // The console host lives outside the main panel so switching to a conversation
  // does not unmount the platform webview; it hides itself with visibility.
  ctx.effect(() => ctx.slots.inject('shell.console', () => ctx.slots.register({
    name: 'shell.console',
    locale: NS,
    inject: (): ConsoleHostInjected => ({
      hooks: { console: controller.state, sidebar: ctx.layout.sidebarInfo },
      attach: element => controller.mount(element),
      panelId: PANEL_ID,
      available: controller.available,
      showSelection: () => { controller.showSelection() },
      retry: () => { controller.retry() },
      refreshLogin: () => { controller.refreshLogin() },
      navigateToLogin: () => { controller.navigateToLogin() },
      zoomIn: () => { controller.zoomIn() },
      zoomOut: () => { controller.zoomOut() },
      resetZoom: () => { controller.resetZoom() },
      toggleAssistant,
    }),
  }, ConsoleHost)), 'client-ui-workbench: console host')
  // The floating AI window rides the shell overlay so it covers any main panel
  // (workbench, console, conversation) without changing the active panel.
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'ecom-workbench.assistant-window',
    locale: NS,
    children: { 'ecom.assistant.conversation': { kind: 'single', scope: 'session-maybe' } },
    inject: (): AssistantWindowInjected => ({
      hooks: { assistant: assistant.state, console: controller.state },
      close: () => { assistant.close() },
      moveTo: (rect) => { assistant.moveTo(rect) },
      jumpConsole,
    }),
  }, AssistantWindow)), 'client-ui-workbench: assistant window')
  // The window body is session-maybe: its declaration above makes the renderer
  // provide the current mainView Session to the shared embedded conversation.
  ctx.effect(() => ctx.slots.inject('ecom.assistant.conversation', () => ctx.slots.register({
    name: 'ecom.assistant.conversation',
  }, AssistantConversationSurface)), 'client-ui-workbench: assistant conversation body')
  // The root header-leading seat renders on blank hero pages too, so the
  // product actions stay reachable before the first message exists.
  ctx.effect(() => ctx.slots.inject('conversation.header.leading', () => ctx.slots.register({
    name: 'conversation.header.leading',
    locale: NS,
    inject: (): AssistantHeaderActionsInjected => ({
      hooks: { console: controller.state },
      toggleAssistant,
      jumpConsole,
    }),
  }, AssistantHeaderActions)), 'client-ui-workbench: assistant header actions')
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
  // The product shell opts the stock sidebar into its compact presentation.
  const disposeProductNavigation = ctx.reflect.provide('productNavigation', { compact: true })
  const unmountRemote = await ctx.remote.$mount(remote)
  const ui = ctx.inject(['remote.workbench', 'locale', 'slots', 'layout', 'sidebarRightTabs', 'sidebarRight', 'uiSession', 'uiWorkspace', 'sessions'], registerUi)
  try {
    await ui
  } catch (error) {
    await ui.dispose()
    await unmountRemote()
    void disposeProductNavigation()
    throw error
  }
  return async () => {
    await ui.dispose()
    await unmountRemote()
    void disposeProductNavigation()
  }
}
