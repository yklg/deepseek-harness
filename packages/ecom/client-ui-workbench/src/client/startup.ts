/**
 * Startup behavior of the product shell: open the workbench first, collapse
 * the harness navigation column, and resume the remembered platform when the
 * user asked for automatic entry.
 */
import type { ILayout, MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PlatformPreferencesStore } from './platform-preferences.ts'
import type { PlatformId } from './platforms.ts'

/** Actions and inputs the product bundle supplies when the shell first renders. */
export interface WorkbenchStartupDeps {
  /** Main panel key the startup selection opens. */
  readonly panelId: MainPanelId
  /** Layout actions and sidebar presentation consulted at startup. */
  readonly layout: Pick<ILayout, 'selectStartupPanel' | 'setSidebar' | 'sidebarInfo'>
  /** Persisted platform selection read before the automatic-entry decision. */
  readonly preferences: PlatformPreferencesStore
  /** Whether this deployment can host a platform console. */
  readonly available: () => boolean
  /** @param platformId - remembered platform to open automatically. */
  readonly openPlatform: (platformId: PlatformId) => void
  /** @param task - automatic entry deferred until after the shell paints. */
  readonly schedule: (task: () => void) => void
}

/**
 * Select the workbench at startup, collapse the harness sidebar, and open the
 * remembered platform when automatic entry is enabled and possible.
 * @param deps - startup selection actions, preferences, availability check, and scheduler.
 * @returns nothing; the layout controller applies the startup selection at most once.
 */
export function startWorkbench(deps: WorkbenchStartupDeps): void {
  deps.layout.selectStartupPanel(deps.panelId)
  if (!deps.layout.sidebarInfo.getSnapshot().collapsed) deps.layout.setSidebar(true)
  const preferences = deps.preferences.state.getSnapshot()
  const platformId = preferences.lastPlatform
  if (!preferences.autoEnter || platformId === null || !deps.available()) return
  deps.schedule(() => { deps.openPlatform(platformId) })
}
