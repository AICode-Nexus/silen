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

function normalizedWhatwgInput(value: string): string {
  const normalized = value.replace(/[\t\n\r]/g, '')
  let start = 0
  let end = normalized.length
  while (start < end && normalized.charCodeAt(start) <= 0x20) start += 1
  while (end > start && normalized.charCodeAt(end - 1) <= 0x20) end -= 1
  return normalized.slice(start, end)
}

function isNetworkPath(value: string): boolean {
  const first = value[0]
  const second = value[1]
  return (
    (first === '/' || first === '\\') && (second === '/' || second === '\\')
  )
}

function requiresCanonicalPathname(value: string): boolean {
  if (value.includes('\\')) return true
  return value.split('/').some((segment) => {
    try {
      const decoded = decodeURIComponent(segment)
      return decoded === '.' || decoded === '..'
    } catch {
      return false
    }
  })
}

/** Resolve an authored documentation link without allowing a root path to escape the site base. */
export function resolveSiteLink(
  href: string,
  configuredBase: string | undefined = '/',
): string {
  const parsedHref = normalizedWhatwgInput(href)
  if (
    (!parsedHref.startsWith('/') && !parsedHref.startsWith('\\')) ||
    isNetworkPath(parsedHref)
  ) {
    return href
  }

  const match = /^([^?#]*)(.*)$/.exec(parsedHref)
  const rawPathname = match?.[1] ?? parsedHref
  const suffix = match?.[2] ?? ''
  const pathname = canonicalPathname(rawPathname)
  if (pathname === undefined) return href
  const canonicalize =
    parsedHref !== href || requiresCanonicalPathname(rawPathname)
  const safePathname = canonicalize ? pathname : rawPathname

  const base = normalizedBase(configuredBase)
  if (base === '/') return canonicalize ? `${safePathname}${suffix}` : href

  const baseWithoutSlash = base.slice(0, -1)
  if (pathname === baseWithoutSlash || pathname.startsWith(base)) {
    return canonicalize ? `${safePathname}${suffix}` : href
  }
  return `${base}${safePathname.replace(/^\/+/, '')}${suffix}`
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
