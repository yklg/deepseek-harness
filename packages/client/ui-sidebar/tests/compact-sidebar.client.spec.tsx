// @vitest-environment jsdom
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
/** Product compact mode rendered through the production slot renderer. */
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { en as commonEn } from '@deepseek-ai/dsh-client-locale/src/locales/en.ts'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { ILayout, MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { apply, inject } from '../src/client/index.ts'
import { en as sidebarEn } from '../src/client/locales.ts'

const PANEL = 'compact-sidebar-panel' as MainPanelId
const runtimes = new Set<SlotTestRuntime>()

afterEach(async () => {
  try {
    for (const runtime of runtimes) await runtime.dispose()
  } finally {
    runtimes.clear()
    cleanup()
    localStorage.clear()
  }
})

interface BenchOptions {
  /** Whether the embedding product provides the compact presentation service. */
  readonly compact?: boolean
  /** Sidebar fold state the layout column owner reports. */
  readonly collapsed?: boolean
}

/**
 * Mount the shipped sidebar plugin on the production slot renderer with the
 * services its inject list names.
 * @param options - product compact mode and the sidebar fold state.
 * @returns the runtime, rendered root view, layout double, and sidebar handle.
 */
async function bench({ compact = false, collapsed = false }: BenchOptions = {}) {
  const runtime = await SlotTestRuntime.create()
  runtimes.add(runtime)
  const locale = new LocaleRuntime(runtime.ctx)
  locale.setLocale('en')
  const layout = {
    panelInfo: runtime.panelInfo,
    sidebarInfo: { getSnapshot: () => ({ collapsed }), subscribe: () => () => {} },
    beginNavigation: vi.fn(() => new AbortController().signal),
    setSidebar: vi.fn(),
    toggleSidebar: vi.fn(),
    selectPanel: vi.fn(),
    selectStartupPanel: vi.fn(),
    openRightbar: vi.fn(),
    closeRightbar: vi.fn(),
  } satisfies ILayout
  await runtime.mount({
    inject: ['slots'],
    apply(ctx: Context) {
      ctx.provide('shortcuts', { catalog: createSnapshotStore([]) } as never)
      ctx.provide('layout', layout)
      ctx.provide('uiWorkspace', { startSession: vi.fn() } as never)
      ctx.provide('locale', locale)
      if (compact) ctx.provide('productNavigation', { compact: true })
      ctx.effect(() => locale.register('common', { zh: commonZh, en: commonEn }), 'compact sidebar test: common locale')
      ctx.slots.installLocale(locale)
    },
  })
  function Frame({ renderSlot }: PropsRenderSlots<'sidebar' | 'main'>) {
    return <aside>{renderSlot('sidebar', { collapsed, width: collapsed ? 56 : 300, drawer: false })}</aside>
  }
  await runtime.root.declare({
    sidebar: { kind: 'single', scope: 'root' },
    main: { kind: 'keyed', scope: 'root' },
  }, Frame)
  const sidebar = await runtime.mount({ inject: [...inject], apply })
  const view = runtime.renderRoot()
  return { runtime, view, layout, sidebar }
}

/** Panel-row icon probe: the sidebar owns the row button, the factory supplies the glyph. */
function ProbeIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <span data-testid="probe-panel-icon" data-size={size} />
}

/** Browsing-region probe: compact mode must keep the workspace/session seat mounted. */
function ProbeRegion({ wide }: PropsRuntime<'sidebar.workspaces'>) {
  return <div data-testid="probe-region" data-wide={wide} />
}

/**
 * Register the two navigation surfaces compact mode must leave untouched: one
 * global panel row and the browsing-region occupant.
 * @param runtime - the mounted runtime.
 * @returns handles of the two contributing plugins.
 */
async function mountNavigation(runtime: SlotTestRuntime) {
  const panel = await runtime.mount({
    inject: ['slots'],
    apply(ctx: Context) {
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL }, () => null))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
        { name: 'sidebar.panellist', id: PANEL, label: 'Probe panel' }, ProbeIcon,
      ))
    },
  })
  const region = await runtime.mount({
    inject: ['slots'],
    apply(ctx: Context) {
      ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register(
        { name: 'sidebar.workspaces' }, ProbeRegion,
      ))
    },
  })
  return { panel, region }
}

/**
 * Fill the brand-mark seat so the test can tell the mark from the toggle glyph.
 * @param runtime - the mounted runtime.
 * @returns the contributing plugin handle.
 */
async function mountBrandMark(runtime: SlotTestRuntime) {
  return runtime.mount({
    inject: ['slots'],
    apply(ctx: Context) {
      ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register(
        { name: 'sidebar.brand.mark' }, () => <span data-testid="probe-brand-mark" />,
      ))
    },
  })
}

describe('sidebar product compact mode', () => {
  it('keeps the stock wide sidebar: the brand wordmark and both New Session controls', async () => {
    const { runtime, view } = await bench()
    await mountNavigation(runtime)
    await mountBrandMark(runtime)

    await view.findByRole('navigation', { name: sidebarEn['panels.label'] })
    // The expanded brand doubles as a New Session shortcut beside the principal button.
    expect(view.getAllByRole('button', { name: sidebarEn['session.new.label'] })).toHaveLength(2)
    expect(view.getByText(commonEn['brand.localBuild'])).toBeTruthy()
    expect(view.getByTestId('probe-brand-mark')).toBeTruthy()
    expect(view.getByRole('button', { name: 'Probe panel' })).toBeTruthy()
    expect(view.getByTestId('probe-region').getAttribute('data-wide')).toBe('true')
    expect(view.getByText(sidebarEn['session.new'])).toBeTruthy()
  })

  it('hides the brand block and New Session controls while navigation stays usable', async () => {
    const { runtime, view } = await bench({ compact: true })
    await mountNavigation(runtime)
    await mountBrandMark(runtime)

    await view.findByRole('navigation', { name: sidebarEn['panels.label'] })
    expect(view.queryAllByRole('button', { name: sidebarEn['session.new.label'] })).toEqual([])
    expect(view.queryByText(commonEn['brand.localBuild'])).toBeNull()
    expect(view.queryByText(sidebarEn['session.new'])).toBeNull()
    // The mark slot still renders, so a product keeps its own logo.
    expect(view.getByTestId('probe-brand-mark')).toBeTruthy()
    expect(view.getByRole('button', { name: 'Probe panel' })).toBeTruthy()
    expect(view.getByTestId('probe-region').getAttribute('data-wide')).toBe('true')
  })

  it('keeps the collapsed rail navigable in compact mode', async () => {
    const { runtime, view } = await bench({ compact: true, collapsed: true })
    await mountNavigation(runtime)

    expect(view.getByRole('button', { name: sidebarEn['toggle.open'] })).toBeTruthy()
    expect(view.queryAllByRole('button', { name: sidebarEn['session.new.label'] })).toEqual([])
    await view.findByTestId('probe-region')
    expect(view.getByTestId('probe-region').getAttribute('data-wide')).toBe('false')
    expect(view.getByRole('button', { name: 'Probe panel' })).toBeTruthy()
  })

  it('keeps the collapsed rail New Session control for the stock sidebar', async () => {
    const { view } = await bench({ collapsed: true })

    expect(view.getByRole('button', { name: sidebarEn['toggle.open'] })).toBeTruthy()
    expect(view.getAllByRole('button', { name: sidebarEn['session.new.label'] })).toHaveLength(1)
  })
})
