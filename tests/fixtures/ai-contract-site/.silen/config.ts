import { defineConfig } from '../../../../src/index'

export default defineConfig({
  title: 'Agent Contract Fixture',
  description: 'A bilingual site contract fixture.',
  lang: 'en-US',
  base: '/handbook/',
  ai: {
    llmsFullTxt: false,
    index: false,
    contract: {
      instructions: '.silen/ai-public.md',
      tasksDir: '.silen/ai-tasks',
    },
  },
  themeConfig: {
    locales: [
      { lang: 'en-US', label: 'English', root: '/' },
      { lang: 'zh-CN', label: '中文', root: '/zh/' },
    ],
  },
})
