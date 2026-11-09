/** Startup behavior of the ecom product shell: workbench first, collapsed navigation, and remembered platform. */
import { describe, expect, it, vi } from 'vitest'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId, SidebarInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import { createPlatformPreferencesStore } from '../src/client/platform-preferences.ts'
import type { PlatformPreferences, PlatformPreferencesStore } from '../src/client/platform-preferences.ts'
import { startWorkbench } from '../src/client/startup.ts'

/** Main panel key the startup selection opens. */
const PANEL_ID = 'ecom-workbench' as MainPanelId

/** Layout fake: records the startup selection and sidebar collapse. */
interface FakeLayout {
  /** Startup selection and sidebar write, typed against the startup dependency. */
  readonly layout: {
    selectStartupPanel: (panelId: MainPanelId) => void
    setSidebar: (collapsed: boolean) => void
    sidebarInfo: HostObservable<SidebarInfo>
  }
  /** Recorded startup panel selection. */
  readonly selectStartupPanel: ReturnType<typeof vi.fn>
  /** Recorded sidebar collapse writes. */
  readonly setSidebar: ReturnType<typeof vi.fn>
}

/**
 * @param collapsed - sidebar state the layout reports at startup.
 * @returns the layout fake and its recorded actions.
 */
function fakeLayout(collapsed: boolean): FakeLayout {
  const selectStartupPanel = vi.fn()
  const setSidebar = vi.fn()
  return {
    layout: {
      selectStartupPanel,
      setSidebar,
      sidebarInfo: { getSnapshot: () => ({ collapsed }), subscribe: () => () => {} },
    },
    selectStartupPanel,
    setSidebar,
  }
}

/**
 * @param value - preference fields seeded into storage.
 * @returns a preferences store seeded from one storage read.
 */
function preferencesWith(value: Partial<PlatformPreferences>): PlatformPreferencesStore {
  const raw = JSON.stringify({ autoEnter: false, lastPlatform: null, lastConsoleUrl: null, ...value })
  return createPlatformPreferencesStore({ getItem: () => raw, setItem: () => {} })
}

/**
 * @returns a scheduler that records deferred tasks instead of running them.
 */
function recordingSchedule(): { schedule: (task: () => void) => void; tasks: Array<() => void> } {
  const tasks: Array<() => void> = []
  return { schedule: (task) => { tasks.push(task) }, tasks }
}

describe('workbench startup', () => {
  it('opens the workbench first and collapses an expanded navigation column', () => {
    const { layout, selectStartupPanel, setSidebar } = fakeLayout(false)
    startWorkbench({
      panelId: PANEL_ID,
      layout,
      preferences: preferencesWith({}),
      available: () => true,
      openPlatform: vi.fn(),
      schedule: vi.fn(),
    })
    expect(selectStartupPanel).toHaveBeenCalledWith(PANEL_ID)
    expect(setSidebar).toHaveBeenCalledWith(true)
  })

  it('leaves an already collapsed navigation column untouched', () => {
    const { layout, setSidebar } = fakeLayout(true)
    startWorkbench({
      panelId: PANEL_ID,
      layout,
      preferences: preferencesWith({}),
      available: () => true,
      openPlatform: vi.fn(),
      schedule: vi.fn(),
    })
    expect(setSidebar).not.toHaveBeenCalled()
  })

  it('defers automatic entry into the remembered platform until scheduled', () => {
    const { layout } = fakeLayout(true)
    const { schedule, tasks } = recordingSchedule()
    const openPlatform = vi.fn()
    startWorkbench({
      panelId: PANEL_ID,
      layout,
      preferences: preferencesWith({ autoEnter: true, lastPlatform: 'douyin-shop' }),
      available: () => true,
      openPlatform,
      schedule,
    })
    expect(openPlatform).not.toHaveBeenCalled()
    expect(tasks).toHaveLength(1)
    tasks[0]?.()
    expect(openPlatform).toHaveBeenCalledWith('douyin-shop')
  })

  it('keeps the selection page when automatic entry is off', () => {
    const { layout } = fakeLayout(true)
    const { schedule, tasks } = recordingSchedule()
    const openPlatform = vi.fn()
    startWorkbench({
      panelId: PANEL_ID,
      layout,
      preferences: preferencesWith({ lastPlatform: 'buyin' }),
      available: () => true,
      openPlatform,
      schedule,
    })
    expect(tasks).toHaveLength(0)
    expect(openPlatform).not.toHaveBeenCalled()
  })

  it('keeps the selection page when no platform was remembered', () => {
    const { layout } = fakeLayout(true)
    const { schedule, tasks } = recordingSchedule()
    startWorkbench({
      panelId: PANEL_ID,
      layout,
      preferences: preferencesWith({ autoEnter: true }),
      available: () => true,
      openPlatform: vi.fn(),
      schedule,
    })
    expect(tasks).toHaveLength(0)
  })

  it('skips automatic entry when the deployment cannot host a console', () => {
    const { layout } = fakeLayout(true)
    const { schedule, tasks } = recordingSchedule()
    startWorkbench({
      panelId: PANEL_ID,
      layout,
      preferences: preferencesWith({ autoEnter: true, lastPlatform: 'douyin-shop' }),
      available: () => false,
      openPlatform: vi.fn(),
      schedule,
    })
    expect(tasks).toHaveLength(0)
  })
})
