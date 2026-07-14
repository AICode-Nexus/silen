import { rm } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { build } from '../../src/node/build'
import {
  createDevServer,
  createPreviewServer,
  type SilenServer,
} from '../../src/node/server'

const root = path.resolve('tests/fixtures/basic')
let preview: SilenServer | undefined
let development: SilenServer | undefined
const browserProblems = new WeakMap<Page, string[]>()
const expectedResourceErrors = new WeakMap<Page, Set<string>>()

test.setTimeout(120_000)

function serverUrl(server: SilenServer | undefined, route = ''): string {
  if (!server) throw new Error('Expected the Silen test server to be running')
  return new URL(route, server.url).href
}

test.beforeAll(async () => {
  await build(root)
  preview = await createPreviewServer(root, { port: 0 })
  development = await createDevServer(root, { port: 0 })
})

test.afterAll(async () => {
  await Promise.all([preview?.close(), development?.close()])
  await rm(path.join(root, '.silen/dist'), { force: true, recursive: true })
  await rm(path.join(root, '.silen/.temp'), { force: true, recursive: true })
})

test.beforeEach(({ page }) => {
  const problems: string[] = []
  browserProblems.set(page, problems)
  expectedResourceErrors.set(page, new Set())
  page.on('console', (message) => {
    const text = message.text()
    const location = message.location().url
    if (
      message.type() === 'error' &&
      text.startsWith('Failed to load resource:') &&
      expectedResourceErrors.get(page)?.has(location)
    ) {
      return
    }
    if (
      message.type() === 'error' ||
      (message.type() === 'warning' &&
        /accessib|aria-|hydration|did not match|invalid.*nest/i.test(text))
    ) {
      problems.push(
        `console ${message.type()}: ${text}${location ? ` (${location})` : ''}`,
      )
    }
  })
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`))
})

test.afterEach(({ page }) => {
  expect(browserProblems.get(page) ?? []).toEqual([])
})

test('serves the complete built theme at the exact desktop boundary', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText(): Promise<string> {
          return Promise.resolve(
            sessionStorage.getItem('silen-browser-clipboard') ?? '',
          )
        },
        writeText(value: string): Promise<void> {
          sessionStorage.setItem('silen-browser-clipboard', value)
          return Promise.resolve()
        },
      },
    })
  })
  await page.setViewportSize({ width: 1_200, height: 900 })
  await page.goto(serverUrl(preview))

  await expect(page.locator('[data-custom-root]')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Silen browser fixture', level: 1 }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Read the guide' }),
  ).toHaveAttribute('href', '/project/guide/')

  await page.getByRole('link', { name: 'Read the guide' }).click()
  await expect(page).toHaveURL(serverUrl(preview, 'guide/'))
  await expect(
    page.getByRole('heading', { name: 'Getting Started', level: 1 }),
  ).toBeVisible()

  await page.setViewportSize({ width: 959, height: 900 })
  await expect(
    page.getByRole('button', { name: 'Open navigation' }),
  ).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Documentation sidebar' }),
  ).toBeHidden()

  await page.setViewportSize({ width: 960, height: 900 })
  await expect(
    page.getByRole('button', { name: 'Open navigation' }),
  ).toBeHidden()
  await expect(
    page.getByRole('navigation', { name: 'Documentation sidebar' }),
  ).toBeVisible()

  const copy = page.getByRole('button', { name: 'Copy code' })
  await expect(page.locator('.shiki')).toBeVisible()
  await expect(copy).toHaveAttribute('data-silen-copy-ready', '')
  await copy.click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('pnpm add silen')

  await page.goto(serverUrl(preview, 'about'))
  await expect(page.locator('[data-demo]')).toContainText(
    'Custom theme component',
  )
  await expect(page.locator('[data-custom-root]')).toBeVisible()
})

test('supports mobile Sheet focus, lazy keyboard search, and no-flash appearance persistence', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(serverUrl(preview))

  const navigationTrigger = page.getByRole('button', {
    name: 'Open navigation',
  })
  await navigationTrigger.click()
  const navigation = page.getByRole('dialog', {
    name: 'Documentation navigation',
  })
  await expect(navigation).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Home' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(navigation).toBeHidden()
  await expect(navigationTrigger).toBeFocused()

  const appearance = page.getByRole('button', { name: /^Appearance:/ })
  await expect(appearance).toHaveAttribute('aria-label', 'Appearance: System')
  await appearance.click()
  await appearance.click()
  await expect(appearance).toHaveAttribute('aria-label', 'Appearance: Dark')
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('silen-theme')))
    .toBe('dark')

  await page.addInitScript(() => {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        document.documentElement.dataset.appearanceAtReady =
          document.documentElement.classList.contains('dark') ? 'dark' : 'light'
      },
      { once: true },
    )
  })
  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.locator('html')).toHaveAttribute(
    'data-appearance-at-ready',
    'dark',
  )
  await expect(appearance).toHaveAttribute('aria-label', 'Appearance: Dark')

  await page.keyboard.press('Control+k')
  const search = page.getByRole('dialog', { name: 'Search documentation' })
  await expect(search).toBeVisible()
  const searchInput = search.getByRole('combobox', {
    name: 'Search documentation',
  })
  await expect(searchInput).toBeFocused()
  await searchInput.fill('install')
  await expect(search.getByRole('option')).toContainText('Getting Started')
  await searchInput.press('ArrowDown')
  await searchInput.press('Enter')
  await expect(page).toHaveURL(serverUrl(preview, 'guide/'))
  await expect(search).toBeHidden()
})

test('uses the custom theme for development SSR, hydration, and 404 rendering', async ({
  page,
}) => {
  const missingUrl = serverUrl(development, 'missing')
  expectedResourceErrors.get(page)?.add(missingUrl)
  const missingSsr = await fetch(missingUrl)
  expect(missingSsr.status).toBe(404)
  expect(await missingSsr.text()).toContain('data-custom-root=""')
  const missing = await page.goto(missingUrl)
  expect(missing?.status()).toBe(404)
  await expect(page.locator('[data-custom-root]')).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '404', level: 1 }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Return home' })).toHaveAttribute(
    'href',
    '/project/',
  )

  const aboutUrl = serverUrl(development, 'about')
  const aboutSsr = await fetch(aboutUrl)
  const aboutSsrBody = await aboutSsr.text()
  expect(aboutSsr.status, aboutSsrBody).toBe(200)
  expect(aboutSsrBody).toContain('data-demo=""')
  const about = await page.goto(aboutUrl)
  expect(about?.status()).toBe(200)
  await expect(page.locator('[data-demo]')).toContainText(
    'Custom theme component',
  )
})
