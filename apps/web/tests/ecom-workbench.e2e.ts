// Keyless assembled-browser coverage for the product workbench bundle: the
// workbench is the startup surface, the harness sidebar starts collapsed in its
// compact product mode, and the launcher reads the Host `workbench` Remote
// namespace. The Web profile has no Electron private channel, so both surfaces
// report automation as unavailable instead of waiting for a shell answer.
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
  }, 180_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('starts on the product workbench with the harness navigation collapsed', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-ecom-workbench'))

    // The product home is the startup main panel: no sidebar entry click and no
    // conversation composer on screen.
    await expect.poll(() => page.getByRole('heading', { name: 'Choose a platform to start live selling' }).count()).toBe(1)
    const frame = page.locator('[class*="frame"]').first()
    await expect.poll(async () => await frame.getAttribute('data-sidebar-collapsed')).not.toBeNull()

    // Opening the harness navigation shows the compact product sidebar: the
    // harness brand block and the New Session button stay out of the view.
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
    await expect.poll(async () => await frame.getAttribute('data-sidebar-collapsed')).toBeNull()
    await expect.poll(() => page.getByRole('button', { name: 'New session', exact: true }).count()).toBe(0)
    await expect.poll(() => page.getByText('DSH Local Build').count()).toBe(0)
    await expect.poll(() => page.getByRole('button', { name: 'Ecom workbench', exact: true }).count()).not.toBe(0)

    // Connect a workspace through the expanded sidebar; that navigation selects
    // the conversation and collapses the sidebar again.
    await connectFreshWorkspace(page, scaffold.workspaceCwd, 'ecom-workbench')
    await expect.poll(async () => await frame.getAttribute('data-sidebar-collapsed')).not.toBeNull()
    await page.getByRole('button', { name: 'Ecom workbench', exact: true }).click()
    await expect.poll(() => page.getByRole('heading', { name: 'Choose a platform to start live selling' }).count()).toBe(1)

    // Web degrades to the platform chooser: both cards are disabled, the
    // unsupported platform is a disabled placeholder, and the desktop-only
    // notice explains why no console can open here.
    const chooser = page.getByRole('region', { name: 'Choose a platform' })
    const douyinShop = chooser.getByRole('button', { name: /Douyin Shop/ })
    await expect.poll(() => douyinShop.count()).toBe(1)
    await expect.poll(async () => await douyinShop.isDisabled()).toBe(true)
    await expect.poll(async () => await chooser.getByRole('button', { name: /Douyin Group Buy/ }).isDisabled()).toBe(true)
    await expect.poll(async () => await chooser.textContent())
      .toContain('Platform sign-in and consoles are only available in the desktop app.')
    const autoEnter = page.getByRole('switch', { name: 'Enter automatically on startup (remember choice)' })
    await expect.poll(async () => await autoEnter.getAttribute('aria-checked')).toBe('false')

    await expect.poll(async () => await page.locator('body').textContent()).toContain('Unavailable')
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
