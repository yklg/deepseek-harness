/** Placeholder launcher page occupying the workbench main-panel key. */
import type { ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import css from './WorkbenchPage.module.css'

/** Launcher page props: the framework's root-scope seats and this package's localized copy. */
export type WorkbenchPageProps = PropsRuntime<'main'> & PropsLocale<'ecomWorkbench'>

/**
 * Render the workbench launcher placeholder.
 * @param props - framework root-scope seats and localized copy.
 * @returns the launcher page.
 */
export function WorkbenchPage({ t }: WorkbenchPageProps): ReactNode {
  return (
    <div className={css.page}>
      <section className={css.intro}>
        <h1 className={css.heading}>{t('panel.heading')}</h1>
        <p className={css.description}>{t('panel.description')}</p>
      </section>
    </div>
  )
}
