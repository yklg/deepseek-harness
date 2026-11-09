/** Static platform registry and the login-probe contract for the ecommerce suite. */
import type { PlatformLocaleKey } from './platform-locales.ts'

/** Platform identities shipped in v1. */
export type PlatformId = 'douyin-shop' | 'buyin'

/** Login state decided by an adapter from a read-only page snapshot. */
export type PlatformLoginState = 'in' | 'out' | 'unknown'

/** A read-only snapshot collected from the platform guest. */
export interface PlatformProbe {
  readonly url: string
  readonly title: string
  readonly text: string
}

/** Console destinations one platform adapter owns for the signed-in experience. */
export interface PlatformConsoleEntry {
  /** Candidate console URLs in preference order; a decision uses the first legal one. */
  readonly urls: readonly string[]
  /** Console path prefixes; a current page whose path starts with one already shows the console. */
  readonly pathPrefixes: readonly string[]
}

/** Kind of page a platform guest currently shows. */
export type PlatformUrlKind = 'console' | 'login' | 'platform' | 'external'

/** One platform's URLs, storage identity and login detector. */
export interface PlatformAdapter {
  readonly id: PlatformId
  /** Locale key for the card title. */
  readonly titleKey: PlatformLocaleKey
  /** Locale key for the card description. */
  readonly descriptionKey: PlatformLocaleKey
  /** Canonical sign-in entry; `open()` starts here unless a console URL is restored. */
  readonly loginUrl: string
  readonly homeUrl: string
  /** Application origins that may be probed through the automation broker. */
  readonly origins: readonly string[]
  /** Sign-in origins; navigation here is a login-flow page rather than a probe target. */
  readonly loginOrigins: readonly string[]
  /** Console destination and the paths that already show it. */
  readonly consoleEntry: PlatformConsoleEntry
  /**
   * Login page that returns to a console address after the platform sign-in; platforms without a
   * confirmed return parameter leave this undefined and use {@link PlatformAdapter.loginUrl}.
   * @param consoleUrl - console address to return to after sign-in.
   * @returns an absolute https login URL on a registered origin.
   */
  readonly loginUrlWithConsole?: (consoleUrl: string) => string
  /**
   * Classify one guest address without touching the page.
   * @param value - address reported by the surface.
   * @returns console, login, platform, or external.
   */
  classifyUrl(value: string): PlatformUrlKind
  /** Read-only script evaluated in the guest to collect a probe. */
  readonly probeScript: string
  /** @param probe - snapshot from the guest, or undefined before one exists. */
  loginState(probe: PlatformProbe | undefined): PlatformLoginState
  /** @param account - account dimension reserved for a later version. */
  storageKey(account: string): string
}

const LOGIN_PATH = /\/(?:login|roles-select|account)(?:\/|$)/i
const LOGIN_TEXT = /扫码登录|登录抖店|登录巨量百应|请登录|账号登录|选择角色/
const CONSOLE_TEXT = /直播中控|直播管理|数据中心|选品广场|工作台/

const PROBE_SCRIPT = `(() => {
  const body = document.body
  return {
    url: location.href,
    title: document.title,
    text: (body === null ? '' : body.innerText).slice(0, 6000),
  }
})()`

/** Origins of the Douyin Shop merchant backend; console addresses must use one of them. */
const DOUYIN_ORIGINS: readonly string[] = ['https://fxg.jinritemai.com']

/** Origins of the Buyin talent workspace; console addresses must use one of them. */
const BUYIN_ORIGINS: readonly string[] = ['https://buyin.jinritemai.com']

/** Douyin Shop plain sign-in page; kept free of return parameters. */
const DOUYIN_LOGIN_URL = 'https://fxg.jinritemai.com/login'

/** Douyin Shop sign-in endpoint that accepts a console address as its return target. */
const DOUYIN_LOGIN_RETURN_URL = 'https://fxg.jinritemai.com/login/common'

/** Douyin Shop console destination observed in a real user navigation; primary candidate. */
const DOUYIN_CONSOLE_PRIMARY = 'https://fxg.jinritemai.com/ffa/content-tool/live/control'

/** Douyin Shop console destination from the oba-live-tool constants; open-source constant, pending real-device verification. */
const DOUYIN_CONSOLE_FALLBACK = 'https://fxg.jinritemai.com/ffa/buyin/dashboard/live/control'

/** Buyin console destination from the oba-live-tool constants; open-source constant, pending real-device verification. */
const BUYIN_CONSOLE_URL = 'https://buyin.jinritemai.com/dashboard/live/control'

/**
 * Accept a console address only when it is an absolute https URL on a registered platform origin.
 * @param origins - origins that denote the platform application.
 * @param value - untrusted candidate address.
 * @returns the parsed URL, or undefined when the address cannot host a platform console.
 */
export function parseConsoleUrl(origins: readonly string[], value: string | undefined): URL | undefined {
  if (value === undefined || value === '') return undefined
  let url: URL
  try { url = new URL(value) } catch { return undefined }
  return url.protocol === 'https:' && origins.includes(url.origin) ? url : undefined
}

