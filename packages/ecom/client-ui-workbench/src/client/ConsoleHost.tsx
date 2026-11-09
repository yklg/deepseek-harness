/**
 * Persistent shell seat for the platform console: a top bar with navigation,
 * the active platform, its login state and controls, plus the webview viewport
 * the live surface mounts into. The seat stays mounted while another main panel
 * is selected; visibility is governed here, never by unmounting the guest.
 * The seat clears the harness sidebar track so the product console fills the
 * workspace to its right.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId, SidebarInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ConsoleSnapshot } from './ConsoleController.ts'
import { platformById } from './platforms.ts'
import css from './ConsoleHost.module.css'

/** Console runtime, navigation state, and shell actions injected into the persistent host. */
export interface ConsoleHostInjected {
  /** Console and navigation sources; bound as the `useConsole` and `useSidebar` selector hooks. */
  readonly hooks: {
    readonly console: HostObservable<ConsoleSnapshot>
    readonly sidebar: HostObservable<SidebarInfo>
  }
  /**
   * Mount the live surface into the seat element.
   * @param element - stable container that outlives surface replacements.
   * @returns the detach callback that leaves the surface alive.
   */
  readonly attach: (element: HTMLElement) => () => void
  /** Main panel key whose selection shows the console. */
  readonly panelId: MainPanelId
  /** Whether this deployment can host a persistent platform console. */
  readonly available: boolean
  /** Show the platform picker while keeping the current guest alive. */
  readonly showSelection: () => void
  /** Retry the failed console surface and read its login state again. */
  readonly retry: () => void
  /** Open or collapse the harness navigation column. */
  readonly toggleSidebar: () => void
  /** Re-read the active platform's login state after the window regains focus. */
  readonly refreshLogin: () => void
  /** Return an out-of-platform guest to the canonical sign-in entry. */
  readonly navigateToLogin: () => void
  /** Switch the main column to the AI assistant conversation. */
  readonly toggleAssistant: () => void
}

/** Shell console host props: the persistent seat runtime, injected actions, and localized copy. */
export type ConsoleHostProps =
  PropsRuntime<'shell.console'> & InjectFace<ConsoleHostInjected> & PropsLocale<'ecomWorkbench'>

/** One status line shown under the console top bar. */
interface ConsoleHint {
  /** Styling and assistive-technology role of the line. */
  readonly tone: 'info' | 'error'
  /** Localized copy, already interpolated. */
  readonly text: string
}

/**
 * @param snapshot - current console state.
 * @param t - translate function of the workbench namespace.
 * @returns copy for the current login state, including the in-flight check.
 */
function loginStateText(snapshot: ConsoleSnapshot, t: ConsoleHostProps['t']): string {
  if (snapshot.loginState === 'in') return t('platform.loginState.in')
  if (snapshot.loginState === 'out') return t('platform.loginState.out')
  return snapshot.checking ? t('platform.loginState.checking') : t('platform.loginState.unknown')
}

/**
 * Pick at most one status line so overlapping states do not stack.
 * @param snapshot - current console state.
 * @param available - whether this deployment can host a platform console.
 * @param t - translate function of the workbench namespace.
 * @returns the highest-priority line, or undefined when the console has nothing to report.
 */
function hintOf(snapshot: ConsoleSnapshot, available: boolean, t: ConsoleHostProps['t']): ConsoleHint | undefined {
  if (!available) return { tone: 'error', text: t('platform.desktopOnly') }
  if (snapshot.phase === 'starting') return { tone: 'info', text: t('platform.console.opening') }
  if (snapshot.phase === 'failed' && snapshot.error !== undefined) {
    return { tone: 'error', text: t('platform.console.failed', { message: snapshot.error }) }
  }
  if (snapshot.blockedLink === true) return { tone: 'info', text: t('platform.link.blocked') }
  if (snapshot.pageIssue === 'left-platform') return { tone: 'error', text: t('platform.page.outside') }
  if (snapshot.probeError !== undefined) {
    return { tone: 'error', text: t('platform.probe.failed', { message: snapshot.probeError }) }
  }
  if (snapshot.loginState === 'out') return { tone: 'info', text: t('platform.login.required') }
  return undefined
}

/**
 * Render the persistent console seat.
 * @param props - console runtime hooks, shell actions, and localized copy.
 * @returns the hidden-until-active host with its top bar and viewport.
 */
export function ConsoleHost(props: ConsoleHostProps): ReactNode {
  const {
    useConsole, usePanelInfo, useSidebar, attach, panelId, available, showSelection, retry, toggleSidebar,
    refreshLogin, navigateToLogin, toggleAssistant, t,
  } = props
  const snapshot = useConsole(state => state)
  const collapsed = useSidebar(info => info.collapsed)
  const active = usePanelInfo(info => info.activePanelId === panelId) && snapshot.view === 'console'
  const platform = snapshot.platformId === null ? undefined : platformById(snapshot.platformId)
  const viewport = useRef<HTMLDivElement | null>(null)
  const hint = snapshot.view === 'console' ? hintOf(snapshot, available, t) : undefined

  useEffect(() => {
    const element = viewport.current
    /* v8 ignore next -- the viewport is always rendered, so its ref is attached before this effect runs. */
    if (element === null) return undefined
    return attach(element)
  }, [attach])

  return (
    <div
      id="ecom-console-host"
      className={css.host}
      data-ecom-console-host
      data-ecom-console-active={active ? 'true' : 'false'}
    >
      {active && platform !== undefined ? (
        <header className={css.bar}>
          <Button size="sm" variant="ghost" onClick={toggleSidebar}>
            {collapsed ? t('platform.nav.open') : t('platform.nav.close')}
          </Button>
          <h1 className={css.title}>{t(platform.titleKey)}</h1>
          <span className={css.loginState} data-ecom-console-login-state={snapshot.loginState}>
            {loginStateText(snapshot, t)}
          </span>
          <div className={css.actions}>
            {snapshot.pageIssue === 'left-platform' ? (
              <Button size="sm" variant="outline" onClick={navigateToLogin}>{t('platform.login.open')}</Button>
            ) : null}
            {snapshot.loginState === 'in' || snapshot.pageIssue === 'left-platform' ? null : (
              <Button size="sm" variant="ghost" onClick={refreshLogin}>{t('platform.login.refresh')}</Button>
            )}
            <Button size="sm" variant="ghost" onClick={toggleAssistant}>{t('platform.aiAssistant')}</Button>
            <Button size="sm" variant="ghost" onClick={showSelection}>{t('platform.switch')}</Button>
            {snapshot.phase === 'failed' ? (
              <Button size="sm" variant="outline" onClick={retry}>{t('platform.retry')}</Button>
            ) : null}
          </div>
        </header>
      ) : null}
      {hint === undefined ? null : (
        <p
          className={hint.tone === 'error' ? css.error : css.hint}
          role={hint.tone === 'error' ? 'alert' : 'status'}
        >
          {hint.text}
        </p>
      )}
      <div className={css.viewport} ref={viewport} />
    </div>
  )
}
