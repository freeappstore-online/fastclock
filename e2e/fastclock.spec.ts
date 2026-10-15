import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'

// Times are America/New_York (see playwright.config.ts).
const at = (iso: string) => new Date(iso).getTime()
const H = 3600000
const NOW = '2026-07-16T09:00:00-04:00'

// Three goal-met fasts ending on Jul 13, 14 and 15, each crossing midnight.
const FASTS = [
  { id: 'a', startMs: at('2026-07-12T20:00:00-04:00'), endMs: at('2026-07-13T12:00:00-04:00'), goalMs: 16 * H },
  { id: 'b', startMs: at('2026-07-13T20:00:00-04:00'), endMs: at('2026-07-14T14:00:00-04:00'), goalMs: 16 * H },
  { id: 'c', startMs: at('2026-07-14T20:00:00-04:00'), endMs: at('2026-07-15T12:00:00-04:00'), goalMs: 16 * H },
]
const ACTIVE = { presetId: '16:8', goalMs: 16 * H, startedAt: at('2026-07-15T20:00:00-04:00') }

interface Seed {
  fasts?: unknown[]
  active?: unknown
  goal?: unknown
}

/** Write app data, then reload so the app reads it as it would after a restart. */
async function seed(page: Page, data: Seed) {
  await page.goto('/')
  await page.evaluate((d) => {
    localStorage.clear()
    if (d.fasts) localStorage.setItem('fastclock.fasts', JSON.stringify(d.fasts))
    if (d.active) localStorage.setItem('fastclock.active', JSON.stringify(d.active))
    if (d.goal) localStorage.setItem('fastclock.goal', JSON.stringify(d.goal))
  }, data)
  await page.reload()
}

const storage = (page: Page) =>
  page.evaluate(() => ['fastclock.fasts', 'fastclock.active', 'fastclock.goal'].map((k) => localStorage.getItem(k)))

const ring = (page: Page) => page.getByRole('timer').first()
const pastFasts = (page: Page) => page.locator('section[aria-labelledby="list-heading"] > ul > li')
const backup = (page: Page) => page.locator('section[aria-labelledby="backup"]')

test.beforeEach(async ({ page }) => {
  // Keep tests hermetic: no analytics pings or other requests leave localhost.
  await page.route(
    (url) => url.hostname !== 'localhost',
    (route) => route.abort(),
  )
})

