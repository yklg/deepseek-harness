/** AI-sidebar body and chip title for the `ai-sidebar` right-Sidebar tab type. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { buildDraftPrompt, type AiContextSnapshot, type DraftKind } from './ai-context.ts'
import type { EcomWorkbenchLocaleKey } from './locales.ts'
import type { PlatformId } from './platforms.ts'
import css from './AiSidebarTab.module.css'

/**
 * Console fields the AI sidebar reads from the shared console snapshot. The
 * snapshot carries more state; this structural subset keeps the tab independent
 * of the controller's full shape, and both fields are absent while no guest is
 * attached.
 */
export interface AiConsoleSnapshot {
  /** Platform whose console surface is alive, or null before the first open. */
  readonly platformId?: PlatformId | null
  /** Renderer-side guest identity of the active surface, before it attaches. */
  readonly targetId?: number | undefined
}

/** AI-sidebar data and actions supplied by the plugin. */
export interface AiSidebarInjected {
  /** Console state used to hint that a platform page must be open first. */
  readonly hooks: { readonly console: HostObservable<AiConsoleSnapshot> }
  /** Read the active console guest and redact its visible text. */
  readonly readContext: (signal?: AbortSignal) => Promise<AiContextSnapshot>
  /** Open the product's floating AI assistant. */
  readonly openAssistant: () => void
}

/** AI-sidebar body props: the keyed tab's framework seats, injected sources, and localized copy. */
export type AiSidebarTabProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & InjectFace<AiSidebarInjected>
  & PropsLocale<'ecomWorkbench'>

/** Local phase of one page-context read. */
type ReadPhase = 'idle' | 'reading' | 'failed' | 'ready'

/** Outcome of the latest copy action. */
type CopyStatus = 'idle' | 'copied' | 'failed'

/** Draft kinds in display order, each with the locale key of its label. */
const DRAFT_KINDS: readonly { readonly kind: DraftKind; readonly label: EcomWorkbenchLocaleKey }[] = [
  { kind: 'product-script', label: 'aiSidebar.kind.script' },
  { kind: 'quick-replies', label: 'aiSidebar.kind.quick' },
  { kind: 'comment-reply', label: 'aiSidebar.kind.reply' },
]

/**
 * @param error - failure raised by an asynchronous browser or clipboard operation.
 * @returns its message, or the string form of a non-Error rejection.
 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Render the AI sidebar.
 * @param props - console source, read/assistant actions, and localized copy.
 * @returns the empty, loading, failed, or ready pane with the draft prompt.
 */
