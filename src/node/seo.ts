import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ResolvedConfig, ThemeLocaleItem } from '../shared/config.js'
import type { RouteRecord } from '../shared/page.js'
import type { PageSeo, SeoAlternate } from './render.js'

interface LocaleRoot {
  lang: string
  root: string
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function routePathname(route: string): string {
  return new URL(route, 'https://silen.local').pathname
}

function localeRoot(locale: ThemeLocaleItem): LocaleRoot | undefined {
  if (locale.root === undefined) return undefined
  const pathname = routePathname(locale.root)
  return {
    lang: locale.lang,
    root:
      pathname === '/' || pathname.endsWith('/') ? pathname : `${pathname}/`,
  }
}

function localeRoots(config: ResolvedConfig): readonly LocaleRoot[] {
  const configured = (config.themeConfig.locales ?? []).flatMap((locale) => {
    const rooted = localeRoot(locale)
    return rooted === undefined ? [] : [rooted]
  })
  const defaultLocale = configured.find(({ lang }) => lang === config.lang) ??
    configured.find(({ root }) => root === '/') ?? {
      lang: config.lang,
      root: '/',
    }
  return [
    defaultLocale,
    ...configured.filter(
      ({ lang, root }) =>
        lang !== defaultLocale.lang || root !== defaultLocale.root,
    ),
  ]
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

export function createPageSeo(
  config: ResolvedConfig,
  routes: readonly RouteRecord[],
  route: string,
): PageSeo | undefined {
  if (config.siteUrl === undefined) return undefined

  const canonicalRoute = routePathname(route)
  const routeByPathname = new Map(
    routes.map((candidate) => [routePathname(candidate.path), candidate.path]),
  )
  const roots = localeRoots(config)
  const currentRoot = [...roots]
    .filter(({ root }) => routeWithinRoot(canonicalRoute, root))
    .sort((left, right) => right.root.length - left.root.length)[0] ?? {
    lang: config.lang,
    root: '/',
  }
  const relativeRoute = relativeLocaleRoute(canonicalRoute, currentRoot.root)
  const alternates: SeoAlternate[] = []
  const seenLanguages = new Set<string>()

  for (const locale of roots) {
    if (seenLanguages.has(locale.lang)) continue
    const target = routeForLocale(locale.root, relativeRoute)
    const compiledRoute = routeByPathname.get(target)
    if (compiledRoute === undefined) continue
    seenLanguages.add(locale.lang)
    alternates.push({
      lang: locale.lang,
      url: absoluteRouteUrl(config.siteUrl, config.base, compiledRoute),
    })
  }

  const defaultTarget = routeForLocale(roots[0]?.root ?? '/', relativeRoute)
  const defaultRoute = routeByPathname.get(defaultTarget)
  if (defaultRoute !== undefined) {
    alternates.push({
      lang: 'x-default',
      url: absoluteRouteUrl(config.siteUrl, config.base, defaultRoute),
    })
  }

  return {
    canonicalUrl: absoluteRouteUrl(config.siteUrl, config.base, route),
    alternates,
  }
}

function escapeXml(value: string): string {
  const escapes: Readonly<Record<string, string>> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  }
  return value.replace(/[&<>"']/g, (character) => escapes[character]!)
}

export async function emitSitemap(
  config: ResolvedConfig,
  routes: readonly RouteRecord[],
  outDir: string,
): Promise<void> {
  const siteUrl = config.siteUrl
  if (siteUrl === undefined) return
  const urls = routes
    .map((route) => absoluteRouteUrl(siteUrl, config.base, route.path))
    .sort(compareStrings)
  const lines = urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`)
  await writeFile(
    path.join(outDir, 'sitemap.xml'),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...lines,
      '</urlset>',
      '',
    ].join('\n'),
    'utf8',
  )
}
