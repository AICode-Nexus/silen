import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { definePlugin } from '@aicode-nexus/silen'

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const escapes: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }
    return escapes[character]!
  })
}

export default definePlugin(
  (_context, options: { readonly origin: string }) => ({
    name: 'example-sitemap',
    async buildEnd({ config, outDir, routes }) {
      const origin = new URL(config.base, options.origin)
      const urls = routes.map((route) => {
        const location = new URL(route.path.replace(/^\//, ''), origin)
        return `<url><loc>${xml(location.href)}</loc></url>`
      })
      await writeFile(
        path.join(outDir, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`,
        'utf8',
      )
    },
  }),
)