test('start and end a fast', async ({ page }) => {
  await page.clock.install({ time: new Date(NOW) })
  await seed(page, {})
  await expect(ring(page)).toHaveAttribute('aria-label', 'Not fasting. Goal 16h')

  await page.getByRole('button', { name: 'Start fast' }).click()
  await expect(page.getByRole('button', { name: 'End fast' })).toBeVisible()
  await expect(page.getByText('Started today at 9:00 AM')).toBeVisible()

  await page.clock.fastForward('02:30:00')
  await expect(ring(page)).toHaveAttribute('aria-label', 'Fasting for 2 hours 30 minutes of a 16h goal')

  // The running fast survives a reload with the right elapsed time.
  await page.reload()
  await expect(ring(page)).toHaveAttribute('aria-label', 'Fasting for 2 hours 30 minutes of a 16h goal')
  await expect(page.getByText(/You're in the recently ate stage/)).toBeVisible()

  await page.getByRole('button', { name: 'End fast' }).click()
  await expect(page.getByRole('button', { name: 'Start fast' })).toBeVisible()
  await expect(page.getByText('Eating window · next fast in')).toBeVisible()
  await expect(page.getByText('Last fast: 2h 30m of 16h.')).toBeVisible()

  await page.getByRole('link', { name: 'See history' }).click()
  await expect(pastFasts(page)).toHaveCount(1)
  await expect(pastFasts(page).first()).toContainText('2h 30m of 16h')
  await expect(pastFasts(page).first()).toContainText('Goal not met')
})

test('change the preset', async ({ page }) => {
  await seed(page, {})
  await page.getByRole('button', { name: '18:6' }).click()
  await expect(page.getByRole('button', { name: '18:6' })).toHaveAttribute('aria-pressed', 'true')
  await expect(ring(page)).toHaveAttribute('aria-label', 'Not fasting. Goal 18h')

  await page.getByRole('button', { name: 'Custom' }).click()
  await page.getByLabel('Hours').fill('14.5')
  await expect(ring(page)).toHaveAttribute('aria-label', 'Not fasting. Goal 14h 30m')

  await page.getByRole('button', { name: 'OMAD 23:1' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'OMAD 23:1' })).toHaveAttribute('aria-pressed', 'true')
  await expect(ring(page)).toHaveAttribute('aria-label', 'Not fasting. Goal 23h')

  // Changing the goal mid-fast keeps the start time.
  await page.getByRole('button', { name: 'Start fast' }).click()
  await page.getByRole('button', { name: '16:8' }).click()
  await expect(ring(page)).toHaveAttribute('aria-label', /of a 16h goal$/)
})

test('edit a past fast', async ({ page }) => {
  await page.clock.install({ time: new Date(NOW) })
  await seed(page, { fasts: FASTS })
  await page.goto('/history')
  const newest = pastFasts(page).first()
  await expect(newest).toContainText('16h of 16h')

  await newest.getByRole('button', { name: /^Edit fast started/ }).click()
  await newest.getByLabel('End').fill('2026-07-14T19:00')
  await newest.getByRole('button', { name: 'Save' }).click()
  await expect(newest.getByRole('alert')).toHaveText('The end time must be after the start time.')

  await newest.getByLabel('End').fill('2026-07-16T10:00')
  await newest.getByRole('button', { name: 'Save' }).click()
  await expect(newest.getByRole('alert')).toHaveText("The end time can't be in the future.")

  await newest.getByLabel('End').fill('2026-07-15T13:30')
  await newest.getByRole('button', { name: 'Save' }).click()
  await expect(newest).toContainText('17h 30m of 16h')

  await page.reload()
  await expect(pastFasts(page).first()).toContainText('17h 30m of 16h')

  // Delete, with confirmation.
  await pastFasts(page).first().getByRole('button', { name: /^Delete fast started/ }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
  await expect(pastFasts(page)).toHaveCount(2)
})

test('history stats, chart and calendar', async ({ page }) => {
  await page.clock.install({ time: new Date(NOW) })
  await seed(page, { fasts: FASTS })
  await page.goto('/history')

  const stats = page.locator('dl')
  await expect(stats).toContainText('Current streak3 days')
  await expect(stats).toContainText('Average fast16h 40m')
  await expect(stats).toContainText('Longest fast18h')

  // Fasts crossing midnight are split across days: Jul 13 = 12h + 4h, Jul 14 = 14h + 4h.
  await expect(page.getByRole('img', { name: /^Fasting hours per day/ })).toHaveAttribute(
    'aria-label',
    'Fasting hours per day, last 7 days: Fri 0h, Sat 0h, Sun 4h, Mon 16h, Tue 18h, Wed 12h, Thu 0h. Total 50h.',
  )
  await page.getByText('Show as table').click()
  await expect(page.locator('details tbody tr')).toHaveCount(7)
  await expect(page.getByRole('row', { name: 'Tuesday, Jul 14 18h' })).toBeVisible()

  await expect(page.getByLabel('Monday, Jul 13: 1 fast, goal met')).toBeVisible()
  await expect(page.getByLabel('Wednesday, Jul 15: 1 fast, goal met')).toBeVisible()
  await expect(page.getByLabel('Thursday, Jul 16: no fasts')).toHaveAttribute('aria-current', 'date')
})

test('export and import round-trip', async ({ page }, testInfo) => {
  await seed(page, { fasts: FASTS, active: ACTIVE, goal: { presetId: 'custom', goalMs: 14.5 * H } })
  const before = await storage(page)
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Your data stays on this device' })).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export backup' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^fastclock-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const file = testInfo.outputPath('backup.json')
  await download.saveAs(file)
  expect(JSON.parse(readFileSync(file, 'utf8')).fasts).toHaveLength(3)
  await expect(backup(page).getByRole('status')).toHaveText('Exported 3 fasts and your running fast.')

  await page.getByRole('button', { name: 'Erase all FastClock data on this device' }).click()
  await page.getByRole('button', { name: 'Erase everything' }).click()
  expect(await storage(page)).toEqual([null, null, null])

  // A damaged file is rejected and changes nothing.
  const bad = join(testInfo.outputDir, 'bad.json')
  writeFileSync(bad, JSON.stringify({ format: 'fastclock-backup', version: 1, fasts: [{ id: 1 }] }))
  await page.getByLabel('Backup file to restore').setInputFiles(bad)
  await expect(backup(page).getByRole('alert')).toHaveText('Some fasts in that backup are damaged, so nothing was restored.')
  expect(await storage(page)).toEqual([null, null, null])

  // Restoring asks first, then brings back everything exactly.
  await page.getByLabel('Backup file to restore').setInputFiles(file)
  const dialog = page.getByRole('dialog', { name: 'Restore this backup?' })
  await expect(dialog).toContainText('replaces the 0 fasts on this device with the 3 fasts in the file')
  await dialog.getByRole('button', { name: 'Restore' }).click()
  await expect(backup(page).getByRole('status')).toHaveText('Restored 3 fasts.')
  expect(await storage(page)).toEqual(before)

  await page.goto('/history')
  await expect(pastFasts(page)).toHaveCount(3)
})

test('works offline once loaded (PWA)', async ({ page, context }) => {
  await seed(page, { fasts: FASTS, active: ACTIVE })
  // Wait for the service worker to install and take control of the page.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('button', { name: 'End fast' })).toBeVisible()
  await expect(ring(page)).toHaveAttribute('aria-label', /^Fasting for \d+ hours/)

  // A deep link that was never visited still loads from the cache (SPA fallback).
  await page.goto('/history')
  await expect(page.getByRole('heading', { name: 'History', level: 1 })).toBeVisible()
  await expect(pastFasts(page)).toHaveCount(3)
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'Your data stays on this device' })).toBeVisible()
  await context.setOffline(false)
})

