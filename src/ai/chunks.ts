import GithubSlugger from 'github-slugger'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import type { AiChunk, AiPage } from '../shared/ai.js'

interface ChunkAstNode {
  type: string
  alt?: string
  children?: ChunkAstNode[]
  depth?: number
  lang?: string | null
  url?: string
  value?: string
}

interface PendingChunk {
  id: string
  headingPath: string[]
  nodes: ChunkAstNode[]
}

// remark-parse and unified are both pinned, but pnpm keeps the parser's own
// compatible declaration copy. Bridge that type-only boundary here.
const markdownParser = unified().use(remarkParse as never)

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function nodeText(node: ChunkAstNode): string {
  if (node.type === 'code') return ''
  if (node.type === 'text' || node.type === 'inlineCode') {
    return node.value ?? ''
  }
  if (node.type === 'image') return node.alt ?? ''
  return (node.children ?? []).map(nodeText).filter(Boolean).join(' ')
}

function headingText(node: ChunkAstNode): string {
  return normalizeText(nodeText(node))
}

function walk(
  nodes: readonly ChunkAstNode[],
  visitor: (node: ChunkAstNode) => void,
): void {
  for (const node of nodes) {
    visitor(node)
    walk(node.children ?? [], visitor)
  }
}

function chunkText(nodes: readonly ChunkAstNode[]): string {
  return normalizeText(
    nodes
      .filter((node) => node.type !== 'heading')
      .map(nodeText)
      .filter(Boolean)
      .join(' '),
  )
}

function chunkCode(
  nodes: readonly ChunkAstNode[],
): Array<{ language: string; value: string }> {
  const code: Array<{ language: string; value: string }> = []
  walk(nodes, (node) => {
    if (node.type === 'code') {
      code.push({ language: node.lang ?? '', value: node.value ?? '' })
    }
  })
  return code
}

function chunkLinks(nodes: readonly ChunkAstNode[]): string[] {
  const links: string[] = []
  walk(nodes, (node) => {
    if (node.type === 'link' && node.url) links.push(node.url)
  })
  return links
}

function slug(value: string): string {
  return new GithubSlugger().slug(value) || 'section'
}

function uniqueHeadingId(
  route: string,
  segments: readonly string[],
  seen: Map<string, number>,
): { id: string; segments: string[] } {
  const baseId = `${route}#${segments.join('/')}`
  const duplicate = seen.get(baseId) ?? 0
  seen.set(baseId, duplicate + 1)
  if (duplicate === 0) return { id: baseId, segments: [...segments] }

  const uniqueSegments = [...segments]
  const last = uniqueSegments.at(-1) ?? 'section'
  uniqueSegments[uniqueSegments.length - 1] = `${last}-${duplicate}`
  return {
    id: `${route}#${uniqueSegments.join('/')}`,
    segments: uniqueSegments,
  }
}

function finalizeChunk(
  page: AiPage,
  chunk: PendingChunk,
  order: number,
): AiChunk {
  return {
    id: chunk.id,
    route: page.route,
    title: page.title,
    headingPath: chunk.headingPath,
    text: chunkText(chunk.nodes),
    code: chunkCode(chunk.nodes),
    links: chunkLinks(chunk.nodes),
    order,
  }
}

export function createAiChunks(page: AiPage): AiChunk[] {
  if (page.draft === true || page.ai === false) return []

  const tree = markdownParser.parse(page.markdown) as unknown as ChunkAstNode
  const chunks: PendingChunk[] = []
  const seenIds = new Map<string, number>()
  let activeHeadingTitles: string[] = []
  let activeHeadingSlugs: string[] = []
  let current: PendingChunk = {
    id: page.route,
    headingPath: [],
    nodes: [],
  }

  for (const node of tree.children ?? []) {
    if (node.type === 'heading' && (node.depth === 2 || node.depth === 3)) {
      chunks.push(current)
      const title = headingText(node)
      const segment = slug(title)
      if (node.depth === 2) {
        activeHeadingTitles = [title]
        activeHeadingSlugs = [segment]
      } else {
        activeHeadingTitles = [...activeHeadingTitles.slice(0, 1), title]
        activeHeadingSlugs = [...activeHeadingSlugs.slice(0, 1), segment]
      }
      const unique = uniqueHeadingId(page.route, activeHeadingSlugs, seenIds)
      activeHeadingSlugs = unique.segments
      current = {
        id: unique.id,
        headingPath: [...activeHeadingTitles],
        nodes: [node],
      }
      continue
    }
    current.nodes.push(node)
  }
  chunks.push(current)

  return chunks.map((chunk, order) => finalizeChunk(page, chunk, order))
}
