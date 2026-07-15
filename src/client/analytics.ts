import type { AnalyticsProvider } from '../shared/config.js'

export const SILEN_PAGEVIEW_EVENT = 'silen:pageview'

export interface AnalyticsPageviewDetail {
  readonly path: string
  readonly title: string
  readonly location: string
  readonly referrer?: string
}

interface AnalyticsWindow extends Window {
  _hmt?: unknown[][]
  gtag?: (...arguments_: unknown[]) => void
}

export function analyticsPagePath(value: string): string {
  const url = new URL(value, 'https://silen.local')
  return `${url.pathname}${url.search}`
}

export function trackAnalyticsPageview(
  analytics: readonly AnalyticsProvider[],
  pageview: {
    readonly path: string
    readonly title: string
    readonly referrer?: string
  },
): AnalyticsPageviewDetail | undefined {
  const providers = analytics.filter((provider) => provider.enabled !== false)
  if (providers.length === 0 || typeof window === 'undefined') return undefined

  const analyticsWindow = window as AnalyticsWindow
  const detail: AnalyticsPageviewDetail = {
    path: pageview.path,
    title: pageview.title,
    location: new URL(pageview.path, window.location.origin).href,
    ...(pageview.referrer === undefined ? {} : { referrer: pageview.referrer }),
  }

  for (const provider of providers) {
    if (provider.provider === 'google') {
      analyticsWindow.gtag?.('event', 'page_view', {
        send_to: provider.id,
        page_title: detail.title,
        page_location: detail.location,
        ...(detail.referrer === undefined
          ? {}
          : { page_referrer: detail.referrer }),
      })
    } else if (provider.provider === 'baidu') {
      analyticsWindow._hmt ??= []
      analyticsWindow._hmt.push(['_trackPageview', detail.path])
    }
  }

  window.dispatchEvent(
    new CustomEvent<AnalyticsPageviewDetail>(SILEN_PAGEVIEW_EVENT, { detail }),
  )
  return detail
}
