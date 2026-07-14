import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from 'react'
import { flushSync } from 'react-dom'
import config from 'virtual:silen/config'
import routes from 'virtual:silen/routes'
import Theme from 'virtual:silen/theme'
import type { JsonObject } from '../shared/page.js'
import { DataProvider, type PagePublicData } from './data.js'
import { navigateDocument } from './navigation.js'
import { resolveInternalUrl, RouterProvider, type Router } from './router.js'

export interface ResolvedPage {
  title: string
  description: string
  publicData: PagePublicData
  Component: ComponentType
}

export interface RouteMatch {
  found: boolean
  page: ResolvedPage
}

export interface RenderedPage {
  appHtml: string
  status: 200 | 404
  title: string
  description: string
  publicData: PagePublicData
}

export interface AppProps {
  initialUrl: string
  initialPage: ResolvedPage
}

function NotFound(): React.JSX.Element {
  return <h1>404</h1>
}

function decodePathname(pathname: string): string | undefined {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return undefined
  }
}

function routePathname(url: string): {
  pathname: string
  route: string | undefined
} {
  const pathname = new URL(url, 'https://silen.local').pathname
  if (config.base === '/') {
    return { pathname, route: decodePathname(pathname) }
  }

  const baseWithoutSlash = config.base.slice(0, -1)
  if (pathname === baseWithoutSlash) return { pathname, route: '/' }
  if (!pathname.startsWith(config.base)) return { pathname, route: undefined }

  const suffix = decodePathname(pathname.slice(config.base.length))
  return { pathname, route: suffix === undefined ? undefined : `/${suffix}` }
}

function browserPath(url: string): string {
  const parsed = new URL(url, 'https://silen.local')
  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}

function routeCandidates(route: string): readonly string[] {
  if (route === '/') return ['/']
  return route.endsWith('/')
    ? [route, route.slice(0, -1)]
    : [route, `${route}/`]
}

function matchedRoute(route: string | undefined): string | undefined {
  if (route === undefined) return undefined
  return routeCandidates(route).find((candidate) =>
    Object.hasOwn(routes, candidate),
  )
}

function stringField(
  frontmatter: JsonObject,
  field: string,
  fallback: string,
): string {
  const value = frontmatter[field]
  return typeof value === 'string' ? value : fallback
}

export async function resolveRoute(url: string): Promise<RouteMatch> {
  const request = routePathname(url)
  const route = matchedRoute(request.route)
  const loader = route === undefined ? undefined : routes[route]

  if (!loader || !route) {
    return {
      found: false,
      page: {
        title: 'Page not found',
        description: '',
        publicData: {
          siteTitle: config.title,
          lang: config.lang,
          base: config.base,
          route: request.route ?? request.pathname,
          themeConfig: config.themeConfig,
        },
        Component: NotFound,
      },
    }
  }

  const module = await loader()
  return {
    found: true,
    page: {
      title: stringField(module.frontmatter, 'title', config.title),
      description: stringField(
        module.frontmatter,
        'description',
        config.description,
      ),
      publicData: {
        siteTitle: config.title,
        lang: stringField(module.frontmatter, 'lang', config.lang),
        base: config.base,
        route,
        frontmatter: module.frontmatter,
        headings: module.headings,
        themeConfig: config.themeConfig,
      },
      Component: module.default,
    },
  }
}

const HISTORY_KEY = '__silen'

interface HistoryPosition {
  path: string
  scrollX: number
  scrollY: number
}

interface ClientPageState {
  path: string
  page: ResolvedPage
}

function recordHistoryPosition(
  state: unknown,
  position: HistoryPosition,
): Record<string, unknown> {
  const existing =
    typeof state === 'object' && state !== null && !Array.isArray(state)
      ? state
      : {}
  return { ...existing, [HISTORY_KEY]: position }
}

