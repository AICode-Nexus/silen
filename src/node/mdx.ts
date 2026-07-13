import { readFile } from 'node:fs/promises'
import mdx from '@mdx-js/rollup'
import matter from 'gray-matter'
import GithubSlugger from 'github-slugger'
import type { Plugin } from 'vite'
import type { Heading, JsonObject, RouteRecord } from '../shared/page.js'
import { remarkPageData } from './remark-page-data.js'

export interface CompiledPage {
  file: string
  route: string
  source: string
  frontmatter: JsonObject
  headings: Heading[]
  links: string[]
  title: string
  description: string
}

interface AnalyzedPage {
  frontmatter: JsonObject
  headings: Heading[]
  links: string[]
}

export function normalizeFrontmatter(value: unknown): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }

  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) {
      throw new TypeError('the root value is not JSON-serializable')
    }

    const normalized: unknown = JSON.parse(serialized)
    if (
      typeof normalized !== 'object' ||
      normalized === null ||
      Array.isArray(normalized)
    ) {
      throw new TypeError('the normalized root value is not an object')
    }

    return normalized as JsonObject
  } catch (cause) {
    const detail = cause instanceof Error ? `: ${cause.message}` : ''
    throw new TypeError(`Failed to normalize frontmatter as JSON${detail}`, {
      cause,
    })
  }
}

function stringField(
  frontmatter: JsonObject,
  field: string,
): string | undefined {
  const value = frontmatter[field]
  return typeof value === 'string' ? value : undefined
}

function analyzePageSource(
  content: string,
  frontmatter: unknown,
): AnalyzedPage {
  const normalizedFrontmatter = normalizeFrontmatter(frontmatter)
  const slugger = new GithubSlugger()
  const headings: Heading[] = []
  const links: string[] = []

  for (const match of content.matchAll(/^(#{2,6})\s+(.+)$/gm)) {
    const hashes = match[1]
    const rawTitle = match[2]
    if (!hashes || !rawTitle) continue

    const title = rawTitle.trim()
    headings.push({
      depth: hashes.length,
      title,
      slug: slugger.slug(title),
    })
  }

  for (const match of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const url = match[1]
    if (url) links.push(url)
  }

  return { frontmatter: normalizedFrontmatter, headings, links }
}

function fallbackTitle(content: string, headings: Heading[]): string {
  const h1 = /^#\s+(.+)$/m.exec(content)?.[1]?.trim()
  return h1 ?? headings[0]?.title ?? ''
}

function serializeJsonForModule(value: JsonObject): string {
  const serialized = JSON.stringify(value)
  return `JSON.parse(${JSON.stringify(serialized)})`
}

export async function compilePage(route: RouteRecord): Promise<CompiledPage> {
  const source = await readFile(route.file, 'utf8')
  const parsed = matter(source)
  const analyzed = analyzePageSource(parsed.content, parsed.data)

  return {
    file: route.file,
    route: route.path,
    source,
    ...analyzed,
    title:
      stringField(analyzed.frontmatter, 'title') ??
      fallbackTitle(parsed.content, analyzed.headings),
    description: stringField(analyzed.frontmatter, 'description') ?? '',
  }
}

const pageDataPlugin: Plugin = {
  name: 'silen:page-data',
  enforce: 'pre',
  transform(source, id) {
    const cleanId = id.split('?', 1)[0]
    if (!cleanId || !/\.mdx?$/.test(cleanId)) return undefined

    const parsed = matter(source)
    const analyzed = analyzePageSource(parsed.content, parsed.data)

    return [
      parsed.content,
      `export const frontmatter = ${serializeJsonForModule(analyzed.frontmatter)}`,
      `export const headings = ${JSON.stringify(analyzed.headings)}`,
      `export const links = ${JSON.stringify(analyzed.links)}`,
    ].join('\n')
  },
}

export function createMdxPlugins(): Plugin[] {
  // Vite 8's public Plugin type is based on Rolldown while the official MDX
  // adapter exposes the Rollup Plugin type. Vite accepts that adapter at
  // runtime; bridge only the incompatible declaration families here.
  const mdxPlugin = mdx({
    remarkPlugins: [remarkPageData],
  }) as unknown as Plugin
  return [pageDataPlugin, mdxPlugin]
}

export type {
  Heading,
  JsonObject,
  JsonPrimitive,
  JsonValue,
} from '../shared/page.js'
