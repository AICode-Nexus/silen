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
    config.themeConfig = Object.assign(
      {
        socialLinks: [
          {
            icon: 'github',
            link: 'https://github.com/AICode-Nexus/silen',
            ariaLabel: 'Silen on GitHub',
          },
        ],
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
      themeConfig: {
        socialLinks: [
          {
            icon: 'github',
            link: 'https://github.com/AICode-Nexus/silen',
            ariaLabel: 'Silen on GitHub',
          },
        ],
      },
    })
    expect(source).not.toContain('do-not-bundle')
    expect(source).not.toContain('do-not-bundle-theme')
    expect(source).not.toContain(root)
    expect(source).not.toContain('configFile')
    expect(source).not.toContain('outDir')
  })

  it('resolves and loads exactly the three public virtual IDs', async () => {
    const root = path.resolve('tests/fixtures/ssr')
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
    expect(load('\0virtual:silen/theme')).toMatch(/theme-default\/index\.tsx/)
    expect(load('\0virtual:silen/theme')).toMatch(
      /^import ".*theme-default\/styles\/index\.css"/,
    )
    expect(resolveId('virtual:silen/unknown')).toBeUndefined()
    expect(load('\0virtual:silen/unknown')).toBeUndefined()
    expect(resolveId('\0virtual:silen/routes')).toBeUndefined()
    expect(resolveId('/ordinary-module.ts')).toBeUndefined()
  })
})
