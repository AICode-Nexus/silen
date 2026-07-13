import { act } from 'react'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const routeMocks = vi.hoisted(() => ({
  aboutLoader: vi.fn(),
  guideLoader: vi.fn(),
  homeLoader: vi.fn(),
}))

vi.mock('virtual:silen/config', () => ({
  default: {
    title: 'Fixture Docs',
    description: 'Fixture fallback description',
    lang: 'en-US',
    base: '/project/',
    outDir: '.silen/dist',
    onBrokenLinks: 'error',
    command: 'build',
    root: '/',
    configFile: '/.silen/config.ts',
  },
}))

vi.mock('virtual:silen/routes', async () => {
  const { Link, useRoute } = await import('../src/client/router')

  function Home(): React.JSX.Element {
    return (
      <>
        <h1>Home</h1>
        <output data-testid="route">{useRoute()}</output>
        <Link href="/project/">Current</Link>
        <Link href="/project/guide#install">Guide</Link>
        <Link href="/project/about">About</Link>
        <Link href="/project/missing">Missing</Link>
      </>
    )
  }

  function Guide(): React.JSX.Element {
    return (
      <>
        <h1>Guide</h1>
        <output data-testid="route">{useRoute()}</output>
        <Link href="#details">Details</Link>
        <Link href="/project/about">About</Link>
        <h2 id="install">Install</h2>
        <h2 id="details">Details heading</h2>
      </>
    )
  }

  function About(): React.JSX.Element {
    return (
      <>
        <h1>About</h1>
        <output data-testid="route">{useRoute()}</output>
        <Link href="/project/">Home</Link>
      </>
    )
  }

  routeMocks.homeLoader.mockImplementation(() =>
    Promise.resolve({
      default: Home,
      frontmatter: {
        title: 'Home',
        description: 'Home description',
      },
      headings: [],
      links: ['/guide'],
    }),
  )
  routeMocks.guideLoader.mockImplementation(() =>
    Promise.resolve({
      default: Guide,
      frontmatter: {
        title: 'Guide',
        description: 'Guide description',
        lang: 'zh-CN',
      },
      headings: [
        { depth: 2, title: 'Install', slug: 'install' },
        { depth: 2, title: 'Details heading', slug: 'details' },
      ],
      links: ['/about'],
    }),
  )
  routeMocks.aboutLoader.mockImplementation(() =>
    Promise.resolve({
      default: About,
      frontmatter: {
        title: 'About',
        description: 'About description',
      },
      headings: [],
      links: [],
    }),
  )

  return {
    default: {
      '/': routeMocks.homeLoader,
      '/guide': routeMocks.guideLoader,
      '/about': routeMocks.aboutLoader,
    },
  }
})

vi.mock('virtual:silen/theme', () => ({
  default: {
    Layout({ children }: { children: React.ReactNode }) {
      return (
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      )
    },
  },
}))

import { App, resolveRoute } from '../src/client/app'
import { hydrate } from '../src/client/entry'

function metadataDescription(): HTMLMetaElement {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="description"]',
  )
  if (!meta) throw new Error('Expected description metadata')
  return meta
}

async function serverMarkup(url: string): Promise<string> {
  const match = await resolveRoute(url)
  return renderToString(<App initialUrl={url} initialPage={match.page} />)
}