export function AiSidebarTab(props: AiSidebarTabProps): ReactNode {
  const { useConsole, readContext, openAssistant, t } = props
  const consoleState = useConsole(snapshot => snapshot)
  const inflight = useRef<AbortController | undefined>(undefined)
  const generation = useRef(0)
  const [phase, setPhase] = useState<ReadPhase>('idle')
  const [context, setContext] = useState<AiContextSnapshot | undefined>(undefined)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [kind, setKind] = useState<DraftKind>('product-script')
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  // A closed tab abandons its in-flight read; the generation guard keeps the
  // late rejection from publishing into an unmounted component.
  useEffect(() => () => {
    generation.current += 1
    inflight.current?.abort()
  }, [])
  const read = async (): Promise<void> => {
    inflight.current?.abort()
    const controller = new AbortController()
    inflight.current = controller
    const ordinal = ++generation.current
    setPhase('reading')
    setFailure(undefined)
    setCopyStatus('idle')
    try {
      const next = await readContext(controller.signal)
      if (ordinal !== generation.current) return
      setContext(next)
      setPhase('ready')
    } catch (error) {
      if (ordinal !== generation.current) return
      setFailure(messageOf(error))
      setPhase('failed')
    } finally {
      if (inflight.current === controller) inflight.current = undefined
    }
  }
  const copy = async (): Promise<void> => {
    if (context === undefined) return
    setCopyStatus('idle')
    try {
      const accepted = await writeClipboard(buildDraftPrompt(kind, context, t))
      setCopyStatus(accepted ? 'copied' : 'failed')
    } catch (error) {
      // The shared helper reports a refusal as false; a thrown write is the same failed outcome.
      void error
      setCopyStatus('failed')
    }
  }
  const selectKind = (next: DraftKind): void => {
    setKind(next)
    setCopyStatus('idle')
  }
  const prompt = context === undefined ? undefined : buildDraftPrompt(kind, context, t)
  const readLabel = context === undefined ? t('aiSidebar.read') : t('aiSidebar.reread')
  const noPlatform = consoleState.platformId === null || consoleState.platformId === undefined

  return (
    <div className={css.pane}>
      <header className={css.header}>
        <h2 className={css.heading}>{t('aiSidebar.title')}</h2>
      </header>
      <p className={css.description}>{t('aiSidebar.description')}</p>
      <div className={css.actions}>
        <Button size="sm" variant="outline" disabled={phase === 'reading'} onClick={() => { void read() }}>
          {readLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={openAssistant}>{t('aiSidebar.openAssistant')}</Button>
      </div>
      {noPlatform ? <p className={css.hint}>{t('aiSidebar.needConsole')}</p> : null}
      {phase === 'idle' ? <p className={css.hint}>{t('aiSidebar.empty')}</p> : null}
      {phase === 'reading' ? <p className={css.hint} role="status">{t('aiSidebar.reading')}</p> : null}
      {phase === 'failed' && failure !== undefined
        ? <p className={css.error} role="alert">{t('aiSidebar.failed', { message: failure })}</p>
        : null}
      {phase === 'ready' && context !== undefined ? (
        <>
          <section className={css.section} aria-label={t('aiSidebar.context')}>
            <h3 className={css.sectionHeading}>{t('aiSidebar.context')}</h3>
            <p className={css.sourceTitle}>{context.title}</p>
            <p className={css.sourceUrl}>{context.url}</p>
            <p className={css.count}>{t('aiSidebar.redacted', { count: context.redacted.counts.total })}</p>
            <pre className={css.preview}>{context.redacted.text}</pre>
          </section>
          <div className={css.kinds} role="group" aria-label={t('aiSidebar.prompt')}>
            {DRAFT_KINDS.map(entry => (
              <Button
                key={entry.kind}
                size="sm"
                variant={entry.kind === kind ? 'primary' : 'ghost'}
                aria-pressed={entry.kind === kind}
                onClick={() => { selectKind(entry.kind) }}
              >
                {t(entry.label)}
              </Button>
            ))}
          </div>
          <section className={css.section} aria-label={t('aiSidebar.prompt')}>
            <h3 className={css.sectionHeading}>{t('aiSidebar.prompt')}</h3>
            <pre className={`${css.preview} ${css.promptPreview}`}>{prompt}</pre>
            <div className={css.actions}>
              <Button size="sm" variant="outline" onClick={() => { void copy() }}>
                {copyStatus === 'copied' ? t('aiSidebar.copied') : t('aiSidebar.copy')}
              </Button>
            </div>
            {copyStatus === 'failed' ? <p className={css.error} role="alert">{t('aiSidebar.copyFailed')}</p> : null}
            <p className={css.hint}>{t('aiSidebar.hint')}</p>
          </section>
        </>
      ) : null}
    </div>
  )
}

/** Chip-title props: the same keyed tab seat without a body. */
export type AiSidebarTitleProps = PropsRuntime<'sidebar.right.pane.tab.title'> & PropsLocale<'ecomWorkbench'>

/**
 * Render the AI-sidebar chip title.
 * @param props - keyed title seat and localized copy.
 * @returns the localized tab title.
 */
export function AiSidebarTitle({ t }: AiSidebarTitleProps): ReactNode {
  return t('aiSidebar.title')
}
