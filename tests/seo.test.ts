import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build, type BuildResult } from '../src/node/build'

const root = path.resolve('tests/fixtures/seo-site')
let result: BuildResult
let englishGuide: string
let chineseGuide: string
let chineseOnly: string
let notFound: string

beforeAll(async () => {
  result = await build(root)
  ;[englishGuide, chineseGuide, chineseOnly, notFound] = await Promise.all([
    readFile(path.join(result.outDir, 'guide/index.html'), 'utf8'),
    readFile(path.join(result.outDir, 'zh/guide/index.html'), 'utf8'),
    readFile(path.join(result.outDir, 'zh/only-zh/index.html'), 'utf8'),
    readFile(path.join(result.outDir, '404.html'), 'utf8'),
  ])
})

afterAll(async () => {
  await Promise.all([
    rm(path.join(root, '.silen/dist'), { recursive: true, force: true }),
    rm(path.join(root, '.silen/.temp'), { recursive: true, force: true }),
  ])
})

describe('configured absolute SEO artifacts', () => {
  it('renders canonical and social metadata from escaped page data', () => {
    expect(englishGuide).toContain(
      '<link rel="canonical" href="https://docs.example.com/handbook/guide/">',
    )
    expect(englishGuide).toContain(
      '<meta property="og:type" content="website">',
    )
    expect(englishGuide).toContain(
      '<meta property="og:title" content="Guide &lt;Primary&gt; &amp; &quot;Safe&quot;">',
    )
    expect(englishGuide).toContain(
      '<meta property="og:description" content="Learn &lt;fast&gt; &amp; safely.">',
    )
    expect(englishGuide).toContain(
      '<meta property="og:url" content="https://docs.example.com/handbook/guide/">',
    )
    expect(englishGuide).toContain(
      '<meta name="twitter:card" content="summary">',
    )
    expect(englishGuide).toContain(
      '<meta name="twitter:title" content="Guide &lt;Primary&gt; &amp; &quot;Safe&quot;">',
    )
    expect(englishGuide).toContain(
      '<meta name="twitter:description" content="Learn &lt;fast&gt; &amp; safely.">',
    )
    expect(englishGuide).not.toContain('og:image')
    expect(englishGuide).not.toContain('twitter:image')
    expect(englishGuide).toContain(
      '<meta content="still-present" name="seo-fixture-plugin">',
    )
    expect(englishGuide.match(/<link rel="canonical"/g)).toHaveLength(1)
    expect(englishGuide).not.toContain('plugin.example.com/wrong-canonical')
    expect(englishGuide).not.toContain(
      'plugin.example.com/wrong-mixed-canonical',
    )
    expect(englishGuide).toContain('plugin.example.com/preserved.css')
  })

  it('emits only compiled locale counterparts in deterministic locale order', () => {
    const expected = [
      '<link rel="alternate" hreflang="en-US" href="https://docs.example.com/handbook/guide/">',
      '<link rel="alternate" hreflang="zh-CN" href="https://docs.example.com/handbook/zh/guide/">',
      '<link rel="alternate" hreflang="x-default" href="https://docs.example.com/handbook/guide/">',
    ]

    for (const html of [englishGuide, chineseGuide]) {
      const alternates = html.match(
        /<link rel="alternate" hreflang="[^"]+" href="[^"]+">/g,
      )
      expect(alternates).toEqual(expected)
      expect(html).not.toContain('hreflang="fr-FR"')
    }
  })

  it('does not invent a default route or x-default for a locale-only page', () => {
    expect(chineseOnly).toContain(
      '<link rel="canonical" href="https://docs.example.com/handbook/zh/only-zh">',
    )
    expect(chineseOnly.match(/<link rel="alternate"/g)).toHaveLength(1)
    expect(chineseOnly).toContain('hreflang="zh-CN"')
    expect(chineseOnly).not.toContain('hreflang="en-US"')
    expect(chineseOnly).not.toContain('hreflang="x-default"')
  })

  it('omits absolute SEO metadata from generated 404 pages', () => {
    expect(notFound).not.toContain('rel="canonical"')
    expect(notFound).not.toContain('rel="alternate"')
    expect(notFound).not.toContain('property="og:')
    expect(notFound).not.toContain('name="twitter:')
  })

  it('writes a sorted, escaped sitemap with every content route exactly once', async () => {
    const sitemap = await readFile(
      path.join(result.outDir, 'sitemap.xml'),
      'utf8',
    )
    expect(sitemap).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        '  <url><loc>https://docs.example.com/handbook/</loc></url>\n' +
        '  <url><loc>https://docs.example.com/handbook/caf%C3%A9%20&amp;%20tea</loc></url>\n' +
        '  <url><loc>https://docs.example.com/handbook/fr/</loc></url>\n' +
        '  <url><loc>https://docs.example.com/handbook/guide/</loc></url>\n' +
        '  <url><loc>https://docs.example.com/handbook/only-default</loc></url>\n' +
        '  <url><loc>https://docs.example.com/handbook/zh/</loc></url>\n' +
        '  <url><loc>https://docs.example.com/handbook/zh/guide/</loc></url>\n' +
        '  <url><loc>https://docs.example.com/handbook/zh/only-zh</loc></url>\n' +
        '</urlset>\n',
    )
    expect(sitemap.match(/<url>/g)).toHaveLength(result.routes.length)
    expect(sitemap).not.toContain('404')
  })

  it('preserves the static robots.txt passthrough', async () => {
    await expect(
      readFile(path.join(result.outDir, 'robots.txt'), 'utf8'),
    ).resolves.toBe('User-agent: *\nDisallow:\n')
  })
})
