import { describe, expect, it } from 'vitest'
import {
  isActiveThemeLink,
  resolveThemeLocaleLinks,
} from '../../src/theme-default/lib/navigation'

describe('theme navigation', () => {
  it('builds locale links when percent-triplet hex case differs', () => {
    const locales = [
      { lang: 'en-US', label: 'English', root: '/' },
      { lang: 'fr-FR', label: 'Français', root: '/caf%C3%A9/' },
    ] as const

    expect(
      resolveThemeLocaleLinks(
        locales,
        '/caf%c3%a9/guide/?mode=full#intro',
        '/',
      ),
    ).toEqual([
      {
        locale: locales[0],
        href: '/guide/?mode=full#intro',
        active: false,
      },
      {
        locale: locales[1],
        href: '/caf%C3%A9/guide/?mode=full#intro',
        active: true,
      },
    ])
  })

  it('treats percent-case-equivalent links as active without folding path case', () => {
    expect(
      isActiveThemeLink('/caf%c3%a9/guide/', '/caf%C3%A9/guide/', '/'),
    ).toBe(true)
    expect(isActiveThemeLink('/EN/guide/', '/en/guide/', '/')).toBe(false)
  })
})
