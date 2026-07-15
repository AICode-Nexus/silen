export function joinBaseRoute(base: string, route: string): string {
  return `${base.replace(/\/$/, '')}/${route.replace(/^\//, '')}`
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
