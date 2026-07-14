export function joinBaseRoute(base: string, route: string): string {
  return `${base.replace(/\/$/, '')}/${route.replace(/^\//, '')}`
}
