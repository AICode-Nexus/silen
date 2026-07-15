import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { CompiledPage } from '../src/node/mdx'
import { validateInternalLinks } from '../src/node/links'
import type { RouteRecord } from '../src/shared/page'

const routes: RouteRecord[] = [
  { path: '/', file: '/docs/index.mdx', relativeFile: 'index.mdx' },
  {
    path: '/guide/',
    file: '/docs/guide/index.mdx',
    relativeFile: 'guide/index.mdx',
  },
  { path: '/about', file: '/docs/about.mdx', relativeFile: 'about.mdx' },
  {
    path: '/literal/[id]',
    file: '/docs/literal/[id].mdx',
    relativeFile: 'literal/[id].mdx',
  },
]

function page(links: string[]): CompiledPage {
  return {
    file: path.resolve('/docs/guide/index.mdx'),
    route: '/guide/',
    source: '',
    frontmatter: {},
    headings: [],
    links,
    title: 'Guide',
    description: '',
    data: {},
  }
}

describe('validateInternalLinks', () => {
  it('normalizes base, relative, query, hash, encoded, and trailing aliases', () => {
    const diagnostics = validateInternalLinks(
      routes,
      [
        page([
          '../?from=guide#top',
          '/guide',
          '/project/about/?mode=full#team',
          '/project/literal/%5Bid%5D#details',
          '#install',
          '?mode=compact',
          'https://example.com/missing',
          'mailto:docs@example.com',
          '//cdn.example.com/file.js',
          '/project/logo.svg',
        ]),
      ],
      'error',
      '/project/',
    )

    expect(diagnostics).toEqual([])
  })

  it('deduplicates broken static links and reports route plus source file', () => {
    expect(() =>
      validateInternalLinks(
        routes,
        [page(['/missing?one=1#top', '/missing?two=2#bottom'])],
        'error',
        '/project/',
      ),
    ).toThrow(
      '/docs/guide/index.mdx (route /guide/): Broken internal link /missing?one=1#top',
    )
  })

  it('warns without failing and ignores without diagnostics', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const pages = [page(['/missing'])]

    const warnings = validateInternalLinks(routes, pages, 'warn', '/project/')
    const ignored = validateInternalLinks(routes, pages, 'ignore', '/project/')

    expect(warnings).toHaveLength(1)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('route /guide/')
    expect(ignored).toEqual([])
  })
})
