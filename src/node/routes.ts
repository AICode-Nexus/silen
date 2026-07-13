import path from 'node:path'
import fg from 'fast-glob'
import type { RouteRecord } from '../shared/page.js'

export function fileToRoute(relativeFile: string): string {
  const normalized = relativeFile.replaceAll('\\', '/').replace(/\.mdx?$/, '')

  if (normalized === 'index') return '/'
  if (normalized.endsWith('/index')) return `/${normalized.slice(0, -5)}`
  return `/${normalized}`
}

export async function scanRoutes(root: string): Promise<RouteRecord[]> {
  const files = await fg(['**/*.md', '**/*.mdx'], {
    cwd: root,
    ignore: ['.silen/**'],
    onlyFiles: true,
  })
  const routes = files.sort().map((relativeFile) => ({
    path: fileToRoute(relativeFile),
    relativeFile,
    file: path.resolve(root, relativeFile),
  }))
  const seen = new Map<string, string>()

  for (const route of routes) {
    const previous = seen.get(route.path)
    if (previous) {
      throw new Error(
        `Duplicate route ${route.path}: ${previous}, ${route.relativeFile}`,
      )
    }
    seen.set(route.path, route.relativeFile)
  }

  return routes
}
