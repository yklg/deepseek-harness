/** Platform registry integrity, locale binding, and login-probe decisions. */
import { describe, expect, it } from 'vitest'
import { buyin, douyinShop, isPlatformId, PLATFORMS, platformById } from '../src/client/platforms.ts'
import type { PlatformProbe } from '../src/client/platforms.ts'
import {
  platformDe, platformEn, platformEs, platformFr, platformJa, platformPt, platformRu, platformZh,
} from '../src/client/platform-locales.ts'
import type { PlatformLocaleKey } from '../src/client/platform-locales.ts'
import { de, en, es, fr, ja, pt, ru, zh } from '../src/client/locales.ts'

const platformDictionaries: readonly Record<PlatformLocaleKey, string>[] = [
  platformZh, platformEn, platformJa, platformEs, platformFr, platformDe, platformRu, platformPt,
]

/**
 * @param url - guest page URL.
 * @param text - visible page text collected by the probe script.
 * @returns a read-only page snapshot.
 */
function probe(url: string, text = ''): PlatformProbe {
  return { url, title: '', text }
}

describe('platform registry', () => {
  it('ships the Douyin Shop and Buyin adapters exactly once', () => {
    expect(PLATFORMS).toContain(douyinShop)
    expect(PLATFORMS).toContain(buyin)
    expect(PLATFORMS.map(platform => platform.id).sort()).toEqual(['buyin', 'douyin-shop'])
    expect(new Set(PLATFORMS.map(platform => platform.id)).size).toBe(PLATFORMS.length)
  })

  it('keeps every adapter URL absolute https on a registered origin', () => {
    for (const platform of PLATFORMS) {
      expect(platform.origins.length).toBeGreaterThan(0)
      expect(platform.probeScript.length).toBeGreaterThan(0)
      for (const url of [platform.loginUrl, platform.homeUrl]) {
        const parsed = new URL(url)
        expect(parsed.protocol).toBe('https:')
        expect(platform.origins).toContain(parsed.origin)
      }
    }
  })

  it('gives each platform a stable per-account storage partition', () => {
    for (const platform of PLATFORMS) {
      expect(platform.storageKey('default')).toBe(`platform:${platform.id}:default`)
    }
    expect(douyinShop.storageKey('default')).not.toBe(buyin.storageKey('default'))
    expect(douyinShop.storageKey('account-a')).not.toBe(douyinShop.storageKey('account-b'))
  })

  it('accepts only the shipped platform ids', () => {
    for (const platform of PLATFORMS) expect(isPlatformId(platform.id)).toBe(true)
    for (const value of ['group-buy', '', 'douyin-shop-2', null, undefined, 42, {}, []]) {
      expect(isPlatformId(value)).toBe(false)
    }
  })

  it('resolves adapters by id and reports unknown ids as missing', () => {
    expect(platformById('douyin-shop')).toBe(douyinShop)
    expect(platformById('buyin')).toBe(buyin)
    expect(platformById('group-buy')).toBeUndefined()
    expect(platformById(undefined)).toBeUndefined()
  })

  it('resolves each card copy key in every platform dictionary', () => {
    for (const platform of PLATFORMS) {
      for (const dictionary of platformDictionaries) {
        expect(dictionary[platform.titleKey]).toBeTypeOf('string')
        expect(dictionary[platform.titleKey].length).toBeGreaterThan(0)
        expect(dictionary[platform.descriptionKey]).toBeTypeOf('string')
        expect(dictionary[platform.descriptionKey].length).toBeGreaterThan(0)
      }
    }
  })

  it('merges the platform copy into every workbench dictionary with identical keys', () => {
    const keys = Object.keys(zh).sort()
    for (const dictionary of [en, ja, es, fr, de, ru, pt]) {
      expect(Object.keys(dictionary).sort()).toEqual(keys)
    }
    for (const key of Object.keys(platformZh)) {
      expect(zh).toHaveProperty(key)
      expect(en).toHaveProperty(key)
    }
  })
})

