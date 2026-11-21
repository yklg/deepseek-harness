// @vitest-environment jsdom
/** Mock platform pages: run each adapter's probe script over jsdom fixtures and pin the URL taxonomy. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { PlatformAdapter, PlatformLoginState, PlatformProbe, PlatformUrlKind } from '../src/client/platforms.ts'
import { buyin, douyinShop, PLATFORMS } from '../src/client/platforms.ts'

// jsdom implements no layout or innerText, so textContent stands in for the visible text the
// guest reports; these fixtures assert only the copy the login decision reads.
const nativeInnerText = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'innerText')

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    configurable: true,
    get(this: HTMLElement): string | null { return this.textContent },
  })
})

afterAll(() => {
  if (nativeInnerText === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'innerText')
  else Object.defineProperty(HTMLElement.prototype, 'innerText', nativeInnerText)
})

beforeEach(() => {
  document.title = ''
  document.body.innerHTML = ''
})

/**
 * @param value - value the guest script returned.
 * @returns whether it carries the three string fields the broker validates.
 */
function isProbeSnapshot(value: unknown): value is PlatformProbe {
  if (typeof value !== 'object' || value === null) return false
  const snapshot = value as Record<string, unknown>
  return typeof snapshot.url === 'string' && typeof snapshot.title === 'string' && typeof snapshot.text === 'string'
}

/**
 * Run one adapter's probe script in the current jsdom document.
 * @param script - probe script shipped by the adapter.
 * @returns the snapshot the guest would report for the current document.
 */
function runProbeScript(script: string): PlatformProbe {
  // Indirect eval runs the guest script outside this module's scope, as the guest page does.
  const snapshot: unknown = (0, eval)(script)
  if (!isProbeSnapshot(snapshot)) throw new Error('probe script must return string url, title, and text')
  return snapshot
}

/** One mock platform page and the login state the adapter must decide for it. */
interface MockPage {
  /** Test title naming the page role. */
  readonly label: string
  /** Real address the guest reports for this page. */
  readonly url: string
  readonly title: string
  readonly html: string
  /** Visible copy the guest snapshot must carry. */
  readonly visible: string
  readonly state: PlatformLoginState
}

/**
 * Render one mock page and collect the snapshot the guest reports for it.
 * @param platform - adapter whose probe script runs against the page.
 * @param page - mock page to render.
 * @returns the collected snapshot, carrying the real address the fixture declares for the page.
 */
function probePage(platform: PlatformAdapter, page: MockPage): PlatformProbe {
  document.title = page.title
  document.body.innerHTML = page.html
  const snapshot = runProbeScript(platform.probeScript)
  // jsdom cannot navigate to a platform origin, so the declared address stands in for `location.href`.
  return { url: page.url, title: snapshot.title, text: snapshot.text }
}

const DOUYIN_PAGES: readonly MockPage[] = [
  {
    label: 'decides the sign-in page as signed out',
    url: 'https://fxg.jinritemai.com/login',
    title: '抖店 - 商家登录',
    html: `<main class="login">
      <h1>抖店</h1>
      <p>扫码登录</p>
      <p>请使用抖音 App 扫码，或切换账号登录</p>
      <p>登录后可进入直播中控台与数据中心</p>
      <a href="https://fxg.jinritemai.com/login/common">账号登录</a>
    </main>`,
    visible: '扫码登录',
    state: 'out',
  },
  {
    label: 'decides the console page as signed in',
    url: 'https://fxg.jinritemai.com/ffa/content-tool/live/control',
    title: '直播中控台 - 抖店',
    html: `<header><span>抖店</span><span>直播中控</span></header>
      <nav><a href="/ffa/live">直播管理</a><a href="/ffa/data">数据中心</a><a href="/ffa/goods">选品广场</a></nav>
      <p>在线人数 1,204 · 成交金额 ¥8,600.00</p>`,
    visible: '直播中控',
    state: 'in',
  },
  {
    label: 'decides the merchant home as signed in',
    url: 'https://fxg.jinritemai.com/',
    title: '抖店 - 商家中心',
    html: `<nav><span>工作台</span><span>商品管理</span><span>订单管理</span></nav>
      <p>今日支付金额 ¥1,204.00</p>`,
    visible: '工作台',
    state: 'in',
  },
  {
    label: 'decides a page without sign-in or console copy as signed in',
    url: 'https://fxg.jinritemai.com/help',
    title: '帮助中心 - 抖店',
    html: '<h1>帮助中心</h1><p>常见问题 · 联系客服</p>',
    visible: '帮助中心',
    state: 'in',
  },
  {
    label: 'decides a page showing an in-page sign-in prompt as signed out',
    url: 'https://fxg.jinritemai.com/',
    title: '抖店',
    html: '<div class="modal"><p>请扫码登录后继续</p></div><nav><span>商品管理</span></nav>',
    visible: '请扫码登录',
    state: 'out',
  },
]

