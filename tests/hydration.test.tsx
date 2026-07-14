import { act } from 'react'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface RouteFixtureModule {
  default: () => React.JSX.Element
  frontmatter: Record<string, string>
  headings: Array<{ depth: number; title: string; slug: string }>
  links: string[]
}

const routeMocks = vi.hoisted(() => ({
  aboutLoader: vi.fn<() => Promise<RouteFixtureModule>>(),
  guideLoader: vi.fn<() => Promise<RouteFixtureModule>>(),
  homeLoader: vi.fn<() => Promise<RouteFixtureModule>>(),
  navigateDocument: vi.fn<(href: string) => void>(),
}))

vi.mock('../src/client/navigation', () => ({
  navigateDocument: routeMocks.navigateDocument,
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
        layout: 'home',
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
        layout: 'page',
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
    layouts: {
      doc({ children }: { children: React.ReactNode }) {
        return <section data-layout="doc">{children}</section>
      },
      home({ children }: { children: React.ReactNode }) {
        return <section data-layout="home">{children}</section>
      },
      page({ children }: { children: React.ReactNode }) {
        return <section data-layout="page">{children}</section>
      },
    },
    components: {},
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

async function captureUnhandledRejections(
  action: () => void,
): Promise<unknown[]> {
  const rejections: unknown[] = []
  const handleRejection = (reason: unknown): void => {
    rejections.push(reason)
  }
  process.on('unhandledRejection', handleRejection)
  try {
    action()
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  } finally {
    process.off('unhandledRejection', handleRejection)
  }
  return rejections
}

function deferred<T>(): {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T) => void
} {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    reject = promiseReject
    resolve = promiseResolve
  })
  return { promise, reject, resolve }
}

function useControlledAnimationFrames(): {
  flush: () => void
  pending: () => number
} {
  let nextHandle = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const handle = nextHandle++
      callbacks.set(handle, callback)
      return handle
    }),
  )
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((handle: number) => callbacks.delete(handle)),
  )
  return {
    flush() {
      const pending = [...callbacks.entries()]
      callbacks.clear()
      for (const [, callback] of pending) callback(performance.now())
    },
    pending: () => callbacks.size,
  }
}

async function traverseHistory(direction: 'back' | 'forward'): Promise<void> {
  await act(async () => {
    const popped = new Promise<void>((resolve) => {
      window.addEventListener('popstate', () => resolve(), { once: true })
    })
    window.history[direction]()
    await popped
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  })
}

function storedHistoryPosition(): {
  path: string
  scrollX: number
  scrollY: number
} {
  const state: unknown = window.history.state
  if (typeof state !== 'object' || state === null) {
    throw new Error('Expected an object history state')
  }
  const position = (state as Record<string, unknown>).__silen
  if (typeof position !== 'object' || position === null) {
    throw new Error('Expected a Silen history position')
  }
  const fields = position as Record<string, unknown>
  if (
    typeof fields.path !== 'string' ||
    typeof fields.scrollX !== 'number' ||
    typeof fields.scrollY !== 'number'
  ) {
    throw new Error('Expected a valid Silen history position')
  }
  return {
    path: fields.path,
    scrollX: fields.scrollX,
    scrollY: fields.scrollY,
  }
}

function historyState(
  path: string,
  scrollX: number,
  scrollY: number,
): { __silen: { path: string; scrollX: number; scrollY: number } } {
  return { __silen: { path, scrollX, scrollY } }
}

