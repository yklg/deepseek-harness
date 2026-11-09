/** Product home page of the ecommerce workbench: platform hero, console, dashboard, and system strip. */
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Button, IconChevronRightOutlineRegular, IconPanelLeftOutlineRegular, IconSparkleRegular, Switch, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable, InjectFace, PropsLocale, PropsRuntime, TranslateNS,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ConsoleSnapshot } from './ConsoleController.ts'
import type { PlatformPreferences } from './platform-preferences.ts'
import { platformById, PLATFORMS } from './platforms.ts'
import type { PlatformId, PlatformLoginState } from './platforms.ts'
import type { OverviewSnapshot, StatusSnapshot } from './source.ts'
import css from './WorkbenchPage.module.css'

/** Element id binding the platform section to its heading. */
const PLATFORM_HEADING_ID = 'ecom-workbench-platform-heading'

/** Element id binding the live-console card to its heading. */
const CONSOLE_HEADING_ID = 'ecom-workbench-console-heading'

/** Element id binding the dashboard card to its heading. */
const DASHBOARD_HEADING_ID = 'ecom-workbench-dashboard-heading'

/** Launcher data and actions supplied by the plugin. */
export interface WorkbenchPageInjected {
  /** Host status, Yunying overview, console, platform-preference, and sidebar sources. */
  readonly hooks: {
    readonly status: HostObservable<StatusSnapshot>
    readonly overview: HostObservable<OverviewSnapshot>
    readonly console: HostObservable<ConsoleSnapshot>
    readonly platformPreferences: HostObservable<PlatformPreferences>
    readonly sidebar: HostObservable<SidebarInfo>
  }
  /** Whether this deployment can host a persistent platform console guest. */
  readonly platformsAvailable: boolean
  /** @param platformId - platform whose console should open. */
  readonly openPlatform: (platformId: PlatformId) => void
  /** @param autoEnter - persisted startup auto-enter choice. */
  readonly setAutoEnter: (autoEnter: boolean) => void
  /** Switch the main panel to the AI conversation. */
  readonly toggleAssistant: () => void
  /** Toggle the harness navigation sidebar. */
  readonly toggleNavigation: () => void
  /** Re-read the Host status. */
  readonly refreshStatus: () => void
  /** Re-read the Yunying overview. */
  readonly refreshOverview: () => void
  /** Open the live-console tab in the selected conversation; false when none is selected. */
  readonly openLiveConsole: () => Promise<boolean>
  /** Open the browser tab in the selected conversation; false when none is selected. */
  readonly openBrowser: () => Promise<boolean>
}

/** Product home props: the keyed main seat, injected stores, and localized copy. */
export type WorkbenchPageProps = PropsRuntime<'main'> & InjectFace<WorkbenchPageInjected> & PropsLocale<'ecomWorkbench'>

/** Localized login-state badge label plus the palette that matches it. */
interface LoginBadge {
  readonly label: string
  readonly tone: TagTone
}

/** Localized status readout plus the dot palette that matches it. */
interface StatusReadout {
  readonly label: string
  readonly tone: 'idle' | 'success' | 'warning' | 'danger'
}

/**
 * @param state - login state decided by the active platform's latest probe.
 * @param checking - whether a probe is in flight.
 * @param t - translate seat of this plugin's dictionary.
 * @returns the localized badge copy for the active platform.
 */
function loginBadge(state: PlatformLoginState, checking: boolean, t: TranslateNS<'ecomWorkbench'>): LoginBadge {
  if (state === 'in') return { label: t('platform.loginState.in'), tone: 'success' }
  if (state === 'out') return { label: t('platform.loginState.out'), tone: 'warning' }
  return { label: checking ? t('platform.loginState.checking') : t('platform.loginState.unknown'), tone: 'quiet' }
}

/**
 * @param console - snapshot of the persistent platform console.
 * @param t - translate seat of this plugin's dictionary.
 * @returns the console phase badge, or null while no console is open or starting.
 */