function historyPosition(state: unknown): HistoryPosition | undefined {
  if (typeof state !== 'object' || state === null) return undefined
  const value = (state as Record<string, unknown>)[HISTORY_KEY]
  if (typeof value !== 'object' || value === null) return undefined
  const position = value as Partial<HistoryPosition>
  if (
    typeof position.path !== 'string' ||
    typeof position.scrollX !== 'number' ||
    typeof position.scrollY !== 'number'
  ) {
    return undefined
  }
  return position as HistoryPosition
}

function setMetadata(page: ResolvedPage): void {
  document.title = page.title
  document.documentElement.lang = page.publicData.lang
  let description = document.querySelector<HTMLMetaElement>(
    'meta[name="description"]',
  )
  if (!description) {
    description = document.createElement('meta')
    description.name = 'description'
    document.head.append(description)
  }
  description.content = page.description
}

function focusElement(element: HTMLElement): void {
  if (!element.hasAttribute('tabindex')) element.tabIndex = -1
  element.focus({ preventScroll: true })
}

function scrollToAnchor(hash: string): boolean {
  if (!hash) return false
  const encodedId = hash.slice(1)
  let id = encodedId
  try {
    id = decodeURIComponent(encodedId)
  } catch {
    // Browsers preserve malformed fragments, so use the raw ID as a fallback.
  }
  const target =
    document.getElementById(id) ?? document.getElementsByName(id).item(0)
  if (!(target instanceof HTMLElement)) return false
  target.scrollIntoView()
  focusElement(target)
  return true
}

function focusMainContent(): void {
  const main = document.querySelector<HTMLElement>(
    'main, [role="main"], #main-content, [data-silen-main]',
  )
  if (main) focusElement(main)
}

function restoreNavigationPosition(url: URL, position?: HistoryPosition): void {
  if (position) {
    window.scrollTo(position.scrollX, position.scrollY)
    return
  }
  if (scrollToAnchor(url.hash)) return
  window.scrollTo(0, 0)
  focusMainContent()
}

function currentBrowserUrl(): URL {
  return new URL(window.location.href)
}

function samePage(left: URL, right: URL): boolean {
  return left.pathname === right.pathname && left.search === right.search
}

