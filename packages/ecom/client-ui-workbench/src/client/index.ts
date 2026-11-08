/**
 * Workbench plugin, browser half: the **Ecom workbench** entry of the sidebar
 * and the launcher page it opens in the main column, plus the `live-console`
 * tab type of the right Sidebar.
 *
 * Both surfaces reach their hosts through public paths only: the launcher
 * registers into the `sidebar.panellist` list and the keyed `main` seat, and
 * the console type declares itself through `ctx.sidebarRightTabs` with its body
 * and chip title in `sidebar.right.pane.tab` and
 * `sidebar.right.pane.tab.title` under the definition's id. Components receive
 * only the framework's derived props shares; every product string comes from
 * the `ecomWorkbench` dictionaries.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the slot registry's Context merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: the `sidebar.panellist` slot the launcher entry registers into.
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: the `ctx.sidebarRightTabs` merge and the keyed tab body seats.
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { LiveConsoleTab, LiveConsoleTitle } from './LiveConsoleTab.tsx'
import { WorkbenchIcon } from './WorkbenchIcon.tsx'
import { WorkbenchPage } from './WorkbenchPage.tsx'
import { en, ja, es, fr, de, ru, pt, zh } from './locales.ts'

/** Copy namespace owned by this plugin. */
const NS = 'ecomWorkbench'

/** Sidebar entry id and the keyed `main` panel it opens. */
const PANEL_ID = 'ecom-workbench' as MainPanelId

/** This implementation's identity in the right-Sidebar tab system; the key its body and title register under. */
const TAB_ID = '@deepseek-ai/dsh-client-ui-workbench'

/** Tab type discriminator; the type is a page opened by kind and claims no resource address. */
const LIVE_CONSOLE_KIND = 'live-console'

/** Required browser services: the slot registry, copy, and the right-Sidebar tab registry. */
export const inject = ['slots', 'locale', 'sidebarRightTabs']

/**
 * The `live-console` page type.
 * @param title - thunked chip title, read again on every use so a language change needs no re-registration.
 * @returns the definition to register.
 */
function liveConsoleDefinition(title: () => string): SidebarRightTabDefinition {
  return { id: TAB_ID, kind: LIVE_CONSOLE_KIND, priority: 'builtin', title }
}

/**
 * Register the workbench dictionaries, sidebar entry, launcher page, and
 * live-console tab type.
 * @param ctx - client root context carrying the slot registry, copy, and the right-Sidebar tab registry.
 */
export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
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
  }, WorkbenchPage)), 'client-ui-workbench: launcher page')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab',
    key: TAB_ID,
    locale: NS,
  }, LiveConsoleTab)), 'client-ui-workbench: live-console body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab.title',
    key: TAB_ID,
    locale: NS,
  }, LiveConsoleTitle)), 'client-ui-workbench: live-console title')
}
