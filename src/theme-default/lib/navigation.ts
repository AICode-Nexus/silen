import type { ThemeLocaleItem } from '../../shared/config.js'
import { resolveSiteLink } from '../../shared/url.js'

function normalizedBase(base: string): string {
  if (!base || base === '/') return '/'
  const leading = base.startsWith('/') ? base : `/${base}`
  return leading.endsWith('/') ? leading : `${leading}/`
}

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
  return resolveSiteLink(link.startsWith('/') ? link : `/${link}`, base)
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
  if (target === current) return true
  return normalizedPath(resolveThemeLink(currentRoute, base)) === target
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
  const resolvedBase = normalizedBase(base)
  if (resolvedBase === '/') return path

  const baseWithoutSlash = resolvedBase.slice(0, -1)
  if (path === baseWithoutSlash) return '/'
  if (path.startsWith(resolvedBase))
    return `/${path.slice(resolvedBase.length)}`
  return path
}

function isWithinLocaleRoot(path: string, root: string): boolean {
  if (root === '/') return true
  return path === root.slice(0, -1) || path.startsWith(root)
}

function localeRelativePath(path: string, root: string): string {
  if (root === '/') return path === '/' ? '' : path.slice(1)
  if (path === root || path === root.slice(0, -1)) return ''
  if (path.startsWith(root)) return path.slice(root.length)
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
  const localeRoots = locales
    .map((locale) => ({
      locale,
      root:
        locale.root === undefined
          ? undefined
          : normalizedLocaleRoot(locale.root),
    }))
    .filter(
      (entry): entry is { locale: ThemeLocaleItem; root: string } =>
        entry.root !== undefined,
    )
  const currentRoot =
    localeRoots
      .filter(({ root }) => isWithinLocaleRoot(currentPath, root))
      .sort((left, right) => right.root.length - left.root.length)[0]?.root ??
    '/'
  const relativePath = localeRelativePath(currentPath, currentRoot)
  const suffix = `${currentUrl.search}${currentUrl.hash}`

  return locales.map((locale) => {
    if (locale.root !== undefined) {
      const root = normalizedLocaleRoot(locale.root)
      const target = `${localePath(root, relativePath)}${suffix}`
      return {
        locale,
        href: resolveThemeLink(target, base),
        active: root === currentRoot,
      }
    }

    const link = locale.link ?? '/'
    return {
      locale,
      href: resolveThemeLink(link, base),
      active: isActiveThemeLink(currentRoute, link, base),
    }
  })
}
