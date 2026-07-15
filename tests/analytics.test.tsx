import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SILEN_PAGEVIEW_EVENT,
  analyticsPagePath,
  trackAnalyticsPageview,
  type AnalyticsPageviewDetail,
} from '../src/client/analytics'

interface AnalyticsWindow extends Window {
  _hmt?: unknown[][]
  gtag?: ReturnType<typeof vi.fn>
}

describe('client analytics', () => {
  const analyticsWindow = window as AnalyticsWindow

  beforeEach(() => {
    window.history.replaceState(null, '', '/project/guide?mode=full#install')
    analyticsWindow._hmt = []
    analyticsWindow.gtag = vi.fn()
  })

  afterEach(() => {
    delete analyticsWindow._hmt
    delete analyticsWindow.gtag
  })

  it('tracks a page once per enabled preset and dispatches a generic event', () => {
    const details: AnalyticsPageviewDetail[] = []
    const listener = (event: Event): void => {
      details.push((event as CustomEvent<AnalyticsPageviewDetail>).detail)
    }
    window.addEventListener(SILEN_PAGEVIEW_EVENT, listener)

    const detail = trackAnalyticsPageview(
      [
        { provider: 'google', id: 'G-EXAMPLE' },
        { provider: 'baidu', id: 'baidu-example' },
        {
          provider: 'custom',
          name: 'self-hosted',
          scripts: [{ content: 'void 0' }],
        },
        { provider: 'google', id: 'disabled', enabled: false },
      ],
      {
        path: '/project/guide?mode=full',
        title: 'Guide',
        referrer: 'https://docs.example.com/project/',
      },
    )

    window.removeEventListener(SILEN_PAGEVIEW_EVENT, listener)
    expect(analyticsWindow.gtag).toHaveBeenCalledOnce()
    expect(analyticsWindow.gtag).toHaveBeenCalledWith('event', 'page_view', {
      send_to: 'G-EXAMPLE',
      page_title: 'Guide',
      page_location: 'http://localhost:3000/project/guide?mode=full',
      page_referrer: 'https://docs.example.com/project/',
    })
    expect(analyticsWindow._hmt).toEqual([
      ['_trackPageview', '/project/guide?mode=full'],
    ])
    expect(detail).toEqual({
      path: '/project/guide?mode=full',
      title: 'Guide',
      location: 'http://localhost:3000/project/guide?mode=full',
      referrer: 'https://docs.example.com/project/',
    })
    expect(details).toEqual([detail])
  })

  it('ignores fragments and does nothing without enabled providers', () => {
    expect(analyticsPagePath('/project/guide?mode=full#install')).toBe(
      '/project/guide?mode=full',
    )
    expect(
      trackAnalyticsPageview(
        [{ provider: 'google', id: 'disabled', enabled: false }],
        { path: '/project/', title: 'Home' },
      ),
    ).toBeUndefined()
    expect(analyticsWindow.gtag).not.toHaveBeenCalled()
    expect(analyticsWindow._hmt).toEqual([])
  })
})
