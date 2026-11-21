// @vitest-environment jsdom
/** AI sidebar: empty/loading/failed/ready panes, draft switching, copying, and the assistant action. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { allowAllAccess, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import type { AiContextSnapshot } from '../src/client/ai-context.ts'
import type { AiConsoleSnapshot } from '../src/client/AiSidebarTab.tsx'
import {
  AiSidebarTab, AiSidebarTitle, type AiSidebarTabProps, type AiSidebarTitleProps,
} from '../src/client/AiSidebarTab.tsx'
import { redactPii } from '../src/client/pii.ts'
import { AI_SIDEBAR_KIND, AI_SIDEBAR_TAB_ID, aiSidebarDefinition } from '../src/client/ai-sidebar.ts'
import { de, en, es, fr, ja, pt, ru, zh } from '../src/client/locales.ts'

const SESSION = SessionId('session-ai')

/** Visible text of the console page the fake reader returns. */
const RAW_TEXT = '买家电话 13800138000，收货地址：上海市浦东新区世纪大道 1 号'

/** One read of the console page. */
const CONTEXT: AiContextSnapshot = {
  url: 'https://fxg.jinritemai.com/ffa/content-tool/live/control',
  title: '直播中控',
  text: RAW_TEXT,
  redacted: redactPii(RAW_TEXT),
}

/** Console snapshots the tab receives through its `useConsole` hook. */
const idleConsole: AiConsoleSnapshot = { platformId: null }
const liveConsole: AiConsoleSnapshot = { platformId: 'douyin-shop', targetId: 42 }

/** Clipboard write of the current test. */
const writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  writeText.mockReset()
  writeText.mockResolvedValue(undefined)
  Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText } })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(globalThis.navigator, 'clipboard')
})

/**
 * @param readContext - reader the tab calls.
 * @param state - console snapshot and assistant action the test replaces.
 * @returns props for a hand-built tab occurrence.
 */
function sidebarProps(
  readContext: AiSidebarTabProps['readContext'],
  state: { readonly console?: AiConsoleSnapshot; readonly openAssistant?: () => void } = {},
): AiSidebarTabProps {
  return {
    ...allowAllAccess,
    sessionId: SESSION,
    useSession: <T,>(select: (value: object) => T): T => select({}),
    useProjection: () => undefined,
    useAccess: () => true,
    useTabInfo: () => undefined,
    useConsole: <T,>(select: (value: AiConsoleSnapshot) => T): T => select(state.console ?? liveConsole),
    readContext,
    openAssistant: state.openAssistant ?? vi.fn(),
    t: makeTranslate(en),
  } as AiSidebarTabProps
}

/**
 * Render the tab, read one page, and wait for the ready pane.
 * @param context - snapshot the reader resolves.
 * @returns the read mock and the rendered container.
 */
async function renderReady(context: AiContextSnapshot = CONTEXT): Promise<{
  readonly readContext: Mock<AiSidebarTabProps['readContext']>
  readonly container: HTMLElement
}> {
  const readContext = vi.fn<AiSidebarTabProps['readContext']>(async () => context)
  const { container } = render(<AiSidebarTab {...sidebarProps(readContext)} />)
  fireEvent.click(screen.getByRole('button', { name: en['aiSidebar.read'] }))
  await screen.findByText(en['aiSidebar.context'])
  return { readContext, container }
}

