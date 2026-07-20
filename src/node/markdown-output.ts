import { createProcessor } from '@mdx-js/mdx'
import { gfmToMarkdown } from 'mdast-util-gfm'
import { toMarkdown } from 'mdast-util-to-markdown'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import type { CompiledPage } from './mdx.js'
import { rewriteInternalPageLink } from './links.js'

interface MarkdownAstNode {
  type: string
  align?: Array<'left' | 'right' | 'center' | null>
  children?: MarkdownAstNode[]
  position?: {
    start?: { offset?: number }
    end?: { offset?: number }
  }
  value?: string
  url?: string
}

const markdownParser = createProcessor({
  remarkPlugins: [remarkGfm, [remarkFrontmatter, ['yaml', 'toml']]],
})

const markdownSerializerOptions = {
  bullet: '-' as const,
  fences: true,
  extensions: [gfmToMarkdown()],
}

function stringifyMarkdown(node: MarkdownAstNode): string {
  return toMarkdown(node as never, markdownSerializerOptions)
}

const omittedNodeTypes = new Set([
  'html',
  'mdxFlowExpression',
  'mdxTextExpression',
  'mdxjsEsm',
  'toml',
  'yaml',
])

function sanitizedChildren(
  nodes: readonly MarkdownAstNode[],
  source: string,
  route: string,
  base: string,
): MarkdownAstNode[] {
  return nodes.flatMap((node) => sanitizeNode(node, source, route, base))
}

function tableCellText(
  cell: MarkdownAstNode | undefined,
  source: string,
  route: string,
  base: string,
): string {
  if (!cell) return ''
  const content = stringifyMarkdown({
    type: 'paragraph',
    children: sanitizedChildren(cell.children ?? [], source, route, base),
  })
    .trim()
    .replace(/\s*\n\s*/g, '<br>')
  return content.replaceAll('|', '\\|')
}

function tableDelimiter(align: 'left' | 'right' | 'center' | null): string {
  if (align === 'left') return ':---'
  if (align === 'right') return '---:'
  if (align === 'center') return ':---:'
  return '---'
}

function markdownTable(
  node: MarkdownAstNode,
  source: string,
  route: string,
  base: string,
): string {
  const [header, ...rows] = node.children ?? []
  const columnCount = Math.max(
    header?.children?.length ?? 0,
    ...rows.map((row) => row.children?.length ?? 0),
  )
  if (columnCount === 0) return ''
  const raw =
    node.position?.start?.offset === undefined ||
    node.position.end?.offset === undefined
      ? undefined
      : source.slice(node.position.start.offset, node.position.end.offset)
  const outerPipes =
    raw
      ?.split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .every((line) => line.startsWith('|') && line.endsWith('|')) ?? false
  const columns = Array.from({ length: columnCount }, (_, index) => index)
  const align = node.align ?? []
  const serializeRow = (row: MarkdownAstNode | undefined): string =>
    columns
      .map((index) =>
        tableCellText(row?.children?.[index], source, route, base),
      )
      .join(' | ')
  const tableRows = [
    serializeRow(header),
    columns.map((index) => tableDelimiter(align[index] ?? null)).join(' | '),
    ...rows.map(serializeRow),
  ]
  return outerPipes
    ? tableRows.map((row) => `| ${row} |`).join('\n')
    : tableRows.join('\n')
}

function sanitizeNode(
  node: MarkdownAstNode,
  source: string,
  route: string,
  base: string,
): MarkdownAstNode[] {
  if (omittedNodeTypes.has(node.type)) return []

  if (node.type === 'table') {
    const value = markdownTable(node, source, route, base)
    return value ? [{ type: 'html', value }] : []
  }

  if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
    return sanitizedChildren(node.children ?? [], source, route, base)
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
  return `${stringifyMarkdown(tree).trimEnd()}\n`
}
