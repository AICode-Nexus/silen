import { defineConfig } from '../../../../src/index'

export default defineConfig({
  title: 'Basic Docs',
  description: 'Basic production fixture',
  lang: 'en-US',
  base: '/project',
  themeConfig: {
    search: true,
    logo: '/project/logo.svg',
  },
  privateToken: 'do-not-serialize',
})