export function App({ initialUrl, initialPage }: AppProps): React.JSX.Element {
  const [state, setState] = useState<ClientPageState>(() => ({
    path: browserPath(initialUrl),
    page: initialPage,
  }))
  const stateRef = useRef(state)
  const routeCache = useRef(new Map<string, Promise<RouteMatch>>())
  const navigationSequence = useRef(0)
  const restorationFrame = useRef<number | undefined>(undefined)
  const scrollFrame = useRef<number | undefined>(undefined)
  const suspendedScrollSequence = useRef<number | undefined>(undefined)

  const loadRoute = useCallback((url: URL): Promise<RouteMatch> => {
    const key = url.pathname
    const cached = routeCache.current.get(key)
    if (cached) return cached

    const loaded = resolveRoute(`${url.pathname}${url.search}${url.hash}`)
    routeCache.current.set(key, loaded)
    void loaded.catch(() => routeCache.current.delete(key))
    return loaded
  }, [])

  const saveCurrentScroll = useCallback((force = false): void => {
    const position: HistoryPosition = {
      path: stateRef.current.path,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    }
    if (position.path !== browserPath(window.location.href)) return
    const recorded = historyPosition(window.history.state)
    if (
      !force &&
      recorded?.path === position.path &&
      recorded.scrollX === position.scrollX &&
      recorded.scrollY === position.scrollY
    ) {
      return
    }
    window.history.replaceState(
      recordHistoryPosition(window.history.state, position),
      '',
    )
  }, [])

  const cancelScheduledScrollSave = useCallback((): void => {
    if (scrollFrame.current === undefined) return
    window.cancelAnimationFrame(scrollFrame.current)
    scrollFrame.current = undefined
  }, [])

  const cancelScheduledRestoration = useCallback((): void => {
    if (restorationFrame.current === undefined) return
    window.cancelAnimationFrame(restorationFrame.current)
    restorationFrame.current = undefined
  }, [])

  const scheduleCurrentScrollSave = useCallback((): void => {
    if (suspendedScrollSequence.current !== undefined) return
    if (scrollFrame.current !== undefined) return
    scrollFrame.current = window.requestAnimationFrame(() => {
      scrollFrame.current = undefined
      saveCurrentScroll()
    })
  }, [saveCurrentScroll])

  const schedulePopstateRestoration = useCallback(
    (
      url: URL,
      position: HistoryPosition | undefined,
      sequence: number,
    ): void => {
      cancelScheduledRestoration()
      restorationFrame.current = window.requestAnimationFrame(() => {
        restorationFrame.current = undefined
        const path = browserPath(url.href)
        if (
          sequence !== navigationSequence.current ||
          sequence !== suspendedScrollSequence.current ||
          stateRef.current.path !== path ||
          browserPath(window.location.href) !== path
        ) {
          return
        }
        restoreNavigationPosition(url, position)
        saveCurrentScroll(true)
        suspendedScrollSequence.current = undefined
      })
    },
    [cancelScheduledRestoration, saveCurrentScroll],
  )

  const commitPage = useCallback(
    (
      url: URL,
      page: ResolvedPage,
      position?: HistoryPosition,
      restorePosition = true,
    ): void => {
      const nextState = { path: browserPath(url.href), page }
      flushSync(() => setState(nextState))
      stateRef.current = nextState
      setMetadata(page)
      if (restorePosition) {
        restoreNavigationPosition(url, position)
        scheduleCurrentScrollSave()
      }
    },
    [scheduleCurrentScrollSave],
  )

  const go = useCallback(
    async (href: string): Promise<void> => {
      const url = resolveInternalUrl(href, config.base)
      if (!url) return
      const current = currentBrowserUrl()
      const sequence = ++navigationSequence.current
      const interruptedPopstate = suspendedScrollSequence.current !== undefined
      if (interruptedPopstate) {
        cancelScheduledScrollSave()
        cancelScheduledRestoration()
        suspendedScrollSequence.current = sequence
      }
      const renderedCurrent = new URL(
        stateRef.current.path,
        window.location.origin,
      )

      const finishInterruptedPopstate = (): void => {
        if (suspendedScrollSequence.current !== sequence) return
        saveCurrentScroll(true)
        suspendedScrollSequence.current = undefined
      }

      const loadActiveRoute = async (): Promise<RouteMatch | undefined> => {
        try {
          const match = await loadRoute(url)
          return sequence === navigationSequence.current ? match : undefined
        } catch (error) {
          if (sequence !== navigationSequence.current) return undefined
          throw error
        }
      }

      if (interruptedPopstate && url.href === current.href) {
        const recordedPosition = historyPosition(window.history.state)
        const position =
          recordedPosition?.path === browserPath(url.href)
            ? recordedPosition
            : undefined
        if (samePage(renderedCurrent, url)) {
          const nextState = {
            ...stateRef.current,
            path: browserPath(url.href),
          }
          flushSync(() => setState(nextState))
          stateRef.current = nextState
          restoreNavigationPosition(url, position)
        } else {
          const match = await loadActiveRoute()
          if (!match) return
          commitPage(url, match.page, position)
        }
        finishInterruptedPopstate()
        return
      }

      if (url.href === current.href) {
        window.history.replaceState(
          recordHistoryPosition(window.history.state, {
            path: browserPath(url.href),
            scrollX: window.scrollX,
            scrollY: window.scrollY,
          }),
          '',
        )
        restoreNavigationPosition(url)
        scheduleCurrentScrollSave()
        finishInterruptedPopstate()
        return
      }

      if (samePage(interruptedPopstate ? renderedCurrent : current, url)) {
        if (!interruptedPopstate) saveCurrentScroll(true)
        window.history.pushState(
          recordHistoryPosition(null, {
            path: browserPath(url.href),
            scrollX: 0,
            scrollY: 0,
          }),
          '',
          browserPath(url.href),
        )
        const nextState = { ...stateRef.current, path: browserPath(url.href) }
        flushSync(() => setState(nextState))
        stateRef.current = nextState
        restoreNavigationPosition(url)
        scheduleCurrentScrollSave()
        finishInterruptedPopstate()
        return
      }

      const match = await loadActiveRoute()
      if (!match) return
      if (!interruptedPopstate) saveCurrentScroll(true)
      window.history.pushState(
        recordHistoryPosition(null, {
          path: browserPath(url.href),
          scrollX: 0,
          scrollY: 0,
        }),
        '',
        browserPath(url.href),
      )
      commitPage(url, match.page)
      finishInterruptedPopstate()
    },
    [
      cancelScheduledRestoration,
      cancelScheduledScrollSave,
      commitPage,
      loadRoute,
      saveCurrentScroll,
      scheduleCurrentScrollSave,
    ],
  )

  const prefetch = useCallback(
    async (href: string): Promise<void> => {
      const url = resolveInternalUrl(href, config.base)
      if (!url || samePage(currentBrowserUrl(), url)) return
      await loadRoute(url)
    },
    [loadRoute],
  )

  useEffect(() => {
    setMetadata(stateRef.current.page)
    const initialRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    if (!historyPosition(window.history.state)) {
      saveCurrentScroll()
    }

    const handlePopState = (event: PopStateEvent): void => {
      cancelScheduledScrollSave()
      cancelScheduledRestoration()
      const url = currentBrowserUrl()
      const sequence = ++navigationSequence.current
      suspendedScrollSequence.current = sequence
      const navigate = async (): Promise<void> => {
        const current = new URL(stateRef.current.path, window.location.origin)
        const recordedPosition = historyPosition(event.state)
        const position =
          recordedPosition?.path === browserPath(url.href)
            ? recordedPosition
            : undefined
        if (samePage(current, url)) {
          const nextState = {
            ...stateRef.current,
            path: browserPath(url.href),
          }
          flushSync(() => setState(nextState))
          stateRef.current = nextState
          schedulePopstateRestoration(url, position, sequence)
          return
        }

        const match = await loadRoute(url)
        if (sequence !== navigationSequence.current) return
        commitPage(url, match.page, position, false)
        schedulePopstateRestoration(url, position, sequence)
      }
      void navigate().catch(() => {
        if (sequence === navigationSequence.current) {
          navigateDocument(url.href)
        }
      })
    }

    window.addEventListener('scroll', scheduleCurrentScrollSave, {
      passive: true,
    })
    window.addEventListener('popstate', handlePopState)
    return () => {
      navigationSequence.current += 1
      suspendedScrollSequence.current = undefined
      cancelScheduledScrollSave()
      cancelScheduledRestoration()
      window.removeEventListener('scroll', scheduleCurrentScrollSave)
      window.removeEventListener('popstate', handlePopState)
      window.history.scrollRestoration = initialRestoration
    }
  }, [
    cancelScheduledRestoration,
    cancelScheduledScrollSave,
    commitPage,
    loadRoute,
    saveCurrentScroll,
    scheduleCurrentScrollSave,
    schedulePopstateRestoration,
  ])

  const router = useMemo<Router>(
    () => ({
      path: state.path,
      base: config.base,
      go,
      prefetch,
    }),
    [go, prefetch, state.path],
  )
  const { Component } = state.page
  return (
    <DataProvider value={state.page.publicData}>
      <RouterProvider value={router}>
        <Theme.Layout>
          <Component />
        </Theme.Layout>
      </RouterProvider>
    </DataProvider>
  )
}

export type { PagePublicData } from './data.js'
