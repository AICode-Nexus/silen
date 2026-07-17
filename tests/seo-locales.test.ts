import { readFile } from 'node:fs/promises'
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

  it('matches the configured default BCP 47 language case-insensitively', () => {
    const seo = createPageSeo(
      resolvedConfig('en-us', [
        { lang: 'zh-CN', label: '中文', root: '/' },
        { lang: 'en-US', label: 'English', root: '/en/' },
      ]),
      routeRecords('/guide/', '/en/guide/'),
      '/guide/',
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

  it('deduplicates case-equivalent language tags while preserving authored hreflang', () => {
    const seo = createPageSeo(
      resolvedConfig('en-US', [
        { lang: 'en-US', label: 'English', root: '/en/' },
        { lang: 'EN-us', label: 'Legacy English', root: '/legacy-en/' },
        { lang: 'zh-CN', label: '中文', root: '/' },
      ]),
      routeRecords('/en/guide/', '/legacy-en/guide/', '/guide/'),
      '/legacy-en/guide/',
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

  it('rejects duplicate normalized locale roots in SEO resolution', () => {
    expect(() =>
      createPageSeo(
        resolvedConfig('en-US', [
          { lang: 'en-US', label: 'English', root: '/shared' },
          { lang: 'zh-CN', label: '中文', root: '/shared/' },
        ]),
        routeRecords('/shared/'),
        '/shared/',
      ),
    ).toThrow(/duplicate normalized locale root \/shared\//i)
  })

  it('builds one immutable route index before the build render loop', async () => {
    const seoModule = await import('../src/node/seo')
    const createResolver = (
      seoModule as typeof seoModule & {
        createPageSeoResolver?: (
          config: ResolvedConfig,
          routes: readonly RouteRecord[],
        ) => { resolve(route: string): ReturnType<typeof createPageSeo> }
      }
    ).createPageSeoResolver

    expect(createResolver).toBeTypeOf('function')
    if (createResolver === undefined) return

    let routePathReads = 0
    const routes = Array.from({ length: 200 }, (_, index) => {
      const route = `/route-${index}/`
      return Object.defineProperty(
        {
          file: `${route}.mdx`,
          relativeFile: `${route}.mdx`,
        },
        'path',
        {
          enumerable: true,
          get() {
            routePathReads += 1
            return route
          },
        },
      ) as RouteRecord
    })
    const resolver = createResolver(
      resolvedConfig('en-US', [{ lang: 'en-US', label: 'English', root: '/' }]),
      routes,
    )
    const readsAfterIndexing = routePathReads

    for (let index = 0; index < routes.length; index += 1) {
      resolver.resolve(`/route-${index}/`)
    }

    expect(readsAfterIndexing).toBe(routes.length)
    expect(routePathReads).toBe(readsAfterIndexing)

    const buildSource = await readFile('src/node/build.ts', 'utf8')
    const resolverCreation = buildSource.indexOf(
      'createPageSeoResolver(config, routes)',
    )
    const renderLoop = buildSource.indexOf('for (const output of outputs)')
    const routeResolution = buildSource.indexOf(
      'seoResolver.resolve(route.path)',
    )

    expect(resolverCreation).toBeGreaterThan(-1)
    expect(resolverCreation).toBeLessThan(renderLoop)
    expect(routeResolution).toBeGreaterThan(renderLoop)
  })
})
