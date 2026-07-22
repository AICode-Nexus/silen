function pathname(value: string): string {
  return value.split(/[?#]/, 1)[0] ?? value
}

export function normalizeSiteRoute(value: string): string {
  const withoutSuffix = pathname(value).replace(/\.(?:md|mdx|html)$/i, '')
  if (withoutSuffix === '/index') return '/'
  if (withoutSuffix.endsWith('/index')) {
    return withoutSuffix.slice(0, -6) || '/'
  }
  if (withoutSuffix.length > 1 && withoutSuffix.endsWith('/')) {
    return withoutSuffix.slice(0, -1)
  }
  return withoutSuffix || '/'
}

export function routeUnderBase(
  value: string,
  base: string | undefined,
): string {
  const target = pathname(value)
  if (!base || base === '/') return normalizeSiteRoute(target)
  const normalizedBase = (base.startsWith('/') ? base : `/${base}`).replace(
    /\/?$/,
    '/',
  )
  const mount = normalizedBase.slice(0, -1)
  if (target === mount) return '/'
  if (target.startsWith(normalizedBase)) {
    return normalizeSiteRoute(`/${target.slice(normalizedBase.length)}`)
  }
  return normalizeSiteRoute(target)
}
