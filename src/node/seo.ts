import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ResolvedConfig } from '../shared/config.js'
import type { RouteRecord } from '../shared/page.js'
import {
  absoluteRouteUrl,
  createPageSeoResolver,
  type PageSeo,
} from '../shared/seo.js'

export { absoluteRouteUrl, createPageSeoResolver } from '../shared/seo.js'

function compareStrings(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

export function createPageSeo(
  config: ResolvedConfig,
  routes: readonly RouteRecord[],
  route: string,
): PageSeo | undefined {
  return createPageSeoResolver(config, routes).resolve(route)
}

function escapeXml(value: string): string {
  const escapes: Readonly<Record<string, string>> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  }
  return value.replace(/[&<>"']/g, (character) => escapes[character]!)
}

export async function emitSitemap(
  config: ResolvedConfig,
  routes: readonly RouteRecord[],
  outDir: string,
): Promise<void> {
  const siteUrl = config.siteUrl
  if (siteUrl === undefined) return
  const urls = routes
    .map((route) => absoluteRouteUrl(siteUrl, config.base, route.path))
    .sort(compareStrings)
  const lines = urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`)
  await writeFile(
    path.join(outDir, 'sitemap.xml'),
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...lines,
      '</urlset>',
      '',
    ].join('\n'),
    'utf8',
  )
}
