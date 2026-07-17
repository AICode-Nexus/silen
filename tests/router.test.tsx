import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Link,
  RouterProvider,
  useRoute,
  useRouter,
  type Router,
} from '../src/client/router'

function createRouter(overrides: Partial<Router> = {}): Router {
  return {
    path: '/project/',
    base: '/project/',
    go: vi.fn().mockResolvedValue(undefined),
    prefetch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function NativeNavigationGuard({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element {
  return <div onClick={(event) => event.preventDefault()}>{children}</div>
}

function renderLink(
  router: Router,
  props: AnchorHTMLAttributes<HTMLAnchorElement>,
): void {
  render(
    <RouterProvider value={router}>
      <NativeNavigationGuard>
        <Link {...props}>Destination</Link>
      </NativeNavigationGuard>
    </RouterProvider>,
  )
}

function handledRejectedPromise(error: Error): {
  catchHandler: ReturnType<typeof vi.spyOn>
  promise: Promise<void>
} {
  const promise = Promise.reject<void>(error)
  void promise.catch(() => undefined)
  const catchHandler = vi.spyOn(promise, 'catch')
  return { catchHandler, promise }
}

describe('client router hooks', () => {
  afterEach(cleanup)

  it('exposes the router and its current URL through the public hooks', () => {
    const router = createRouter({ path: '/project/guide?mode=full#install' })

    function Probe(): React.JSX.Element {
      const currentRouter = useRouter()
      const route = useRoute()
      return (
        <output>
          {currentRouter === router ? 'same' : 'different'}:{route}
        </output>
      )
    }

    render(
      <RouterProvider value={router}>
        <Probe />
      </RouterProvider>,
    )

    expect(
      screen.getByText('same:/project/guide?mode=full#install'),
    ).toBeTruthy()
  })
})

describe('Link', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/project/')
  })

  afterEach(cleanup)

  it.each([
    ['/project/guide', '/project/guide'],
    ['guide?mode=full#install', 'guide?mode=full#install'],
    ['#install', '#install'],
    [
      `${window.location.origin}/project/guide?mode=full#install`,
      `${window.location.origin}/project/guide?mode=full#install`,
    ],
  ])('intercepts an internal href %s', (href, expected) => {
    const router = createRouter()
    renderLink(router, { href })

    fireEvent.click(screen.getByRole('link', { name: 'Destination' }))

    expect(router.go).toHaveBeenCalledOnce()
    expect(router.go).toHaveBeenCalledWith(expected)
  })

  it('mounts an authored root-relative documentation link inside the configured base', () => {
    const router = createRouter()
    renderLink(router, { href: '/guide/' })
    const link = screen.getByRole('link', { name: 'Destination' })

    expect(link.getAttribute('href')).toBe('/project/guide/')
    fireEvent.focus(link)
    fireEvent.click(link)

    expect(router.prefetch).toHaveBeenCalledWith('/project/guide/')
    expect(router.go).toHaveBeenCalledWith('/project/guide/')
  })

  it('keeps an already mounted documentation link idempotent', () => {
    const router = createRouter()
    renderLink(router, { href: '/project/guide/' })

    expect(
      screen.getByRole('link', { name: 'Destination' }).getAttribute('href'),
    ).toBe('/project/guide/')
  })

  it.each([
    ['/../outside/?mode=literal#top', '/project/outside/?mode=literal#top'],
    ['/%2e%2e/outside/', '/project/outside/'],
    ['/project/../outside/', '/project/outside/'],
    ['/project/%2E%2E/outside/', '/project/outside/'],
  ])('canonicalizes dot segments in authored href %s', (href, expected) => {
    const router = createRouter()
    renderLink(router, { href })
    const link = screen.getByRole('link', { name: 'Destination' })

    expect(link.getAttribute('href')).toBe(expected)
    fireEvent.click(link)

    expect(router.go).toHaveBeenCalledWith(expected)
  })

  it.each([
    ['/..\t/outside/', '/project/outside/'],
    ['/.\n./outside/', '/project/outside/'],
    ['/project/..\r/outside/', '/project/outside/'],
    ['/project/%2e\r%2e/outside/', '/project/outside/'],
    ['/guide\tname/?mode=full\n#top', '/project/guidename/?mode=full#top'],
    ['\u000b /guide/', '/project/guide/'],
    ['\u000b \\guide/', '/project/guide/'],
    ['\u0000 \t/project/../outside/', '/project/outside/'],
  ])(
    'keeps WHATWG-normalized root-relative href %s inside the base',
    (href, expected) => {
      const router = createRouter()
      renderLink(router, { href })
      const link = screen.getByRole<HTMLAnchorElement>('link', {
        name: 'Destination',
      })

      expect(link.getAttribute('href')).toBe(expected)
      expect(new URL(link.href).pathname).toSatisfy(
        (pathname: string) =>
          pathname === '/project' || pathname.startsWith('/project/'),
      )
      fireEvent.click(link)

      expect(router.go).toHaveBeenCalledWith(expected)
    },
  )

  it('matches a human-readable Unicode and space href against a canonical encoded base', () => {
    const base = '/%E6%96%87%E6%A1%A3%20docs/'
    window.history.replaceState(null, '', base)
    const router = createRouter({ base, path: base })
    renderLink(router, { href: '/文档 docs/guide' })

    fireEvent.click(screen.getByRole('link', { name: 'Destination' }))

    expect(router.go).toHaveBeenCalledWith('/文档 docs/guide')
  })

  it('prefetches internal routes on focus and hover', () => {
    const router = createRouter()
    renderLink(router, { href: '/project/guide' })
    const link = screen.getByRole('link', { name: 'Destination' })

    fireEvent.focus(link)
    fireEvent.mouseEnter(link)

    expect(router.prefetch).toHaveBeenNthCalledWith(1, '/project/guide')
    expect(router.prefetch).toHaveBeenNthCalledWith(2, '/project/guide')
  })

  it.each(['focus', 'hover'] as const)(
    'contains a rejected %s prefetch without navigating',
    async (interaction) => {
      const rejected = handledRejectedPromise(new Error('prefetch failed'))
      const router = createRouter({
        prefetch: vi.fn().mockReturnValue(rejected.promise),
      })
      renderLink(router, { href: '/project/guide' })
      const link = screen.getByRole('link', { name: 'Destination' })
      const currentUrl = window.location.href

      if (interaction === 'focus') fireEvent.focus(link)
      else fireEvent.mouseEnter(link)
      await new Promise((resolve) => window.setTimeout(resolve, 0))

      expect(router.prefetch).toHaveBeenCalledWith('/project/guide')
      expect(rejected.catchHandler).toHaveBeenCalledOnce()
      expect(router.go).not.toHaveBeenCalled()
      expect(window.location.href).toBe(currentUrl)
    },
  )

  it('falls back to document navigation after an intercepted click rejects', async () => {
    const rejected = handledRejectedPromise(new Error('navigation failed'))
    const router = createRouter({
      go: vi.fn().mockReturnValue(rejected.promise),
    })
    renderLink(router, { href: '#recovered' })

    fireEvent.click(screen.getByRole('link', { name: 'Destination' }))
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    expect(router.go).toHaveBeenCalledWith('#recovered')
    expect(rejected.catchHandler).toHaveBeenCalledOnce()
    expect(window.location.hash).toBe('#recovered')
  })

  it.each([
    ['cross-origin HTTPS', 'https://example.com/project/guide', {}],
    [
      'same-origin complete URL outside the configured base',
      `${window.location.origin}/other/guide`,
      {},
    ],
    ['same-origin protocol relative', '//localhost:3000/project/guide', {}],
    ['mailto', 'mailto:docs@example.com', {}],
    ['telephone', 'tel:+15555550100', {}],
    ['JavaScript', 'javascript:alert(1)', {}],
    ['data', 'data:text/plain,guide', {}],
    ['download', '/project/guide.pdf', { download: true }],
    ['targeted', '/project/guide', { target: '_blank' }],
  ] satisfies ReadonlyArray<
    readonly [string, string, AnchorHTMLAttributes<HTMLAnchorElement>]
  >)('preserves native navigation for %s links', (_label, href, attributes) => {
    const router = createRouter()
    renderLink(router, { href, ...attributes })
    const link = screen.getByRole('link', { name: 'Destination' })

    fireEvent.focus(link)
    fireEvent.mouseEnter(link)
    fireEvent.click(link)

    expect(router.prefetch).not.toHaveBeenCalled()
    expect(router.go).not.toHaveBeenCalled()
  })

  it.each([
    ['middle button', { button: 1 }],
    ['meta key', { button: 0, metaKey: true }],
    ['control key', { button: 0, ctrlKey: true }],
    ['shift key', { button: 0, shiftKey: true }],
    ['alt key', { altKey: true, button: 0 }],
  ])('preserves native navigation for a %s click', (_label, init) => {
    const router = createRouter()
    renderLink(router, { href: '/project/guide' })

    fireEvent.click(screen.getByRole('link', { name: 'Destination' }), init)

    expect(router.go).not.toHaveBeenCalled()
  })

  it('respects a consumer click handler that prevents navigation', () => {
    const router = createRouter()
    const onClick = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault()
    })
    renderLink(router, { href: '/project/guide', onClick })

    fireEvent.click(screen.getByRole('link', { name: 'Destination' }))

    expect(onClick).toHaveBeenCalledOnce()
    expect(router.go).not.toHaveBeenCalled()
  })

  it('preserves brief-compatible router mocks that omit base', () => {
    const router: Router = {
      path: '/',
      go: vi.fn().mockResolvedValue(undefined),
      prefetch: vi.fn().mockResolvedValue(undefined),
    }
    renderLink(router, { href: '/guide' })

    fireEvent.click(screen.getByRole('link', { name: 'Destination' }))

    expect(router.go).toHaveBeenCalledWith('/guide')
  })
})
