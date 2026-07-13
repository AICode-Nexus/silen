import path from 'node:path'
import { createServer } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  compilePage,
  createMdxPlugins,
  type CompiledPage,
} from '../src/node/mdx'

const fixture = 'tests/fixtures/mdx/page.mdx'

describe('MDX compilation', () => {
  it('compiles the complete page contract with deterministic metadata', async () => {
    const page: CompiledPage = await compilePage(fixture)
    const { source, ...metadata } = page

    expect(source).toContain('title: Getting Started')
    expect(metadata).toEqual({
      file: fixture,
      route: '/page',
      frontmatter: {
        title: 'Getting Started',
        description: 'Install Silen in a new project.',
        draft: false,
      },
      headings: [
        { depth: 2, title: 'Install', slug: 'install' },
        { depth: 2, title: 'Install', slug: 'install-1' },
      ],
      links: ['/guide/configuration', 'https://example.com/packages'],
      title: 'Getting Started',
      description: 'Install Silen in a new project.',
    })
  })

  it('uses deterministic title and description fallbacks', async () => {
    const page = await compilePage(
      path.resolve('tests/fixtures/routes/guide/getting-started.mdx'),
    )

    expect(page.title).toBe('Getting started')
    expect(page.description).toBe('')
    expect(page.route).toBe('/getting-started')
  })

  it('composes a metadata pre-transform before the official MDX plugin', () => {
    const plugins = createMdxPlugins()

    expect(plugins.map((plugin) => plugin.name)).toEqual([
      'silen:page-data',
      '@mdx-js/rollup',
    ])
    expect(plugins[0]).toMatchObject({ enforce: 'pre' })
  })

  it('loads typed metadata exports and a default component through Vite', async () => {
    const server = await createServer({
      appType: 'custom',
      configFile: false,
      logLevel: 'silent',
      plugins: createMdxPlugins(),
      root: process.cwd(),
      server: { middlewareMode: true },
    })

    try {
      const loaded: unknown = await server.ssrLoadModule(`/${fixture}`)
      const pageModule = loaded as {
        default: unknown
        frontmatter: Record<string, unknown>
        headings: unknown
        links: unknown
      }

      expect(pageModule.frontmatter).toEqual({
        title: 'Getting Started',
        description: 'Install Silen in a new project.',
        draft: false,
      })
      expect(pageModule.headings).toEqual([
        { depth: 2, title: 'Install', slug: 'install' },
        { depth: 2, title: 'Install', slug: 'install-1' },
      ])
      expect(pageModule.links).toEqual([
        '/guide/configuration',
        'https://example.com/packages',
      ])
      expect(pageModule.default).toBeTypeOf('function')
    } finally {
      await server.close()
    }
  })
})
