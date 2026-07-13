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
})