describe('hydration and browser navigation', () => {
  let scrollIntoView: ReturnType<typeof vi.fn>
  let scrollTo: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.head.innerHTML =
      '<title>Server title</title><meta name="description" content="Server description">'
    document.body.innerHTML = ''
    document.documentElement.lang = 'en-US'
    window.history.replaceState(null, '', '/project/')
    scrollIntoView = vi.fn()
    scrollTo = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    Object.defineProperty(window, 'scrollX', {
      configurable: true,
      value: 0,
    })
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 0,
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('hydrates complete SSR markup without a mismatch', async () => {
    window.history.replaceState(null, '', '/project/guide?source=ssr#install')
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup(
      '/project/guide?source=ssr#install',
    )
    document.body.append(container)
    const serverHtml = container.innerHTML
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    const root = await act(async () => hydrate(container))

    expect(container.innerHTML).toBe(serverHtml)
    expect(screen.getByRole('heading', { name: 'Guide' })).toBeTruthy()
    expect(screen.getByTestId('route').textContent).toBe(
      '/project/guide?source=ssr#install',
    )
    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0]).toLowerCase().includes('hydration'),
      ),
    ).toBe(false)

    act(() => root.unmount())
  })

  it('prefetches once, swaps page content and metadata, pushes history, scrolls to an anchor, and keeps Router context', async () => {
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/')
    document.body.append(container)
    const root = await act(async () => hydrate(container))
    const pushState = vi.spyOn(window.history, 'pushState')

    const guide = screen.getByRole('link', { name: 'Guide' })
    fireEvent.mouseEnter(guide)
    await act(async () => {
      await Promise.resolve()
    })
    fireEvent.click(guide)

    expect(await screen.findByRole('heading', { name: 'Guide' })).toBeTruthy()
    expect(routeMocks.guideLoader).toHaveBeenCalledOnce()
    expect(screen.getByTestId('route').textContent).toBe(
      '/project/guide#install',
    )
    expect(window.location.pathname).toBe('/project/guide')
    expect(window.location.hash).toBe('#install')
    expect(pushState).toHaveBeenCalledOnce()
    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(document.title).toBe('Guide')
    expect(metadataDescription().content).toBe('Guide description')
    expect(document.documentElement.lang).toBe('zh-CN')

    act(() => root.unmount())
  })

  it('uses a native hash transition without reloading the current page', async () => {
    window.history.replaceState(null, '', '/project/guide')
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/guide')
    document.body.append(container)
    const root = await act(async () => hydrate(container))
    const callsAfterHydration = routeMocks.guideLoader.mock.calls.length

    fireEvent.click(screen.getByRole('link', { name: 'Details' }))

    expect(window.location.hash).toBe('#details')
    expect(screen.getByTestId('route').textContent).toBe(
      '/project/guide#details',
    )
    expect(routeMocks.guideLoader).toHaveBeenCalledTimes(callsAfterHydration)
    expect(scrollIntoView).toHaveBeenCalledOnce()

    act(() => root.unmount())
  })

  it('replaces history instead of pushing when navigating to the current URL', async () => {
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/')
    document.body.append(container)
    const root = await act(async () => hydrate(container))
    const pushState = vi.spyOn(window.history, 'pushState')
    const replaceState = vi.spyOn(window.history, 'replaceState')

    fireEvent.click(screen.getByRole('link', { name: 'Current' }))

    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).toHaveBeenCalledOnce()
    expect(screen.getByTestId('route').textContent).toBe('/project/')

    act(() => root.unmount())
  })

  it('focuses main content after a non-hash page navigation', async () => {
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/')
    document.body.append(container)
    const root = await act(async () => hydrate(container))

    fireEvent.click(screen.getByRole('link', { name: 'About' }))

    expect(await screen.findByRole('heading', { name: 'About' })).toBeTruthy()
    expect(document.activeElement).toBe(
      screen.getByRole('main', { hidden: true }),
    )
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
    expect(document.title).toBe('About')

    act(() => root.unmount())
  })

  it('loads popstate content without pushing and restores saved scroll', async () => {
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/')
    document.body.append(container)
    const root = await act(async () => hydrate(container))
    Object.defineProperty(window, 'scrollX', {
      configurable: true,
      value: 24,
    })
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 48,
    })

    fireEvent.click(screen.getByRole('link', { name: 'About' }))
    expect(await screen.findByRole('heading', { name: 'About' })).toBeTruthy()
    const pushState = vi.spyOn(window.history, 'pushState')
    pushState.mockClear()

    await act(async () => {
      window.history.back()
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    expect(pushState).not.toHaveBeenCalled()
    expect(scrollTo).toHaveBeenLastCalledWith(24, 48)
    expect(document.title).toBe('Home')

    act(() => root.unmount())
  })

  it('renders a real 404 page and metadata for an unknown static route', async () => {
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/')
    document.body.append(container)
    const root = await act(async () => hydrate(container))

    fireEvent.click(screen.getByRole('link', { name: 'Missing' }))

    expect(await screen.findByRole('heading', { name: '404' })).toBeTruthy()
    expect(document.title).toBe('Page not found')
    expect(metadataDescription().content).toBe('')
    expect(window.location.pathname).toBe('/project/missing')

    act(() => root.unmount())
  })
})
