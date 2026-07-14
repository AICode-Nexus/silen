import type { PageModule } from 'virtual:silen/routes'
import type { Theme } from 'virtual:silen/theme'

export interface HotRouteUpdate {
  module: PageModule
  path: string
}

type HotRouteListener = (update: HotRouteUpdate) => void
type HotThemeListener = (theme: Theme) => void

const routeListeners = new Set<HotRouteListener>()
const themeListeners = new Set<HotThemeListener>()

export function publishHotRouteUpdate(update: HotRouteUpdate): void {
  for (const listener of routeListeners) listener(update)
}

export function subscribeToHotRouteUpdates(
  listener: HotRouteListener,
): () => void {
  routeListeners.add(listener)
  return () => routeListeners.delete(listener)
}

export function publishHotThemeUpdate(theme: Theme): void {
  for (const listener of themeListeners) listener(theme)
}

export function subscribeToHotThemeUpdates(
  listener: HotThemeListener,
): () => void {
  themeListeners.add(listener)
  return () => themeListeners.delete(listener)
}
