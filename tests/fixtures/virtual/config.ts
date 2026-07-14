import type { VirtualConfig } from 'virtual:silen/config'

const config: VirtualConfig = {
  title: 'Test Docs',
  description: '',
  lang: 'en-US',
  base: '/',
  ai: {
    llmsTxt: true,
    llmsFullTxt: true,
    markdownRoutes: true,
    index: true,
  },
  themeConfig: {},
}

export default config
