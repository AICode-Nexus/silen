import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { build } from '../../src/node/build'
import { createPreviewServer, type SilenServer } from '../../src/node/server'

const root = path.resolve('tests/fixtures/basic')
const askAiRoot = path.resolve('tests/fixtures/ask-ai-enabled')
let preview: SilenServer | undefined
let askAiPreview: SilenServer | undefined
let expectedMarkdown = ''

test.setTimeout(120_000)

function serverUrl(route = ''): string {
  if (!preview) throw new Error('Expected the preview server to be running')
  return new URL(route, preview.url).href
}

function askAiServerUrl(route = ''): string {
  if (!askAiPreview)
    throw new Error('Expected the Ask AI preview to be running')
  return new URL(route, askAiPreview.url).href
}

test.beforeAll(async () => {
  const [result] = await Promise.all([build(root), build(askAiRoot)])
  expectedMarkdown = await readFile(
    path.join(result.outDir, 'guide/index.md'),
    'utf8',
  )
  ;[preview, askAiPreview] = await Promise.all([
    createPreviewServer(root, { port: 0 }),
    createPreviewServer(askAiRoot, { port: 0 }),
  ])
})

test.afterAll(async () => {
  await Promise.all([preview?.close(), askAiPreview?.close()])
  await Promise.all(
    [root, askAiRoot].flatMap((fixture) => [
      rm(path.join(fixture, '.silen/dist'), { force: true, recursive: true }),
      rm(path.join(fixture, '.silen/.temp'), { force: true, recursive: true }),
    ]),
  )
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

  await expect(page.getByRole('button', { name: 'Ask AI' })).toHaveCount(0)

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

test('configured Ask AI uses the endpoint NDJSON protocol safely', async ({
  page,
}) => {
  const requestBodies: unknown[] = []
  await page.route('**/api/ask', async (route) => {
    const body: unknown = route.request().postDataJSON()
    requestBodies.push(body)
    const question = (
      body as { messages?: Array<{ content?: unknown }> }
    ).messages?.at(-1)?.content

    if (question === 'abort') {
      await new Promise((resolve) => setTimeout(resolve, 500))
      await route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: '{"type":"text","value":"late answer"}\n',
      })
      return
    }
    if (question === 'error') {
      await route.fulfill({
        status: 502,
        contentType: 'text/plain',
        body: 'raw provider failure sk-must-not-render',
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/x-ndjson',
      body: [
        '{"type":"text","value":"Install "}',
        '{"type":"text","value":"with pnpm."}',
        '{"type":"citation","title":"Reference","url":"/reference?from=ask-ai#sources"}',
        '{"type":"citation","title":"Unsafe script","url":"javascript:alert(1)"}',
      ].join('\n'),
    })
  })

  await page.goto(askAiServerUrl())
  const originalUrl = page.url()
  await page.getByRole('button', { name: 'Ask AI' }).click()
  const dialog = page.getByRole('dialog', { name: 'Ask AI' })
  await expect(dialog).toBeVisible()
  await page.getByRole('textbox', { name: 'Question' }).fill('install')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(dialog.getByText('Install')).toBeVisible()
  await expect(dialog.getByText('with pnpm.')).toBeVisible()
  await expect(dialog.getByRole('link', { name: 'Reference' })).toHaveAttribute(
    'rel',
    'noreferrer',
  )
  await expect(dialog.getByRole('link', { name: 'Unsafe script' })).toHaveCount(
    0,
  )
  await expect(dialog.getByText('Unsafe script')).toBeVisible()
  expect(requestBodies[0]).toEqual({
    route: '/',
    messages: [{ role: 'user', content: 'install' }],
  })

  const popupPromise = page.waitForEvent('popup')
  await dialog.getByRole('link', { name: 'Reference' }).click()
  const popup = await popupPromise
  await popup.waitForLoadState('domcontentloaded')
  await expect(popup).toHaveURL(askAiServerUrl('reference?from=ask-ai#sources'))
  await popup.close()
  expect(page.url()).toBe(originalUrl)

  await page.getByRole('textbox', { name: 'Question' }).fill('abort')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Generating answer')
  await dialog.getByRole('button', { name: 'Close' }).click()
  await expect(dialog).toBeHidden()
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Ask AI' }).click()
  await expect(dialog.getByText('late answer')).toHaveCount(0)

  await page.getByRole('textbox', { name: 'Question' }).fill('error')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    'The AI provider could not complete this request.',
  )
  await expect(dialog.getByText(/sk-must-not-render/)).toHaveCount(0)
  expect(page.url()).toBe(originalUrl)
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
