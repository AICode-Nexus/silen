import { readFile } from 'node:fs/promises'
import path from 'node:path'
import mdx from '@mdx-js/rollup'
import matter from 'gray-matter'
import GithubSlugger from 'github-slugger'
import type { Plugin } from 'vite'
import type { Heading } from '../shared/page.js'
import { fileToRoute } from './routes.js'
import { remarkPageData } from './remark-page-data.js'

export interface CompiledPage {
  file: string
  route: string
  source: string
  frontmatter: Record<string, unknown>
  headings: Heading[]
  links: string[]
  title: string
  description: string
}

interface AnalyzedPage {
  frontmatter: Record<string, unknown>
  headings: Heading[]
  links: string[]
}

function asFrontmatter(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function stringField(
  frontmatter: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = frontmatter[field]
  return typeof value === 'string' ? value : undefined
}

function analyzePageSource(
  content: string,
  frontmatter: Record<string, unknown>,
): AnalyzedPage {
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

  return { frontmatter, headings, links }
}

function fallbackTitle(content: string, headings: Heading[]): string {
  const h1 = /^#\s+(.+)$/m.exec(content)?.[1]?.trim()
  return h1 ?? headings[0]?.title ?? ''
}

export async function compilePage(file: string): Promise<CompiledPage> {
  const source = await readFile(file, 'utf8')
  const parsed = matter(source)
  const frontmatter = asFrontmatter(parsed.data)
  const analyzed = analyzePageSource(parsed.content, frontmatter)

  return {
    file,
    route: fileToRoute(path.basename(file)),
    source,
    ...analyzed,
    title:
      stringField(frontmatter, 'title') ??
      fallbackTitle(parsed.content, analyzed.headings),
    description: stringField(frontmatter, 'description') ?? '',
  }
}

const pageDataPlugin: Plugin = {
  name: 'silen:page-data',
  enforce: 'pre',
  transform(source, id) {
    const cleanId = id.split('?', 1)[0]
    if (!cleanId || !/\.mdx?$/.test(cleanId)) return undefined

    const parsed = matter(source)
    const analyzed = analyzePageSource(
      parsed.content,
      asFrontmatter(parsed.data),
    )

    return [
      parsed.content,
      `export const frontmatter = ${JSON.stringify(analyzed.frontmatter)}`,
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

export type { Heading } from '../shared/page.js'