const BUYIN_PAGES: readonly MockPage[] = [
  {
    label: 'decides the role selection page as signed out',
    url: 'https://buyin.jinritemai.com/mpa/account/roles-select',
    title: '巨量百应 - 选择角色',
    html: `<main>
      <h1>欢迎来到百应</h1>
      <p>选择角色后可进入直播中控台</p>
      <button>达人</button><button>商家</button>
    </main>`,
    visible: '选择角色',
    state: 'out',
  },
  {
    label: 'decides the canonical sign-in page as signed out',
    url: 'https://buyin.jinritemai.com/mpa/account/login?log_out=1&type=24',
    title: '巨量百应 - 登录',
    html: `<main>
      <h1>巨量百应</h1>
      <p>扫码登录</p>
      <p>使用抖音 App 扫码，或账号登录</p>
    </main>`,
    visible: '扫码登录',
    state: 'out',
  },
  {
    label: 'decides the console page as signed in',
    url: 'https://buyin.jinritemai.com/dashboard/live/control?room_id=998',
    title: '直播中控 - 巨量百应',
    html: `<header><h2>直播中控</h2></header>
      <nav><a href="/dashboard/live">直播管理</a><a href="/dashboard/data">数据中心</a></nav>`,
    visible: '直播中控',
    state: 'in',
  },
  {
    label: 'decides the talent home as signed in',
    url: 'https://buyin.jinritemai.com/',
    title: '巨量百应',
    html: '<h1>欢迎来到百应</h1><p>数据概览 · 我的直播</p>',
    visible: '欢迎来到百应',
    state: 'in',
  },
]

/** Marketing landing page; its copy advertises the console but it belongs to another site. */
const MARKETING_PAGE = {
  url: 'https://www.douyinec.com/',
  title: '抖音电商 - 冬季好物节',
  html: `<header><a href="/">抖音电商</a></header>
    <main>
      <h1>抖音电商冬季好物节</h1>
      <p>直播中控台与数据中心一站式管理，立即入驻抖店</p>
      <a target="_blank" href="https://fxg.jinritemai.com/login">立即登录抖店</a>
      <a target="_blank" href="https://www.douyinec.com/apply">免费试用</a>
    </main>`,
  visible: '直播中控台',
}

/** One adapter with its mock page set. */
interface PlatformPages {
  readonly name: string
  readonly adapter: PlatformAdapter
  readonly pages: readonly MockPage[]
}

const MOCK_PAGE_SETS: readonly PlatformPages[] = [
  { name: 'Douyin Shop', adapter: douyinShop, pages: DOUYIN_PAGES },
  { name: 'Buyin', adapter: buyin, pages: BUYIN_PAGES },
]

