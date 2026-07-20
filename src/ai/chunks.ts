import GithubSlugger from 'github-slugger'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import type { AiChunk, AiPage } from '../shared/ai.js'

interface ChunkAstNode {
  type: string
  alt?: string
  children?: ChunkAstNode[]
  depth?: number
  identifier?: string
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
const markdownParser = unified()
  .use(remarkParse as never)
  .use(remarkGfm as never)

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
      .filter(
        (node) =>
          node.type !== 'heading' ||
          (typeof node.depth === 'number' && node.depth >= 4),
      )
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

function chunkLinks(
  nodes: readonly ChunkAstNode[],
  definitions: ReadonlyMap<string, string>,
): string[] {
  const links: string[] = []
  walk(nodes, (node) => {
    if (node.type === 'link' && node.url) links.push(node.url)
    if (node.type === 'linkReference' && node.identifier) {
      const url = definitions.get(node.identifier)
      if (url) links.push(url)
    }
  })
  return links
}

function linkDefinitions(nodes: readonly ChunkAstNode[]): Map<string, string> {
  const definitions = new Map<string, string>()
  walk(nodes, (node) => {
    if (
      node.type === 'definition' &&
      node.identifier &&
      node.url &&
      !definitions.has(node.identifier)
    ) {
      definitions.set(node.identifier, node.url)
    }
  })
  return definitions
}

function slug(value: string): string {
  return new GithubSlugger().slug(value) || 'section'
}

function uniqueHeadingId(
  route: string,
  segments: readonly string[],
  usedIds: Set<string>,
): { id: string; segments: string[] } {
  const uniqueSegments = [...segments]
  const last = uniqueSegments.at(-1) ?? 'section'
  let duplicate = 0
  let id = `${route}#${uniqueSegments.join('/')}`

  while (usedIds.has(id)) {
    duplicate += 1
    uniqueSegments[uniqueSegments.length - 1] = `${last}-${duplicate}`
    id = `${route}#${uniqueSegments.join('/')}`
  }
  usedIds.add(id)
  return { id, segments: uniqueSegments }
}

function finalizeChunk(
  page: AiPage,
  chunk: PendingChunk,
  order: number,
  definitions: ReadonlyMap<string, string>,
): AiChunk {
  return {
    id: chunk.id,
    route: page.route,
    title: page.title,
    headingPath: chunk.headingPath,
    text: chunkText(chunk.nodes),
    code: chunkCode(chunk.nodes),
    links: chunkLinks(chunk.nodes, definitions),
    order,
  }
}

export function createAiChunks(page: AiPage): AiChunk[] {
  if (page.draft === true || page.ai === false) return []

  const tree = markdownParser.parse(page.markdown) as unknown as ChunkAstNode
  const chunks: PendingChunk[] = []
  const definitions = linkDefinitions(tree.children ?? [])
  const usedIds = new Set([page.route])
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
      const unique = uniqueHeadingId(page.route, activeHeadingSlugs, usedIds)
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

  return chunks.map((chunk, order) =>
    finalizeChunk(page, chunk, order, definitions),
  )
}
