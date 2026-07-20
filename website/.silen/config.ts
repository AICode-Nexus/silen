import { defineConfig } from '@aicode-nexus/silen'

export default defineConfig({
  title: 'Silen',
  description:
    'A calm, React-first documentation engine powered by Vite, MDX, and AI-ready content.',
  lang: 'en-US',
  base: '/silen/',
  siteUrl: 'https://aicode-nexus.github.io',
  onBrokenLinks: 'error',
  ai: {
    contract: {
      enabled: true,
      instructions: '.silen/ai-public.md',
    },
  },
  themeConfig: {
    logo: { src: '/logo.svg', alt: 'Silen' },
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Theme', link: '/theme/' },
      { text: 'Integrations', link: '/integrations/' },
      { text: 'AI', link: '/ai/' },
      { text: 'Reference', link: '/reference/' },
      { text: 'GitHub', link: 'https://github.com/AICode-Nexus/silen' },
    ],
    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Quick start', link: '/guide/' },
          { text: 'Project structure', link: '/guide/project-structure/' },
          { text: 'Configuration', link: '/guide/configuration/' },
          { text: 'Markdown and MDX', link: '/guide/markdown-mdx/' },
          { text: 'CLI and deployment', link: '/guide/cli-deployment/' },
        ],
      },
      {
        text: 'Theme',
        items: [
          { text: 'Layouts and navigation', link: '/theme/' },
          { text: 'Tokens', link: '/theme/tokens/' },
          {
            text: 'Extensions and accessibility',
            link: '/theme/extensions-accessibility/',
          },
        ],
      },
      {
        text: 'Integrations',
        items: [
          { text: 'Overview', link: '/integrations/' },
          { text: 'Plugins', link: '/guide/plugins' },
        ],
      },
      {
        text: 'AI',
        items: [
          { text: 'Generated artifacts', link: '/ai/' },
          { text: 'Agent Contract', link: '/ai/agent-contract/' },
          {
            text: 'Local workspace and MCP',
            link: '/ai/local-workspace-mcp/',
          },
        ],
      },
      {
        text: 'Reference',
        items: [{ text: 'Configuration and CLI', link: '/reference/' }],
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
          { text: '主题', link: '/zh/theme/' },
          { text: '集成', link: '/zh/integrations/' },
          { text: 'AI', link: '/zh/ai/' },
          { text: '参考', link: '/zh/reference/' },
          { text: 'GitHub', link: 'https://github.com/AICode-Nexus/silen' },
        ],
        sidebar: [
          {
            text: '开始使用',
            items: [
              { text: '快速开始', link: '/zh/guide/' },
              {
                text: '项目结构',
                link: '/zh/guide/project-structure/',
              },
              { text: '配置', link: '/zh/guide/configuration/' },
              { text: 'Markdown 与 MDX', link: '/zh/guide/markdown-mdx/' },
              {
                text: 'CLI 与部署',
                link: '/zh/guide/cli-deployment/',
              },
            ],
          },
          {
            text: '主题',
            items: [
              { text: '布局与导航', link: '/zh/theme/' },
              { text: '设计令牌', link: '/zh/theme/tokens/' },
              {
                text: '扩展与无障碍',
                link: '/zh/theme/extensions-accessibility/',
              },
            ],
          },
          {
            text: '集成',
            items: [
              { text: '概览', link: '/zh/integrations/' },
              { text: '插件', link: '/zh/guide/plugins' },
            ],
          },
          {
            text: 'AI',
            items: [
              { text: '生成产物', link: '/zh/ai/' },
              { text: 'Agent Contract', link: '/zh/ai/agent-contract/' },
              {
                text: '本地工作区与 MCP',
                link: '/zh/ai/local-workspace-mcp/',
              },
            ],
          },
          {
            text: '参考',
            items: [{ text: '配置与 CLI', link: '/zh/reference/' }],
          },
        ],
        home: {
          hero: {
            name: 'Silen',
            text: '为人类与 AI 构建的 React 文档。',
            tagline:
              '使用 MDX 写作、用 React 扩展，再从同一个可信源输出静态 HTML、本地搜索、干净 Markdown 与可选 MCP 工作区。',
            image: {
              src: '/silen-workflow.jpg',
              darkSrc: '/silen-workflow-dark.jpg',
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
          src: '/silen-workflow.jpg',
          darkSrc: '/silen-workflow-dark.jpg',
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
    },
  },
})
