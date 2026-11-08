// Keyless assembled-browser coverage for the product workbench bundle: the
// sidebar launcher reads the Host `workbench` Remote namespace, and the live
// console follows its event stream. The Web profile has no Electron private
// channel, so both surfaces must report automation as unavailable instead of
// waiting for a shell answer.
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

describe('web e2e: ecom workbench', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      profile: { packages: [], bundles: ['@deepseek-ai/dsh-bundle-ecom-workbench'] },
    })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd, 'ecom-workbench')
  }, 180_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('opens the launcher and live console and reports the missing desktop channel', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-ecom-workbench'))
    await page.getByRole('button', { name: 'Ecom workbench', exact: true }).click()
    await expect.poll(() => page.getByRole('heading', { name: 'Ecom workbench' }).count()).toBe(1)

    const status = page.getByRole('region', { name: 'Service status' })
    await expect.poll(async () => await status.textContent()).toContain('Unavailable')
    await expect.poll(async () => await status.textContent()).toContain('Not configured')
    const today = page.getByRole('region', { name: 'Today' })
    await expect.poll(async () => await today.textContent()).toContain('Yunying is not configured for this deployment.')

    await page.getByRole('button', { name: 'Open live console' }).click()
    const heading = page.getByRole('heading', { name: 'Live console' })
    await expect.poll(() => heading.count()).toBe(1)
    const body = heading.locator('xpath=ancestor::div[contains(@class,"pane")][1]')
    await expect.poll(async () => await body.textContent(), { timeout: 15_000 }).toContain('Unavailable')
    // The Host publishes its starting channel state; the console replays it
    // before any live event arrives.
    await expect.poll(async () => await body.textContent(), { timeout: 15_000 }).toContain('Disconnected')
    await expect.poll(async () => await body.textContent(), { timeout: 15_000 }).not.toContain('No automation activity yet.')

    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
