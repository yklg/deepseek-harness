/** Launcher page: automation and Yunying status with quick entries into the workbench. */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { OverviewSnapshot, StatusSnapshot } from './source.ts'
import css from './WorkbenchPage.module.css'

/** Launcher data and actions supplied by the plugin. */
export interface WorkbenchPageInjected {
  /** Host status and Yunying overview sources. */
  readonly hooks: {
    readonly status: HostObservable<StatusSnapshot>
    readonly overview: HostObservable<OverviewSnapshot>
  }
  /** Re-read the Host status. */
  readonly refreshStatus: () => void
  /** Re-read the Yunying overview. */
  readonly refreshOverview: () => void
  /** Open the live-console tab in the selected conversation; false when none is selected. */
  readonly openLiveConsole: () => Promise<boolean>
  /** Open the browser tab in the selected conversation; false when none is selected. */
  readonly openBrowser: () => Promise<boolean>
}

/** Launcher props: the keyed main seat, injected stores, and localized copy. */
export type WorkbenchPageProps = PropsRuntime<'main'> & InjectFace<WorkbenchPageInjected> & PropsLocale<'ecomWorkbench'>

/**
 * Render the workbench launcher.
 * @param props - injected status stores, quick actions, and localized copy.
 * @returns the launcher page.
 */
export function WorkbenchPage(props: WorkbenchPageProps): ReactNode {
  const { useStatus, useOverview, refreshStatus, refreshOverview, openLiveConsole, openBrowser, t } = props
  const status = useStatus(snapshot => snapshot)
  const overview = useOverview(snapshot => snapshot)
  const [hint, setHint] = useState<string | undefined>(undefined)
  const runAction = (action: () => Promise<boolean>): void => {
    void action().then((opened) => { setHint(opened ? undefined : t('panel.quick.noSession')) })
  }
  const automation = status.status?.automation
  const automationState = status.phase === 'loading'
    ? t('console.state.loading')
    : status.phase === 'failed'
      ? t('panel.status.failed', { message: status.error ?? '' })
      : automation === undefined
        ? t('console.state.loading')
        : !automation.enabled
          ? t('panel.status.disabled')
          : !automation.available
            ? t('console.state.unavailable')
            : !automation.connected
              ? t('panel.status.disconnected')
              : t('panel.status.connected')
  const targetCount = automation === undefined
    ? undefined
    : automation.targets === null
      ? t('panel.status.targetsUnknown')
      : t('panel.status.targets', { count: automation.targets })
  const yunyingState = status.phase === 'loading'
    ? t('console.state.loading')
    : status.phase === 'failed'
      ? t('panel.status.failed', { message: status.error ?? '' })
      : status.status?.yunying.configured === true
        ? t('panel.status.yunyingConfigured')
        : t('panel.status.yunyingUnconfigured')
  const dashboard = overview.overview?.configured === true ? overview.overview.dashboard : null

  return (
    <div className={css.page}>
      <div className={css.content}>
        <header className={css.header}>
          <h1 className={css.heading}>{t('panel.heading')}</h1>
          <p className={css.description}>{t('panel.description')}</p>
        </header>

        <section className={css.card} aria-label={t('panel.status.heading')}>
          <h2 className={css.cardHeading}>{t('panel.status.heading')}</h2>
          <dl className={css.rows}>
            <div className={css.row}>
              <dt className={css.label}>{t('panel.status.automation')}</dt>
              <dd className={css.value}>
                {automationState}
                {targetCount === undefined ? null : <span className={css.secondary}>{targetCount}</span>}
              </dd>
            </div>
            <div className={css.row}>
              <dt className={css.label}>{t('panel.status.yunying')}</dt>
              <dd className={css.value}>{yunyingState}</dd>
            </div>
          </dl>
          <div className={css.actions}>
            <Button size="sm" variant="outline" onClick={refreshStatus}>{t('panel.quick.refresh')}</Button>
          </div>
        </section>

        <section className={css.card} aria-label={t('panel.yunying.heading')}>
          <h2 className={css.cardHeading}>{t('panel.yunying.heading')}</h2>
          {overview.phase === 'failed' ? (
            <p className={css.error}>{t('panel.yunying.failed', { message: overview.error ?? '' })}</p>
          ) : overview.phase !== 'ready' || overview.overview === undefined ? (
            <p className={css.muted}>{t('console.state.loading')}</p>
          ) : !overview.overview.configured ? (
            <p className={css.muted}>{t('panel.yunying.unconfigured')}</p>
          ) : dashboard === null ? (
            <p className={css.muted}>{t('panel.yunying.empty')}</p>
          ) : (
            <>
              <p className={css.meta}>{t('panel.yunying.date', { date: dashboard.date })}</p>
              {dashboard.metrics.length === 0
                ? <p className={css.muted}>{t('panel.yunying.empty')}</p>
                : (
                  <ul className={css.metrics}>
                    {dashboard.metrics.map(metric => (
                      <li key={metric.key} className={css.metric}>
                        <span className={css.metricLabel}>{metric.label}</span>
                        <span className={css.metricValue}>
                          {String(metric.value)}{metric.unit === undefined ? '' : ` ${metric.unit}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
            </>
          )}
          <div className={css.actions}>
            <Button size="sm" variant="outline" onClick={refreshOverview}>{t('panel.yunying.refresh')}</Button>
          </div>
        </section>

        <section className={css.card} aria-label={t('panel.quick.heading')}>
          <h2 className={css.cardHeading}>{t('panel.quick.heading')}</h2>
          <div className={css.actions}>
            <Button size="sm" onClick={() => { runAction(openLiveConsole) }}>{t('panel.quick.console')}</Button>
            <Button size="sm" variant="outline" onClick={() => { runAction(openBrowser) }}>{t('panel.quick.browser')}</Button>
            <Button size="sm" variant="ghost" onClick={refreshStatus}>{t('panel.quick.refresh')}</Button>
          </div>
          {hint === undefined ? null : <p className={css.hint} role="status">{hint}</p>}
        </section>
      </div>
    </div>
  )
}