describe('AI sidebar', () => {
  it('shows the empty state and asks for a console page before any read', () => {
    render(<AiSidebarTab {...sidebarProps(vi.fn(), { console: idleConsole })} />)
    expect(screen.getByText(en['aiSidebar.title'])).toBeTruthy()
    expect(screen.getByText(en['aiSidebar.description'])).toBeTruthy()
    expect(screen.getByText(en['aiSidebar.empty'])).toBeTruthy()
    expect(screen.getByText(en['aiSidebar.needConsole'])).toBeTruthy()
    expect(screen.getByRole('button', { name: en['aiSidebar.read'] })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the reading state while the page is being read', () => {
    const readContext: AiSidebarTabProps['readContext'] = () => new Promise<AiContextSnapshot>(() => {})
    render(<AiSidebarTab {...sidebarProps(readContext)} />)
    fireEvent.click(screen.getByRole('button', { name: en['aiSidebar.read'] }))
    expect(screen.getByRole('status').textContent).toBe(en['aiSidebar.reading'])
  })

  it('reports a failed read with the reader message', async () => {
    const readContext = vi.fn<AiSidebarTabProps['readContext']>(async () => { throw new Error('attach failed') })
    render(<AiSidebarTab {...sidebarProps(readContext)} />)
    fireEvent.click(screen.getByRole('button', { name: en['aiSidebar.read'] }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Could not read the page: attach failed')
  })

  it('shows the source page, redaction count, and redacted preview when ready', async () => {
    await renderReady()
    expect(screen.getByText(CONTEXT.title)).toBeTruthy()
    expect(screen.getByText(CONTEXT.url)).toBeTruthy()
    expect(screen.getByText(en['aiSidebar.redacted'].replace('{count}', '2'))).toBeTruthy()
    expect(screen.getByText(CONTEXT.redacted.text)).toBeTruthy()
    expect(screen.queryByText(/13800138000/)).toBeNull()
    expect(screen.getByRole('button', { name: en['aiSidebar.reread'] })).toBeTruthy()
  })

  it('re-reads the page from the ready pane', async () => {
    const { readContext } = await renderReady()
    fireEvent.click(screen.getByRole('button', { name: en['aiSidebar.reread'] }))
    await vi.waitFor(() => { expect(readContext).toHaveBeenCalledTimes(2) })
  })

  it('switches between the three draft kinds', async () => {
    await renderReady()
    const script = screen.getByRole('button', { name: en['aiSidebar.kind.script'] })
    const quick = screen.getByRole('button', { name: en['aiSidebar.kind.quick'] })
    expect(script.getAttribute('aria-pressed')).toBe('true')
    expect(quick.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(quick)
    expect(quick.getAttribute('aria-pressed')).toBe('true')
    expect(script.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText(content => content.includes('quick replies for live commerce'), { selector: 'pre' })).toBeTruthy()
  })

  it('copies the current prompt with the redacted context', async () => {
    await renderReady()
    fireEvent.click(screen.getByRole('button', { name: en['aiSidebar.copy'] }))
    await vi.waitFor(() => { expect(writeText).toHaveBeenCalledOnce() })
    const copied = writeText.mock.calls[0]?.[0] ?? ''
    expect(copied).toContain(CONTEXT.redacted.text)
    expect(copied).not.toContain('13800138000')
    await screen.findByRole('button', { name: en['aiSidebar.copied'] })
  })

  it('reports a refused clipboard write', async () => {
    writeText.mockRejectedValue(new Error('clipboard denied'))
    await renderReady()
    fireEvent.click(screen.getByRole('button', { name: en['aiSidebar.copy'] }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(en['aiSidebar.copyFailed'])
  })

  it('opens the AI assistant from the pane', async () => {
    const openAssistant = vi.fn()
    const readContext = vi.fn<AiSidebarTabProps['readContext']>(async () => CONTEXT)
    render(<AiSidebarTab {...sidebarProps(readContext, { openAssistant })} />)
    fireEvent.click(screen.getByRole('button', { name: en['aiSidebar.openAssistant'] }))
    expect(openAssistant).toHaveBeenCalledOnce()
  })

  it('localizes the chip title', () => {
    const props = {
      ...allowAllAccess,
      sessionId: SESSION,
      useSession: <T,>(select: (value: object) => T): T => select({}),
      useProjection: () => undefined,
      useAccess: () => true,
      useTabInfo: () => undefined,
      t: makeTranslate(en),
    } as AiSidebarTitleProps
    render(<AiSidebarTitle {...props} />)
    expect(screen.getByText(en['aiSidebar.title'])).toBeTruthy()
  })
})

/**
 * @param value - one dictionary entry.
 * @returns its template placeholders, sorted, as one comparable string.
 */
function placeholdersOf(value: string): string {
  return [...(value.match(/\{\w+\}/g) ?? [])].sort().join(',')
}

describe('AI sidebar registration contract', () => {
  it('defines a builtin page type under its own implementation id', () => {
    const definition = aiSidebarDefinition(() => en['aiSidebar.title'])
    expect(definition.id).toBe(AI_SIDEBAR_TAB_ID)
    expect(definition.kind).toBe(AI_SIDEBAR_KIND)
    expect(definition.priority).toBe('builtin')
    expect(definition.patterns).toBeUndefined()
    expect(definition.title('')).toBe(en['aiSidebar.title'])
  })
})

describe('AI sidebar dictionaries', () => {
  const dictionaries: ReadonlyArray<readonly [string, Record<string, string>]> = [
    ['en', en], ['ja', ja], ['es', es], ['fr', fr], ['de', de], ['ru', ru], ['pt', pt],
  ]
  const source: Record<string, string> = zh
  const keys = Object.keys(source).filter(key => key.startsWith('aiSidebar.'))

  it('carries every AI-sidebar key in all eight languages with matching placeholders', () => {
    expect(keys.length).toBeGreaterThanOrEqual(22)
    for (const [locale, dictionary] of dictionaries) {
      for (const key of keys) {
        const translated = dictionary[key]
        expect(translated, `${locale} is missing ${key}`).toBeTypeOf('string')
        expect(placeholdersOf(translated ?? ''), `${locale} placeholders for ${key}`)
          .toBe(placeholdersOf(source[key] ?? ''))
      }
    }
  })
})