describe('probe script in the guest', () => {
  it('reports the guest address, document title, and visible text', () => {
    document.title = '直播中控台 - 抖店'
    document.body.innerHTML = '<h1>直播中控</h1><p>在线人数 1,204</p>'
    const probe = runProbeScript(douyinShop.probeScript)
    expect(probe.url).toBe(window.location.href)
    expect(probe.title).toBe('直播中控台 - 抖店')
    expect(probe.text).toContain('直播中控')
    expect(probe.text).toContain('在线人数 1,204')
  })

  it('collects exactly the url, title, and text fields the broker carries', () => {
    const probe = runProbeScript(buyin.probeScript)
    expect(Object.keys(probe).sort()).toEqual(['text', 'title', 'url'])
    expect(JSON.parse(JSON.stringify(probe))).toEqual(probe)
  })

  it('clamps the collected text to 6000 characters, not bytes', () => {
    document.body.innerHTML = `<p>${'a'.repeat(6_000)}</p>`
    expect(runProbeScript(douyinShop.probeScript).text).toBe('a'.repeat(6_000))

    document.body.innerHTML = `<p>${'中'.repeat(6_100)}</p>`
    const text = runProbeScript(douyinShop.probeScript).text
    expect(text).toHaveLength(6_000)
    expect(text).toBe('中'.repeat(6_000))
  })

  it('collects empty text from a document without a body', () => {
    const body = document.body
    body.remove()
    try {
      expect(runProbeScript(douyinShop.probeScript).text).toBe('')
    } finally {
      document.documentElement.appendChild(body)
    }
  })

  it('reads the page without changing it', () => {
    document.title = '巨量百应'
    document.body.innerHTML = '<h1>欢迎来到百应</h1><p>数据概览</p>'
    const html = document.body.innerHTML
    runProbeScript(buyin.probeScript)
    expect(document.title).toBe('巨量百应')
    expect(document.body.innerHTML).toBe(html)
  })
})

describe('mock platform pages', () => {
  for (const { name, adapter, pages } of MOCK_PAGE_SETS) {
    for (const page of pages) {
      it(`${name}: ${page.label}`, () => {
        const probe = probePage(adapter, page)
        expect(probe.title).toBe(page.title)
        expect(probe.text).toContain(page.visible)
        expect(adapter.loginState(probe)).toBe(page.state)
      })
    }
  }

  it('keeps the marketing landing page external and out of the platform session', () => {
    document.title = MARKETING_PAGE.title
    document.body.innerHTML = MARKETING_PAGE.html
    const snapshot = runProbeScript(douyinShop.probeScript)
    expect(snapshot.text).toContain(MARKETING_PAGE.visible)
    const probe: PlatformProbe = { url: MARKETING_PAGE.url, title: snapshot.title, text: snapshot.text }
    for (const platform of PLATFORMS) {
      expect(platform.classifyUrl(MARKETING_PAGE.url)).toBe('external')
      expect(platform.loginState(probe)).toBe('out')
    }
  })

  it('reports unknown for a blank guest that has no address yet', () => {
    const snapshot = runProbeScript(douyinShop.probeScript)
    expect(snapshot.text).toBe('')
    for (const platform of PLATFORMS) {
      expect(platform.loginState({ ...snapshot, url: '' })).toBe('unknown')
      expect(platform.loginState({ ...snapshot, url: 'not a url' })).toBe('unknown')
      expect(platform.loginState(undefined)).toBe('unknown')
      // A guest on an unregistered origin is never reported as signed in.
      expect(platform.loginState(snapshot)).toBe('out')
    }
  })
})

/** One address the adapter's taxonomy must classify. */
interface UrlCase {
  readonly label: string
  readonly url: string
  readonly kind: PlatformUrlKind
}

