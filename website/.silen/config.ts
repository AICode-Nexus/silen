import { defineConfig } from 'silen'

export default defineConfig({
  title: 'Silen',
  description:
    'A calm, React-first documentation engine powered by Vite, MDX, and AI-ready content.',
  lang: 'en-US',
  base: '/silen/',
  onBrokenLinks: 'error',
  themeConfig: {
    logo: { src: '/logo.svg', alt: 'Silen' },
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'AI', link: '/ai/' },
      { text: 'GitHub', link: 'https://github.com/AICode-Nexus/silen' },
    ],
    sidebar: [
      {
        text: 'Start here',
        items: [
          { text: 'Introduction', link: '/guide/' },
          { text: 'AI-ready docs', link: '/ai/' },
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
        nav: [
          { text: '指南', link: '/zh/guide/' },
          { text: 'AI', link: '/zh/ai/' },
          { text: 'GitHub', link: 'https://github.com/AICode-Nexus/silen' },
        ],
        sidebar: [
          {
            text: '从这里开始',
            items: [
              { text: '快速开始', link: '/zh/guide/' },
              { text: 'AI-ready 文档', link: '/zh/ai/' },
            ],
          },
        ],
        home: {
          hero: {
            name: 'Silen',
            text: '去掉噪音的文档体验。',
            tagline:
              '一个轻量的 React、Vite 与 MDX 文档站生成器，保留 VitePress 式的简洁体验，并内建 AI-ready 输出。',
            image: { src: '/logo.svg', alt: 'Silen 标识' },
            actions: [
              { text: '快速开始', link: '/zh/guide/', theme: 'brand' },
              {
                text: '查看 GitHub',
                link: 'https://github.com/AICode-Nexus/silen',
                theme: 'alt',
                target: '_blank',
              },
            ],
          },
          features: [
            {
              icon: '⚛',
              title: 'React 优先',
              details:
                '使用 TypeScript、React 组件和可信的 MDX，同时保持专注的文档写作流程。',
            },
            {
              icon: '⚡',
              title: 'Vite 驱动',
              details:
                '快速启动、无整页刷新的导航，并为生产环境输出完整静态 HTML。',
            },
            {
              icon: '✦',
              title: 'AI-ready',
              details:
                '生成 llms.txt、干净 Markdown 路由、搜索索引，以及有权限边界的 MCP 工作区。',
              link: '/zh/ai/',
              linkText: '了解 AI 能力',
            },
          ],
        },
      },
    ],
    home: {
      hero: {
        name: 'Silen',
        text: 'Documentation without the noise.',
        tagline:
          'A lightweight React, Vite, and MDX site generator with a VitePress-inspired experience and AI-ready output.',
        image: { src: '/logo.svg', alt: 'Silen mark' },
        actions: [
          { text: 'Get started', link: '/guide/', theme: 'brand' },
          {
            text: 'View on GitHub',
            link: 'https://github.com/AICode-Nexus/silen',
            theme: 'alt',
            target: '_blank',
          },
        ],
      },
      features: [
        {
          icon: '⚛',
          title: 'React-first',
          details:
            'Use TypeScript, React components, and trusted MDX without giving up a focused documentation workflow.',
        },
        {
          icon: '⚡',
          title: 'Vite-fast',
          details:
            'Start quickly, navigate without full reloads, and emit complete static HTML for production hosting.',
        },
        {
          icon: '✦',
          title: 'AI-ready',
          details:
            'Generate llms.txt, clean Markdown routes, search indexes, and a permission-gated MCP workspace.',
          link: '/ai/',
          linkText: 'Explore AI features',
        },
      ],
    },
  },
})
