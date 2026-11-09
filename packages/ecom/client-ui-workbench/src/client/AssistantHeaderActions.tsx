/** Product actions injected into the Conversation header: toggle the AI window and jump to the console. */
import type { ReactNode } from 'react'
import { Button, IconSparkleRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable, InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { ConsoleSnapshot } from './ConsoleController.ts'
import css from './AssistantWindow.module.css'

/** Actions and the console source the Conversation header action seat receives. */
export interface AssistantHeaderActionsInjected {
  /** Platform console snapshot used to decide whether the jump action is available. */
  readonly hooks: { readonly console: HostObservable<ConsoleSnapshot> }
  /** Toggle the floating assistant window. */
  readonly toggleAssistant: () => void
  /** Close the floating window and focus the live console. */
  readonly jumpConsole: () => void
}

/** Full props of the Conversation header action entries. */
export type AssistantHeaderActionsProps =
  & PropsRuntime<'conversation.header.leading'>
  & InjectFace<AssistantHeaderActionsInjected>
  & PropsLocale<'ecomWorkbench'>

/**
 * Render the two product header actions.
 * @param props - console source, actions, and localized copy.
 * @returns the AI-window toggle and the console jump, the latter only with a selected platform.
 */
export function AssistantHeaderActions(props: AssistantHeaderActionsProps): ReactNode {
  const { useConsole, toggleAssistant, jumpConsole, t } = props
  const consoleState = useConsole(snapshot => snapshot)
  return (
    <div className={css.headerActions}>
      <Button size="sm" variant="ghost" icon={<IconSparkleRegular />} onClick={toggleAssistant}>
        {t('platform.aiAssistant')}
      </Button>
      {consoleState.platformId === null ? null : (
        <Button size="sm" variant="ghost" onClick={jumpConsole}>{t('platform.console.jump')}</Button>
      )}
    </div>
  )
}
