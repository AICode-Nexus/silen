import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'client/index': 'src/client/index.ts',
    'theme-default/index': 'src/theme-default/index.tsx',
    'ai/index': 'src/ai/index.ts',
  },
  format: ['esm'],
  dts: false,
  splitting: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  onSuccess: 'tsc -p tsconfig.build.json',
})