const DOUYIN_URL_CASES: readonly UrlCase[] = [
  {
    label: 'classifies the canonical sign-in page as login',
    url: 'https://fxg.jinritemai.com/login',
    kind: 'login',
  },
  {
    label: 'classifies the console-return sign-in page as login',
    url: 'https://fxg.jinritemai.com/login/common?extra=%7B%22target_url%22%3A%22https%3A%2F%2Ffxg.jinritemai.com%2F%22%7D',
    kind: 'login',
  },
  { label: 'classifies the merchant home as platform', url: 'https://fxg.jinritemai.com/', kind: 'platform' },
  {
    label: 'classifies an internal merchant page as platform',
    url: 'https://fxg.jinritemai.com/ffa/mshop/homepage/index',
    kind: 'platform',
  },
  {
    label: 'classifies the primary console entry as console',
    url: 'https://fxg.jinritemai.com/ffa/content-tool/live/control',
    kind: 'console',
  },
  {
    label: 'classifies the fallback console entry as console',
    url: 'https://fxg.jinritemai.com/ffa/buyin/dashboard/live/control',
    kind: 'console',
  },
  {
    label: 'classifies a console address with a query as console',
    url: 'https://fxg.jinritemai.com/ffa/content-tool/live/control?room_id=42',
    kind: 'console',
  },
  {
    label: 'classifies a page below the console prefix as console',
    url: 'https://fxg.jinritemai.com/ffa/content-tool/live/control/room/42',
    kind: 'console',
  },
  {
    label: 'classifies the bare console prefix as console',
    url: 'https://fxg.jinritemai.com/ffa/content-tool/live',
    kind: 'console',
  },
  {
    label: 'classifies the trailing-slash console prefix as console',
    url: 'https://fxg.jinritemai.com/ffa/content-tool/live/',
    kind: 'console',
  },
  {
    label: 'keeps a prefix-lookalike path on the platform without calling it console',
    url: 'https://fxg.jinritemai.com/ffa/content-tool/live2',
    kind: 'platform',
  },
  {
    label: 'keeps the other platform console external',
    url: 'https://buyin.jinritemai.com/dashboard/live/control',
    kind: 'external',
  },
  { label: 'keeps the marketing landing page external', url: 'https://www.douyinec.com/', kind: 'external' },
  {
    label: 'keeps a look-alike host external',
    url: 'https://fxg.jinritemai.com.evil.example/',
    kind: 'external',
  },
  {
    label: 'keeps a look-alike host with a login path external',
    url: 'https://fxg.jinritemai.com.evil.example/login',
    kind: 'external',
  },
  {
    label: 'keeps an address that only embeds the platform origin in its path external',
    url: 'https://evil.example/fxg.jinritemai.com/login',
    kind: 'external',
  },
  {
    label: 'keeps a trailing-dot platform host external',
    url: 'https://fxg.jinritemai.com./login',
    kind: 'external',
  },
  {
    label: 'keeps a plain http address external',
    url: 'http://fxg.jinritemai.com/login',
    kind: 'external',
  },
  {
    label: 'keeps a non-default https port external',
    url: 'https://fxg.jinritemai.com:8443/login',
    kind: 'external',
  },
  {
    label: 'keeps a userinfo address external',
    url: 'https://user:pass@fxg.jinritemai.com/login',
    kind: 'external',
  },
  {
    label: 'normalizes the default https port back onto the platform',
    url: 'https://fxg.jinritemai.com:443/login',
    kind: 'login',
  },
  {
    label: 'normalizes the platform host case',
    url: 'https://FXG.JINRITEMAI.COM/login',
    kind: 'login',
  },
  {
    label: 'keeps a javascript: address external',
    url: 'javascript:alert(1)',
    kind: 'external',
  },
  { label: 'keeps a data: address external', url: 'data:text/html,hi', kind: 'external' },
  { label: 'keeps about:blank external', url: 'about:blank', kind: 'external' },
  { label: 'keeps an empty address external', url: '', kind: 'external' },
  { label: 'keeps a non-URL value external', url: 'not a url', kind: 'external' },
  {
    label: 'keeps an oversized foreign host external',
    url: `https://${'a'.repeat(2_000)}.evil.example/`,
    kind: 'external',
  },
  {
    label: 'keeps an oversized path on the platform origin internal',
    url: `https://fxg.jinritemai.com/${'a'.repeat(100_000)}`,
    kind: 'platform',
  },
]

