import { describe, expect, it } from 'vitest'
import { defineConfig } from '../src/index'
import type {
  ThemeConfig,
  ThemeLocaleItem,
  ThemeSocialLink,
} from '../src/index'

describe('public package contract', () => {
  it('returns typed configuration unchanged', () => {
    const config = defineConfig({ title: 'Docs', base: '/project/' })
    expect(config).toEqual({ title: 'Docs', base: '/project/' })
  })

  it('exposes typed social links through themeConfig', () => {
    const socialLink: ThemeSocialLink = {
      icon: 'github',
      link: 'https://github.com/AICode-Nexus/silen',
      ariaLabel: 'Silen on GitHub',
    }
    const themeConfig: ThemeConfig = { socialLinks: [socialLink] }

    expect(defineConfig({ themeConfig })).toEqual({ themeConfig })
  })

  it('exposes typed locale switch entries through themeConfig', () => {
    const locale: ThemeLocaleItem = {
      lang: 'zh-CN',
      label: '中文',
      root: '/zh/',
    }
    const themeConfig: ThemeConfig = {
      locales: [{ lang: 'en-US', label: 'English', root: '/' }, locale],
    }

    expect(defineConfig({ themeConfig })).toEqual({ themeConfig })
  })

  it('exposes a strict typed home-page configuration', () => {
    const themeConfig: ThemeConfig = {
      home: {
        hero: {
          name: 'Silen',
          tagline: 'Documentation without the weight.',
          image: { src: '/hero.svg', alt: 'Silen home page' },
          actions: [{ text: 'Get started', link: '/guide/', theme: 'brand' }],
        },
        features: [
          {
            title: 'Fast',
            details: 'Compile-time content with focused hydration.',
          },
        ],
      },
    }

    expect(defineConfig({ themeConfig })).toEqual({ themeConfig })
  })
})
