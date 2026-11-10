/** Floating assistant layout: the embedded Conversation fills its body and the composer stays at the floor. */
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

const STORAGE_KEY = 'ecomWorkbench.assistantWindow.v1'

describe('web e2e: floating assistant layout', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      profile: { packages: [], bundles: ['@deepseek-ai/dsh-bundle-ecom-workbench'] },
    })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale: 'en-US' })
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 180_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  /** Seed the assistant rectangle and reload so the product store reads it. */
  async function seedRect(width: number, height: number): Promise<void> {
    await page.evaluate(([key, w, h]) => {
      localStorage.setItem(key, JSON.stringify({ version: 1, rect: { x: 100, y: 100, width: w, height: h } }))
    }, [STORAGE_KEY, width, height] as const)
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }

  /** Open the assistant and measure its embedded layout. */
  async function measure(): Promise<Record<'window' | 'body' | 'content' | 'seat' | 'card', DOMRect>> {
    await page.getByRole('button', { name: 'AI assistant', exact: true }).first().click()
    const section = page.locator('section[aria-label="AI assistant"]').first()
    await section.waitFor({ state: 'attached' })
    return await section.evaluate((root) => {
      const rect = (el: Element): DOMRect => el.getBoundingClientRect()
      const body = root.querySelector(':scope > div[class*="body"]')!
      const content = root.querySelector('[data-conversation-content]')!
      const seat = root.querySelector('[data-composer-seat]')!
      const card = root.querySelector('[data-composer-card]')!
      return { window: rect(root), body: rect(body), content: rect(content), seat: rect(seat), card: rect(card) }
    })
  }

  for (const [width, height] of [[520, 640], [400, 440]] as const) {
    it(`fills and docks the composer at ${width}x${height}`, async () => {
      await seedRect(width, height)
      const m = await measure()
      expect(Math.abs(m.content.height - m.body.height)).toBeLessThanOrEqual(1)
      expect(Math.abs(m.seat.bottom - m.body.bottom)).toBeLessThanOrEqual(4)
      expect(m.card.height).toBeLessThanOrEqual(96)
      expect(m.card.top).toBeGreaterThanOrEqual(m.window.top)
      expect(m.card.bottom).toBeLessThanOrEqual(m.window.bottom + 1)
      // the composer card is fully visible inside the floating window
      const card = page.locator('section[aria-label="AI assistant"] [data-composer-card]').first()
      expect(await card.isVisible()).toBe(true)
      expect(await card.boundingBox()).not.toBeNull()
    }, 60_000)
  }
})
