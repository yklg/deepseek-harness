/** Placeholder live-console body and chip title for the `live-console` right-Sidebar tab type. */
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import css from './LiveConsoleTab.module.css'

/** Live-console body props: the keyed tab's framework seats and this package's localized copy. */
export type LiveConsoleTabProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'ecomWorkbench'>

/**
 * Render the live-console placeholder body.
 * @param props - keyed tab framework seats and localized copy.
 * @returns the console placeholder.
 */
export function LiveConsoleTab({ t }: LiveConsoleTabProps): ReactNode {
  return (
    <div className={css.pane}>
      <h2 className={css.heading}>{t('console.title')}</h2>
      <p className={css.hint}>{t('console.description')}</p>
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
