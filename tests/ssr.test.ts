import path from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RenderedPage } from '../src/client/app'
import { createMdxPlugins } from '../src/node/mdx'
import { silenPlugin } from '../src/node/plugin'
import type { ResolvedConfig } from '../src/shared/config'

const fixtureRoot = path.resolve('tests/fixtures/ssr')
const config: ResolvedConfig = {
  title: 'Fixture Docs',
  description: 'Fixture fallback description',
  lang: 'en-US',
  base: '/project/',
  outDir: path.join(fixtureRoot, '.silen/dist'),
  onBrokenLinks: 'error',
  themeConfig: {},
  analytics: [],
  ai: {
    llmsTxt: true,
    llmsFullTxt: true,
    markdownRoutes: true,
    index: true,
  },
  command: 'build',
  root: fixtureRoot,
  configFile: path.join(fixtureRoot, '.silen/config.ts'),
}

describe('SSR entry', () => {
  let server: ViteDevServer
  let render: (url: string) => Promise<RenderedPage>

  beforeAll(async () => {
    server = await createServer({
      appType: 'custom',
      configFile: false,
      logLevel: 'silent',
      root: process.cwd(),
      server: { middlewareMode: true },
      plugins: [...(await silenPlugin(config)), ...(await createMdxPlugins())],
    })

    const entry = path.resolve('src/client/ssr-entry.tsx').replaceAll('\\', '/')
    const loaded: unknown = await server.ssrLoadModule(`/@fs/${entry}`)
    render = (loaded as { render: (url: string) => Promise<RenderedPage> })
      .render
  })

  afterAll(async () => {
    await server?.close()
  })

  it('renders the complete primary MDX document before hydration', async () => {
    const rendered = await render('/project/guide/?source=ssr#install')

    expect(rendered).toMatchObject({
      status: 200,
      title: 'Guide',
      description: 'Read the complete guide.',
      publicData: {
        lang: 'zh-CN',
        base: '/project/',
        route: '/guide/',
        frontmatter: {
          title: 'Guide',
          description: 'Read the complete guide.',
          lang: 'zh-CN',
        },
        headings: [{ depth: 2, title: 'Install', slug: 'install' }],
      },
    })
    expect(rendered.appHtml).toContain('<h1>Guide</h1>')
    expect(rendered.appHtml).toContain('<h2>Install</h2>')
    expect(rendered.appHtml).toContain(
      'This primary content must be present in the server response.',
    )
    expect(rendered.appHtml).toContain('data-silen-code-block=""')
    expect(rendered.appHtml).toContain('class="shiki shiki-themes')
    expect(rendered.appHtml).toContain('data-language="sh"')
    expect(rendered.appHtml).toContain('aria-label="Copy code"')
  })

  it.each([
    ['/project/guide', '/guide/'],
    ['/project/about/', '/about'],
    ['https://silen.local/project/about?mode=full#details', '/about'],
  ])('accepts trailing-slash aliases for %s', async (url, route) => {
    const rendered = await render(url)

    expect(rendered.status).toBe(200)
    expect(rendered.publicData.route).toBe(route)
  })

  it('maps both normalized base forms to the root route', async () => {
    const withSlash = await render('/project/?source=ssr')
    const withoutSlash = await render('/project#top')

    expect(withSlash.status).toBe(200)
    expect(withoutSlash.status).toBe(200)
    expect(withSlash.publicData.route).toBe('/')
    expect(withoutSlash.publicData.route).toBe('/')
    expect(withSlash.appHtml).toContain('<h1>Home</h1>')
  })

  it.each(['/about', '/other/about', '/project/missing'])(
    'returns complete 404 metadata outside known base-aware routes for %s',
    async (url) => {
      const rendered = await render(url)

      expect(rendered).toMatchObject({
        status: 404,
        title: 'Page not found',
        description: '',
        publicData: {
          lang: 'en-US',
          base: '/project/',
        },
      })
      expect(rendered.appHtml).toContain('<h1>404</h1>')
      expect(rendered.appHtml).toContain('Page not found')
      expect(rendered.appHtml).toContain('href="/project/"')
    },
  )

  it.each([
    '/project%2Fabout',
    '/project%2fabout',
    '/project%5Cabout',
    '/project%5cabout',
  ])(
    'rejects encoded separators at the base mount boundary for %s',
    async (url) => {
      const rendered = await render(url)

      expect(rendered.status).toBe(404)
      expect(rendered.appHtml).toContain('<h1>404</h1>')
    },
  )

  it('rejects malformed route encoding beneath the base without throwing', async () => {
    const rendered = await render('/project/%E0%A4%A')

    expect(rendered.status).toBe(404)
    expect(rendered.appHtml).toContain('<h1>404</h1>')
  })

  it('keeps bracket-named pages static instead of matching parameters', async () => {
    const literal = await render(
      '/project/literal/%5Bid%5D?source=encoded#details',
    )
    const parameterLike = await render('/project/literal/123')

    expect(literal.status).toBe(200)
    expect(literal.publicData.route).toBe('/literal/[id]')
    expect(parameterLike.status).toBe(404)
  })
})
