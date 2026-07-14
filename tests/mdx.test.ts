import path from 'node:path'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  compilePage,
  createMdxPlugins,
  normalizeFrontmatter,
  type CompiledPage,
} from '../src/node/mdx'
import { scanRoutes } from '../src/node/routes'
import type { RouteRecord } from '../src/shared/page'

const fixture = 'tests/fixtures/mdx/page.mdx'
const fixtureRoute: RouteRecord = {
  path: '/page',
  relativeFile: 'page.mdx',
  file: fixture,
}

async function loadMdxModule(file: string) {
  const server = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    plugins: createMdxPlugins(),
    root: process.cwd(),
    server: { middlewareMode: true },
  })

  try {
    const loaded: unknown = await server.ssrLoadModule(`/${file}`)
    return loaded as {
      default: unknown
      frontmatter: Record<string, unknown>
      headings: unknown
      links: unknown
    }
  } finally {
    await server.close()
  }
}

describe('MDX compilation', () => {
  it('compiles the complete page contract with deterministic metadata', async () => {
    const page: CompiledPage = await compilePage(fixtureRoute)
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
    const root = path.resolve('tests/fixtures/routes')
    const route = (await scanRoutes(root)).find(
      (record) => record.relativeFile === 'guide/getting-started.mdx',
    )
    expect(route).toBeDefined()

    const page = await compilePage(route!)

    expect(page.title).toBe('Getting started')
    expect(page.description).toBe('')
    expect(page.route).toBe('/guide/getting-started')
  })

  it('preserves canonical nested page and index routes', async () => {
    const routeFixtures = await scanRoutes(
      path.resolve('tests/fixtures/routes'),
    )
    const mdxFixtures = await scanRoutes(path.resolve('tests/fixtures/mdx'))
    const nestedPage = routeFixtures.find(
      (route) => route.relativeFile === 'guide/getting-started.mdx',
    )
    const nestedIndex = mdxFixtures.find(
      (route) => route.relativeFile === 'guide/index.mdx',
    )
    expect(nestedPage).toBeDefined()
    expect(nestedIndex).toBeDefined()

    const pages = await Promise.all([
      compilePage(nestedPage!),
      compilePage(nestedIndex!),
    ])

    expect(pages.map((page) => page.route)).toEqual([
      '/guide/getting-started',
      '/guide/',
    ])
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
    const pageModule = await loadMdxModule(fixture)

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
  })

  it('highlights fenced code at compile time while preserving trusted MDX', async () => {
    const pageModule = await loadMdxModule('tests/fixtures/mdx/highlight.mdx')
    const Component = pageModule.default as ComponentType
    const rendered = renderToStaticMarkup(createElement(Component))

    expect(rendered).toContain('data-trusted-mdx="yes"')
    expect(rendered.match(/class="shiki shiki-themes/g)).toHaveLength(2)
    expect(rendered).toContain('data-language="typescript"')
    expect(rendered).toContain('data-language="not-a-real-language"')
    expect(rendered).not.toContain('<script>')
    expect(rendered).not.toContain(process.cwd())
    expect(rendered).not.toContain(
      path.resolve('tests/fixtures/mdx/highlight.mdx'),
    )
  })

  it('shares JSON-safe frontmatter between static and Vite results', async () => {
    const file = 'tests/fixtures/mdx/json-safe.mdx'
    const route: RouteRecord = {
      path: '/json-safe',
      relativeFile: 'json-safe.mdx',
      file,
    }

    const [page, pageModule] = await Promise.all([
      compilePage(route),
      loadMdxModule(file),
    ])

    expect(page.frontmatter).toEqual({
      published: '2026-07-13T00:00:00.000Z',
      values: {
        notANumber: null,
        positiveInfinity: null,
        negativeInfinity: null,
      },
    })
    expect(pageModule.frontmatter).toEqual(page.frontmatter)
  })

  it('preserves root and nested __proto__ properties without inheritance', async () => {
    const file = 'tests/fixtures/mdx/prototype-safe.mdx'
    const route: RouteRecord = {
      path: '/prototype-safe',
      relativeFile: 'prototype-safe.mdx',
      file,
    }

    const [page, pageModule] = await Promise.all([
      compilePage(route),
      loadMdxModule(file),
    ])
    const staticNested = page.frontmatter.nested
    const viteNested = pageModule.frontmatter.nested

    expect(pageModule.frontmatter).toEqual(page.frontmatter)
    expect(Object.hasOwn(page.frontmatter, '__proto__')).toBe(true)
    expect(Object.hasOwn(pageModule.frontmatter, '__proto__')).toBe(true)
    expect(staticNested).toBeTypeOf('object')
    expect(viteNested).toBeTypeOf('object')
    if (
      typeof staticNested !== 'object' ||
      staticNested === null ||
      Array.isArray(staticNested) ||
      typeof viteNested !== 'object' ||
      viteNested === null ||
      Array.isArray(viteNested)
    ) {
      throw new TypeError('Expected nested frontmatter objects')
    }
    expect(Object.hasOwn(staticNested, '__proto__')).toBe(true)
    expect(Object.hasOwn(viteNested, '__proto__')).toBe(true)
    expect('rootInherited' in page.frontmatter).toBe(false)
    expect('rootInherited' in pageModule.frontmatter).toBe(false)
    expect('nestedInherited' in staticNested).toBe(false)
    expect('nestedInherited' in viteNested).toBe(false)
    expect(Object.prototype).not.toHaveProperty('rootInherited')
    expect(Object.prototype).not.toHaveProperty('nestedInherited')
  })

  it('reports frontmatter values that cannot be normalized', () => {
    expect(() => normalizeFrontmatter({ unsupported: 1n })).toThrow(
      'Failed to normalize frontmatter as JSON',
    )
  })
})
