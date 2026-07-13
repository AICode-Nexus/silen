import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const virtualAliases = {
  'virtual:silen/config': fileURLToPath(
    new URL('./tests/fixtures/virtual/config.ts', import.meta.url),
  ),
  'virtual:silen/routes': fileURLToPath(
    new URL('./tests/fixtures/virtual/routes.ts', import.meta.url),
  ),
  'virtual:silen/theme': fileURLToPath(
    new URL('./tests/fixtures/virtual/theme.tsx', import.meta.url),
  ),
}

export default defineConfig({
  resolve: {
    alias: virtualAliases,
  },
  test: {
    projects: [
      {
        resolve: { alias: virtualAliases },
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        resolve: { alias: virtualAliases },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['tests/**/*.test.tsx'],
        },
      },
    ],
  },
})
