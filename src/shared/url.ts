export function joinBaseRoute(base: string, route: string): string {
  return `${base.replace(/\/$/, '')}/${route.replace(/^\//, '')}`
}

function normalizedBase(base: string | undefined): string {
  if (!base || base === '/') return '/'
  const withLeadingSlash = base.startsWith('/') ? base : `/${base}`
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash
    : `${withLeadingSlash}/`
}

function canonicalPathname(value: string): string | undefined {
  try {
    return new URL(value, 'https://silen.local').pathname
  } catch {
    return undefined
  }
}

/** Resolve an authored documentation link without allowing a root path to escape the site base. */
export function resolveSiteLink(
  href: string,
  configuredBase: string | undefined = '/',
): string {
  if (
    !href.startsWith('/') ||
    href.startsWith('//') ||
    href.startsWith('/\\')
  ) {
    return href
  }

  const base = normalizedBase(configuredBase)
  if (base === '/') return href

  const match = /^([^?#]*)(.*)$/.exec(href)
  const rawPathname = match?.[1] ?? href
  const suffix = match?.[2] ?? ''
  const pathname = canonicalPathname(rawPathname)
  if (pathname === undefined) return href

  const baseWithoutSlash = base.slice(0, -1)
  if (pathname === baseWithoutSlash || pathname.startsWith(base)) return href
  return `${base}${rawPathname.replace(/^\/+/, '')}${suffix}`
}

export function normalizedUrlScheme(value: string): string | undefined {
  const compact = [...value]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0
      return code > 0x20 && code !== 0x7f
    })
    .join('')
  return /^[a-z][a-z0-9+.-]*:/i.exec(compact)?.[0].slice(0, -1).toLowerCase()
}

export function hasExecutableUrlScheme(value: string): boolean {
  const scheme = normalizedUrlScheme(value)
  return scheme === 'data' || scheme === 'javascript' || scheme === 'vbscript'
}
