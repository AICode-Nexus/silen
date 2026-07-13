import type { CompiledPage } from './mdx.js'
import type { RouteRecord } from '../shared/page.js'

export interface LinkDiagnostic {
  file: string
  route: string
  link: string
  message: string
}

export type BrokenLinkMode = 'error' | 'warn' | 'ignore'

const staticAssetExtension =
  /\.(?:avif|bmp|css|csv|eot|gif|ico|jpe?g|js|json|map|mp3|mp4|ogg|otf|pdf|png|svg|txt|wav|webm|webp|woff2?|xml|zip)$/i
const absoluteScheme = /^[A-Za-z][A-Za-z\d+.-]*:/

function normalizedBase(base: string): string {
  const leading = base.startsWith('/') ? base : `/${base}`
  return leading.endsWith('/') ? leading : `${leading}/`
}

function routeAliases(route: string): string[] {
  if (route === '/') return ['/']
  return route.endsWith('/')
    ? [route, route.slice(0, -1)]
    : [route, `${route}/`]
}

function pageDirectory(route: string): string {
  if (route === '/') return '/'
  return route.endsWith('/') ? route : `${route}/`
}

function stripBase(pathname: string, base: string): string {
  if (base === '/') return pathname
  const root = base.slice(0, -1)
  if (pathname === root || pathname === base) return '/'
  return pathname.startsWith(base)
    ? `/${pathname.slice(base.length)}`
    : pathname
}

function normalizePageExtension(pathname: string): string {
  const withoutExtension = pathname.replace(/\.(?:md|mdx|html)$/i, '')
  if (withoutExtension === '/index') return '/'
  return withoutExtension.endsWith('/index')
    ? `${withoutExtension.slice(0, -5)}`
    : withoutExtension
}

function targetRoute(
  link: string,
  page: CompiledPage,
  base: string,
): string | undefined {
  const trimmed = link.trim()
  if (!trimmed || trimmed.startsWith('//') || absoluteScheme.test(trimmed)) {
    return undefined
  }

  const mountedPage = `${base}${pageDirectory(page.route).replace(/^\//, '')}`
  let url: URL
  try {
    url = new URL(trimmed, `https://silen.local${mountedPage}`)
  } catch {
    return trimmed
  }

  let pathname = stripBase(url.pathname, base)
  try {
    pathname = decodeURIComponent(pathname)
  } catch {
    return pathname
  }
  pathname = pathname.replace(/\/{2,}/g, '/')
  if (staticAssetExtension.test(pathname)) return undefined
  return normalizePageExtension(pathname) || '/'
}

function formatDiagnostic(diagnostic: LinkDiagnostic): string {
  return `${diagnostic.file} (route ${diagnostic.route}): ${diagnostic.message}`
}

export function validateInternalLinks(
  routes: readonly RouteRecord[],
  pages: readonly CompiledPage[],
  mode: BrokenLinkMode,
  configuredBase = '/',
): LinkDiagnostic[] {
  if (mode === 'ignore') return []

  const base = normalizedBase(configuredBase)
  const known = new Set(routes.flatMap((route) => routeAliases(route.path)))
  const diagnostics: LinkDiagnostic[] = []

  for (const page of pages) {
    const seenTargets = new Set<string>()
    for (const link of page.links) {
      const target = targetRoute(link, page, base)
      if (
        target === undefined ||
        known.has(target) ||
        seenTargets.has(target)
      ) {
        continue
      }
      seenTargets.add(target)
      diagnostics.push({
        file: page.file,
        route: page.route,
        link,
        message: `Broken internal link ${link}`,
      })
    }
  }

  if (diagnostics.length === 0) return diagnostics
  const message = diagnostics.map(formatDiagnostic).join('\n')
  if (mode === 'error') throw new Error(message)
  console.warn(message)
  return diagnostics
}
