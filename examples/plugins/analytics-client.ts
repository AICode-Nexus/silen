import { fileURLToPath } from 'node:url'
import { definePlugin } from '@aicode-nexus/silen'

export default definePlugin(
  (_context, options: { readonly siteId: string }) => ({
    name: 'example-analytics-client',
    clientModules() {
      return fileURLToPath(new URL('./analytics-runtime.tsx', import.meta.url))
    },
    transformHead() {
      return [
        {
          tag: 'meta',
          attributes: { name: 'example-site-id', content: options.siteId },
        },
      ]
    },
  }),
)
