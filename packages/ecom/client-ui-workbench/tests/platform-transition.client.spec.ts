/** Console-transition decision: login-state matrix, path matching, URL whitelisting, and one-shot behavior. */
import { describe, expect, it } from 'vitest'
import { decideConsoleTransition, type ConsoleTransitionInput } from '../src/client/platform-transition.ts'
import { buyin, douyinShop, type PlatformAdapter, type PlatformConsoleEntry } from '../src/client/platforms.ts'

const DOUYIN_CONSOLE = 'https://fxg.jinritemai.com/ffa/content-tool/live/control'
const DOUYIN_FALLBACK = 'https://fxg.jinritemai.com/ffa/buyin/dashboard/live/control'
const DOUYIN_HOME = 'https://fxg.jinritemai.com/ffa/mshop/homepage/index'
const BUYIN_CONSOLE = 'https://buyin.jinritemai.com/dashboard/live/control'

/**
 * @param consoleEntry - console destination replaced on the Douyin Shop adapter.
 * @returns a Douyin Shop adapter carrying the test destination.
 */
function adapterWith(consoleEntry: PlatformConsoleEntry): PlatformAdapter {
  return { ...douyinShop, consoleEntry }
}

/**
 * @param overrides - fields replaced by the test.
 * @returns a decision input for a signed-in guest on a non-console page.
 */
function input(overrides: Partial<ConsoleTransitionInput> = {}): ConsoleTransitionInput {
  return {
    adapter: douyinShop,
    currentUrl: DOUYIN_HOME,
    loginState: 'in',
    navigatedAfterLogin: false,
    starting: false,
    ...overrides,
  }
}

describe('decideConsoleTransition', () => {
  it('keeps the current page while the surface is starting or the guest is not signed in', () => {
    expect(decideConsoleTransition(input({ starting: true }))).toEqual({ kind: 'none' })
    expect(decideConsoleTransition(input({ loginState: 'out' }))).toEqual({ kind: 'none' })
    expect(decideConsoleTransition(input({ loginState: 'unknown' }))).toEqual({ kind: 'none' })
  })

  it('sends a signed-in guest on a non-console page to the primary console candidate', () => {
    expect(decideConsoleTransition(input())).toEqual({ kind: 'navigate', url: DOUYIN_CONSOLE })
  })

  it('stays put once this surface already navigated after login', () => {
    expect(decideConsoleTransition(input({ navigatedAfterLogin: true }))).toEqual({ kind: 'none' })
    // The user navigated back to a normal platform page after the automatic transition; the console must not grab it again.
    expect(decideConsoleTransition(input({ navigatedAfterLogin: true, currentUrl: DOUYIN_HOME })))
      .toEqual({ kind: 'none' })
  })

  it('stays put when the guest already shows a console destination', () => {
    expect(decideConsoleTransition(input({ currentUrl: DOUYIN_CONSOLE }))).toEqual({ kind: 'none' })
    expect(decideConsoleTransition(input({ currentUrl: DOUYIN_FALLBACK }))).toEqual({ kind: 'none' })
  })

  it('matches console paths without query, hash, or trailing slash', () => {
    for (const currentUrl of [
      `${DOUYIN_CONSOLE}/`,
      `${DOUYIN_CONSOLE}/room/9?from=home#chat`,
      `${DOUYIN_FALLBACK}?tab=live`,
    ]) {
      expect(decideConsoleTransition(input({ currentUrl }))).toEqual({ kind: 'none' })
    }
  })

  it('does not treat a sibling path that only shares a name prefix as the console', () => {
    for (const currentUrl of [
      'https://fxg.jinritemai.com/ffa/content-tool/live-training',
      'https://fxg.jinritemai.com/ffa/content-tool/liv',
    ]) {
      expect(decideConsoleTransition(input({ currentUrl }))).toEqual({ kind: 'navigate', url: DOUYIN_CONSOLE })
    }
  })

  it('navigates when the current address is missing or not on a registered origin', () => {
    for (const currentUrl of [
      undefined,
      'not-a-url',
      'https://example.com/ffa/content-tool/live/control',
      'http://fxg.jinritemai.com/ffa/content-tool/live/control',
    ]) {
      expect(decideConsoleTransition(input({ currentUrl }))).toEqual({ kind: 'navigate', url: DOUYIN_CONSOLE })
    }
  })

  it('reports one error when the adapter declares no console destination', () => {
    const adapter = adapterWith({ urls: [], pathPrefixes: [] })
    expect(decideConsoleTransition(input({ adapter }))).toEqual({ kind: 'error', reason: 'no-candidate' })
  })

  it('rejects every candidate outside the https origin whitelist', () => {
    const adapter = adapterWith({
      urls: [
        'http://fxg.jinritemai.com/ffa/content-tool/live/control',
        'https://fxg.jinritemai.com:8443/ffa/content-tool/live/control',
        'https://fxg.jinritemai.com.evil.example/ffa/content-tool/live/control',
        'https://fxg.jinritemai.com@evil.example/ffa/content-tool/live/control',
        BUYIN_CONSOLE,
        'javascript:alert(1)',
        'not-a-url',
        '',
      ],
      pathPrefixes: ['/ffa/content-tool/live'],
    })
    expect(decideConsoleTransition(input({ adapter }))).toEqual({ kind: 'error', reason: 'invalid-url' })
  })

  it('uses the first legal candidate and never falls through to a later one', () => {
    const adapter = adapterWith({
      urls: ['https://example.com/ffa/content-tool/live/control', DOUYIN_CONSOLE, DOUYIN_FALLBACK],
      pathPrefixes: ['/ffa/content-tool/live'],
    })
    expect(decideConsoleTransition(input({ adapter }))).toEqual({ kind: 'navigate', url: DOUYIN_CONSOLE })
  })

  it('returns the same single decision for repeated calls and then stops', () => {
    const first = decideConsoleTransition(input())
    expect(first).toEqual({ kind: 'navigate', url: DOUYIN_CONSOLE })
    expect(decideConsoleTransition(input({ navigatedAfterLogin: first.kind === 'navigate' })))
      .toEqual({ kind: 'none' })
  })

  it('decides the Buyin console from its roles entry page', () => {
    expect(decideConsoleTransition(input({
      adapter: buyin,
      currentUrl: 'https://buyin.jinritemai.com/mpa/account/roles-select',
    }))).toEqual({ kind: 'navigate', url: BUYIN_CONSOLE })
    expect(decideConsoleTransition(input({
      adapter: buyin,
      currentUrl: `${BUYIN_CONSOLE}?tab=goods#top`,
    }))).toEqual({ kind: 'none' })
  })
})
