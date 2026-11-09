// @vitest-environment jsdom
/** Embedded Conversation surface contract for secondary display areas. */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply as applyMenus, inject as injectMenus } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { GlobalStandardProps, PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type {
  ISession, SessionListState, SessionReference, SessionSnapshot, SessionSummary,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  allowAllAccess, bindSnapshotSelector, contextMenuHook, sessionSnapshot, SlotTestRuntime, stubConfigForm,
} from '@deepseek-ai/dsh-client-test-runtime'
import {
  apply, EMPTY_CONVERSATION_SNAPSHOT, EmbeddedConversation, inject,
  type ConversationSnapshot, type EmbeddedConversationProps,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { SessionInputShell } from '../src/client/input/facade.ts'
import './control-row-dom.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Test-only root overlay that hosts the embedded window. */
    'test.embeddedOverlay': { kind: 'list'; scope: 'root'; owner: EmbeddedOverlayOwnerProps }
    /** Test-only session-optional position occupied by the embedded Conversation surface. */
    'test.embeddedConversation': { kind: 'single'; scope: 'session-maybe' }
  }
}

declare module '@deepseek-ai/dsh-api-session-controller/client' {
  interface SessionReferenceSourceMap {
    /** Test-only independent reference held by the embedded window. */
    embeddedTest: unknown
  }
}

/** Owner props of the test root overlay: the optional Session the window pins. */
interface EmbeddedOverlayOwnerProps {
  readonly pinned?: SessionReference | undefined
}

const SID = 'embedded-main' as SessionId
const OTHER = 'embedded-pinned' as SessionId

/** Root frame hosting the test overlay and, when requested, the Conversation main Slot. */
type TestFrameProps = PropsRenderSlots<'test.embeddedOverlay'>

let pinnedReference: SessionReference | undefined

function TestFrame({ renderSlot }: TestFrameProps) {
  return <>{renderSlot('test.embeddedOverlay', { pinned: pinnedReference })}</>
}

/** Root-overlay window: renders the embedded surface, optionally under a pinned Session provider. */
function EmbeddedWindow({
  pinned, SessionProvider, renderSlot,
}: PropsRuntime<'test.embeddedOverlay'> & PropsRenderSlots<'test.embeddedConversation'>) {
  const body = renderSlot('test.embeddedConversation', {})
  return (
    <div data-test-embedded-window="">
      {pinned === undefined ? body : <SessionProvider session={pinned}>{body}</SessionProvider>}
    </div>
  )
}

/** Shadow registration that records the View identity the embedded occurrence requests. */
function ChatViewProbe({ view }: { readonly view?: string | undefined }) {
  return <i data-chat-view={view ?? 'absent'} />
}

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']

function workspaceState(): WorkspaceSnapshot {
  return {
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  }
}

function listState(rows: readonly { readonly id: SessionId; readonly blank: boolean }[]): SessionListState {
  const byId: Record<SessionId, SessionSummary> = {}
  for (const row of rows) {
    byId[row.id] = {
      id: row.id, displayTitle: row.id, running: false, retainedBy: {}, blank: row.blank, updatedAt: 1,
    }
  }
  return { ids: rows.map(row => row.id), byId, phase: 'ready', projectionsBySession: {} }
}

function fakeInput() {
  const sink = vi.fn(() => Promise.resolve({ kind: 'success' as const }))
  const shell = new SessionInputShell({
    actx: {} as Context,
    defaultSink: sink,
    commandAttachments: {
      serialize: () => Promise.resolve([]),
      release: () => {},
      unsupportedNotice: (token: string) => token,
    },
  })
  return { useInput: bindSnapshotSelector(shell.state), inputActions: shell.actions }
}

/** One recorded Factory render request, captured without erasing the test's types. */
interface FactoryCall {
  readonly name: string
  readonly input: unknown
  readonly slots: Readonly<Record<string, unknown>> | undefined
}

