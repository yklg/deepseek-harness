/** Live-console body and chip title for the `live-console` right-Sidebar tab type. */
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { WorkbenchEvent } from '@deepseek-ai/dsh-ecom-workbench-server/types'
import type { EventsSnapshot, StatusSnapshot } from './source.ts'
import css from './LiveConsoleTab.module.css'

/** Live-console data and actions supplied by the plugin. */
export interface LiveConsoleInjected {
  /** Host status and event-stream sources. */
  readonly hooks: {
    readonly status: HostObservable<StatusSnapshot>
    readonly events: HostObservable<EventsSnapshot>
  }
  /** Reopen the Host event stream. */
  readonly reconnect: () => void
  /** Re-read the Host status. */
  readonly refreshStatus: () => void
}

/** Live-console body props: the keyed tab's framework seats, injected stores, and localized copy. */
export type LiveConsoleTabProps = PropsRuntime<'sidebar.right.pane.tab'> & InjectFace<LiveConsoleInjected> & PropsLocale<'ecomWorkbench'>

type Translate = TranslateNS<'ecomWorkbench'>

/**
 * Describe one event in the console's vocabulary.
 * @param event - retained Host event.
 * @param t - localized copy.
 * @returns the row's primary text.
 */
function eventLabel(event: WorkbenchEvent, t: Translate): string {
  switch (event.type) {
    case 'run-started':
      return t('console.event.runStarted', { operation: event.operation })
    case 'run-finished':
      return event.ok
        ? t('console.event.runFinishedOk', { operation: event.operation })
        : t('console.event.runFinishedFailed', { operation: event.operation, code: event.code ?? 'unknown' })
    case 'target-closed':
      return event.reason === 'crashed' ? t('console.event.targetCrashed') : t('console.event.targetClosed')
    case 'channel':
      return event.connected ? t('console.state.connected') : t('console.state.disconnected')
    default:
      return assertNever(event, 'WorkbenchEvent')
  }
}

/**
 * Render the live console.
 * @param props - injected status and event stores, actions, and localized copy.
 * @returns the console body.
 */
export function LiveConsoleTab(props: LiveConsoleTabProps): ReactNode {
  const { useStatus, useEvents, reconnect, refreshStatus, t } = props
  const status = useStatus(snapshot => snapshot)
  const events = useEvents(snapshot => snapshot)
  const automation = status.status?.automation
  const state = automation?.enabled === false
    ? t('panel.status.disabled')
    : status.phase === 'loading'
      ? t('console.state.loading')
      : status.phase === 'failed'
        ? t('console.state.unavailable')
        : events.disconnected
          ? t('console.state.disconnected')
          : automation?.available === false
            ? t('console.state.unavailable')
            : automation?.connected === false
              ? t('console.state.disconnected')
              : t('console.state.connected')
  const rows = [...events.events].reverse()

  return (
    <div className={css.pane}>
      <header className={css.header}>
        <h2 className={css.heading}>{t('console.title')}</h2>
        <span className={css.state}>{state}</span>
      </header>
      <div className={css.actions}>
        <Button size="sm" variant="ghost" onClick={refreshStatus}>{t('panel.quick.refresh')}</Button>
        {events.disconnected ? <Button size="sm" variant="outline" onClick={reconnect}>{t('console.reconnect')}</Button> : null}
      </div>
      {events.disconnected
        ? <p className={css.error} role="alert">{t('console.error', { message: events.error ?? t('console.state.disconnected') })}</p>
        : null}
      {rows.length === 0
        ? <p className={css.hint}>{t('console.empty')}</p>
        : (
          <ol className={css.list} aria-live="polite">
            {rows.map((event, index) => (
              <li key={`${event.type}-${String(event.at)}-${String(index)}`} className={css.item}>
                <time className={css.time} dateTime={new Date(event.at).toISOString()}>{new Date(event.at).toLocaleTimeString()}</time>
                <span className={css.message}>{eventLabel(event, t)}</span>
                {'targetId' in event && typeof event.targetId === 'string'
                  ? <span className={css.target}>{t('console.target', { targetId: event.targetId })}</span>
                  : null}
              </li>
            ))}
          </ol>
        )}
    </div>
  )
}

/** Chip-title props: the same keyed tab seat without a body. */
export type LiveConsoleTitleProps = PropsRuntime<'sidebar.right.pane.tab.title'> & PropsLocale<'ecomWorkbench'>

/**
 * Render the live-console chip title.
 * @param props - keyed title seat and localized copy.
 * @returns the localized tab title.
 */
export function LiveConsoleTitle({ t }: LiveConsoleTitleProps): ReactNode {
  return t('console.title')
}
