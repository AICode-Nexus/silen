import { definePlugin } from '@aicode-nexus/silen'

export default definePlugin(
  (_context, options: { readonly wordsPerMinute?: number }) => ({
    name: 'example-reading-time',
    transformPageData(page, context) {
      const words = context.source.trim().split(/\s+/u).filter(Boolean).length
      const wordsPerMinute = options.wordsPerMinute ?? 250
      return {
        data: {
          ...page.data,
          readingTimeMinutes: Math.max(1, Math.ceil(words / wordsPerMinute)),
        },
      }
    },
  }),
)
