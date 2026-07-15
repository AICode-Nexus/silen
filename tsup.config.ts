import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'node/cli': 'src/node/cli.ts',
    'client/entry': 'src/client/entry.tsx',
    'client/hmr': 'src/client/hmr.ts',
    'client/index': 'src/client/index.ts',
    'client/ssr-entry': 'src/client/ssr-entry.tsx',
    'theme-default/index': 'src/theme-default/index.tsx',
    'ai/index': 'src/ai/index.ts',
  },
  format: ['esm'],
  dts: false,
  splitting: true,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-dom',
    'virtual:silen/config',
    'virtual:silen/routes',
    'virtual:silen/theme',
    'virtual:silen/ask-ai',
    'virtual:silen/client-extensions',
  ],
  onSuccess: 'tsc -p tsconfig.build.json',
})