const BUYIN_URL_CASES: readonly UrlCase[] = [
  {
    label: 'classifies the canonical sign-in page as login',
    url: 'https://buyin.jinritemai.com/mpa/account/login?log_out=1&type=24',
    kind: 'login',
  },
  {
    label: 'classifies the role selection entry as login',
    url: 'https://buyin.jinritemai.com/mpa/account/roles-select',
    kind: 'login',
  },
  { label: 'classifies the workspace home as platform', url: 'https://buyin.jinritemai.com/', kind: 'platform' },
  {
    label: 'classifies the dashboard root as platform',
    url: 'https://buyin.jinritemai.com/dashboard',
    kind: 'platform',
  },
  {
    label: 'classifies the console entry as console',
    url: 'https://buyin.jinritemai.com/dashboard/live/control',
    kind: 'console',
  },
  {
    label: 'classifies a console address with a query as console',
    url: 'https://buyin.jinritemai.com/dashboard/live/control?room_id=998',
    kind: 'console',
  },
  {
    label: 'classifies a page below the console prefix as console',
    url: 'https://buyin.jinritemai.com/dashboard/live/control/room/998',
    kind: 'console',
  },
  {
    label: 'classifies the trailing-slash console prefix as console',
    url: 'https://buyin.jinritemai.com/dashboard/live/control/',
    kind: 'console',
  },
  {
    label: 'keeps a prefix-lookalike path on the platform without calling it console',
    url: 'https://buyin.jinritemai.com/dashboard/live/controls',
    kind: 'platform',
  },
  {
    label: 'keeps the other platform external',
    url: 'https://fxg.jinritemai.com/ffa/content-tool/live/control',
    kind: 'external',
  },
  { label: 'keeps the marketing landing page external', url: 'https://www.douyinec.com/', kind: 'external' },
  {
    label: 'keeps a look-alike host external',
    url: 'https://fxg.jinritemai.com.evil.example/',
    kind: 'external',
  },
  { label: 'keeps a plain http address external', url: 'http://buyin.jinritemai.com/dashboard', kind: 'external' },
  {
    label: 'keeps a non-default https port external',
    url: 'https://buyin.jinritemai.com:8443/dashboard',
    kind: 'external',
  },
  {
    label: 'keeps a userinfo address external',
    url: 'https://user:pass@buyin.jinritemai.com/dashboard',
    kind: 'external',
  },
  {
    label: 'normalizes the default https port back onto the platform',
    url: 'https://buyin.jinritemai.com:443/dashboard',
    kind: 'platform',
  },
  { label: 'keeps a javascript: address external', url: 'javascript:alert(1)', kind: 'external' },
  { label: 'keeps an empty address external', url: '', kind: 'external' },
  {
    label: 'keeps an oversized foreign host external',
    url: `https://${'a'.repeat(2_000)}.evil.example/`,
    kind: 'external',
  },
]

const URL_MATRIX: readonly { readonly adapter: PlatformAdapter; readonly cases: readonly UrlCase[] }[] = [
  { adapter: douyinShop, cases: DOUYIN_URL_CASES },
  { adapter: buyin, cases: BUYIN_URL_CASES },
]

describe('URL taxonomy matrix', () => {
  for (const { adapter, cases } of URL_MATRIX) {
    for (const row of cases) {
      it(`${adapter.id}: ${row.label}`, () => {
        expect(adapter.classifyUrl(row.url)).toBe(row.kind)
      })
    }
  }

  it('never reports a foreign address as signed in, even with console copy on the page', () => {
    for (const { adapter, cases } of URL_MATRIX) {
      for (const row of cases) {
        if (adapter.classifyUrl(row.url) !== 'external') continue
        // loginState does not repeat classifyUrl's userinfo rejection; the userinfo case below owns
        // that asymmetry.
        if (row.url.includes('@')) continue
        expect(adapter.loginState({ url: row.url, title: '', text: '直播中控 数据中心' }), row.url).not.toBe('in')
      }
    }
  })
})

