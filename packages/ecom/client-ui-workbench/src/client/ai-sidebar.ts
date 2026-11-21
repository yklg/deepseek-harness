/**
 * Registration seam for the right Sidebar's `ai-sidebar` tab. The Lead wires it
 * from the plugin's `registerUi`: the whole plugin body composes the console
 * controller, the platform adapters, and the assistant window, so the tab takes
 * those as a wiring object instead of owning them. Everything this module
 * registers is an effect on the client context, and the returned disposers
 * withdraw the tab type, body, and chip title in reverse order.
 *
 * @module @deepseek-ai/dsh-client-ui-workbench/src/client/ai-sidebar
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the slot registry's Context merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the `ctx.sidebarRightTabs` merge and the keyed tab seats.
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { AiRemote } from './ai-context.ts'
import { createAiContextReader } from './ai-context.ts'
import {
  AiSidebarTab, AiSidebarTitle, type AiConsoleSnapshot, type AiSidebarInjected,
} from './AiSidebarTab.tsx'
import type { PlatformAdapter } from './platforms.ts'

/** Copy namespace owned by this plugin. */
const NS = 'ecomWorkbench'

/** This implementation's identity in the right-Sidebar tab system; the key its body and title register under. */
export const AI_SIDEBAR_TAB_ID = '@deepseek-ai/dsh-client-ui-workbench/ai-sidebar'

/** Tab type discriminator; the tab is a page opened by kind and claims no resource address. */
export const AI_SIDEBAR_KIND = 'ai-sidebar'

/**
 * The `ai-sidebar` page type.
 * @param title - thunked chip title, read again on every use so a language change needs no re-registration.
 * @returns the definition to register.
 */
export function aiSidebarDefinition(title: () => string): SidebarRightTabDefinition {
  return { id: AI_SIDEBAR_TAB_ID, kind: AI_SIDEBAR_KIND, priority: 'builtin', title }
}

/** Sources and actions the plugin supplies to the AI sidebar. */
export interface AiSidebarWiring {
  /** Workbench Remote methods the page-context reader calls. */
  readonly remote: AiRemote
  /** Active platform adapter, or undefined before a platform opens. */
  readonly platform: () => PlatformAdapter | undefined
  /** Renderer-side guest identity of the active console surface, while it has one. */
  readonly targetId: () => number | undefined
  /** Console snapshot source; pass `controller.state` for the platform hint. */
  readonly console: HostObservable<AiConsoleSnapshot>
  /** Open the product's floating AI assistant. */
  readonly openAssistant: () => void
}

/**
 * Register the AI-sidebar tab type, its body, and its chip title as effects.
 * Call from `registerUi` after the console controller and assistant store exist;
 * the returned disposers are withdrawn with that effect.
 * @param ctx - client context carrying the locale, slot, and right-Sidebar registries.
 * @param wiring - Remote methods, platform/guest getters, console source, and the assistant opener.
 * @returns the disposers for the type, body, and title registrations.
 */
export function registerAiSidebar(ctx: ClientContext, wiring: AiSidebarWiring): Array<() => void> {
  const t = ctx.locale.bind(NS)
  const readContext = createAiContextReader({
    remote: wiring.remote,
    platform: wiring.platform,
    targetId: wiring.targetId,
  })
  return [
    ctx.effect(
      () => ctx.sidebarRightTabs.register(aiSidebarDefinition(() => t('aiSidebar.title'))),
      'client-ui-workbench: ai-sidebar type',
    ),
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab',
      key: AI_SIDEBAR_TAB_ID,
      locale: NS,
      inject: (): AiSidebarInjected => ({
        hooks: { console: wiring.console },
        readContext,
        openAssistant: wiring.openAssistant,
      }),
    }, AiSidebarTab)), 'client-ui-workbench: ai-sidebar body'),
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
      name: 'sidebar.right.pane.tab.title',
      key: AI_SIDEBAR_TAB_ID,
      locale: NS,
    }, AiSidebarTitle)), 'client-ui-workbench: ai-sidebar title'),
  ]
}
