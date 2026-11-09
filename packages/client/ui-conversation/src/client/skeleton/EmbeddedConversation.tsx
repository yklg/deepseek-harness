/** Reusable embedded Conversation surface for a secondary display area. */
import type { ReactNode } from 'react'
import type { PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationViewsProps } from '../contract/slots.ts'
import { conversationPhase } from '../contract/snapshot.ts'

/**
 * Fixed Chat selection for the embedded occurrence's `views` local position.
 * The main occurrence keeps its own width controls and View tabs; an embedded
 * occurrence always renders the Chat View.
 * @param props - the Factory local-slot props bound to the embedded occurrence.
 * @returns the strict Session body fixed to the Chat View.
 */
function FixedChatConversationView(props: ConversationViewsProps): ReactNode {
  return <>{props.renderSlot('conversation.session', { view: 'chat' })}</>
}

const EMBEDDED_CONTENT_SLOTS = { views: FixedChatConversationView }

/**
 * Props of one embedded Conversation surface: the optional-Session standard
 * kit of a Conversation shell plus the Factory render seat.
 */
export type EmbeddedConversationProps = PropsRuntime<'main.conversation'> & PropsRenderFactories

/**
 * Render the shared Conversation body (transcript, Composer, and blank Hero)
 * as a reusable embedded surface.
 *
 * Prerequisites: this component must be registered as the entry of a
 * `session` or `session-maybe` Slot and rendered by the installed slot
 * renderer, which supplies the `useSession`, `useConversation`, `useSessions`,
 * and `renderFactorySlot` seats. The target Session comes from the surrounding
 * Session scope, never from a prop: a strict-session host must wrap the Slot
 * render in the injected `SessionProvider` with a retained `SessionReference`;
 * a root-scope overlay (for example a `shell.overlay` entry) declares a
 * `session-maybe` child Slot and may render it directly to inherit the current
 * main-view Session, or inside `SessionProvider` to target an explicit
 * reference. With no target Session the occurrence renders the blank Hero and
 * its Composer, but not a transcript.
 *
 * The plugin also registers this same implementation as the public
 * `conversation.embedded` Factory (scope `session-maybe`, no input props). A
 * host Slot component renders that Factory through its standard
 * `renderFactorySlot` seat; this Component form is for hosts that may import
 * this package's runtime values. Both entries share the phase decision and
 * render nothing while the `conversation.content` Factory is unregistered.
 * @param props - optional-Session standard sources and the factory render seat.
 * @returns the shared Conversation content occurrence, or nothing while the
 * `conversation.content` Factory has no registration.
 */
export function EmbeddedConversation({
  sessionId, useSession, useConversation, useSessions, renderFactorySlot,
}: EmbeddedConversationProps): ReactNode {
  const session = useSession(snapshot => snapshot)
  const conversation = useConversation(snapshot => snapshot)
  const shellPhase = session === undefined || conversation === undefined
    ? 'blank'
    : conversationPhase(session, conversation)
  const summaryBlank = useSessions(state => sessionId === undefined ? undefined : state.byId[sessionId]?.blank)
  // The same phase decision as the resident main shell: while a blank Session
  // is still replaying, settle on the hidden composer instead of flashing the
  // centered Hero; a list row that already proves the Session blank can land
  // directly on the Hero.
  const settling = sessionId !== undefined
    && shellPhase === 'blank'
    && session?.openState === 'loading'
    && summaryBlank !== true
  const hero = sessionId === undefined
    || (shellPhase === 'blank' && (session?.openState === 'open' || summaryBlank === true))
  const phase = settling ? 'settling' : hero ? 'hero' : 'active'
  return <>{renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero }, { slots: EMBEDDED_CONTENT_SLOTS })}</>
}