describe('URL taxonomy boundaries', () => {
  // LOGIN_PATH matches the account segment anywhere in the path, so every page below /account is
  // classified as a sign-in page. Pinned as observed; whether fxg serves signed-in content there
  // is unverified.
  it('classifies every /account path on the platform origins as login', () => {
    expect(douyinShop.classifyUrl('https://fxg.jinritemai.com/account/index')).toBe('login')
    expect(buyin.classifyUrl('https://buyin.jinritemai.com/mpa/account/profile')).toBe('login')
  })

  it('keeps a console path on a look-alike host external', () => {
    expect(douyinShop.classifyUrl('https://fxg.jinritemai.com.evil.example/ffa/content-tool/live/control'))
      .toBe('external')
  })

  it('keeps a console path on the marketing site external', () => {
    expect(buyin.classifyUrl('https://www.douyinec.com/dashboard/live/control')).toBe('external')
  })

  // Addresses carrying credentials are unsafe in both classifiers: the guest must not be
  // navigated through them and they prove nothing about the session.
  it('treats a userinfo address as external and signed out', () => {
    expect(douyinShop.classifyUrl('https://user:pass@fxg.jinritemai.com/')).toBe('external')
    expect(douyinShop.loginState({ url: 'https://user:pass@fxg.jinritemai.com/', title: '', text: '' })).toBe('out')
    expect(buyin.classifyUrl('https://user:pass@buyin.jinritemai.com/dashboard')).toBe('external')
    expect(buyin.loginState({ url: 'https://user:pass@buyin.jinritemai.com/dashboard', title: '', text: '' })).toBe('out')
  })
})

describe('console sign-in return', () => {
  /**
   * @param adapter - adapter expected to build a console return address.
   * @returns the console-return builder.
   */
  function buildLoginUrl(adapter: PlatformAdapter): (consoleUrl: string) => string {
    const build = adapter.loginUrlWithConsole
    if (build === undefined) throw new Error(`${adapter.id} must support a console return target`)
    return build
  }

  it('builds a sign-in address on the login origins for every console candidate', () => {
    for (const consoleUrl of douyinShop.consoleEntry.urls) {
      const loginUrl = buildLoginUrl(douyinShop)(consoleUrl)
      expect(douyinShop.loginOrigins, loginUrl).toContain(new URL(loginUrl).origin)
      expect(douyinShop.classifyUrl(loginUrl)).toBe('login')
      expect(new URL(loginUrl).searchParams.get('extra') ?? '').toContain(consoleUrl)
    }
  })

  it('falls back to the plain sign-in page on the login origins for a foreign target', () => {
    const loginUrl = buildLoginUrl(douyinShop)('https://evil.example/ffa/content-tool/live/control')
    expect(loginUrl).toBe(douyinShop.loginUrl)
    expect(douyinShop.loginOrigins).toContain(new URL(loginUrl).origin)
    expect(douyinShop.classifyUrl(loginUrl)).toBe('login')
  })

  it('leaves the Buyin console entry on the adapter origins without a return builder', () => {
    expect(buyin.loginUrlWithConsole).toBeUndefined()
    for (const consoleUrl of buyin.consoleEntry.urls) {
      expect(buyin.origins).toContain(new URL(consoleUrl).origin)
    }
  })
})

describe('adapter declarations', () => {
  it('keeps every declared address inside its own taxonomy', () => {
    for (const platform of PLATFORMS) {
      for (const url of [platform.loginUrl, platform.homeUrl, ...platform.consoleEntry.urls]) {
        expect(platform.classifyUrl(url), url).not.toBe('external')
      }
      expect(platform.classifyUrl(platform.loginUrl), platform.loginUrl).toBe('login')
      if (platform.loginUrlWithConsole !== undefined) {
        for (const consoleUrl of platform.consoleEntry.urls) {
          expect(platform.classifyUrl(platform.loginUrlWithConsole(consoleUrl))).toBe('login')
        }
      }
    }
  })

  it('keeps every console path on an origin that can host the console', () => {
    for (const platform of PLATFORMS) {
      const [origin] = platform.origins
      if (origin === undefined) throw new Error(`${platform.id} must declare a platform origin`)
      for (const prefix of platform.consoleEntry.pathPrefixes) {
        const consoleUrl = `${origin}${prefix}`
        expect(platform.classifyUrl(consoleUrl), consoleUrl).toBe('console')
      }
    }
  })
})