/** Hand-built optional-Session standard props for one embedded occurrence. */
function embeddedProps(options: {
  readonly session?: SessionSnapshot | undefined
  readonly conversation?: ConversationSnapshot | undefined
  readonly summaryBlank?: boolean | undefined
}): { readonly props: EmbeddedConversationProps; readonly calls: FactoryCall[] } {
  const { session } = options
  const sessionId = session?.sessionId
  const useSession: EmbeddedConversationProps['useSession'] = session === undefined
    ? () => undefined
    : bindSnapshotSelector(createSnapshotStore(session))
  const conversation = options.conversation
  const useConversation: EmbeddedConversationProps['useConversation'] = conversation === undefined
    ? () => undefined
    : bindSnapshotSelector(createSnapshotStore(conversation))
  const input = fakeInput()
  const calls: FactoryCall[] = []
  const renderFactorySlot: EmbeddedConversationProps['renderFactorySlot'] = (name, factoryInput, factoryOptions) => {
    calls.push({ name, input: factoryInput, slots: factoryOptions?.slots })
    return null
  }
  const props: EmbeddedConversationProps = {
    usePanelInfo: selector => selector({ activePanelId: null }),
    useResource,
    useContextMenu: contextMenuHook(),
    useWorkspaces: bindSnapshotSelector(createSnapshotStore<WorkspaceSnapshot>(workspaceState())),
    useSessions: bindSnapshotSelector(createSnapshotStore<SessionListState>(listState(
      sessionId === undefined ? [] : [{ id: sessionId, blank: options.summaryBlank === true }],
    ))),
    useSessionStatus: bindSnapshotSelector(createSnapshotStore<SessionStatusSnapshot>(new Map())),
    useSessionRetainInfo: () => undefined,
    ...allowAllAccess,
    sessionId,
    useSession,
    useProjection: (() => undefined),
    useConversation,
    useInput: input.useInput,
    inputActions: input.inputActions,
    renderFactorySlot,
  }
  return { props, calls }
}

/** jsdom implements no Range geometry (Lexical measures the caret with one once the composer is editable). */
Range.prototype.getBoundingClientRect = () => ({
  top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}),
})

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  pinnedReference = undefined
})

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

function sessionFake(): Partial<ISession> {
  return {
    loadOlder: vi.fn<ISession['loadOlder']>(() => Promise.resolve()),
    prompt: vi.fn<ISession['prompt']>(async () => ({ ok: true as const, value: { accepted: true as const } })),
  }
}

/** Bridge a host Slot position to the public embedded Factory (the ui-subagent usage). */
function EmbeddedFactoryBridge({ renderFactorySlot }: PropsRenderFactories) {
  return <>{renderFactorySlot('conversation.embedded', {})}</>
}

interface BenchOptions {
  /** Declare the Conversation main Slot so ui-conversation registers its Factories. */
  readonly declareMain: boolean
  /** Mount ui-conversation; false leaves every Conversation Factory and standard source unregistered. */
  readonly mountConversation?: boolean | undefined
  readonly mainSession?: SessionSnapshot | undefined
  readonly mainSummaryBlank?: boolean | undefined
  readonly pinnedSession?: SessionSnapshot | undefined
  readonly chatProbe?: boolean | undefined
  /** Which public entry the host Slot position registers: the Factory bridge or the exported Component. */
  readonly host?: 'factory' | 'component' | undefined
}

/** Observable outcome of one embedded occurrence, used for cross-entry equivalence. */
function renderedState(container: HTMLElement) {
  const content = container.querySelector<HTMLElement>('[data-conversation-content]')
  return {
    session: content?.dataset.conversationSession ?? null,
    phase: content?.dataset.contentPhase ?? null,
    composer: container.querySelector('[data-composer-input]') !== null,
  }
}

