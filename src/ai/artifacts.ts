import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AiChunk, AiPage } from '../shared/ai.js'
import type { AiArtifactConfig, ResolvedConfig } from '../shared/config.js'
import { joinBaseRoute } from '../shared/url.js'
import { createAiChunks } from './chunks.js'

export interface AiIndexFile {
  version: 1
  generatedBy: string
  pages: AiPage[]
  chunks: AiChunk[]
}

export interface ArtifactOptions {
  outDir: string
  site: Pick<ResolvedConfig, 'title' | 'description' | 'base'>
  pages: readonly AiPage[]
  config?: Partial<AiArtifactConfig> & {
    readonly contract?: { readonly enabled?: boolean }
  }
}

export interface ArtifactResult {
  files: string[]
  pageCount: number
  chunkCount: number
}

const defaultConfig = {
  llmsTxt: true,
  llmsFullTxt: true,
  markdownRoutes: true,
  index: true,
}

function normalizeText(value: string): string {
  return `${value.replace(/\r\n?/g, '\n').trimEnd()}\n`
}

function publicPage(page: AiPage): AiPage {
  return {
    route: page.route,
    title: page.title,
    markdown: normalizeText(page.markdown),
    ...(page.description ? { description: page.description } : {}),
  }
}

function includedPages(pages: readonly AiPage[]): AiPage[] {
  return pages
    .filter((page) => page.draft !== true && page.ai !== false)
    .map(publicPage)
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function markdownLinkLabel(value: string): string {
  return singleLine(value).replaceAll('\\', '\\\\').replaceAll(']', '\\]')
}

export function markdownUrlForRoute(route: string): string {
  if (route === '/') return '/index.md'
  if (route.endsWith('/')) return `${route}index.md`
  return `${route}.md`
}

function markdownOutputFile(outDir: string, route: string): string {
  const url = markdownUrlForRoute(route)
  if (!url.startsWith('/') || url.includes('\\') || url.includes('\0')) {
    throw new Error(`Unsafe AI Markdown route ${route}`)
  }
  const segments = url.slice(1).split('/')
  for (const segment of segments) {
    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      throw new Error(`Unsafe encoded AI Markdown route ${route}`)
    }
    if (
      !segment ||
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      decoded.includes('\0')
    ) {
      throw new Error(`Unsafe AI Markdown route ${route}`)
    }
  }
  return path.resolve(outDir, ...segments)
}

export function renderLlmsTxt(
  site: Pick<ResolvedConfig, 'title' | 'description' | 'base'>,
  pages: readonly AiPage[],
  markdownRoutes = true,
  contractEnabled = true,
): string {
  const links = pages.map(
    (page) =>
      `- [${markdownLinkLabel(page.title)}](${joinBaseRoute(site.base, markdownRoutes ? markdownUrlForRoute(page.route) : page.route)})${page.description ? `: ${singleLine(page.description)}` : ''}`,
  )
  return normalizeText(
    [
      `# ${site.title}`,
      '',
      `> ${site.description}`,
      '',
      '## Documentation',
      '',
      ...links,
      ...(contractEnabled
        ? [
            '',
            '## Agent Contract',
            '',
            `- [Silen Agent Contract](${joinBaseRoute(site.base, '/.well-known/silen/manifest.json')})`,
          ]
        : []),
    ].join('\n'),
  )
}

export function renderLlmsFullTxt(
  site: Pick<ResolvedConfig, 'title' | 'description'>,
  pages: readonly AiPage[],
): string {
  return normalizeText(
    [
      `# ${site.title}`,
      '',
      `> ${site.description}`,
      ...pages.flatMap((page) => ['', page.markdown.trimEnd()]),
    ].join('\n'),
  )
}

export async function generateAiArtifacts(
  options: ArtifactOptions,
): Promise<ArtifactResult> {
  const config = { ...defaultConfig, ...options.config }
  const pages = includedPages(options.pages)
  const chunks = pages.flatMap(createAiChunks)
  const files: string[] = []

  await mkdir(options.outDir, { recursive: true })

  if (config.markdownRoutes) {
    await Promise.all(
      pages.map(async (page) => {
        const relativeFile = markdownUrlForRoute(page.route).slice(1)
        const destination = markdownOutputFile(options.outDir, page.route)
        await mkdir(path.dirname(destination), { recursive: true })
        await writeFile(destination, page.markdown, 'utf8')
        files.push(relativeFile)
      }),
    )
  }
  if (config.llmsTxt) {
    await writeFile(
      path.join(options.outDir, 'llms.txt'),
      renderLlmsTxt(
        options.site,
        pages,
        config.markdownRoutes,
        options.config?.contract?.enabled !== false,
      ),
      'utf8',
    )
    files.push('llms.txt')
  }
  if (config.llmsFullTxt) {
    await writeFile(
      path.join(options.outDir, 'llms-full.txt'),
      renderLlmsFullTxt(options.site, pages),
      'utf8',
    )
    files.push('llms-full.txt')
  }
  if (config.index) {
    const index: AiIndexFile = {
      version: 1,
      generatedBy: 'Silen',
      pages,
      chunks,
    }
    await writeFile(
      path.join(options.outDir, 'ai-index.json'),
      `${JSON.stringify(index, null, 2)}\n`,
      'utf8',
    )
    files.push('ai-index.json')
  }

  return {
    files: files.sort(),
    pageCount: pages.length,
    chunkCount: chunks.length,
  }
}
