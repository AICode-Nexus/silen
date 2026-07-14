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

function isWithinBase(linkPath: string, base: string): boolean {
  if (base === '/') return true
  const baseWithoutSlash = base.slice(0, -1)
  return linkPath === baseWithoutSlash || linkPath.startsWith(base)
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

  const resolvedBase = normalizedBase(base)
  const match = /^([^?#]*)(.*)$/.exec(link)
  const linkPath = match?.[1] ?? link
  const suffix = match?.[2] ?? ''
  const absolutePath = linkPath.startsWith('/') ? linkPath : `/${linkPath}`
  if (isWithinBase(absolutePath, resolvedBase))
    return `${absolutePath}${suffix}`
  return `${resolvedBase}${absolutePath.replace(/^\/+/, '')}${suffix}`
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