describe('console destinations', () => {
  it('keeps every console candidate and path on a registered origin', () => {
    for (const platform of PLATFORMS) {
      expect(platform.consoleEntry.urls.length).toBeGreaterThan(0)
      expect(platform.consoleEntry.pathPrefixes.length).toBeGreaterThan(0)
      for (const url of platform.consoleEntry.urls) {
        const parsed = new URL(url)
        expect(parsed.protocol).toBe('https:')
        expect(platform.origins).toContain(parsed.origin)
      }
      for (const prefix of platform.consoleEntry.pathPrefixes) {
        expect(prefix.startsWith('/')).toBe(true)
        expect(prefix.length).toBeGreaterThan(1)
      }
    }
  })

  it('pins the Douyin Shop console candidates in preference order', () => {
    expect(douyinShop.consoleEntry).toEqual({
      urls: [
        'https://fxg.jinritemai.com/ffa/content-tool/live/control',
        'https://fxg.jinritemai.com/ffa/buyin/dashboard/live/control',
      ],
      pathPrefixes: ['/ffa/content-tool/live', '/ffa/buyin/dashboard/live'],
    })
  })

  it('pins the Buyin console destination', () => {
    expect(buyin.consoleEntry).toEqual({
      urls: ['https://buyin.jinritemai.com/dashboard/live/control'],
      pathPrefixes: ['/dashboard/live/control'],
    })
  })
})

describe('console login return', () => {
  /**
   * @returns the Douyin Shop console-return builder.
   */
  function douyinReturn(): (consoleUrl: string) => string {
    const build = douyinShop.loginUrlWithConsole
    if (build === undefined) throw new Error('douyin shop must support a console return target')
    return build
  }

  it('builds a login page that returns to each console candidate', () => {
    for (const consoleUrl of douyinShop.consoleEntry.urls) {
      const loginUrl = new URL(douyinReturn()(consoleUrl))
      expect(loginUrl.origin).toBe('https://fxg.jinritemai.com')
      expect(loginUrl.pathname).toBe('/login/common')
      const extra = JSON.stringify({ target_url: consoleUrl })
      expect(loginUrl.search).toBe(`?extra=${encodeURIComponent(extra)}`)
      expect(loginUrl.searchParams.get('extra')).toBe(extra)
    }
  })

  it('falls back to the plain login page for an illegal return target', () => {
    for (const target of [
      'https://example.com/ffa/content-tool/live/control',
      'http://fxg.jinritemai.com/ffa/content-tool/live/control',
      'javascript:alert(1)',
      'not-a-url',
      '',
    ]) {
      expect(douyinReturn()(target)).toBe(douyinShop.loginUrl)
    }
    expect(douyinShop.loginUrl.endsWith('/login')).toBe(true)
  })

  it('leaves platforms without a confirmed return parameter on the plain login page', () => {
    expect(buyin.loginUrlWithConsole).toBeUndefined()
  })
})

describe('login probe', () => {
  it('reports an unknown state before any usable snapshot exists', () => {
    for (const platform of PLATFORMS) {
      expect(platform.loginState(undefined)).toBe('unknown')
      expect(platform.loginState(probe(''))).toBe('unknown')
      expect(platform.loginState(probe('not-a-url'))).toBe('unknown')
    }
  })

  it('reports each official login page as signed out', () => {
    expect(douyinShop.loginState(probe(douyinShop.loginUrl))).toBe('out')
    expect(buyin.loginState(probe(buyin.loginUrl))).toBe('out')
  })

  it('reports a guest that left the platform origins as signed out', () => {
    expect(douyinShop.loginState(probe('https://example.com/console', '直播中控'))).toBe('out')
  })

  it('reports a platform console page as signed in', () => {
    expect(douyinShop.loginState(probe('https://fxg.jinritemai.com/ffa/mshop/homepage/index', '直播中控台 数据中心'))).toBe('in')
    expect(buyin.loginState(probe('https://buyin.jinritemai.com/dashboard/live', '直播中控'))).toBe('in')
  })

  it('keeps a platform page without login or console markers unknown', () => {
    const state = douyinShop.loginState(probe('https://fxg.jinritemai.com/help', '帮助中心'))
    expect(state).toBe('unknown')
    expect(state).not.toBe('in')
  })

  it('reports an in-page login prompt as signed out', () => {
    expect(douyinShop.loginState(probe('https://fxg.jinritemai.com/', '请扫码登录'))).toBe('out')
  })

  it('decides a login page that also shows console text as signed out', () => {
    expect(douyinShop.loginState(probe('https://fxg.jinritemai.com/login', '直播中控'))).toBe('out')
    expect(buyin.loginState(probe(buyin.loginUrl, '直播中控 数据中心'))).toBe('out')
  })
})