function consoleBadge(console: ConsoleSnapshot, t: TranslateNS<'ecomWorkbench'>): LoginBadge | null {
  if (console.phase === 'starting') return { label: t('platform.console.opening'), tone: 'info' }
  if (console.phase === 'ready' && console.platformId !== null) {
    return { label: t('platform.console.running'), tone: 'success' }
  }
  return null
}

/**
 * @param active - whether the card names the platform whose console is alive.
 * @param state - login state probed for the active platform.
 * @param t - translate seat of this plugin's dictionary.
 * @returns the localized call-to-action for the platform card.
 */
function tileAction(active: boolean, state: PlatformLoginState, t: TranslateNS<'ecomWorkbench'>): string {
  if (!active) return t('platform.open')
  if (state === 'in') return t('platform.enterConsole')
  if (state === 'out') return t('platform.continueLogin')
  return t('platform.open')
}

/**
 * @param title - localized platform title.
 * @returns the single character shown inside the platform brand mark.
 */
function brandLetter(title: string): string {
  return title.trim().slice(0, 1)
}

/**
 * @param status - Host service status snapshot.
 * @param t - translate seat of this plugin's dictionary.
 * @returns the localized browser-automation state and its dot palette.
 */
function automationReadout(status: StatusSnapshot, t: TranslateNS<'ecomWorkbench'>): StatusReadout {
  if (status.phase === 'loading') return { label: t('console.state.loading'), tone: 'idle' }
  if (status.phase === 'failed') {
    return { label: t('panel.status.failed', { message: status.error ?? '' }), tone: 'danger' }
  }
  const automation = status.status?.automation
  if (automation === undefined) return { label: t('console.state.loading'), tone: 'idle' }
  if (!automation.enabled) return { label: t('panel.status.disabled'), tone: 'warning' }
  if (!automation.available) return { label: t('console.state.unavailable'), tone: 'warning' }
  if (!automation.connected) return { label: t('panel.status.disconnected'), tone: 'warning' }
  return { label: t('panel.status.connected'), tone: 'success' }
}

/**
 * @param status - Host service status snapshot.
 * @param t - translate seat of this plugin's dictionary.
 * @returns the localized Yunying state and its dot palette.
 */
function yunyingReadout(status: StatusSnapshot, t: TranslateNS<'ecomWorkbench'>): StatusReadout {
  if (status.phase === 'loading') return { label: t('console.state.loading'), tone: 'idle' }
  if (status.phase === 'failed') {
    return { label: t('panel.status.failed', { message: status.error ?? '' }), tone: 'danger' }
  }
  if (status.status?.yunying.configured === true) {
    return { label: t('panel.status.yunyingConfigured'), tone: 'success' }
  }
  return { label: t('panel.status.yunyingUnconfigured'), tone: 'idle' }
}

/**
 * @returns the bag glyph marking the product home in the top bar.
 */
function ProductMark(): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 5.4h10l-.8 8.1H3.8L3 5.4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M5.6 5.4V4a2.4 2.4 0 0 1 4.8 0v1.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Render the product home page.
 * @param props - injected stores, platform actions, navigation actions, and localized copy.
 * @returns the workbench home page.
 */
