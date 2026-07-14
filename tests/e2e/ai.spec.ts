import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
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

async function chooseCopyAction(
  page: Page,
  name: 'Copy Markdown' | 'Copy for AI',
): Promise<void> {
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  await page.getByRole('menuitem', { name }).click()
}

test('copy actions use base-aware Markdown and preserve page navigation', async ({
  context,
  page,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(serverUrl()).origin,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(serverUrl('guide/'))

  const copy = page.getByRole('button', { name: 'Copy', exact: true })
  await expect(copy).toBeVisible()
  expect(await page.evaluate(() => Object.hasOwn(navigator, 'clipboard'))).toBe(
    false,
  )

  await copy.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('menuitem', { name: 'Copy Markdown' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')

  const originalUrl = page.url()
  await chooseCopyAction(page, 'Copy Markdown')
  await expect(page.getByRole('status')).toHaveText('Markdown copied')
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(expectedMarkdown)
  expect(page.url()).toBe(originalUrl)

  await chooseCopyAction(page, 'Copy for AI')
  await expect(page.getByRole('status')).toHaveText('AI context copied')
  const copiedContext = await page.evaluate(() =>
    navigator.clipboard.readText(),
  )
  expect(copiedContext).toContain('# Getting Started')
  expect(copiedContext).toContain(`Source: ${serverUrl('guide/')}`)
  expect(copiedContext).not.toContain('Documentation sidebar')
  expect(copiedContext).not.toContain('Page navigation')
  expect(page.url()).toBe(originalUrl)

  await page.getByRole('link', { name: 'Next: About' }).click()
  await expect(page).toHaveURL(serverUrl('about'))
})

test('copy actions expose fetch and clipboard failures to assistive tech', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const clipboard = navigator.clipboard
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: clipboard.readText.bind(clipboard),
        writeText(): Promise<void> {
          return Promise.reject(new DOMException('Denied', 'NotAllowedError'))
        },
      },
    })
  })
  await page.route('**/guide/index.md', async (route) => {
    await route.fulfill({ status: 503, body: 'Unavailable' })
  })
  await page.goto(serverUrl('guide/'))

  await chooseCopyAction(page, 'Copy Markdown')
  await expect(page.getByRole('alert')).toHaveText(
    'Could not fetch page Markdown. Please try again.',
  )

  await page.unroute('**/guide/index.md')
  await chooseCopyAction(page, 'Copy for AI')
  await expect(page.getByRole('alert')).toHaveText(
    'Could not access the clipboard. Please try again.',
  )
})
