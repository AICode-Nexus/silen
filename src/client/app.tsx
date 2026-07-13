import type { ComponentType } from 'react'
import config from 'virtual:silen/config'
import routes from 'virtual:silen/routes'
import Theme from 'virtual:silen/theme'
import type { Heading, JsonObject } from '../shared/page.js'

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

function decodePathname(pathname: string): string {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return pathname
  }
}

function routePathname(url: string): {
  pathname: string
  route: string | undefined
} {
  const pathname = decodePathname(new URL(url, 'https://silen.local').pathname)
  if (config.base === '/') return { pathname, route: pathname }

  const baseWithoutSlash = config.base.slice(0, -1)
  if (pathname === baseWithoutSlash) return { pathname, route: '/' }
  if (!pathname.startsWith(config.base)) return { pathname, route: undefined }

  return { pathname, route: `/${pathname.slice(config.base.length)}` }
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

export function App({ initialPage }: AppProps): React.JSX.Element {
  const { Component } = initialPage
  return (
    <Theme.Layout>
      <Component />
    </Theme.Layout>
  )
}
