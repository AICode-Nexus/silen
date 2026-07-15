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
      { lang: 'zh-CN', label: '中文', root: '/zh/' },
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
