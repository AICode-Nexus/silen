import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ResolvedConfig } from '../src/shared/config'
import type { RouteRecord } from '../src/shared/page'
import { silenPlugin } from '../src/node/plugin'
import { createVirtualModules } from '../src/node/virtual'

function resolvedConfig(root: string): ResolvedConfig {
  return {
    title: 'Docs',
    description: 'Project documentation',
    lang: 'en-US',
    base: '/project/',
    outDir: path.join(root, '.silen/dist'),
    onBrokenLinks: 'error',
    themeConfig: {},
    analytics: [],
    ai: {
      llmsTxt: true,
      llmsFullTxt: true,
      markdownRoutes: true,
      index: true,
      contract: {
        enabled: true,
        instructions: undefined,
        tasksDir: undefined,
      },
    },
    command: 'build',
    root,
    configFile: path.join(root, '.silen/config.ts'),
  }
}

async function importGeneratedModule(source: string): Promise<unknown> {
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  const loaded: unknown = await import(dataUrl)
  return loaded
}

describe('virtual modules', () => {
  it('emits lazy route imports with safe POSIX and Windows Vite paths', async () => {
    const root = path.resolve('tests/fixtures/ssr')
    const routes: RouteRecord[] = [
      {
        path: '/',
        file: '/repo/docs/index.mdx',
        relativeFile: 'index.mdx',
      },
      {
        path: "/author's-notes",
        file: String.raw`C:\repo\author's-notes.mdx`,
        relativeFile: "author's-notes.mdx",
      },
    ]

    const modules = createVirtualModules({
      routes,
      config: resolvedConfig(root),
    })

    expect(modules.routes).toContain(
      "'/': () => import('/repo/docs/index.mdx')",
    )
    expect(modules.routes).toContain(
      "'/author\\'s-notes': () => import('/@fs/C:/repo/author\\'s-notes.mdx')",
    )
    expect(modules.routes).toContain('export default routes')

    const loaded = (await importGeneratedModule(modules.routes)) as {
      default: Record<string, unknown>
    }
    expect(Object.keys(loaded.default)).toEqual(['/', "/author's-notes"])
  })

  it('adds explicit development HMR boundaries without changing production modules', () => {
    const root = path.resolve('tests/fixtures/ssr')
    const route: RouteRecord = {
      path: '/',
      file: path.join(root, 'index.mdx'),
      relativeFile: 'index.mdx',
    }
    const production = createVirtualModules({
      routes: [route],
      config: resolvedConfig(root),
    })
    const development = createVirtualModules({
      routes: [route],
      config: resolvedConfig(root),
      hmr: true,
    })

    expect(production.routes).not.toContain('import.meta.hot')
    expect(production.theme).not.toContain('import.meta.hot')
    expect(development.routes).toContain('publishHotRouteUpdate')
    expect(development.routes).toContain('import.meta.hot.accept([')
    expect(development.routes).toContain(route.file.replaceAll('\\', '/'))
    expect(development.theme).toContain('import.meta.hot.accept(')
  })

  it('emits deterministic client extension imports', () => {
    const root = path.resolve('tests/fixtures/ssr')
    const modules = createVirtualModules({
      routes: [],
      config: resolvedConfig(root),
      clientModules: ['./.silen/client.tsx', '@scope/silen-plugin/client'],
    })

    expect(modules.clientExtensions).toContain(
      path.join(root, '.silen/client.tsx').replaceAll('\\', '/'),
    )
    expect(modules.clientExtensions).toContain(
      "from '@scope/silen-plugin/client'",
    )
    expect(modules.clientExtensions).toContain(
      'export default clientExtensions',
    )
  })

  it('serializes config as data without executing prototype-named fields', async () => {
    const root = path.resolve('tests/fixtures/ssr')
    const config = resolvedConfig(root) as ResolvedConfig &
      Record<string, unknown>
    Object.defineProperty(config, '__proto__', {
      enumerable: true,
      value: { polluted: true },
    })

    const source = createVirtualModules({ routes: [], config }).config
    const loaded = (await importGeneratedModule(source)) as {
      default: Record<string, unknown>
    }

    expect(loaded.default.title).toBe('Docs')
    expect(Object.hasOwn(loaded.default, '__proto__')).toBe(true)
    expect(loaded.default.__proto__).toEqual({ polluted: true })
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('can emit only browser-public config fields for production', async () => {
    const root = path.resolve('tests/fixtures/ssr')
    const config = resolvedConfig(root) as ResolvedConfig &
      Record<string, unknown>
    config.privateToken = 'do-not-bundle'
    config.siteUrl = 'https://docs.example.com'
    config.analytics = [
      Object.assign(
        { provider: 'google' as const, id: 'G-PUBLIC' },
        { privateAnalyticsToken: 'do-not-bundle-analytics' },
      ),
      {
        provider: 'custom',
        name: 'self-hosted',
        scripts: [
          {
            src: 'https://analytics.example.com/script.js',
            defer: true,
            attributes: { 'data-site': 'docs' },
          },
        ],
      },
      { provider: 'baidu', id: 'disabled', enabled: false },
    ]
    config.themeConfig = Object.assign(
      {
        ai: Object.assign(
          { endpoint: 'https://docs.example.com/api/ask' },
          {
            apiKey: 'do-not-bundle-ai-key',
            headers: { Authorization: 'do-not-bundle-ai-header' },
            provider: 'do-not-bundle-ai-provider',
          },
        ),
        socialLinks: [
          {
            icon: 'github',
            link: 'https://github.com/AICode-Nexus/silen',
            ariaLabel: 'Silen on GitHub',
          },
        ],
        home: Object.assign(
          {
            hero: Object.assign(
              {
                name: 'Public home',
                tagline: 'Safe public fields',
                image: { src: '/hero.svg', alt: 'Home preview' },
                actions: [
                  {
                    text: 'Guide',
                    link: '/guide/',
                    theme: 'brand' as const,
                    privateActionToken: 'do-not-bundle-action',
                  },
                ],
              },
              { privateHeroToken: 'do-not-bundle-hero' },
            ),
            features: [
              {
                title: 'Typed',
                details: 'Public feature',
                privateFeatureToken: 'do-not-bundle-feature',
              },
            ],
          },
          { privateHomeToken: 'do-not-bundle-home' },
        ),
      },
      { privateThemeToken: 'do-not-bundle-theme' },
    )

    const source = createVirtualModules({
      routes: [],
      config,
      publicConfigOnly: true,
    }).config
    const loaded = (await importGeneratedModule(source)) as {
      default: Record<string, unknown>
    }

    expect(loaded.default).toEqual({
      title: 'Docs',
      description: 'Project documentation',
      lang: 'en-US',
      base: '/project/',
      siteUrl: 'https://docs.example.com',
      analytics: [
        { provider: 'google', id: 'G-PUBLIC' },
        {
          provider: 'custom',
          name: 'self-hosted',
          scripts: [
            {
              src: 'https://analytics.example.com/script.js',
              defer: true,
              attributes: { 'data-site': 'docs' },
            },
          ],
        },
      ],
      ai: {
        llmsTxt: true,
        llmsFullTxt: true,
        markdownRoutes: true,
        index: true,
      },
      themeConfig: {
        ai: { endpoint: 'https://docs.example.com/api/ask' },
        socialLinks: [
          {
            icon: 'github',
            link: 'https://github.com/AICode-Nexus/silen',
            ariaLabel: 'Silen on GitHub',
          },
        ],
        home: {
          hero: {
            name: 'Public home',
            tagline: 'Safe public fields',
            image: { src: '/hero.svg', alt: 'Home preview' },
            actions: [{ text: 'Guide', link: '/guide/', theme: 'brand' }],
          },
          features: [{ title: 'Typed', details: 'Public feature' }],
        },
      },
    })
    expect(source).not.toContain('do-not-bundle')
    expect(source).not.toContain('do-not-bundle-theme')
    expect(source).not.toContain('do-not-bundle-action')
    expect(source).not.toContain('do-not-bundle-hero')
    expect(source).not.toContain('do-not-bundle-feature')
    expect(source).not.toContain('do-not-bundle-home')
    expect(source).not.toContain('do-not-bundle-ai-key')
    expect(source).not.toContain('do-not-bundle-ai-header')
    expect(source).not.toContain('do-not-bundle-ai-provider')
    expect(source).not.toContain('do-not-bundle-analytics')
    expect(source).not.toContain(root)
    expect(source).not.toContain('configFile')
    expect(source).not.toContain('outDir')
  })

  it('keeps an omitted siteUrl absent from the public virtual config', async () => {
    const root = path.resolve('tests/fixtures/ssr')
    const source = createVirtualModules({
      routes: [],
      config: resolvedConfig(root),
      publicConfigOnly: true,
    }).config
    const loaded = (await importGeneratedModule(source)) as {
      default: Record<string, unknown>
    }

    expect(Object.hasOwn(loaded.default, 'siteUrl')).toBe(false)
  })

  it('omits analytics providers from the development browser config', async () => {
    const root = path.resolve('tests/fixtures/ssr')
    const config = resolvedConfig(root)
    config.command = 'serve'
    config.analytics = [{ provider: 'google', id: 'G-DEVELOPMENT' }]

    const source = createVirtualModules({
      routes: [],
      config,
      publicConfigOnly: true,
    }).config
    const loaded = (await importGeneratedModule(source)) as {
      default: { analytics: unknown[] }
    }

    expect(loaded.default.analytics).toEqual([])
    expect(source).not.toContain('G-DEVELOPMENT')
  })

  it('serializes public locale message overrides into the virtual config', async () => {
    const root = path.resolve('tests/fixtures/ssr')
    const config = resolvedConfig(root)
    config.themeConfig = {
      locales: [
        {
          lang: 'zh-CN',
          label: '中文',
          root: '/zh/',
          messages: {
            search: { noResults: '这里没有内容。' },
            copy: { copied: '复制好了' },
          },
        },
      ],
    }

    const source = createVirtualModules({
      routes: [],
      config,
      publicConfigOnly: true,
    }).config
    const loaded = (await importGeneratedModule(source)) as {
      default: { themeConfig: { locales: unknown[] } }
    }

    expect(loaded.default.themeConfig.locales).toEqual([
      {
        lang: 'zh-CN',
        label: '中文',
        root: '/zh/',
        messages: {
          search: { noResults: '这里没有内容。' },
          copy: { copied: '复制好了' },
        },
      },
    ])
  })

  it('discovers the project theme without recursively aliasing public theme imports', async () => {
    const root = path.resolve('tests/fixtures/basic')
    const themeFile = path.join(root, '.silen/theme.tsx')
    const plugins = await silenPlugin(resolvedConfig(root))
    expect(plugins.map((plugin) => plugin.name)).toEqual([
      '@tailwindcss/vite:scan',
      '@tailwindcss/vite:generate:serve',
      '@tailwindcss/vite:generate:build',
      'silen:core',
    ])
    const plugin = plugins.find((candidate) => candidate.name === 'silen:core')
    expect(plugin).toBeDefined()
    if (!plugin || typeof plugin.resolveId !== 'function') {
      throw new TypeError('Expected a virtual-module resolve hook')
    }
    if (typeof plugin.load !== 'function') {
      throw new TypeError('Expected a virtual-module load hook')
    }

    const resolveId = plugin.resolveId as (
      id: string,
      importer?: string,
    ) => string | null | undefined
    const load = plugin.load as (id: string) => string | null | undefined

    for (const name of ['routes', 'config', 'theme'] as const) {
      const publicId = `virtual:silen/${name}`
      const resolvedId = `\0${publicId}`
      expect(resolveId(publicId)).toBe(resolvedId)
      expect(load(resolvedId)).toBeTypeOf('string')
    }

    expect(load('\0virtual:silen/routes')).toContain("'/guide/'")
    expect(load('\0virtual:silen/config')).toContain('JSON.parse')
    expect(load('\0virtual:silen/theme')).toContain(
      themeFile.replaceAll('\\', '/'),
    )
    expect(load('\0virtual:silen/theme')).toMatch(
      /^import ".*theme-default\/styles\/index\.css"/,
    )
    expect(resolveId('@aicode-nexus/silen/theme', themeFile)).toMatch(
      /src\/theme-default\/index\.tsx$/,
    )
    expect(
      resolveId('@aicode-nexus/silen/theme', '/ordinary-module.ts'),
    ).toBeUndefined()
    expect(
      resolveId('@aicode-nexus/silen/theme', '\0virtual:silen/theme'),
    ).toBeUndefined()
    expect(resolveId('virtual:silen/unknown')).toBeUndefined()
    expect(load('\0virtual:silen/unknown')).toBeUndefined()
    expect(resolveId('\0virtual:silen/routes')).toBeUndefined()
    expect(resolveId('/ordinary-module.ts')).toBeUndefined()
  })
})
