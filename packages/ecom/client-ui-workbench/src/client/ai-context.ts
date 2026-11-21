/**
 * Read the visible text of the console's embedded page through the Host
 * automation broker and hand it to the AI sidebar already redacted. The reader
 * attaches the exact guest the console surface reports, evaluates one read-only
 * script, validates the returned JSON at the wire boundary, and always releases
 * the target. Draft prompts are then assembled from locale templates so the
 * UI's copy and the prompt instructions share one dictionary.
 *
 * @module @deepseek-ai/dsh-client-ui-workbench/src/client/ai-context
 */

import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import { redactPii, type PiiRedaction } from './pii.ts'
import type { PlatformAdapter } from './platforms.ts'

/** Guest text is clamped to the same 6000 characters the platform probe scripts collect. */
const MAX_CONTEXT_TEXT = 6000

/**
 * @returns the read-only guest script: one JSON page snapshot of address, title,
 * and the first 6000 characters of visible text.
 */
function readPageScript(): string {
  return `(() => JSON.stringify({
  url: location.href,
  title: document.title,
  text: (document.body?.innerText ?? '').slice(0, 6000),
}))()`
}

/** Read the visible page text in the guest. Read-only: it touches no page state. */
export const CONSOLE_TEXT_SCRIPT = readPageScript()

/** The workbench Remote methods one page-context read calls. */
export interface AiRemote {
  /**
   * Attach the console's embedded guest, or the one guest named by `targetId`.
   * @param request - origins the guest may keep and the renderer-side guest identity, when known.
   * @param signal - aborts the call when the sidebar closes or a newer read supersedes this one.
   * @returns the attached automation target.
   */
  attach(
    request: { allowOrigins: readonly string[]; targetId?: number },
    signal?: AbortSignal,
  ): Promise<RemoteResult<{ targetId: string; url: string }>>
  /**
   * Evaluate the read-only context script in an attached guest.
   * @param request - attached target and the script to run.
   * @param signal - aborts the call when the sidebar closes or a newer read supersedes this one.
   * @returns the wire-safe script result.
   */
  evaluate(
    request: { targetId: string; script: string },
    signal?: AbortSignal,
  ): Promise<RemoteResult<{ json: string }>>
  /**
   * Release an attached guest.
   * @param request - attached target to release.
   * @returns a successful result once the broker released the target.
   */
  detach(request: { targetId: string }): Promise<RemoteResult<null>>
}

/** Sources one page-context read resolves when it runs. */
export interface AiContextDeps {
  /** Workbench Remote methods from the client assembly. */
  readonly remote: AiRemote
  /** Active platform adapter, or undefined before a platform opens. */
  readonly platform: () => PlatformAdapter | undefined
  /** Renderer-side guest identity of the active console surface, while it has one. */
  readonly targetId: () => number | undefined
}

/** One read of the console page: the raw guest text and its redacted form. */
export interface AiContextSnapshot {
  /** Address the guest reported. */
  readonly url: string
  /** Document title the guest reported. */
  readonly title: string
  /** Visible page text as the guest reported it, before redaction. */
  readonly text: string
  /** Redacted text and the counts of each masked category. */
  readonly redacted: PiiRedaction
}

/** The three draft kinds the sidebar offers. */
export type DraftKind = 'product-script' | 'quick-replies' | 'comment-reply'

/**
 * @param value - parsed JSON value.
 * @returns whether the value is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Validate the JSON text the broker accepted from the context script.
 * @param json - JSON text encoded by {@link CONSOLE_TEXT_SCRIPT}.
 * @returns the page fields the prompt templates consume.
 * @throws Error when the text is not JSON or does not carry the three string fields.
 */
function parseContext(json: string): { url: string; title: string; text: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    // JSON.parse is the only statement in the try; any failure means the broker accepted non-JSON text.
    throw new Error('page context result is not JSON')
  }
  if (!isRecord(parsed)) throw new Error('page context result is not an object')
  const { url, title, text } = parsed
  if (typeof url !== 'string' || typeof title !== 'string' || typeof text !== 'string') {
    throw new Error('page context result must carry string url, title, and text')
  }
  return { url, title, text: text.slice(0, MAX_CONTEXT_TEXT) }
}

/**
 * @param result - one Remote call result.
 * @returns the value of a successful call.
 * @throws Error naming the Remote failure code and its diagnostic message.
 */
function unwrapRemote<T>(result: RemoteResult<T>): T {
  if (result.ok) return result.value
  throw new Error(`${result.error.code}: ${result.error.message}`)
}

/**
 * Build the read of the console's embedded page.
 * @param deps - workbench Remote methods and the active platform/guest getters.
 * @returns a reader that attaches, evaluates, validates, and always releases the guest.
 */
export function createAiContextReader(deps: AiContextDeps): (signal?: AbortSignal) => Promise<AiContextSnapshot> {
  return async (signal) => {
    const platform = deps.platform()
    if (platform === undefined) throw new Error('open a platform console before reading page context')
    const targetId = deps.targetId()
    if (targetId === undefined) throw new Error('the console page is not attached yet')
    const target = unwrapRemote(await deps.remote.attach({ allowOrigins: platform.origins, targetId }, signal))
    try {
      const result = unwrapRemote(await deps.remote.evaluate({ targetId: target.targetId, script: CONSOLE_TEXT_SCRIPT }, signal))
      const page = parseContext(result.json)
      return { ...page, redacted: redactPii(page.text) }
    } finally {
      // The guest lease is this read's, so release it on both the success and
      // failure paths; a release that fails must not replace the read outcome.
      try {
        await deps.remote.detach({ targetId: target.targetId })
      } catch {
        // Best effort: the broker still owns a guest that refused release.
      }
    }
  }
}

/**
 * Assemble the draft prompt for one kind from the localized template.
 * @param kind - which draft the user picked.
 * @param context - the read page; the template receives its redacted text, never the raw text.
 * @param t - localized copy of the `ecomWorkbench` namespace.
 * @returns the prompt the user copies or hands to the AI assistant.
 */
export function buildDraftPrompt(kind: DraftKind, context: AiContextSnapshot, t: TranslateNS<'ecomWorkbench'>): string {
  const params = { context: context.redacted.text, url: context.url, title: context.title }
  switch (kind) {
    case 'product-script':
      return t('aiSidebar.prompt.script', params)
    case 'quick-replies':
      return t('aiSidebar.prompt.quick', params)
    case 'comment-reply':
      return t('aiSidebar.prompt.reply', params)
    default:
      return assertNever(kind, 'DraftKind')
  }
}
