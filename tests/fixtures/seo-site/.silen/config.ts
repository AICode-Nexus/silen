import { defineConfig } from '../../../../src/index'

export default defineConfig({
  title: 'SEO fixture',
  description: 'SEO discovery integration',
  lang: 'en-US',
  base: '/handbook/',
  siteUrl: 'HTTPS://Docs.Example.COM:443/',
  plugins: [
    () => ({
      name: 'seo-fixture-plugin',
      transformHead: () => [
        {
          tag: 'meta',
          attributes: {
            name: 'seo-fixture-plugin',
            content: 'still-present',
          },
        },
        {
          tag: 'link',
          attributes: {
            rel: 'canonical',
            href: 'https://plugin.example.com/wrong-canonical',
          },
        },
        {
          tag: 'LiNk',
          attributes: {
            ReL: 'alternate CANONICAL',
            href: 'https://plugin.example.com/wrong-mixed-canonical',
          },
        },
        {
          tag: 'link',
          attributes: {
            rel: 'stylesheet',
            href: 'https://plugin.example.com/preserved.css',
          },
        },
      ],
    }),
  ],
  themeConfig: {
    locales: [
      { lang: 'zh-CN', label: '中文', root: '/zh/' },
      { lang: 'zh-CN', label: '中文重复项', root: '/zh/' },
      { lang: 'fr-FR', label: 'Français', root: '/fr/' },
      { lang: 'en-US', label: 'English', root: '/' },
    ],
  },
})
