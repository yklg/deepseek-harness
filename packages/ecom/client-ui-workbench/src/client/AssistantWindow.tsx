/** Floating product AI window rendered into the shell overlay seat over any page. */
import type { ReactNode } from 'react'
import { Button, IconSparkleRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable, InjectFace, PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the public `conversation.embedded` Factory declaration.
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { AssistantWindowSnapshot } from './assistant-state.ts'
import type { WindowRect } from './float-window.ts'
import type { AssistantResizeHandle } from './use-float-window.ts'
import { useFloatWindow } from './use-float-window.ts'
import type { ConsoleSnapshot } from './ConsoleController.ts'
import css from './AssistantWindow.module.css'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Session-maybe Conversation body owned by the floating assistant window. */
    'ecom.assistant.conversation': { kind: 'single'; scope: 'session-maybe' }
  }
}

/** Handles rendered around the floating window, in visual order. */
const HANDLES: readonly AssistantResizeHandle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

/** Actions and sources the product shell supplies to the floating window. */
export interface AssistantWindowInjected {
  /** Assistant window state and the platform console snapshot. */
  readonly hooks: {
    readonly assistant: HostObservable<AssistantWindowSnapshot>
    readonly console: HostObservable<ConsoleSnapshot>
  }
  /** Close the window, keeping its rectangle. */
  readonly close: () => void
  /** Commit a moved or resized rectangle. */
  readonly moveTo: (rect: WindowRect) => void
  /** Close the window and focus the live console, or nothing while no platform is selected. */
  readonly jumpConsole: () => void
}

/** Full props of the shell-overlay occupant. */
export type AssistantWindowProps =
  & PropsRuntime<'shell.overlay'>
  & PropsRenderSlots<'ecom.assistant.conversation'>
  & InjectFace<AssistantWindowInjected>
  & PropsLocale<'ecomWorkbench'>

/**
 * Render the assistant floating window above the current page.
 * @param props - assistant/console sources, actions, Factory seat, and localized copy.
 * @returns the floating window, or nothing while it is closed.
 */
export function AssistantWindow(props: AssistantWindowProps): ReactNode {
  const { useAssistant, useConsole, close, moveTo, jumpConsole, renderSlot, t } = props
  const assistant = useAssistant(snapshot => snapshot)
  const consoleState = useConsole(snapshot => snapshot)
  const windowState = useFloatWindow({
    rect: assistant.rect,
    moveTo,
    viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
  })
  if (!assistant.open) return null
  return (
    <section
      className={`${css.host}${windowState.dragging ? ` ${css.dragging}` : ''}`}
      aria-label={t('platform.aiAssistant')}
      style={{ left: windowState.rect.x, top: windowState.rect.y, width: windowState.rect.width, height: windowState.rect.height }}
    >
      <header className={css.bar} data-assistant-window-drag onPointerDown={(event) => { windowState.onMoveStart(event) }}>
        <IconSparkleRegular />
        <span className={css.title}>{t('platform.aiAssistant')}</span>
        <div className={css.actions}>
          {consoleState.platformId === null ? null : (
            <Button className={css.jump} size="sm" variant="ghost" onClick={jumpConsole}>{t('platform.console.jump')}</Button>
          )}
          <button type="button" className={css.close} aria-label={t('platform.assistant.close')} onClick={close}>✕</button>
        </div>
      </header>
      <div className={css.body}>
        {renderSlot('ecom.assistant.conversation', {}, {
          fallback: <div className={css.fallback} role="status">{t('platform.assistant.fallback')}</div>,
        })}
      </div>
      {HANDLES.map(handle => (
        <span
          key={handle}
          className={css.handle}
          data-handle={handle}
          aria-hidden="true"
          onPointerDown={(event) => { windowState.onResizeStart(event, handle) }}
        />
      ))}
    </section>
  )
}

/** Props supplied to the assistant window's Session-maybe Conversation body. */
export type AssistantConversationSurfaceProps =
  & PropsRuntime<'ecom.assistant.conversation'>
  & PropsRenderFactories

/**
 * Render the shared embedded Conversation inside the assistant window.
 * @param props - the Session-maybe slot kit and Factory render seat.
 * @returns the public `conversation.embedded` Factory occurrence, or nothing
 * while ui-conversation's Factory is not registered.
 */
export function AssistantConversationSurface(props: AssistantConversationSurfaceProps): ReactNode {
  return <>{props.renderFactorySlot('conversation.embedded', {})}</>
}
