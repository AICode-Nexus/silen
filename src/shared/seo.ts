import { normalizeLocaleRoot } from './config.js'

export const coreSeoAttribute = 'data-silen-seo'

export interface SeoAlternate {
  readonly lang: string
  readonly url: string
}

export interface PageSeo {
  readonly canonicalUrl: string
  readonly alternates: readonly SeoAlternate[]
}

export interface SeoHeadEntry {
  readonly tag: 'link' | 'meta'
  readonly attributes: Readonly<Record<string, string>>
}

interface SeoLocale {
  readonly lang: string
  readonly root: string
}

export interface PageSeoConfig {
  readonly siteUrl?: string
  readonly base: string
  readonly lang: string
  readonly themeConfig: {
    readonly locales?: readonly {
      readonly lang: string
      readonly root?: string
    }[]
  }
}

export interface PageSeoRoute {
  readonly path: string
}

export interface PageSeoResolver {
  resolve(route: string): PageSeo | undefined
}

function languageIdentity(lang: string): string {
  return lang.toLowerCase()
}

function routePathname(route: string): string {
  return new URL(route, 'https://silen.local').pathname
}

function routeIdentity(route: string): string {
  const pathname = routePathname(route)
  return pathname === '/' ? pathname : pathname.replace(/\/$/, '')
}

function localeRoots(config: PageSeoConfig): readonly SeoLocale[] {
  const configured = (config.themeConfig.locales ?? []).flatMap((locale) =>
    locale.root === undefined
      ? []
      : [{ lang: locale.lang, root: normalizeLocaleRoot(locale.root) }],
  )
  const rootOwners = new Set<string>()
  for (const locale of configured) {
    if (rootOwners.has(locale.root)) {
      throw new Error(`duplicate normalized locale root ${locale.root}`)
    }
    rootOwners.add(locale.root)
  }

  const configuredDefault = configured.find(
    ({ lang }) => languageIdentity(lang) === languageIdentity(config.lang),
  )
  const defaultLocale = configuredDefault ??
    configured.find(({ root }) => root === '/') ?? {
      lang: config.lang,
      root: '/',
    }
  return Object.freeze([
    defaultLocale,
    ...configured.filter((locale) => locale !== defaultLocale),
  ])
}

function routeWithinRoot(route: string, root: string): boolean {
  return root === '/' || route === root.slice(0, -1) || route.startsWith(root)
}

function relativeLocaleRoute(route: string, root: string): string {
  if (root === '/') return route
  if (route === root.slice(0, -1) || route === root) return '/'
  return `/${route.slice(root.length)}`
}

function routeForLocale(root: string, relativeRoute: string): string {
  if (root === '/') return relativeRoute
  if (relativeRoute === '/') return root
  return `${root}${relativeRoute.slice(1)}`
}

function mountedRoute(base: string, route: string): string {
  return route === '/' ? base : `${base}${route.slice(1)}`
}

export function absoluteRouteUrl(
  siteUrl: string,
  base: string,
  route: string,
): string {
  return new URL(mountedRoute(base, route), siteUrl).href
}

export function createPageSeoResolver(
  config: PageSeoConfig,
  routes: readonly PageSeoRoute[],
): PageSeoResolver {
  if (config.siteUrl === undefined) {
    return Object.freeze({ resolve: () => undefined })
  }

  const routeByPathname = new Map<string, string>()
  for (const candidate of routes) {
    const route = candidate.path
    routeByPathname.set(routeIdentity(route), route)
  }
  const roots = localeRoots(config)
  const matchingRoots = Object.freeze(
    [...roots].sort((left, right) => right.root.length - left.root.length),
  )
  const siteUrl = config.siteUrl

  return Object.freeze({
    resolve(route: string): PageSeo {
      const canonicalRoute = routePathname(route)
      const currentRoot = matchingRoots.find(({ root }) =>
        routeWithinRoot(canonicalRoute, root),
      ) ?? { lang: config.lang, root: '/' }
      const relativeRoute = relativeLocaleRoute(
        canonicalRoute,
        currentRoot.root,
      )
      const alternates: SeoAlternate[] = []
      const seenLanguages = new Set<string>()

      for (const locale of roots) {
        const language = languageIdentity(locale.lang)
        if (seenLanguages.has(language)) continue
        const target = routeForLocale(locale.root, relativeRoute)
        const compiledRoute = routeByPathname.get(routeIdentity(target))
        if (compiledRoute === undefined) continue
        seenLanguages.add(language)
        alternates.push(
          Object.freeze({
            lang: locale.lang,
            url: absoluteRouteUrl(siteUrl, config.base, compiledRoute),
          }),
        )
      }

      const defaultTarget = routeForLocale(roots[0]?.root ?? '/', relativeRoute)
      const defaultRoute = routeByPathname.get(routeIdentity(defaultTarget))
      if (defaultRoute !== undefined) {
        alternates.push(
          Object.freeze({
            lang: 'x-default',
            url: absoluteRouteUrl(siteUrl, config.base, defaultRoute),
          }),
        )
      }

      return Object.freeze({
        canonicalUrl: absoluteRouteUrl(siteUrl, config.base, route),
        alternates: Object.freeze(alternates),
      })
    },
  })
}

export function createSeoHeadEntries(
  page: { readonly title: string; readonly description: string },
  seo: PageSeo | undefined,
): readonly SeoHeadEntry[] {
  if (seo === undefined) return []

  return [
    {
      tag: 'link',
      attributes: { rel: 'canonical', href: seo.canonicalUrl },
    },
    ...seo.alternates.map(({ lang, url }) => ({
      tag: 'link' as const,
      attributes: { rel: 'alternate', hreflang: lang, href: url },
    })),
    {
      tag: 'meta',
      attributes: { property: 'og:type', content: 'website' },
    },
    ...(page.title
      ? [
          {
            tag: 'meta' as const,
            attributes: { property: 'og:title', content: page.title },
          },
        ]
      : []),
    ...(page.description
      ? [
          {
            tag: 'meta' as const,
            attributes: {
              property: 'og:description',
              content: page.description,
            },
          },
        ]
      : []),
    {
      tag: 'meta',
      attributes: { property: 'og:url', content: seo.canonicalUrl },
    },
    {
      tag: 'meta',
      attributes: { name: 'twitter:card', content: 'summary' },
    },
    ...(page.title
      ? [
          {
            tag: 'meta' as const,
            attributes: { name: 'twitter:title', content: page.title },
          },
        ]
      : []),
    ...(page.description
      ? [
          {
            tag: 'meta' as const,
            attributes: {
              name: 'twitter:description',
              content: page.description,
            },
          },
        ]
      : []),
  ]
}
