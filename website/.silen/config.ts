import { defineConfig } from '@aicode-nexus/silen'

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
            text: '为人类与 AI 构建的 React 文档。',
            tagline:
              '使用 MDX 写作、用 React 扩展，再从同一个可信源输出静态 HTML、本地搜索、干净 Markdown 与可选 MCP 工作区。',
            image: {
              src: '/silen-workflow.png',
              alt: 'Silen 将 MDX 与 React 内容构建为静态 HTML、搜索、Markdown、llms.txt 和 MCP 工作区',
            },
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
              icon: 'blocks',
              title: 'React 优先',
              details:
                '在可信 MDX 中组合 TypeScript 与 React 组件，保留轻量写作体验。',
              link: '/zh/guide/',
              linkText: '了解写作流程',
            },
            {
              icon: 'zap',
              title: 'Vite 驱动',
              details:
                '快速启动、无整页刷新的导航，并为生产环境生成完整静态 HTML。',
              link: '/zh/guide/',
              linkText: '查看快速开始',
            },
            {
              icon: 'sparkles',
              title: 'AI-ready',
              details:
                '生成 llms.txt、Markdown 路由、搜索索引与有权限边界的 MCP 工作区。',
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
        text: 'React documentation for people and AI.',
        tagline:
          'Write in MDX, extend with React, and ship static HTML, local search, clean Markdown, and an optional MCP workspace from one trusted source.',
        image: {
          src: '/silen-workflow.png',
          alt: 'Silen builds MDX and React content into static HTML, search, Markdown, llms.txt, and an MCP workspace',
        },
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
          icon: 'blocks',
          title: 'React-first',
          details:
            'Compose TypeScript and React components inside trusted MDX without losing a focused authoring loop.',
          link: '/guide/',
          linkText: 'Explore authoring',
        },
        {
          icon: 'zap',
          title: 'Vite-fast',
          details:
            'Start quickly, navigate without full reloads, and emit complete static HTML for production.',
          link: '/guide/',
          linkText: 'See the quick start',
        },
        {
          icon: 'sparkles',
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
