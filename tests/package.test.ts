import { describe, expect, it } from 'vitest'
import { defineConfig } from '../src/index'
import type { ThemeConfig, ThemeSocialLink } from '../src/index'

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
})