async function bench(options: BenchOptions): Promise<SlotTestRuntime> {
  const runtime = await SlotTestRuntime.create()
  runtime.ctx.provide('uiWorkspace', { openWorkspace: vi.fn(), openSession: vi.fn() } as never)
  runtime.ctx.provide('configForms', {
    developerTools: { enabled: createSnapshotStore(true) },
    get: () => stubConfigForm().scope,
  } as never)
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  runtime.ctx.provide('shortcuts', { catalog: createSnapshotStore([]) })
  await runtime.mount({ inject: [...injectMenus], apply: applyMenus })

  if (options.mainSession !== undefined) {
    await runtime.sessions.add({
      id: options.mainSession.sessionId,
      summary: {
        title: 'Main', displayTitle: 'Main', cwd: '/proj', blank: options.mainSummaryBlank === true,
      },
      snapshot: options.mainSession,
      session: sessionFake(),
    })
    runtime.sessions.retain(options.mainSession.sessionId, { source: 'mainView' })
  }
  if (options.pinnedSession !== undefined) {
    await runtime.sessions.add({
      id: options.pinnedSession.sessionId,
      summary: { title: 'Pinned', displayTitle: 'Pinned', cwd: '/proj' },
      session: sessionFake(),
    })
    pinnedReference = runtime.sessions.retain(options.pinnedSession.sessionId, { source: 'embeddedTest' })
  }

  const children = options.declareMain
    ? {
      'main': { kind: 'keyed', scope: 'root' },
      'test.embeddedOverlay': { kind: 'list', scope: 'root' },
    } as const
    : { 'test.embeddedOverlay': { kind: 'list', scope: 'root' } } as const
  await runtime.root.declare(children, TestFrame)
  if (options.mountConversation !== false) {
    await runtime.mount({ inject: [...inject], apply })
  }
  runtime.slots.register({
    name: 'test.embeddedOverlay',
    id: 'embedded-window',
    children: { 'test.embeddedConversation': { kind: 'single', scope: 'session-maybe' } },
  }, EmbeddedWindow)
  if (options.chatProbe === true && options.mountConversation !== false) {
    runtime.slots.register({ name: 'conversation.session', priority: -1 }, ChatViewProbe)
  }
  const host = options.host ?? 'factory'
  runtime.slots.register(
    { name: 'test.embeddedConversation' },
    host === 'factory' ? EmbeddedFactoryBridge : EmbeddedConversation,
  )
  return runtime
}

interface EmbeddedPhaseCase {
  readonly name: string
  readonly session: Partial<SessionSnapshot>
  readonly summaryBlank: boolean | undefined
  readonly expected: { readonly variant: 'embedded'; readonly phase: 'active' | 'hero' | 'settling'; readonly hero: boolean }
}

const PHASE_CASES: readonly EmbeddedPhaseCase[] = [
  {
    name: 'active transcript',
    session: { blank: false, awaitingFirstTurn: false, running: false, openState: 'open' },
    summaryBlank: false,
    expected: { variant: 'embedded', phase: 'active', hero: false },
  },
  {
    name: 'blank Hero',
    session: { blank: true, awaitingFirstTurn: true, running: false, openState: 'open' },
    summaryBlank: true,
    expected: { variant: 'embedded', phase: 'hero', hero: true },
  },
  {
    name: 'engaged blank Session',
    session: { blank: true, awaitingFirstTurn: true, running: false, openState: 'open', promptAttempted: true },
    summaryBlank: false,
    expected: { variant: 'embedded', phase: 'active', hero: false },
  },
  {
    name: 'settling history replay',
    session: { blank: true, awaitingFirstTurn: true, running: false, openState: 'loading' },
    summaryBlank: false,
    expected: { variant: 'embedded', phase: 'settling', hero: false },
  },
  {
    name: 'blank Session whose summary a loading list has not caught up',
    session: { blank: true, awaitingFirstTurn: true, running: false, openState: 'open' },
    summaryBlank: undefined,
    expected: { variant: 'embedded', phase: 'hero', hero: true },
  },
]

describe('Embedded Conversation phase contract', () => {
  it.each(PHASE_CASES)('derives the $name phase for one embedded content occurrence', ({ session, summaryBlank, expected }) => {
    const snapshot = { ...sessionSnapshot(SID), ...session }
    const { props, calls } = embeddedProps({
      session: snapshot,
      conversation: EMPTY_CONVERSATION_SNAPSHOT,
      summaryBlank,
    })
    render(<EmbeddedConversation {...props} />)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.name).toBe('conversation.content')
    expect(calls[0]?.input).toEqual(expected)
    expect(calls[0]?.slots?.views).toBeTypeOf('function')
  })

  it('renders the Hero and Composer with no Session bound', () => {
    const { props, calls } = embeddedProps({})
    render(<EmbeddedConversation {...props} />)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.name).toBe('conversation.content')
    expect(calls[0]?.input).toEqual({ variant: 'embedded', phase: 'hero', hero: true })
    expect(calls[0]?.slots?.views).toBeTypeOf('function')
  })
})