describe('hydration and browser navigation', () => {
  let currentScrollX: number
  let currentScrollY: number
  let scrollIntoView: ReturnType<typeof vi.fn>
  let scrollTo: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.head.innerHTML =
      '<title>Server title</title><meta name="description" content="Server description">'
    document.body.innerHTML = ''
    document.documentElement.lang = 'en-US'
    window.history.replaceState(null, '', '/project/')
    currentScrollX = 0
    currentScrollY = 0
    scrollIntoView = vi.fn()
    scrollTo = vi.fn((x: number, y: number) => {
      currentScrollX = x
      currentScrollY = y
    })
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
      get: () => currentScrollX,
    })
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      get: () => currentScrollY,
    })
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 0),
      ),
    )
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((handle: number) => window.clearTimeout(handle)),
    )
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
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

  it('selects home, default doc, and page layouts from frontmatter', async () => {
    const [home, guide, about] = await Promise.all([
      serverMarkup('/project/'),
      serverMarkup('/project/guide'),
      serverMarkup('/project/about'),
    ])

    expect(home).toContain('data-layout="home"')
    expect(guide).toContain('data-layout="doc"')
    expect(about).toContain('data-layout="page"')
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

  it('ignores an older rejected click after a newer navigation succeeds', async () => {
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/')
    document.body.append(container)
    const root = await act(async () => hydrate(container))
    const pendingAbout = deferred<never>()
    routeMocks.aboutLoader.mockReturnValueOnce(pendingAbout.promise)

    fireEvent.click(screen.getByRole('link', { name: 'About' }))
    fireEvent.click(screen.getByRole('link', { name: 'Guide' }))
    expect(await screen.findByRole('heading', { name: 'Guide' })).toBeTruthy()

    await act(async () => {
      pendingAbout.reject(new Error('stale about failure'))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(routeMocks.navigateDocument).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/project/guide')
    expect(screen.getByRole('heading', { name: 'Guide' })).toBeTruthy()

    act(() => root.unmount())
  })

  it('ignores an older rejected click after Back selects a newer destination', async () => {
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/')
    document.body.append(container)
    const root = await act(async () => hydrate(container))

    fireEvent.click(screen.getByRole('link', { name: 'Guide' }))
    expect(await screen.findByRole('heading', { name: 'Guide' })).toBeTruthy()
    const pendingAbout = deferred<never>()
    routeMocks.aboutLoader.mockReturnValueOnce(pendingAbout.promise)
    fireEvent.click(screen.getByRole('link', { name: 'About' }))

    await traverseHistory('back')
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    await act(async () => {
      pendingAbout.reject(new Error('stale about failure'))
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(routeMocks.navigateDocument).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/project/')
    expect(screen.getByRole('heading', { name: 'Home' })).toBeTruthy()

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

    await traverseHistory('back')

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    expect(pushState).not.toHaveBeenCalled()
    expect(scrollTo).toHaveBeenLastCalledWith(24, 48)
    expect(document.title).toBe('Home')

    act(() => root.unmount())
  })

  it('contains a rejected popstate load so it cannot become an unhandled rejection', async () => {
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/')
    document.body.append(container)
    const root = await act(async () => hydrate(container))
    routeMocks.aboutLoader.mockRejectedValueOnce(new Error('route failed'))
    window.history.pushState({ attempted: true }, '', '/project/about')

    const rejections = await captureUnhandledRejections(() => {
      fireEvent.popState(window, { state: { attempted: true } })
    })

    expect(routeMocks.aboutLoader).toHaveBeenCalled()
    expect(routeMocks.navigateDocument).toHaveBeenCalledWith(
      `${window.location.origin}/project/about`,
    )
    expect(rejections).toEqual([])

    act(() => root.unmount())
  })

  it('cancels a queued source scroll save and suppresses writes while popstate loads', async () => {
    const aboutModule = await routeMocks.aboutLoader()
    const pendingAbout = deferred<typeof aboutModule>()
    routeMocks.aboutLoader.mockReturnValueOnce(pendingAbout.promise)
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/')
    document.body.append(container)
    const root = await act(async () => hydrate(container))
    const frames = useControlledAnimationFrames()

    currentScrollY = 120
    fireEvent.scroll(window)
    expect(frames.pending()).toBe(1)
    const destinationState = historyState('/project/about', 8, 64)
    window.history.pushState(destinationState, '', '/project/about')
    fireEvent.popState(window, { state: destinationState })
    currentScrollY = 999
    fireEvent.scroll(window)

    frames.flush()
    expect(storedHistoryPosition()).toEqual({
      path: '/project/about',
      scrollX: 8,
      scrollY: 64,
    })
    expect(frames.pending()).toBe(0)

    await act(async () => {
      pendingAbout.resolve(aboutModule)
      await Promise.resolve()
    })
    expect(frames.pending()).toBe(1)
    act(() => frames.flush())

    expect(screen.getByRole('heading', { name: 'About' })).toBeTruthy()
    expect(scrollTo).toHaveBeenLastCalledWith(8, 64)
    expect(storedHistoryPosition()).toEqual({
      path: '/project/about',
      scrollX: 8,
      scrollY: 64,
    })

    act(() => root.unmount())
  })

  it('ignores saved coordinates whose history path does not match the selected URL', async () => {
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/')
    document.body.append(container)
    const root = await act(async () => hydrate(container))
    const frames = useControlledAnimationFrames()
    const staleState = historyState('/project/stale', 700, 900)
    window.history.pushState(staleState, '', '/project/about')

    fireEvent.popState(window, { state: staleState })
    await act(async () => {
      await Promise.resolve()
    })
    act(() => frames.flush())

    expect(screen.getByRole('heading', { name: 'About' })).toBeTruthy()
    expect(scrollTo).toHaveBeenLastCalledWith(0, 0)
    expect(storedHistoryPosition()).toEqual({
      path: '/project/about',
      scrollX: 0,
      scrollY: 0,
    })

    act(() => root.unmount())
  })

  it('keeps rapid popstate traversal isolated and resumes scroll saves for the winner', async () => {
    const aboutModule = await routeMocks.aboutLoader()
    const guideModule = await routeMocks.guideLoader()
    const pendingAbout = deferred<typeof aboutModule>()
    const pendingGuide = deferred<typeof guideModule>()
    routeMocks.aboutLoader.mockReturnValueOnce(pendingAbout.promise)
    routeMocks.guideLoader.mockReturnValueOnce(pendingGuide.promise)
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/')
    document.body.append(container)
    const root = await act(async () => hydrate(container))
    const frames = useControlledAnimationFrames()

    const aboutState = historyState('/project/about', 1, 100)
    window.history.pushState(aboutState, '', '/project/about')
    fireEvent.popState(window, { state: aboutState })
    const guideState = historyState('/project/guide', 2, 200)
    window.history.pushState(guideState, '', '/project/guide')
    fireEvent.popState(window, { state: guideState })
    currentScrollY = 999
    fireEvent.scroll(window)
    frames.flush()

    expect(storedHistoryPosition()).toEqual({
      path: '/project/guide',
      scrollX: 2,
      scrollY: 200,
    })
    await act(async () => {
      pendingAbout.resolve(aboutModule)
      await Promise.resolve()
    })
    expect(screen.getByRole('heading', { name: 'Home' })).toBeTruthy()
    expect(frames.pending()).toBe(0)

    await act(async () => {
      pendingGuide.resolve(guideModule)
      await Promise.resolve()
    })
    act(() => frames.flush())
    expect(screen.getByRole('heading', { name: 'Guide' })).toBeTruthy()
    expect(scrollTo).toHaveBeenLastCalledWith(2, 200)

    currentScrollY = 360
    fireEvent.scroll(window)
    expect(frames.pending()).toBe(1)
    act(() => frames.flush())
    expect(storedHistoryPosition()).toEqual({
      path: '/project/guide',
      scrollX: 2,
      scrollY: 360,
    })

    act(() => root.unmount())
  })

  it('preserves a same-page popstate destination when go interrupts its restoration', async () => {
    window.history.replaceState(null, '', '/project/guide')
    currentScrollY = 90
    scrollIntoView.mockImplementation(function (this: Element) {
      if (this.id === 'details') currentScrollY = 210
    })
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/guide')
    document.body.append(container)
    const root = await act(async () => hydrate(container))
    const frames = useControlledAnimationFrames()

    fireEvent.click(screen.getByRole('link', { name: 'Details' }))
    act(() => frames.flush())
    currentScrollY = 360
    fireEvent.scroll(window)
    act(() => frames.flush())

    window.addEventListener(
      'popstate',
      () => {
        window.scrollTo(0, 0)
      },
      { once: true },
    )
    await traverseHistory('back')
    expect(storedHistoryPosition()).toEqual({
      path: '/project/guide',
      scrollX: 0,
      scrollY: 90,
    })
    expect(frames.pending()).toBe(1)

    fireEvent.click(screen.getByRole('link', { name: 'Details' }))

    expect(window.location.hash).toBe('#details')
    expect(currentScrollY).toBe(210)
    expect(storedHistoryPosition()).toEqual({
      path: '/project/guide#details',
      scrollX: 0,
      scrollY: 210,
    })
    expect(frames.pending()).toBe(0)
    act(() => frames.flush())
    expect(currentScrollY).toBe(210)

    currentScrollY = 240
    fireEvent.scroll(window)
    expect(frames.pending()).toBe(1)
    act(() => frames.flush())

    await traverseHistory('back')
    act(() => frames.flush())
    expect(currentScrollY).toBe(90)

    await traverseHistory('forward')
    act(() => frames.flush())
    expect(currentScrollY).toBe(240)

    act(() => root.unmount())
  })

  it('preserves a loaded cross-page popstate destination when go interrupts its restoration', async () => {
    const aboutModule = await routeMocks.aboutLoader()
    const pendingAbout = deferred<typeof aboutModule>()
    routeMocks.aboutLoader.mockReturnValueOnce(pendingAbout.promise)
    currentScrollX = 5
    currentScrollY = 40
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/')
    document.body.append(container)
    const root = await act(async () => hydrate(container))
    const frames = useControlledAnimationFrames()
    const destinationState = historyState('/project/about', 8, 64)
    window.history.pushState(destinationState, '', '/project/about')

    fireEvent.popState(window, { state: destinationState })
    currentScrollX = 99
    currentScrollY = 999
    await act(async () => {
      pendingAbout.resolve(aboutModule)
      await Promise.resolve()
    })
    expect(screen.getByRole('heading', { name: 'About' })).toBeTruthy()
    expect(frames.pending()).toBe(1)

    fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()

    expect(currentScrollX).toBe(0)
    expect(currentScrollY).toBe(0)
    expect(storedHistoryPosition()).toEqual({
      path: '/project/',
      scrollX: 0,
      scrollY: 0,
    })
    expect(frames.pending()).toBe(0)
    act(() => frames.flush())
    expect(currentScrollY).toBe(0)

    currentScrollY = 120
    fireEvent.scroll(window)
    expect(frames.pending()).toBe(1)
    act(() => frames.flush())

    await traverseHistory('back')
    act(() => frames.flush())
    expect(screen.getByRole('heading', { name: 'About' })).toBeTruthy()
    expect(currentScrollX).toBe(8)
    expect(currentScrollY).toBe(64)

    await traverseHistory('forward')
    act(() => frames.flush())
    expect(screen.getByRole('heading', { name: 'Home' })).toBeTruthy()
    expect(currentScrollX).toBe(0)
    expect(currentScrollY).toBe(120)

    act(() => root.unmount())
  })

  it('cancels pending popstate restoration on unmount without saving its coordinates', async () => {
    const aboutModule = await routeMocks.aboutLoader()
    const pendingAbout = deferred<typeof aboutModule>()
    routeMocks.aboutLoader.mockReturnValueOnce(pendingAbout.promise)
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/')
    document.body.append(container)
    const root = await act(async () => hydrate(container))
    const frames = useControlledAnimationFrames()
    const replaceState = vi.spyOn(window.history, 'replaceState')
    replaceState.mockClear()
    const destinationState = historyState('/project/about', 4, 80)
    window.history.pushState(destinationState, '', '/project/about')
    fireEvent.popState(window, { state: destinationState })

    await act(async () => {
      pendingAbout.resolve(aboutModule)
      await Promise.resolve()
    })
    expect(frames.pending()).toBe(1)
    act(() => root.unmount())
    expect(frames.pending()).toBe(0)
    frames.flush()

    expect(scrollTo).not.toHaveBeenCalledWith(4, 80)
    expect(replaceState).not.toHaveBeenCalled()
    expect(routeMocks.navigateDocument).not.toHaveBeenCalled()
  })

  it('persists anchor and manual scroll through a back and forward page cycle', async () => {
    currentScrollX = 24
    currentScrollY = 48
    scrollIntoView.mockImplementation(function (this: Element) {
      if (this.id === 'install') {
        currentScrollX = 0
        currentScrollY = 180
      }
    })
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/')
    document.body.append(container)
    const root = await act(async () => hydrate(container))

    fireEvent.click(screen.getByRole('link', { name: 'Guide' }))
    expect(await screen.findByRole('heading', { name: 'Guide' })).toBeTruthy()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    expect(storedHistoryPosition()).toEqual({
      path: '/project/guide#install',
      scrollX: 0,
      scrollY: 180,
    })

    currentScrollX = 7
    currentScrollY = 420
    fireEvent.scroll(window)
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    await traverseHistory('back')
    expect(await screen.findByRole('heading', { name: 'Home' })).toBeTruthy()
    expect(scrollTo).toHaveBeenLastCalledWith(24, 48)

    await traverseHistory('forward')
    expect(await screen.findByRole('heading', { name: 'Guide' })).toBeTruthy()
    expect(scrollTo).toHaveBeenLastCalledWith(7, 420)

    act(() => root.unmount())
  })

  it('persists manual scroll through a back and forward hash cycle', async () => {
    window.history.replaceState(null, '', '/project/guide')
    scrollIntoView.mockImplementation(function (this: Element) {
      if (this.id === 'details') {
        currentScrollX = 0
        currentScrollY = 210
      }
    })
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/guide')
    document.body.append(container)
    const root = await act(async () => hydrate(container))

    currentScrollY = 90
    fireEvent.scroll(window)
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    const replaceState = vi.spyOn(window.history, 'replaceState')
    replaceState.mockClear()
    fireEvent.click(screen.getByRole('link', { name: 'Details' }))
    expect(replaceState).toHaveBeenCalledOnce()
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    expect(storedHistoryPosition()).toEqual({
      path: '/project/guide#details',
      scrollX: 0,
      scrollY: 210,
    })

    currentScrollY = 360
    fireEvent.scroll(window)
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    window.addEventListener(
      'popstate',
      () => {
        window.scrollTo(0, 0)
      },
      { once: true },
    )
    await traverseHistory('back')
    expect(scrollTo).toHaveBeenLastCalledWith(0, 90)

    await traverseHistory('forward')
    expect(scrollTo).toHaveBeenLastCalledWith(0, 360)

    act(() => root.unmount())
  })

  it('coalesces scroll history writes and removes the listener on unmount', async () => {
    const container = document.createElement('div')
    container.id = 'app'
    container.innerHTML = await serverMarkup('/project/')
    document.body.append(container)
    const root = await act(async () => hydrate(container))
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    const replaceState = vi.spyOn(window.history, 'replaceState')
    replaceState.mockClear()

    currentScrollY = 10
    fireEvent.scroll(window)
    currentScrollY = 20
    fireEvent.scroll(window)
    currentScrollY = 30
    fireEvent.scroll(window)
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })

    expect(replaceState).toHaveBeenCalledOnce()
    expect(storedHistoryPosition().scrollY).toBe(30)

    act(() => root.unmount())
    replaceState.mockClear()
    currentScrollY = 40
    fireEvent.scroll(window)
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(replaceState).not.toHaveBeenCalled()
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
