import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AiPageActions } from '../../src/theme-default/components/ai-actions'
import { DocLayout } from '../../src/theme-default/components/doc'
import { TestSiteProvider } from '../helpers/test-site-provider'

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function clipboard(): ReturnType<
  typeof vi.fn<(value: string) => Promise<void>>
> {
  const writeText = vi.fn<(value: string) => Promise<void>>(() =>
    Promise.resolve(),
  )
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  return writeText
}

async function chooseCopyAction(
  user: ReturnType<typeof userEvent.setup>,
  name: 'Copy Markdown' | 'Copy for AI',
): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'Copy' }))
  await user.click(screen.getByRole('menuitem', { name }))
}

it('exposes both copy actions from one accessible dropdown trigger', async () => {
  const user = userEvent.setup()
  render(
    <AiPageActions
      title="Install"
      markdownUrl="/guide/install.md"
      canonicalUrl="https://docs.example/guide/install"
    />,
  )

  expect(screen.getAllByRole('button')).toHaveLength(1)
  const trigger = screen.getByRole('button', { name: 'Copy' })
  expect(trigger.getAttribute('aria-haspopup')).toBe('menu')

  await user.click(trigger)
  expect(screen.getByRole('menuitem', { name: 'Copy Markdown' })).not.toBeNull()
  expect(screen.getByRole('menuitem', { name: 'Copy for AI' })).not.toBeNull()
})

it('copies normalized Markdown without page navigation content', async () => {
  const user = userEvent.setup()
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response('# Install\r\n\r\nRun pnpm.\r\n\r\n'))
  vi.stubGlobal('fetch', fetch)
  const writeText = clipboard()

  render(
    <section>
      <nav hidden>Previous: Introduction Next: API</nav>
      <AiPageActions
        title="Install"
        markdownUrl="/guide/install.md"
        canonicalUrl="https://docs.example/guide/install"
      />
    </section>,
  )

  await chooseCopyAction(user, 'Copy Markdown')

  expect(fetch).toHaveBeenCalledWith('/guide/install.md')
  expect(writeText).toHaveBeenCalledWith('# Install\n\nRun pnpm.\n')
  expect(writeText.mock.calls[0]?.[0]).not.toContain('Previous:')
  expect(screen.getByRole('status').textContent).toBe('Markdown copied')
})

it('copies AI context with page title and canonical source attribution', async () => {
  const user = userEvent.setup()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('# Install\n\nRun pnpm.')),
  )
  const writeText = clipboard()

  render(
    <AiPageActions
      title="Install"
      markdownUrl="/guide/install.md"
      canonicalUrl="https://docs.example/guide/install?source=menu#install"
    />,
  )

  await chooseCopyAction(user, 'Copy for AI')

  expect(writeText).toHaveBeenCalledWith(
    [
      '# Install',
      '',
      'Source: https://docs.example/guide/install',
      '',
      '# Install',
      '',
      'Run pnpm.',
      '',
    ].join('\n'),
  )
  expect(screen.getByRole('status').textContent).toBe('AI context copied')
})

it('uses the document route to create base-aware Markdown and canonical URLs', async () => {
  const user = userEvent.setup()
  const fetch = vi
    .fn()
    .mockResolvedValue(new Response('# Install\n\nRun pnpm.\n'))
  vi.stubGlobal('fetch', fetch)
  const writeText = clipboard()

  render(
    <TestSiteProvider
      base="/project/"
      frontmatter={{ title: 'Install' }}
      path="/guide/"
    >
      <DocLayout>
        <h1>Install</h1>
      </DocLayout>
    </TestSiteProvider>,
  )

  const article = screen.getByRole('article')
  await user.click(within(article).getByRole('button', { name: 'Copy' }))
  await user.click(screen.getByRole('menuitem', { name: 'Copy for AI' }))

  expect(fetch).toHaveBeenCalledWith('/project/guide/index.md')
  expect(writeText).toHaveBeenCalledWith(
    expect.stringContaining(
      `Source: ${new URL('/project/guide/', window.location.href).href}`,
    ),
  )
})

it('hides copy actions when global Markdown routes are disabled', () => {
  render(
    <TestSiteProvider
      ai={{
        llmsTxt: true,
        llmsFullTxt: true,
        markdownRoutes: false,
        index: true,
      }}
    >
      <DocLayout>
        <h1>Install</h1>
      </DocLayout>
    </TestSiteProvider>,
  )

  expect(screen.queryByRole('group', { name: 'Page copy actions' })).toBeNull()
})

it.each([
  ['draft page', { draft: true }],
  ['page excluded from AI artifacts', { ai: false }],
] as const)('hides copy actions for a %s', (_name, frontmatter) => {
  render(
    <TestSiteProvider frontmatter={{ title: 'Install', ...frontmatter }}>
      <DocLayout>
        <h1>Install</h1>
      </DocLayout>
    </TestSiteProvider>,
  )

  expect(screen.queryByRole('group', { name: 'Page copy actions' })).toBeNull()
})

it('disables both actions while copying and ignores repeated clicks', async () => {
  const user = userEvent.setup()
  let resolveResponse!: (response: Response) => void
  const response = new Promise<Response>((resolve) => {
    resolveResponse = resolve
  })
  const fetch = vi.fn(() => response)
  vi.stubGlobal('fetch', fetch)
  clipboard()

  render(
    <AiPageActions
      title="Install"
      markdownUrl="/guide/install.md"
      canonicalUrl="https://docs.example/guide/install"
    />,
  )

  const trigger = screen.getByRole('button', { name: 'Copy' })
  await user.click(trigger)
  await user.click(screen.getByRole('menuitem', { name: 'Copy Markdown' }))

  expect((trigger as HTMLButtonElement).disabled).toBe(true)
  expect(trigger.getAttribute('aria-busy')).toBe('true')
  expect(screen.getByRole('status').textContent).toBe('Copying Markdown')

  await user.click(trigger)
  expect(fetch).toHaveBeenCalledTimes(1)

  resolveResponse(new Response('# Install'))
  expect(await screen.findByText('Markdown copied')).not.toBeNull()
  expect((trigger as HTMLButtonElement).disabled).toBe(false)
})

it('reports failed Markdown fetches accessibly and leaves actions retryable', async () => {
  const user = userEvent.setup()
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('Unavailable', { status: 503 })),
  )
  const writeText = clipboard()

  render(
    <AiPageActions
      title="Install"
      markdownUrl="/guide/install.md"
      canonicalUrl="https://docs.example/guide/install"
    />,
  )

  const action = screen.getByRole('button', { name: 'Copy' })
  await chooseCopyAction(user, 'Copy Markdown')

  expect(screen.getByRole('alert').textContent).toBe(
    'Could not fetch page Markdown. Please try again.',
  )
  expect(writeText).not.toHaveBeenCalled()
  expect((action as HTMLButtonElement).disabled).toBe(false)
})

it('reports clipboard permission failures accessibly', async () => {
  const user = userEvent.setup()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('# Install\n')))
  const writeText = clipboard()
  writeText.mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))

  render(
    <AiPageActions
      title="Install"
      markdownUrl="/guide/install.md"
      canonicalUrl="https://docs.example/guide/install"
    />,
  )

  await chooseCopyAction(user, 'Copy for AI')

  expect(screen.getByRole('alert').textContent).toBe(
    'Could not access the clipboard. Please try again.',
  )
})
