import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { build } from '../../src/node/build'
import { createPreviewServer, type SilenServer } from '../../src/node/server'

const root = path.resolve('tests/fixtures/basic')
let preview: SilenServer | undefined
let expectedMarkdown = ''

test.setTimeout(120_000)

function serverUrl(route = ''): string {
  if (!preview) throw new Error('Expected the preview server to be running')
  return new URL(route, preview.url).href
}

test.beforeAll(async () => {
  const result = await build(root)
  expectedMarkdown = await readFile(
    path.join(result.outDir, 'guide/index.md'),
    'utf8',
  )
  preview = await createPreviewServer(root, { port: 0 })
})

test.afterAll(async () => {
  await preview?.close()
  await rm(path.join(root, '.silen/dist'), { force: true, recursive: true })
  await rm(path.join(root, '.silen/.temp'), { force: true, recursive: true })
})

test.beforeEach(async ({ page }) => {
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
          if (sessionStorage.getItem('silen-clipboard-fail') === '1') {
            return Promise.reject(new DOMException('Denied', 'NotAllowedError'))
          }
          sessionStorage.setItem('silen-browser-clipboard', value)
          return Promise.resolve()
        },
      },
    })
  })
})

test('copy actions use base-aware Markdown and preserve page navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(serverUrl('guide/'))

  const copyMarkdown = page.getByRole('button', { name: 'Copy Markdown' })
  const copyForAi = page.getByRole('button', { name: 'Copy for AI' })
  await expect(copyMarkdown).toBeVisible()
  await expect(copyForAi).toBeVisible()

  const originalUrl = page.url()
  await copyMarkdown.click()
  await expect(page.getByRole('status')).toHaveText('Markdown copied')
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(expectedMarkdown)
  expect(page.url()).toBe(originalUrl)

  await copyForAi.click()
  await expect(page.getByRole('status')).toHaveText('AI context copied')
  const context = await page.evaluate(() => navigator.clipboard.readText())
  expect(context).toContain('# Getting Started')
  expect(context).toContain(`Source: ${serverUrl('guide/')}`)
  expect(context).not.toContain('Documentation sidebar')
  expect(context).not.toContain('Page navigation')
  expect(page.url()).toBe(originalUrl)

  await page.getByRole('link', { name: 'Next: About' }).click()
  await expect(page).toHaveURL(serverUrl('about'))
})

test('copy actions expose fetch and clipboard failures to assistive tech', async ({
  page,
}) => {
  await page.route('**/guide/index.md', async (route) => {
    await route.fulfill({ status: 503, body: 'Unavailable' })
  })
  await page.goto(serverUrl('guide/'))

  await page.getByRole('button', { name: 'Copy Markdown' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Could not fetch page Markdown. Please try again.',
  )

  await page.unroute('**/guide/index.md')
  await page.evaluate(() => sessionStorage.setItem('silen-clipboard-fail', '1'))
  await page.getByRole('button', { name: 'Copy for AI' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    'Could not access the clipboard. Please try again.',
  )
})
