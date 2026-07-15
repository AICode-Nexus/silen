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
    locales: [
      { lang: 'en-US', label: 'English', root: '/' },
      {
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
          features: [
            {
              title: 'React 优先',
              details: '使用 React 组件编写文档。',
            },
          ],
        },
      },
    ],
    privateThemeToken: 'do-not-serialize-theme',
  },
  privateToken: 'do-not-serialize',
})