describe('Embedded Conversation in a root-scope overlay', () => {
  it('inherits the current main-view Session through the public Factory', async () => {
    const session = { ...sessionSnapshot(SID), blank: false }
    const runtime = await bench({ declareMain: true, mainSession: session, chatProbe: true })
    const view = runtime.renderRoot()
    expect(runtime.factoryOf('conversation.embedded').name).toBe('conversation.embedded')

    expect(view.container.querySelector('[data-test-embedded-window]')).not.toBeNull()
    expect(renderedState(view.container)).toEqual({ session: SID, phase: 'active', composer: true })
    // The embedded occurrence fixes its View selection to Chat: the strict
    // Session body is rendered with the Chat View request.
    expect(view.container.querySelector('[data-chat-view]')?.getAttribute('data-chat-view')).toBe('chat')
    await runtime.dispose()
  })

  it('pins an explicit Session reference through the injected SessionProvider', async () => {
    const mainSession = { ...sessionSnapshot(SID), blank: false }
    const pinnedSession = { ...sessionSnapshot(OTHER), blank: false }
    const runtime = await bench({
      declareMain: true, mainSession, pinnedSession,
    })
    const view = runtime.renderRoot()

    const content = view.container.querySelector<HTMLElement>('[data-conversation-content]')
    expect(content).not.toBeNull()
    expect(content!.dataset.conversationSession).toBe(OTHER)
    await runtime.dispose()
  })

  it('renders the Hero without a Session target', async () => {
    const runtime = await bench({ declareMain: true })
    const view = runtime.renderRoot()

    expect(renderedState(view.container)).toEqual({ session: null, phase: 'hero', composer: true })
    await runtime.dispose()
  })

  it('renders nothing while the conversation.content Factory has no registration', async () => {
    const runtime = await bench({ declareMain: false })
    const view = runtime.renderRoot()

    expect(view.container.querySelector('[data-test-embedded-window]')).not.toBeNull()
    expect(view.container.querySelector('[data-conversation-content]')).toBeNull()
    expect(view.container.querySelector('[data-slot-error]')).toBeNull()
    expect(view.container.querySelector('[data-factory-error]')).toBeNull()
    await runtime.dispose()
  })

  it('renders nothing while the conversation.embedded Factory has no registration', async () => {
    const runtime = await bench({ declareMain: false, mountConversation: false })
    const view = runtime.renderRoot()

    expect(view.container.querySelector('[data-test-embedded-window]')).not.toBeNull()
    expect(view.container.querySelector('[data-conversation-content]')).toBeNull()
    expect(view.container.querySelector('[data-slot-error]')).toBeNull()
    expect(view.container.querySelector('[data-factory-error]')).toBeNull()
    await runtime.dispose()
  })
})

describe('Embedded Conversation public entries', () => {
  interface EquivalenceCase {
    readonly name: string
    readonly mainSession?: SessionSnapshot | undefined
    readonly mainSummaryBlank?: boolean | undefined
    readonly expected: ReturnType<typeof renderedState>
  }

  const EQUIVALENCE_CASES: readonly EquivalenceCase[] = [
    {
      name: 'active transcript',
      mainSession: { ...sessionSnapshot(SID), blank: false },
      mainSummaryBlank: false,
      expected: { session: SID, phase: 'active', composer: true },
    },
    {
      name: 'blank Hero',
      mainSession: { ...sessionSnapshot(SID), blank: true, awaitingFirstTurn: true },
      mainSummaryBlank: true,
      expected: { session: SID, phase: 'hero', composer: true },
    },
    {
      name: 'no Session',
      expected: { session: null, phase: 'hero', composer: true },
    },
  ]

  it.each(EQUIVALENCE_CASES)(
    'renders the $name state identically through the public Factory and the public Component',
    async ({ mainSession, mainSummaryBlank, expected }) => {
      const factoryRuntime = await bench({
        declareMain: true, mountConversation: true, mainSession, mainSummaryBlank, host: 'factory',
      })
      const factoryState = renderedState(factoryRuntime.renderRoot().container)
      await factoryRuntime.dispose()
      const componentRuntime = await bench({
        declareMain: true, mountConversation: true, mainSession, mainSummaryBlank, host: 'component',
      })
      const componentState = renderedState(componentRuntime.renderRoot().container)
      await componentRuntime.dispose()

      expect(factoryState).toEqual(expected)
      expect(componentState).toEqual(expected)
    },
    30_000,
  )
})
