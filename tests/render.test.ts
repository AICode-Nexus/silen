import { describe, expect, it } from 'vitest'
import type { RenderedPage } from '../src/client/app'
import { renderDocument } from '../src/node/render'
import type { JsonObject } from '../src/shared/page'

function hydrationData(document: string): JsonObject {
  const match =
    /<script>window\.__SILEN__=JSON\.parse\(("(?:\\.|[^"\\])*")\)<\/script>/.exec(
      document,
    )
  if (!match?.[1]) throw new Error('Expected inline hydration data')
  const json = JSON.parse(match[1]) as string
  return JSON.parse(json) as JsonObject
}

function canonicalLinkTags(document: string): string[] {
  return [...document.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .filter((tag) => {
      const rel = /\brel="([^"]*)"/i.exec(tag)?.[1]
      return rel
        ?.split(/\s+/)
        .some((token) => token.toLowerCase() === 'canonical')
    })
}

describe('renderDocument', () => {
  it('escapes metadata and serializes inline data safely and prototype-safely', () => {
    const frontmatter: Record<string, unknown> = {
      danger: '</script><script>globalThis.polluted=true</script>',
      separators: 'before\u2028middle\u2029after',
    }
    Object.defineProperty(frontmatter, '__proto__', {
      enumerable: true,
      value: { inherited: false },
    })
    const page: RenderedPage = {
      appHtml: '<main><h1>Safe primary document</h1></main>',
      status: 200,
      title: '<Title & "quoted">',
      description: 'Description <unsafe> & "quoted"',
      publicData: {
        siteTitle: 'Fixture Docs',
        lang: 'en-US"><script>bad()</script>',
        base: '/project/',
        route: '/',
        frontmatter: frontmatter as JsonObject,
        headings: [],
        themeConfig: { search: true },
      },
    }

    const document = renderDocument(page, {
      base: '/project/',
      clientEntry: 'assets/client-abcd.js',
      favicon: { file: 'favicon.svg', type: 'image/svg+xml' },
      stylesheets: ['assets/page-abcd.css'],
      modulePreloads: ['assets/page-abcd.js'],
      assetPreloads: [{ as: 'image', file: 'assets/mark-abcd.svg' }],
    })

    expect(document).toContain('<html lang="en-US&quot;&gt;&lt;script&gt;')
    expect(document).toContain(
      '<title>&lt;Title &amp; &quot;quoted&quot;&gt;</title>',
    )
    expect(document).toContain(
      '<meta name="description" content="Description &lt;unsafe&gt; &amp; &quot;quoted&quot;">',
    )
    expect(document).toContain(
      '<link rel="icon" type="image/svg+xml" href="/project/favicon.svg">',
    )
    expect(document).toContain(
      '<link rel="stylesheet" href="/project/assets/page-abcd.css">',
    )
    expect(document).toContain(
      '<link rel="modulepreload" href="/project/assets/page-abcd.js">',
    )
    expect(document).toContain(
      '<link rel="preload" as="image" href="/project/assets/mark-abcd.svg">',
    )
    expect(document).not.toContain('</script><script>globalThis.polluted')
    expect(document).not.toContain('\u2028')
    expect(document).not.toContain('\u2029')
    expect(document).toContain('\\u003c/script\\u003e')
    expect(document).toContain('\\u2028')
    expect(document).toContain('\\u2029')

    const data = hydrationData(document)
    expect(data).toEqual(page.publicData)
    const restoredFrontmatter = data.frontmatter
    expect(restoredFrontmatter).toBeTypeOf('object')
    if (
      typeof restoredFrontmatter !== 'object' ||
      restoredFrontmatter === null ||
      Array.isArray(restoredFrontmatter)
    ) {
      throw new TypeError('Expected restored frontmatter')
    }
    expect(Object.hasOwn(restoredFrontmatter, '__proto__')).toBe(true)
    expect('inherited' in restoredFrontmatter).toBe(false)
    expect(Object.prototype).not.toHaveProperty('polluted')
  })

  it('keeps Vite development module URLs outside the configured site base', () => {
    const document = renderDocument(
      {
        appHtml: '<main>Development page</main>',
        status: 200,
        title: 'Development',
        description: '',
        publicData: {
          siteTitle: 'Fixture Docs',
          lang: 'en-US',
          base: '/project/',
          route: '/',
        },
      },
      {
        base: '/project/',
        clientEntry: '/@fs/repo/src/client/entry.tsx',
      },
    )

    expect(document).toContain(
      '<script type="module" src="/@fs/repo/src/client/entry.tsx"></script>',
    )
    expect(document).not.toContain('/project/@fs/')
  })

  it('injects production analytics providers into head with safe custom scripts', () => {
    const document = renderDocument(
      {
        appHtml: '<main>Analytics page</main>',
        status: 200,
        title: 'Analytics',
        description: '',
        publicData: {
          siteTitle: 'Fixture Docs',
          lang: 'en-US',
          base: '/project/',
          route: '/',
          analytics: [
            { provider: 'google', id: 'G-EXAMPLE' },
            { provider: 'baidu', id: 'baidu-example' },
            {
              provider: 'custom',
              name: 'self-hosted',
              scripts: [
                {
                  src: 'https://analytics.example.com/script.js?site=docs&v=1',
                  defer: true,
                  attributes: {
                    crossorigin: 'anonymous',
                    'data-site-id': 'docs',
                  },
                },
                {
                  content:
                    'window.analyticsPayload="</script><script>unsafe()</script>"',
                },
              ],
            },
            { provider: 'google', id: 'disabled', enabled: false },
          ],
        },
      },
      { base: '/project/', clientEntry: 'assets/client.js' },
    )

    expect(document).toContain(
      `window.gtag('config',"G-EXAMPLE",{send_page_view:false})`,
    )
    expect(document).toContain(
      'src="https://www.googletagmanager.com/gtag/js?id=G-EXAMPLE" async',
    )
    expect(document).toContain("['_setAutoPageview',false]")
    expect(document).toContain(
      'src="https://hm.baidu.com/hm.js?baidu-example" async',
    )
    expect(document).toContain(
      'src="https://analytics.example.com/script.js?site=docs&amp;v=1" defer crossorigin="anonymous" data-site-id="docs"',
    )
    expect(document).toContain('<\\/script><script>unsafe()<\\/script>')
    expect(document).not.toContain('id=disabled')
    expect(document).not.toContain('</script><script>unsafe()')
  })

  it('reserves canonical links for core SEO while preserving unrelated plugin head entries', () => {
    const document = renderDocument(
      {
        appHtml: '<main>SEO page</main>',
        status: 200,
        title: 'SEO page',
        description: 'SEO description',
        publicData: {
          siteTitle: 'Fixture Docs',
          lang: 'en-US',
          base: '/project/',
          route: '/guide/',
        },
      },
      {
        base: '/project/',
        clientEntry: 'assets/client.js',
        seo: {
          canonicalUrl: 'https://docs.example.com/project/guide/',
          alternates: [],
        },
        head: [
          {
            tag: 'link',
            attributes: {
              rel: 'canonical',
              href: 'https://plugin.example.com/lowercase',
            },
          },
          {
            tag: 'LiNk',
            attributes: {
              ReL: 'stylesheet CANONICAL alternate',
              href: 'https://plugin.example.com/multi-token',
            },
          },
          {
            tag: 'LINK',
            attributes: { REL: 'stylesheet', href: '/plugin.css' },
          },
          {
            tag: 'link',
            attributes: {
              rel: 'alternate canonicalish',
              href: '/plugin-feed.xml',
            },
          },
          {
            tag: 'meta',
            attributes: { name: 'canonical', content: 'unrelated meta' },
          },
        ],
      },
    )

    expect(canonicalLinkTags(document)).toEqual([
      '<link rel="canonical" href="https://docs.example.com/project/guide/">',
    ])
    expect(document).not.toContain('plugin.example.com/lowercase')
    expect(document).not.toContain('plugin.example.com/multi-token')
    expect(document).toContain('href="/plugin.css"')
    expect(document).toContain('href="/plugin-feed.xml"')
    expect(document).toContain('content="unrelated meta" name="canonical"')
  })

  it('preserves plugin canonical links when core SEO is omitted', () => {
    const document = renderDocument(
      {
        appHtml: '<main>Plugin canonical page</main>',
        status: 200,
        title: 'Plugin canonical page',
        description: '',
        publicData: {
          siteTitle: 'Fixture Docs',
          lang: 'en-US',
          base: '/',
          route: '/',
        },
      },
      {
        base: '/',
        clientEntry: 'assets/client.js',
        head: [
          {
            tag: 'LiNk',
            attributes: {
              ReL: 'alternate CANONICAL',
              href: 'https://plugin.example.com/preserved',
            },
          },
        ],
      },
    )

    expect(canonicalLinkTags(document)).toHaveLength(1)
    expect(document).toContain('https://plugin.example.com/preserved')
  })
})
