import type { ThemeLocaleItem } from '../../shared/config.js'
import { resolveCurrentLocale } from '../../shared/config.js'
import {
  pathnameIdentity,
  resolveSiteLink,
  stripSiteBase,
} from '../../shared/url.js'

function pathname(value: string): string | undefined {
  try {
    return new URL(value, 'https://silen.local').pathname
  } catch {
    return undefined
  }
}

function normalizedPath(value: string): string | undefined {
  const parsed = pathname(value)
  if (parsed === undefined) return undefined
  if (parsed === '/') return '/'
  return parsed.endsWith('/') ? parsed.slice(0, -1) : parsed
}

function hasScheme(link: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(link)
}

export function resolveThemeLink(link: string, base: string): string {
  if (
    !link ||
    link.startsWith('#') ||
    link.startsWith('?') ||
    link.startsWith('//') ||
    hasScheme(link)
  ) {
    return link
  }
  return resolveSiteLink(link.startsWith('/') ? link : `/${link}`, base) ?? link
}

export function isActiveThemeLink(
  currentRoute: string,
  link: string,
  base: string,
): boolean {
  if (
    !link ||
    link.startsWith('#') ||
    link.startsWith('?') ||
    link.startsWith('//') ||
    hasScheme(link)
  ) {
    return false
  }

  const target = normalizedPath(resolveThemeLink(link, base))
  const current = normalizedPath(currentRoute)
  if (target === undefined || current === undefined) return false
  const targetIdentity = pathnameIdentity(target)
  if (targetIdentity === pathnameIdentity(current)) return true
  const resolvedCurrent = normalizedPath(resolveThemeLink(currentRoute, base))
  return (
    resolvedCurrent !== undefined &&
    pathnameIdentity(resolvedCurrent) === targetIdentity
  )
}

export interface ResolvedThemeLocaleLink {
  readonly locale: ThemeLocaleItem
  readonly href: string
  readonly active: boolean
}

function normalizedLocaleRoot(root: string): string {
  const parsed = pathname(root) ?? '/'
  if (parsed === '/') return '/'
  return parsed.endsWith('/') ? parsed : `${parsed}/`
}

function stripBasePath(path: string, base: string): string {
  return stripSiteBase(path, base) ?? path
}

function localeRelativePath(path: string, root: string): string {
  if (root === '/') return path === '/' ? '' : path.slice(1)
  const pathIdentity = pathnameIdentity(path)
  const rootIdentity = pathnameIdentity(root)
  if (
    pathIdentity === rootIdentity ||
    pathIdentity === rootIdentity.slice(0, -1)
  ) {
    return ''
  }
  if (pathIdentity.startsWith(rootIdentity)) return path.slice(root.length)
  return path.startsWith('/') ? path.slice(1) : path
}

function localePath(root: string, relativePath: string): string {
  return relativePath ? `${root}${relativePath}` : root
}

export function resolveThemeLocaleLinks(
  locales: readonly ThemeLocaleItem[],
  currentRoute: string,
  base: string,
): readonly ResolvedThemeLocaleLink[] {
  const currentUrl = new URL(currentRoute, 'https://silen.local')
  const currentPath = stripBasePath(currentUrl.pathname, base)
  const currentLocale = resolveCurrentLocale(
    locales,
    currentRoute,
    base,
    locales[0]?.lang ?? 'en-US',
  )
  const currentRoot = currentLocale.root
  const relativePath = localeRelativePath(currentPath, currentRoot)
  const suffix = `${currentUrl.search}${currentUrl.hash}`

  return locales.map((locale) => {
    if (locale.root !== undefined) {
      const root = normalizedLocaleRoot(locale.root)
      const target = `${localePath(root, relativePath)}${suffix}`
      return {
        locale,
        href: resolveThemeLink(target, base),
        active:
          pathnameIdentity(root) === pathnameIdentity(currentRoot) &&
          currentLocale.locale === locale,
      }
    }

    const link = locale.link ?? '/'
    return {
      locale,
      href: resolveThemeLink(link, base),
      active: currentLocale.locale === locale,
    }
  })
}
