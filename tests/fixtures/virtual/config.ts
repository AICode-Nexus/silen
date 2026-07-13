import type { VirtualConfig } from 'virtual:silen/config'

const config: VirtualConfig = {
  title: 'Test Docs',
  description: '',
  lang: 'en-US',
  base: '/',
  outDir: '.silen/dist',
  onBrokenLinks: 'error',
  command: 'build',
  root: '/',
  configFile: '/.silen/config.ts',
}

export default config
