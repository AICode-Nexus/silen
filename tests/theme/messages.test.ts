import { describe, expect, it } from 'vitest'
import * as sharedConfig from '../../src/shared/config'
import * as themeConfig from '../../src/theme-default/lib/theme-config'

describe('theme message contract', () => {
  it('exposes one typed resolver for complete theme messages', () => {
    expect(themeConfig).toHaveProperty('resolveThemeMessages')
  })

  it('exposes one current-locale resolver shared by theme and build code', () => {
    expect(sharedConfig).toHaveProperty('resolveCurrentLocale')
  })

  it('selects Chinese by primary subtag and English for every other language', () => {
    expect(themeConfig.resolveThemeMessages('zh-CN').search.noResults).toBe(
      '未找到结果。',
    )
    expect(themeConfig.resolveThemeMessages('zh-Hant').appearance.dark).toBe(
      '深色',
    )
    expect(themeConfig.resolveThemeMessages('fr-FR').search.noResults).toBe(
      'No results found.',
    )
  })

  it('deep-merges grouped locale overrides without dropping defaults', () => {
    const messages = themeConfig.resolveThemeMessages('zh-CN', {
      search: { noResults: '这里没有内容。' },
      copy: { copied: '已复制好' },
    })

    expect(messages.search.noResults).toBe('这里没有内容。')
    expect(messages.search.placeholder).toBe('搜索文档')
    expect(messages.copy.copied).toBe('已复制好')
    expect(messages.copy.copyCode).toBe('复制代码')
  })

  it('provides every required message group in both built-in catalogs', () => {
    const groups = [
      'navigation',
      'search',
      'appearance',
      'sidebar',
      'outline',
      'pagination',
      'copy',
      'notFound',
      'askAi',
    ]

    for (const lang of ['en-US', 'zh-CN']) {
      const messages = themeConfig.resolveThemeMessages(lang)
      expect(Object.keys(messages).sort()).toEqual([...groups].sort())
      for (const group of groups) {
        expect(
          Object.values(messages[group as keyof typeof messages]),
        ).not.toContain('')
      }
    }
  })

  it('resolves the longest locale root after removing the site base', () => {
    const locales = [
      { lang: 'en-US', label: 'English', root: '/' },
      { lang: 'zh-CN', label: '中文', root: '/zh/' },
      { lang: 'zh-Hant', label: '繁體中文', root: '/zh/hant/' },
    ] as const

    expect(
      sharedConfig.resolveCurrentLocale(
        locales,
        '/project/zh/hant/guide/?mode=full#intro',
        '/project/',
        'en-US',
      ),
    ).toMatchObject({ lang: 'zh-Hant', label: '繁體中文', root: '/zh/hant/' })
    expect(
      sharedConfig.resolveCurrentLocale(
        locales,
        '/project/zh/guide/',
        '/project/',
        'en-US',
      ),
    ).toMatchObject({ lang: 'zh-CN', label: '中文', root: '/zh/' })
  })

  it('falls back to the site language when no configured locale matches', () => {
    expect(
      sharedConfig.resolveCurrentLocale([], '/guide/', '/', 'fr-FR'),
    ).toEqual({ lang: 'fr-FR', label: 'fr-FR', root: '/' })
  })
})
