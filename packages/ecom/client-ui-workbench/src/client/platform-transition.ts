/** One-shot decision that sends a signed-in platform guest to its console. */
import { parseConsoleUrl, type PlatformAdapter, type PlatformLoginState } from './platforms.ts'

/** Outcome of one console-transition decision. */
export type ConsoleTransition =
  | { readonly kind: 'none' }
  | { readonly kind: 'navigate'; readonly url: string }
  | {
    readonly kind: 'error'
    /** `no-candidate` when the adapter declares no destination; `invalid-url` when none of its candidates is legal. */
    readonly reason: 'no-candidate' | 'invalid-url'
  }

/** Inputs for one console-transition decision. */
export interface ConsoleTransitionInput {
  /** Platform whose console destination and login state decide the transition. */
  readonly adapter: PlatformAdapter
  /** Address the guest currently shows, when the surface reported one. */
  readonly currentUrl: string | undefined
  /** Login state from the latest successful probe. */
  readonly loginState: PlatformLoginState
  /** Whether this surface already navigated once during its login episode. */
  readonly navigatedAfterLogin: boolean
  /** Whether the surface or probe is in a state that must not decide navigation yet. */
  readonly starting: boolean
}

/**
 * @param pathname - URL pathname of the address the guest currently shows.
 * @param prefixes - console path prefixes owned by the adapter.
 * @returns whether the pathname is one of the adapter's console destinations.
 */
function isConsolePath(pathname: string, prefixes: readonly string[]): boolean {
  const path = pathname.replace(/\/+$/, '')
  return prefixes.some((prefix) => {
    const base = prefix.replace(/\/+$/, '')
    return base !== '' && (path === base || path.startsWith(`${base}/`))
  })
}

/**
 * Decide whether a signed-in platform guest should be sent to its console.
 *
 * The decision is idempotent and returns at most one destination: a guest that is not
 * signed in, has already navigated after login, or already shows a console path keeps
 * the current page. The first candidate that is an https URL on a registered origin
 * wins; the decision never cycles through several candidates.
 * @param input - adapter, current address, login state, and one-shot flags.
 * @returns `none`, one `navigate` destination, or an `error` describing why no legal destination exists.
 */
export function decideConsoleTransition(input: ConsoleTransitionInput): ConsoleTransition {
  if (input.starting || input.loginState !== 'in' || input.navigatedAfterLogin) return { kind: 'none' }
  const current = parseConsoleUrl(input.adapter.origins, input.currentUrl)
  if (current !== undefined && isConsolePath(current.pathname, input.adapter.consoleEntry.pathPrefixes)) {
    return { kind: 'none' }
  }
  const candidates = input.adapter.consoleEntry.urls
  if (candidates.length === 0) return { kind: 'error', reason: 'no-candidate' }
  for (const candidate of candidates) {
    if (parseConsoleUrl(input.adapter.origins, candidate) !== undefined) return { kind: 'navigate', url: candidate }
  }
  return { kind: 'error', reason: 'invalid-url' }
}
