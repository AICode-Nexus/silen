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

  it('prefetches internal routes on focus and hover', () => {
    const router = createRouter()
    renderLink(router, { href: '/project/guide' })
    const link = screen.getByRole('link', { name: 'Destination' })

    fireEvent.focus(link)
    fireEvent.mouseEnter(link)

    expect(router.prefetch).toHaveBeenNthCalledWith(1, '/project/guide')
    expect(router.prefetch).toHaveBeenNthCalledWith(2, '/project/guide')
  })

  it.each([
    ['cross-origin HTTPS', 'https://example.com/project/guide', {}],
    ['same-origin protocol relative', '//localhost:3000/project/guide', {}],
    ['outside the configured base', '/other/guide', {}],
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
