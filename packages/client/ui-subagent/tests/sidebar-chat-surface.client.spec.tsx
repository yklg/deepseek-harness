// @vitest-environment jsdom
/** Sidebar chat body renders ui-conversation's shared embedded Conversation Factory. */
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ISession } from '@deepseek-ai/dsh-api-session-controller/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { SlotTestRuntime, stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { apply as applyConversation, inject as conversationInject } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { ConversationSlotPanel } from '../src/client/sidebar-chat/index.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Test-only Session-scoped body occupying the Sidebar chat panel position. */
    'test.sidebarChatBody': { kind: 'single'; scope: 'session' }
  }
}

const CHILD = 'child#1' as SessionId

const fonts = Object.getOwnPropertyDescriptor(document, 'fonts')

/** Shadow registration that records the View identity the embedded occurrence requests. */
function ChatViewProbe({ view }: { readonly view?: string | undefined }) {
  return <i data-chat-view={view ?? 'absent'} />
}

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(document, 'fonts', { configurable: true, value: new EventTarget() })
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  Range.prototype.getBoundingClientRect = () => ({
    top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}),
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  if (fonts === undefined) Reflect.deleteProperty(document, 'fonts')
  else Object.defineProperty(document, 'fonts', fonts)
})

function emptyContextMenu(): () => { readonly getTriggerProps: () => object } {
  return () => ({ getTriggerProps: () => ({}) })
}

/**
 * Assemble the Sidebar chat body over the real Conversation plugin.
 * @param options - whether the Conversation plugin (and its Factory) is mounted.
 * @returns the assembled runtime and the retained child Session reference.
 */
async function bench(options: { readonly conversation: boolean }) {
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
  // The Context-menu plugin supplies this root prop in the shipped composition;
  // the Conversation session view calls it for its menu triggers.
  runtime.slots.provideRoot({ props: { useContextMenu: emptyContextMenu() } })
  await runtime.sessions.add({
    id: CHILD,
    summary: { title: 'Child', displayTitle: 'Child', cwd: '/proj' },
    session: {
      loadOlder: vi.fn<ISession['loadOlder']>(() => Promise.resolve()),
      prompt: vi.fn<ISession['prompt']>(async () => ({ ok: true as const, value: { accepted: true as const } })),
    },
  })
  const reference = runtime.sessions.retain(CHILD, { source: 'sidebarChat' })
  await runtime.declare({
    'main': { kind: 'keyed', scope: 'root' },
    'test.sidebarChatBody': { kind: 'single', scope: 'session' },
  })
  if (options.conversation) {
    await runtime.mount({ inject: [...conversationInject], apply: applyConversation })
  }
  runtime.slots.register({ name: 'test.sidebarChatBody' }, ConversationSlotPanel)
  if (options.conversation) {
    runtime.slots.register({ name: 'conversation.session', priority: -1 }, ChatViewProbe)
  }
  return { runtime, reference }
}

describe('Sidebar chat body over the shared Conversation surface', () => {
  it('renders the shared embedded Conversation for the child Session with the Chat View fixed', async () => {
    const { runtime, reference } = await bench({ conversation: true })
    const view = runtime.renderSlot('test.sidebarChatBody', {}, { session: reference })
    expect(runtime.factoryOf('conversation.embedded').name).toBe('conversation.embedded')

    const content = view.container.querySelector<HTMLElement>('[data-conversation-content]')
    expect(content).not.toBeNull()
    expect(content!.dataset.conversationSession).toBe(CHILD)
    expect(view.container.querySelector('[data-chat-view]')?.getAttribute('data-chat-view')).toBe('chat')
    expect(view.container.querySelector('[data-composer-input]')).not.toBeNull()
    await runtime.dispose()
  })

  it('renders nothing while the shared Factory is unregistered', async () => {
    const { runtime, reference } = await bench({ conversation: false })
    const view = runtime.renderSlot('test.sidebarChatBody', {}, { session: reference })

    expect(view.container.querySelector('[data-conversation-content]')).toBeNull()
    expect(view.container.querySelector('[data-slot-error]')).toBeNull()
    expect(view.container.querySelector('[data-factory-error]')).toBeNull()
    await runtime.dispose()
  })
})