test('shows the general-information note', async ({ page }) => {
  await seed(page, {})
  await expect(page.getByText(/general information about time since eating, not medical advice/)).toBeVisible()
  await page.goto('/about')
  await expect(page.getByText(/general information only, not medical advice/)).toBeVisible()
})

// Every screen, in both themes: the theme follows the system setting, and
// axe finds no WCAG 2 A/AA violations (including colour contrast).
//
// The top bar (logo, nav, text size, theme, Sign in) is the platform's shared
// Shell from @freeappstore/sdk, identical in every app and styled by the
// platform. Its current-nav-link and Sign in contrast are platform issues
// (as in Sleep Sounds), so the app's audit excludes the header.
const PLATFORM_HEADER = '#root header'
const SCREENS = [
  { name: 'Timer (idle)', path: '/', data: { fasts: FASTS } },
  { name: 'Timer (fasting)', path: '/', data: { fasts: FASTS, active: ACTIVE } },
  { name: 'History', path: '/history', data: { fasts: FASTS, active: ACTIVE } },
  { name: 'Privacy', path: '/privacy', data: { fasts: FASTS } },
  { name: 'About', path: '/about', data: {} },
]

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme })

    for (const screen of SCREENS) {
      test(`${screen.name} follows the theme and passes axe`, async ({ page }) => {
        await page.clock.install({ time: new Date(NOW) })
        await seed(page, screen.data)
        await page.goto(screen.path)
        await expect(page.locator('main h1')).toBeVisible()

        expect(await page.evaluate(() => document.documentElement.dataset.theme ?? 'light')).toBe(scheme)
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(scheme)

        // Let the ring's transition settle so contrast is measured on final colours.
        await page.waitForTimeout(1100)
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .exclude(PLATFORM_HEADER)
          .analyze()
        const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
        expect(summary).toEqual([])
      })
    }
  })
}

test('every screen fits a 320px-wide phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await seed(page, { fasts: FASTS, active: ACTIVE })
  for (const path of ['/', '/history', '/privacy', '/about']) {
    await page.goto(path)
    await expect(page.locator('main h1')).toBeVisible()
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.fc-page')!
      return {
        page: el.scrollWidth - el.clientWidth,
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(overflow, path).toEqual({ page: 0, doc: 0 })
  }
})
