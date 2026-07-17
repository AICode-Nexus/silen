import { describe, expect, it } from 'vitest'
import { createPageSeo } from '../src/node/seo'
import type { ResolvedConfig, ThemeLocaleItem } from '../src/shared/config'
import type { RouteRecord } from '../src/shared/page'

function resolvedConfig(
  lang: string,
  locales: readonly ThemeLocaleItem[],
): ResolvedConfig {
  return {
    base: '/handbook/',
    lang,
    siteUrl: 'https://docs.example.com',
    themeConfig: { locales },
  } as ResolvedConfig
}

function routeRecords(...paths: readonly string[]): RouteRecord[] {
  return paths.map((route) => ({
    path: route,
    file: `${route}.mdx`,
    relativeFile: `${route}.mdx`,
  }))
}

describe('localized SEO alternates', () => {
  it('uses the configured non-root default language when another locale owns root', () => {
    const seo = createPageSeo(
      resolvedConfig('en-US', [
        { lang: 'zh-CN', label: '中文', root: '/' },
        { lang: 'en-US', label: 'English', root: '/en/' },
      ]),
      routeRecords('/guide/', '/en/guide/'),
      '/en/guide/',
    )

    expect(seo?.alternates).toEqual([
      {
        lang: 'en-US',
        url: 'https://docs.example.com/handbook/en/guide/',
      },
      {
        lang: 'zh-CN',
        url: 'https://docs.example.com/handbook/guide/',
      },
      {
        lang: 'x-default',
        url: 'https://docs.example.com/handbook/en/guide/',
      },
    ])
  })

  it('uses the configured default counterpart when every locale has a non-root path', () => {
    const seo = createPageSeo(
      resolvedConfig('en-US', [
        { lang: 'zh-CN', label: '中文', root: '/zh/' },
        { lang: 'en-US', label: 'English', root: '/en/' },
      ]),
      routeRecords('/en/guide/', '/zh/guide/'),
      '/zh/guide/',
    )

    expect(seo?.alternates).toEqual([
      {
        lang: 'en-US',
        url: 'https://docs.example.com/handbook/en/guide/',
      },
      {
        lang: 'zh-CN',
        url: 'https://docs.example.com/handbook/zh/guide/',
      },
      {
        lang: 'x-default',
        url: 'https://docs.example.com/handbook/en/guide/',
      },
    ])
  })

  it('omits the default language and x-default when that counterpart was not compiled', () => {
    const seo = createPageSeo(
      resolvedConfig('en-US', [
        { lang: 'zh-CN', label: '中文', root: '/' },
        { lang: 'en-US', label: 'English', root: '/en/' },
      ]),
      routeRecords('/only-zh/'),
      '/only-zh/',
    )

    expect(seo?.alternates).toEqual([
      {
        lang: 'zh-CN',
        url: 'https://docs.example.com/handbook/only-zh/',
      },
    ])
  })

  it('falls back to the root locale when config.lang has no configured locale', () => {
    const seo = createPageSeo(
      resolvedConfig('de-DE', [
        { lang: 'fr-FR', label: 'Français', root: '/fr/' },
        { lang: 'en-US', label: 'English', root: '/' },
      ]),
      routeRecords('/guide/', '/fr/guide/'),
      '/fr/guide/',
    )

    expect(seo?.alternates).toEqual([
      {
        lang: 'en-US',
        url: 'https://docs.example.com/handbook/guide/',
      },
      {
        lang: 'fr-FR',
        url: 'https://docs.example.com/handbook/fr/guide/',
      },
      {
        lang: 'x-default',
        url: 'https://docs.example.com/handbook/guide/',
      },
    ])
  })
})
