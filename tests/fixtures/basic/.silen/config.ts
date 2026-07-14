import { defineConfig } from '../../../../src/index'

export default defineConfig({
  title: 'Basic Docs',
  description: 'Basic production fixture',
  lang: 'en-US',
  base: '/project',
  themeConfig: {
    search: true,
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/' },
      { text: 'About', link: '/about' },
    ],
    sidebar: [
      {
        text: 'Documentation',
        items: [
          { text: 'Getting Started', link: '/guide/' },
          { text: 'About', link: '/about' },
        ],
      },
    ],
    socialLinks: [
      {
        icon: 'github',
        link: 'https://github.com/AICode-Nexus/silen',
        ariaLabel: 'Silen on GitHub',
      },
    ],
    privateThemeToken: 'do-not-serialize-theme',
  },
  privateToken: 'do-not-serialize',
})
