import { createProcessor } from '@mdx-js/mdx'
import remarkFrontmatter from 'remark-frontmatter'
import remarkStringify from 'remark-stringify'
import { unified } from 'unified'
import type { CompiledPage } from './mdx.js'
import { rewriteInternalPageLink } from './links.js'

interface MarkdownAstNode {
  type: string
  children?: MarkdownAstNode[]
  position?: {
    start?: { offset?: number }
    end?: { offset?: number }
  }
  value?: string
  url?: string
}

const markdownParser = createProcessor({
  remarkPlugins: [[remarkFrontmatter, ['yaml', 'toml']]],
})

// The pinned remark package resolves its own compatible unified declaration.
// Runtime interop is stable; bridge only the duplicated declaration families.
const markdownSerializer = unified().use(remarkStringify as never, {
  bullet: '-',
  fences: true,
})

const omittedNodeTypes = new Set([
  'html',
  'mdxFlowExpression',
  'mdxTextExpression',
  'mdxjsEsm',
  'toml',
  'yaml',
])

function sourceForNode(node: MarkdownAstNode, source: string): string {
  const start = node.position?.start?.offset
  const end = node.position?.end?.offset
  return typeof start === 'number' && typeof end === 'number'
    ? source.slice(start, end)
    : ''
}

function isGfmTable(value: string): boolean {
  const lines = value.split(/\r?\n/).map((line) => line.trim())
  if (lines.length < 2 || lines.some((line) => !line.includes('|'))) {
    return false
  }
  const rows = lines.map((line) =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim()),
  )
  const header = rows[0]
  const separators = rows[1]
  return Boolean(
    header?.length &&
    separators?.length === header.length &&
    separators.every((cell) => /^:?-{3,}:?$/.test(cell)),
  )
}

function sanitizedChildren(
  nodes: readonly MarkdownAstNode[],
  source: string,
  route: string,
  base: string,
): MarkdownAstNode[] {
  return nodes.flatMap((node) => sanitizeNode(node, source, route, base))
}

function sanitizeNode(
  node: MarkdownAstNode,
  source: string,
  route: string,
  base: string,
): MarkdownAstNode[] {
  if (omittedNodeTypes.has(node.type)) return []

  if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
    return sanitizedChildren(node.children ?? [], source, route, base)
  }

  const original = sourceForNode(node, source)
  if (node.type === 'paragraph' && isGfmTable(original)) {
    return [{ type: 'html', value: original.replace(/\r\n?/g, '\n') }]
  }

  const sanitized =
    node.url &&
    (node.type === 'link' ||
      node.type === 'image' ||
      node.type === 'definition')
      ? { ...node, url: rewriteInternalPageLink(node.url, route, base) }
      : { ...node }

  if (!node.children) return [sanitized]
  return [
    {
      ...sanitized,
      children: sanitizedChildren(node.children, source, route, base),
    },
  ]
}

export function serializePageMarkdown(page: CompiledPage, base = '/'): string {
  const source = page.source.replace(/\r\n?/g, '\n')
  const parsed = markdownParser.parse(source) as unknown as MarkdownAstNode
  const tree: MarkdownAstNode = {
    ...parsed,
    children: sanitizedChildren(
      parsed.children ?? [],
      source,
      page.route,
      base,
    ),
  }
  return `${String(markdownSerializer.stringify(tree as never)).trimEnd()}\n`
}
