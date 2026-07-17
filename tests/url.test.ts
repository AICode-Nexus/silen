import { describe, expect, it } from 'vitest'
import {
  isSitePathWithinBase,
  resolveSiteLink,
  stripSiteBase,
} from '../src/shared/url'

describe('resolveSiteLink', () => {
  it.each([
    ['nested child', 'chapter/', '/project/guide/', 'chapter/'],
    ['nested parent', '../about/', '/project/guide/deep/', '../about/'],
    ['mounted parent', '../../about/', '/project/guide/deep/', '../../about/'],
    ['query', '?mode=compact', '/project/guide/', '?mode=compact'],
    ['fragment', '#install', '/project/guide/', '#install'],
    [
      'English to Chinese locale',
      '../../zh/guide/',
      '/project/guide/deep/',
      '../../zh/guide/',
    ],
    [
      'Chinese to English locale',
      '../../guide/',
      '/project/zh/deep/',
      '../../guide/',
    ],
  ])(
    'preserves a base-contained %s reference',
    (_label, href, currentRoute, expected) => {
      expect(resolveSiteLink(href, '/project/', currentRoute)).toBe(expected)
    },
  )

  it.each([
    ['literal parents', '../../about/'],
    ['encoded parents', '%2e%2e/%2E%2E/about/'],
    ['tab-normalized parents', '..\t/../about/'],
    ['backslash parents', '..\\..\\about/'],
  ])(
    'rejects a %s relative reference that browser normalization moves outside the base',
    (_label, href) => {
      expect(resolveSiteLink(href, '/project/', '/project/guide/')).toBe(
        undefined,
      )
    },
  )

  it('allows parent traversal when the configured base is the origin root', () => {
    expect(resolveSiteLink('../../about/', '/', '/guide/')).toBe('../../about/')
  })

  it.each([
    ['protocol-relative', '//cdn.example.com/guide/'],
    ['external HTTPS', 'https://example.com/about/'],
    ['external mail', 'mailto:docs@example.com'],
  ])('preserves a %s URL', (_label, href) => {
    expect(resolveSiteLink(href, '/project/', '/project/guide/')).toBe(href)
  })

  it('compares percent-triplet hex case without changing the authored output', () => {
    expect(resolveSiteLink('/caf%c3%a9/guide/', '/caf%C3%A9/')).toBe(
      '/caf%c3%a9/guide/',
    )
  })

  it('shares percent-triplet-only base matching with downstream route consumers', () => {
    expect(isSitePathWithinBase('/caf%c3%a9/guide/', '/caf%C3%A9/')).toBe(true)
    expect(stripSiteBase('/caf%c3%a9/guide/', '/caf%C3%A9/')).toBe('/guide/')
    expect(isSitePathWithinBase('/docs/guide/', '/Docs/')).toBe(false)
    expect(stripSiteBase('/docs/guide/', '/Docs/')).toBeUndefined()
  })

  it('does not fold ordinary pathname character case for base containment', () => {
    expect(resolveSiteLink('/docs/guide/', '/Docs/')).toBe('/Docs/docs/guide/')
  })
})
