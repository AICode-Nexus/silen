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
import type { Heading, JsonObject } from '../shared/page.js'
import { resolveInternalUrl, RouterProvider, type Router } from './router.js'

export interface PagePublicData {
  lang: string
  base: string
  route: string
  frontmatter?: JsonObject
  headings?: readonly Heading[]
}

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
          lang: config.lang,
          base: config.base,
          route: request.route ?? request.pathname,
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
        lang: stringField(module.frontmatter, 'lang', config.lang),
        base: config.base,
        route,
        frontmatter: module.frontmatter,
        headings: module.headings,
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

  const loadRoute = useCallback((url: URL): Promise<RouteMatch> => {
    const key = url.pathname
    const cached = routeCache.current.get(key)
    if (cached) return cached

    const loaded = resolveRoute(`${url.pathname}${url.search}${url.hash}`)
    routeCache.current.set(key, loaded)
    void loaded.catch(() => routeCache.current.delete(key))
    return loaded
  }, [])

  const commitPage = useCallback(
    (url: URL, page: ResolvedPage, position?: HistoryPosition): void => {
      const nextState = { path: browserPath(url.href), page }
      flushSync(() => setState(nextState))
      stateRef.current = nextState
      setMetadata(page)
      restoreNavigationPosition(url, position)
    },
    [],
  )

  const saveCurrentScroll = useCallback((): void => {
    const position: HistoryPosition = {
      path: stateRef.current.path,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    }
    window.history.replaceState(
      recordHistoryPosition(window.history.state, position),
      '',
    )
  }, [])

  const go = useCallback(
    async (href: string): Promise<void> => {
      const url = resolveInternalUrl(href, config.base)
      if (!url) return
      const current = currentBrowserUrl()
      const sequence = ++navigationSequence.current

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
        return
      }

      if (samePage(current, url)) {
        saveCurrentScroll()
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
        return
      }

      const match = await loadRoute(url)
      if (sequence !== navigationSequence.current) return
      saveCurrentScroll()
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
    },
    [commitPage, loadRoute, saveCurrentScroll],
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
      const url = currentBrowserUrl()
      const sequence = ++navigationSequence.current
      const navigate = async (): Promise<void> => {
        const current = new URL(stateRef.current.path, window.location.origin)
        const position = historyPosition(event.state)
        if (samePage(current, url)) {
          const nextState = {
            ...stateRef.current,
            path: browserPath(url.href),
          }
          flushSync(() => setState(nextState))
          stateRef.current = nextState
          restoreNavigationPosition(url, position)
          return
        }

        const match = await loadRoute(url)
        if (sequence !== navigationSequence.current) return
        commitPage(url, match.page, position)
      }
      void navigate()
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      navigationSequence.current += 1
      window.removeEventListener('popstate', handlePopState)
      window.history.scrollRestoration = initialRestoration
    }
  }, [commitPage, loadRoute, saveCurrentScroll])

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
    <RouterProvider value={router}>
      <Theme.Layout>
        <Component />
      </Theme.Layout>
    </RouterProvider>
  )
}