export function WorkbenchPage(props: WorkbenchPageProps): ReactNode {
  const {
    useStatus, useOverview, useConsole, usePlatformPreferences, useSidebar, platformsAvailable, openPlatform,
    setAutoEnter, toggleAssistant, toggleNavigation, refreshStatus, refreshOverview, openLiveConsole, openBrowser, t,
  } = props
  const status = useStatus(snapshot => snapshot)
  const overview = useOverview(snapshot => snapshot)
  const consoleState = useConsole(snapshot => snapshot)
  const preferences = usePlatformPreferences(snapshot => snapshot)
  const sidebar = useSidebar(snapshot => snapshot)
  const [hint, setHint] = useState<string | undefined>(undefined)
  const activePlatform = platformById(consoleState.platformId ?? undefined)
  const activeLogin = loginBadge(consoleState.loginState, consoleState.checking, t)
  const consoleStatus = consoleBadge(consoleState, t)
  const automation = automationReadout(status, t)
  const yunying = yunyingReadout(status, t)
  const targets = status.status?.automation
  const targetCount = targets === undefined
    ? null
    : targets.targets === null
      ? t('panel.status.targetsUnknown')
      : t('panel.status.targets', { count: targets.targets })
  const dashboard = overview.overview?.configured === true ? overview.overview.dashboard : null
  const navigationLabel = sidebar.collapsed ? t('platform.nav.open') : t('platform.nav.close')
  const runAction = (action: () => Promise<boolean>): void => {
    void action().then((opened) => { setHint(opened ? undefined : t('panel.quick.noSession')) })
  }

  return (
    <div className={css.page}>
      <header className={css.productBar}>
        <div className={css.productBrand}>
          <span className={css.productLogo} aria-hidden="true"><ProductMark /></span>
          <span className={css.productName}>{t('panel.title')}</span>
        </div>
        <div className={css.productActions}>
          <Button size="sm" variant="ghost" icon={<IconSparkleRegular />} onClick={toggleAssistant}>
            {t('platform.aiAssistant')}
          </Button>
          <Button size="sm" variant="ghost" icon={<IconPanelLeftOutlineRegular />} onClick={toggleNavigation}>
            {navigationLabel}
          </Button>
        </div>
      </header>

      <div className={css.body}>
        <div className={css.content}>
          <div className={css.hero}>
            <div className={css.heroText}>
              <h1 className={css.heroTitle}>{t('platform.hero.title')}</h1>
              <p className={css.heroDescription}>{t('platform.hero.description')}</p>
            </div>
            {activePlatform === undefined && consoleStatus === null ? null : (
              <div className={css.heroMeta}>
                {activePlatform === undefined ? null : (
                  <Tag tone={activeLogin.tone}>
                    <span>{t(activePlatform.titleKey)}</span>
                    <span className={css.tagDot} aria-hidden="true" />
                    {activeLogin.label}
                  </Tag>
                )}
                {consoleStatus === null ? null : <Tag tone={consoleStatus.tone}>{consoleStatus.label}</Tag>}
              </div>
            )}
          </div>

          <section className={css.platformSection} aria-labelledby={PLATFORM_HEADING_ID}>
            <h2 id={PLATFORM_HEADING_ID} className={css.visuallyHidden}>{t('platform.heading')}</h2>
            <div className={css.tiles}>
              {PLATFORMS.map((platform) => {
                const active = consoleState.platformId === platform.id
                const badge = active ? activeLogin : undefined
                return (
                  <button
                    key={platform.id}
                    type="button"
                    className={css.tile}
                    data-active={active ? 'true' : 'false'}
                    disabled={!platformsAvailable}
                    onClick={() => { openPlatform(platform.id) }}
                  >
                    <span className={css.tileHead}>
                      <span className={css.tileLogo} data-platform={platform.id} aria-hidden="true">
                        {brandLetter(t(platform.titleKey))}
                      </span>
                      <span className={css.tileName}>{t(platform.titleKey)}</span>
                      {badge === undefined ? null : <Tag tone={badge.tone} className={css.tileBadge}>{badge.label}</Tag>}
                    </span>
                    <span className={css.tileDescription}>{t(platform.descriptionKey)}</span>
                    <span className={css.tileAction}>
                      {tileAction(active, consoleState.loginState, t)}
                      <IconChevronRightOutlineRegular size={13} />
                    </span>
                  </button>
                )
              })}
            </div>
            <button type="button" className={css.groupBuy} disabled>
              <span className={css.groupBuyTitle}>{t('platform.groupBuy.title')}</span>
              <Tag tone="neutral">{t('platform.groupBuy.soon')}</Tag>
              <span className={css.groupBuyDescription}>{t('platform.groupBuy.description')}</span>
            </button>
            {platformsAvailable ? null : <p className={css.desktopOnly} role="status">{t('platform.desktopOnly')}</p>}
            <div className={css.autoEnter}>
              <div className={css.autoEnterText}>
                <span className={css.autoEnterTitle}>{t('platform.autoEnter')}</span>
                <span className={css.muted}>{t('platform.autoEnterHint')}</span>
              </div>
              <Switch
                className={css.autoEnterSwitch}
                checked={preferences.autoEnter}
                label={t('platform.autoEnter')}
                onChange={setAutoEnter}
              />
            </div>
          </section>

          <div className={css.businessGrid}>
            <section className={css.card} aria-labelledby={CONSOLE_HEADING_ID}>
              <div className={css.cardHead}>
                <h2 id={CONSOLE_HEADING_ID} className={css.cardHeading}>{t('platform.console.card')}</h2>
                {consoleStatus === null ? null : <Tag tone={consoleStatus.tone}>{consoleStatus.label}</Tag>}
              </div>
              {activePlatform === undefined ? (
                <p className={css.muted}>{t('platform.description')}</p>
              ) : (
                <>
                  <div className={css.consoleRow}>
                    <span className={css.consoleLogo} data-platform={activePlatform.id} aria-hidden="true">
                      {brandLetter(t(activePlatform.titleKey))}
                    </span>
                    <div className={css.consoleInfo}>
                      <span className={css.consoleName}>{t(activePlatform.titleKey)}</span>
                      <Tag tone={activeLogin.tone}>{activeLogin.label}</Tag>
                    </div>
                    <Button
                      className={css.consoleAction}
                      size="sm"
                      variant="outline"
                      onClick={() => { openPlatform(activePlatform.id) }}
                    >
                      {tileAction(true, consoleState.loginState, t)}
                    </Button>
                  </div>
                  {consoleState.phase === 'failed' ? (
                    <p className={css.error}>{t('platform.console.failed', { message: consoleState.error ?? '' })}</p>
                  ) : null}
                </>
              )}
            </section>

            <section className={css.card} aria-labelledby={DASHBOARD_HEADING_ID}>
              <div className={css.cardHead}>
                <h2 id={DASHBOARD_HEADING_ID} className={css.cardHeading}>{t('panel.yunying.heading')}</h2>
                <Button size="sm" variant="outline" onClick={refreshOverview}>{t('panel.yunying.refresh')}</Button>
              </div>
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
            </section>
          </div>

          <footer className={css.systemStrip}>
            <div className={css.systemStatus}>
              <span className={css.statusDot} data-tone={automation.tone} aria-hidden="true" />
              <span className={css.systemLabel}>{t('panel.status.automation')}</span>
              <span>{automation.label}</span>
              {targetCount === null ? null : <span className={css.systemSecondary}>{targetCount}</span>}
              <span className={css.systemSep} aria-hidden="true" />
              <span className={css.statusDot} data-tone={yunying.tone} aria-hidden="true" />
              <span className={css.systemLabel}>{t('panel.status.yunying')}</span>
              <span>{yunying.label}</span>
            </div>
            <div className={css.systemActions}>
              <Button size="sm" variant="ghost" onClick={refreshStatus}>{t('panel.quick.refresh')}</Button>
              <Button size="sm" variant="ghost" onClick={() => { runAction(openBrowser) }}>{t('panel.quick.browser')}</Button>
              <Button size="sm" variant="ghost" onClick={() => { runAction(openLiveConsole) }}>{t('panel.quick.console')}</Button>
            </div>
            {hint === undefined ? null : <p className={css.hint} role="status">{hint}</p>}
          </footer>
        </div>
      </div>
    </div>
  )
}
