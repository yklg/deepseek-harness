/** Console page-context reader: attach/evaluate/release lifecycle, JSON validation, and draft prompts. */
import { describe, expect, it, vi, type Mock } from 'vitest'
import { RemoteError, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the workbench failure-code augmentation RemoteError names.
import type {} from '@deepseek-ai/dsh-ecom-workbench-server/types'
import {
  CONSOLE_TEXT_SCRIPT, buildDraftPrompt, createAiContextReader,
  type AiContextSnapshot, type AiRemote, type DraftKind,
} from '../src/client/ai-context.ts'
import { redactPii } from '../src/client/pii.ts'
import { douyinShop } from '../src/client/platforms.ts'
import { en } from '../src/client/locales.ts'

/** Attached guest the fake broker reports. */
const TARGET = { targetId: 'lease-1', url: 'https://fxg.jinritemai.com/ffa/content-tool/live/control' }

/** Page snapshot the fake context script collects. */
const PAGE = {
  url: 'https://fxg.jinritemai.com/ffa/content-tool/live/control',
  title: '直播中控',
  text: '买家电话 13800138000，订单号：202401011234',
}

/** Redacted form of {@link PAGE}. */
const REDACTED_TEXT = '买家电话 [手机号]，订单号：[单号]'

/** Remote methods one page read calls, split into their recordable mocks. */
interface FakeAiRemote {
  readonly remote: AiRemote
  readonly attach: Mock<AiRemote['attach']>
  readonly evaluate: Mock<AiRemote['evaluate']>
  readonly detach: Mock<AiRemote['detach']>
}

/** Implementations a test replaces; omitted methods answer the happy path. */
interface FakeAiOptions {
  readonly attach?: AiRemote['attach']
  readonly evaluate?: AiRemote['evaluate']
  readonly detach?: AiRemote['detach']
}

/**
 * Build a fake broker that records calls.
 * @param options - implementations to replace.
 * @returns the Remote face and the mocks behind it.
 */
function fakeRemote(options: FakeAiOptions = {}): FakeAiRemote {
  const attach = vi.fn<AiRemote['attach']>(options.attach ?? (async () => ({ ok: true, value: TARGET })))
  const evaluate = vi.fn<AiRemote['evaluate']>(options.evaluate ?? (async () => evalResult(PAGE)))
  const detach = vi.fn<AiRemote['detach']>(options.detach ?? (async () => ({ ok: true, value: null })))
  return { remote: { attach, evaluate, detach }, attach, evaluate, detach }
}

/**
 * @param payload - script value the guest returned.
 * @returns a successful wire result carrying its JSON encoding.
 */
function evalResult(payload: unknown): RemoteResult<{ json: string }> {
  return { ok: true, value: { json: JSON.stringify(payload) } }
}

/**
 * @returns a signal for one read run.
 */
function signalOf(): AbortSignal {
  return new AbortController().signal
}

/**
 * @param fake - fake broker to read through.
 * @param targetId - renderer-side guest identity the console reports.
 * @returns the reader under test.
 */
function readerFor(fake: FakeAiRemote, targetId: number | undefined) {
  return createAiContextReader({ remote: fake.remote, platform: () => douyinShop, targetId: () => targetId })
}

/** The redacted snapshot the happy path returns. */
const SNAPSHOT: AiContextSnapshot = {
  ...PAGE,
  redacted: redactPii(PAGE.text),
}

describe('console page-context reader', () => {
  it('attaches the reported guest on the platform origins, evaluates the script, and releases it', async () => {
    const fake = fakeRemote()
    const signal = signalOf()
    const snapshot = await readerFor(fake, 42)(signal)
    expect(fake.attach).toHaveBeenCalledWith({ allowOrigins: douyinShop.origins, targetId: 42 }, signal)
    expect(fake.evaluate).toHaveBeenCalledWith({ targetId: TARGET.targetId, script: CONSOLE_TEXT_SCRIPT }, signal)
    expect(fake.detach).toHaveBeenCalledWith({ targetId: TARGET.targetId })
    expect(snapshot.url).toBe(PAGE.url)
    expect(snapshot.title).toBe(PAGE.title)
    expect(snapshot.text).toBe(PAGE.text)
    expect(snapshot.redacted.text).toBe(REDACTED_TEXT)
    expect(snapshot.redacted.counts).toEqual({ phone: 1, idCard: 0, order: 1, address: 0, total: 2 })
  })

  it('reads the visible page text with one read-only script', () => {
    expect(CONSOLE_TEXT_SCRIPT).not.toContain('JSON.stringify')
    expect(CONSOLE_TEXT_SCRIPT).toContain('location.href')
    expect(CONSOLE_TEXT_SCRIPT).toContain('document.title')
    expect(CONSOLE_TEXT_SCRIPT).toContain('document.body?.innerText')
    expect(CONSOLE_TEXT_SCRIPT).toContain('slice(0, 6000)')
  })

  it('rejects before touching the broker when no platform is open', async () => {
    const fake = fakeRemote()
    const read = createAiContextReader({ remote: fake.remote, platform: () => undefined, targetId: () => 42 })
    await expect(read()).rejects.toThrow('open a platform console before reading page context')
    expect(fake.attach).not.toHaveBeenCalled()
  })

  it('rejects before touching the broker while the console has no guest identity', async () => {
    const fake = fakeRemote()
    await expect(readerFor(fake, undefined)()).rejects.toThrow('the console page is not attached yet')
    expect(fake.attach).not.toHaveBeenCalled()
  })

  it('reports an attach failure with its code and evaluates nothing', async () => {
    const fake = fakeRemote({
      attach: async () => ({ ok: false, error: new RemoteError('workbench/timeout', 'broker timed out', {}) }),
    })
    await expect(readerFor(fake, 42)()).rejects.toThrow('workbench/timeout: broker timed out')
    expect(fake.evaluate).not.toHaveBeenCalled()
    expect(fake.detach).not.toHaveBeenCalled()
  })

  it('reports an evaluate failure and still releases the guest', async () => {
    const fake = fakeRemote({
      evaluate: async () => ({ ok: false, error: new RemoteError('target/closed', 'guest closed', {}) }),
    })
    await expect(readerFor(fake, 42)()).rejects.toThrow('target/closed: guest closed')
    expect(fake.detach).toHaveBeenCalledOnce()
  })

  it.each([
    ['a non-JSON payload', 'not-json'],
    ['a non-object payload', 'null'],
    ['a missing field', JSON.stringify({ url: PAGE.url, title: PAGE.title })],
    ['a non-string field', JSON.stringify({ ...PAGE, text: 42 })],
  ])('rejects probe JSON with %s and still releases the guest', async (_label, json) => {
    const fake = fakeRemote({ evaluate: async () => ({ ok: true, value: { json } }) })
    await expect(readerFor(fake, 42)()).rejects.toThrow()
    expect(fake.detach).toHaveBeenCalledOnce()
  })

  it('clamps the guest text to the script length', async () => {
    const fake = fakeRemote({ evaluate: async () => evalResult({ ...PAGE, text: 'a'.repeat(7_000) }) })
    const snapshot = await readerFor(fake, 42)()
    expect(snapshot.text).toHaveLength(6_000)
  })

  it('keeps a successful read when the release fails', async () => {
    const fake = fakeRemote({ detach: async () => { throw new Error('release transport lost') } })
    const snapshot = await readerFor(fake, 42)()
    expect(snapshot.redacted.text).toBe(REDACTED_TEXT)
    expect(fake.detach).toHaveBeenCalledOnce()
  })
})

describe('draft prompts', () => {
  const t = makeTranslate(en)

  it.each<DraftKind>(['product-script', 'quick-replies', 'comment-reply'])(
    'assembles the %s prompt from the redacted context only',
    (kind) => {
      const prompt = buildDraftPrompt(kind, SNAPSHOT, t)
      expect(prompt).toContain(SNAPSHOT.redacted.text)
      expect(prompt).toContain(SNAPSHOT.url)
      expect(prompt).toContain(SNAPSHOT.title)
      expect(prompt).not.toContain('13800138000')
      expect(prompt).not.toContain('202401011234')
      expect(prompt.toLowerCase()).toContain('draft')
      expect(prompt.toLowerCase()).toContain('review')
    },
  )

  it('keeps the three draft kinds on distinct templates', () => {
    const prompts = new Set([
      buildDraftPrompt('product-script', SNAPSHOT, t),
      buildDraftPrompt('quick-replies', SNAPSHOT, t),
      buildDraftPrompt('comment-reply', SNAPSHOT, t),
    ])
    expect(prompts.size).toBe(3)
  })

  it('selects the template named by the draft kind', () => {
    const params = { context: SNAPSHOT.redacted.text, url: SNAPSHOT.url, title: SNAPSHOT.title }
    expect(buildDraftPrompt('product-script', SNAPSHOT, t)).toBe(t('aiSidebar.prompt.script', params))
    expect(buildDraftPrompt('quick-replies', SNAPSHOT, t)).toBe(t('aiSidebar.prompt.quick', params))
    expect(buildDraftPrompt('comment-reply', SNAPSHOT, t)).toBe(t('aiSidebar.prompt.reply', params))
  })
})