/**
 * Build the Douyin Shop sign-in page that returns to a console address after sign-in.
 * @param consoleUrl - console address to return to; an illegal address falls back to the plain login page.
 * @returns a sign-in URL whose `extra` parameter carries the encoded return target.
 */
function douyinLoginUrlWithConsole(consoleUrl: string): string {
  const target = parseConsoleUrl(DOUYIN_ORIGINS, consoleUrl)
  if (target === undefined) return DOUYIN_LOGIN_URL
  const extra = JSON.stringify({ target_url: target.href })
  return `${DOUYIN_LOGIN_RETURN_URL}?extra=${encodeURIComponent(extra)}`
}

/**
 * Decide login state from a snapshot without treating an unknown page as logged in.
 * @param origins - platform origins that denote the logged-in application.
 * @param probe - guest snapshot, or undefined before the first probe.
 * @returns `in`, `out`, or `unknown`.
 */
function probeState(origins: readonly string[], probe: PlatformProbe | undefined): PlatformLoginState {
  if (probe === undefined || probe.url === '') return 'unknown'
  let url: URL
  try { url = new URL(probe.url) } catch { return 'unknown' }
  const onPlatform = origins.includes(url.origin)
  if (!onPlatform || LOGIN_PATH.test(url.pathname) || LOGIN_TEXT.test(probe.text)) return 'out'
  if (CONSOLE_TEXT.test(probe.text)) return 'in'
  // On a platform origin without sign-in copy or a login path the session is
  // authenticated; whether the page is a console is the transition's decision.
  return 'in'
}

/**
 * Classify a guest address against one platform's URL taxonomy.
 * @param origins - application origins eligible for probing.
 * @param loginOrigins - sign-in origins.
 * @param consoleEntry - console destinations.
 * @param value - candidate address.
 * @returns the page kind; malformed or unsafe addresses are external.
 */
function classifyPlatformUrl(origins: readonly string[], loginOrigins: readonly string[],
  consoleEntry: PlatformConsoleEntry, value: string): PlatformUrlKind {
  let url: URL
  try { url = new URL(value) } catch { return 'external' }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return 'external'
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (consoleEntry.pathPrefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`))) return 'console'
  if (origins.includes(url.origin)) return LOGIN_PATH.test(url.pathname) ? 'login' : 'platform'
  return loginOrigins.includes(url.origin) ? 'login' : 'external'
}

/** Douyin Shop merchant backend. */
export const douyinShop: PlatformAdapter = {
  id: 'douyin-shop',
  titleKey: 'platform.douyinShop.title',
  descriptionKey: 'platform.douyinShop.description',
  loginUrl: DOUYIN_LOGIN_URL,
  homeUrl: 'https://fxg.jinritemai.com/',
  origins: DOUYIN_ORIGINS,
  loginOrigins: DOUYIN_ORIGINS,
  classifyUrl: value => classifyPlatformUrl(DOUYIN_ORIGINS, DOUYIN_ORIGINS, douyinShop.consoleEntry, value),
  consoleEntry: {
    urls: [DOUYIN_CONSOLE_PRIMARY, DOUYIN_CONSOLE_FALLBACK],
    pathPrefixes: ['/ffa/content-tool/live', '/ffa/buyin/dashboard/live'],
  },
  loginUrlWithConsole: douyinLoginUrlWithConsole,
  probeScript: PROBE_SCRIPT,
  loginState: probe => probeState(DOUYIN_ORIGINS, probe),
  storageKey: account => `platform:douyin-shop:${account}`,
}

/** Buyin talent workspace; the roles page is the official entry. */
export const buyin: PlatformAdapter = {
  id: 'buyin',
  titleKey: 'platform.buyin.title',
  descriptionKey: 'platform.buyin.description',
  loginUrl: 'https://buyin.jinritemai.com/mpa/account/login?type=24',
  homeUrl: 'https://buyin.jinritemai.com/',
  origins: BUYIN_ORIGINS,
  loginOrigins: BUYIN_ORIGINS,
  classifyUrl: value => classifyPlatformUrl(BUYIN_ORIGINS, BUYIN_ORIGINS, buyin.consoleEntry, value),
  consoleEntry: {
    urls: [BUYIN_CONSOLE_URL],
    pathPrefixes: ['/dashboard/live/control'],
  },
  probeScript: PROBE_SCRIPT,
  loginState: probe => probeState(BUYIN_ORIGINS, probe),
  storageKey: account => `platform:buyin:${account}`,
}

/** Platforms with an active adapter in v1. */
export const PLATFORMS: readonly PlatformAdapter[] = [douyinShop, buyin]

/**
 * Decide whether an untrusted value names a shipped platform.
 * @param value - untrusted persisted identity.
 * @returns whether the value names a shipped adapter.
 */
export function isPlatformId(value: unknown): value is PlatformId {
  return value === 'douyin-shop' || value === 'buyin'
}

/**
 * Look up a shipped platform adapter.
 * @param id - platform identity.
 * @returns the adapter, or undefined for a retired/unknown id.
 */
export function platformById(id: string | undefined): PlatformAdapter | undefined {
  return id === undefined ? undefined : PLATFORMS.find(platform => platform.id === id)
}
