import { describe, expect, it } from 'vitest'
import { defineConfig, definePlugin } from '../src/index'
import type {
  AnalyticsProvider,
  ThemeConfig,
  ThemeLocaleItem,
  ThemeSocialLink,
} from '../src/index'

describe('public package contract', () => {
  it('returns typed configuration unchanged', () => {
    const config = defineConfig({ title: 'Docs', base: '/project/' })
    expect(config).toEqual({ title: 'Docs', base: '/project/' })
  })

  it('returns typed plugin factories unchanged', () => {
    const plugin = definePlugin((_context, options: { label: string }) => ({
      name: 'fixture',
      config: () => ({ description: options.label }),
    }))

    expect(defineConfig({ plugins: [[plugin, { label: 'Plugin' }]] })).toEqual({
      plugins: [[plugin, { label: 'Plugin' }]],
    })
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

  it('exposes typed site analytics providers', () => {
    const analytics: readonly AnalyticsProvider[] = [
      { provider: 'google', id: 'G-EXAMPLE' },
      { provider: 'baidu', id: 'baidu-example' },
      {
        provider: 'custom',
        name: 'self-hosted',
        scripts: [
          {
            src: 'https://analytics.example.com/script.js',
            defer: true,
            attributes: { 'data-site': 'docs' },
          },
        ],
      },
    ]

    expect(defineConfig({ analytics })).toEqual({ analytics })
  })

  it('exposes typed locale switch entries through themeConfig', () => {
    const locale: ThemeLocaleItem = {
      lang: 'zh-CN',
      label: '中文',
      root: '/zh/',
      nav: [{ text: '指南', link: '/zh/guide/' }],
      sidebar: [
        {
          text: '中文文档',
          items: [{ text: '快速开始', link: '/zh/guide/' }],
        },
      ],
      home: {
        hero: {
          name: 'Silen',
          text: '去掉噪音的文档体验。',
        },
      },
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
