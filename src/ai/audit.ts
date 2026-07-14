import path from 'node:path'
import type { WorkspaceSearchDocument } from './search.js'

export interface WorkspaceCitation {
  path: string
  line: number
  kind: 'footnote' | 'link'
  label: string
  target?: string
  valid: boolean
}

export interface WorkspaceBacklink {
  path: string
  route: string
  title: string
}

export interface WorkspaceAuditIssue {
  code: 'broken-link' | 'citation' | 'artifact' | 'index'
  path: string
  message: string
}

export interface WorkspaceAuditResult {
  ok: boolean
  filesChecked: number
  issues: WorkspaceAuditIssue[]
}

export type WorkspaceDocument = WorkspaceSearchDocument

const absoluteScheme = /^[A-Za-z][A-Za-z\d+.-]*:/

function routeForFile(file: string): string {
  const withoutExtension = file.replace(/\.mdx?$/i, '')
  if (withoutExtension === 'index') return '/'
  if (withoutExtension.endsWith('/index')) {
    return `/${withoutExtension.slice(0, -6)}`
  }
  return `/${withoutExtension}`
}

function normalizedRoute(route: string): string {
  const withoutSuffix = route.split(/[?#]/, 1)[0] ?? route
  const withoutExtension = withoutSuffix.replace(/\.(?:md|mdx|html)$/i, '')
  if (withoutExtension === '/index') return '/'
  if (withoutExtension.endsWith('/index')) {
    return withoutExtension.slice(0, -6) || '/'
  }
  return withoutExtension.length > 1 && withoutExtension.endsWith('/')
    ? withoutExtension.slice(0, -1)
    : withoutExtension || '/'
}

function targetRoute(
  source: WorkspaceDocument,
  target: string,
): string | undefined {
  const trimmed = target.trim()
  if (
    !trimmed ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('//') ||
    absoluteScheme.test(trimmed)
  ) {
    return undefined
  }
  if (trimmed.startsWith('/')) return normalizedRoute(trimmed)
  const targetPath = path.posix.normalize(
    path.posix.join(
      path.posix.dirname(source.path),
      trimmed.split(/[?#]/, 1)[0] ?? trimmed,
    ),
  )
  return normalizedRoute(routeForFile(targetPath))
}

function markdownLinks(
  markdown: string,
): Array<{ target: string; line: number; label?: string }> {
  const lines = markdown.split('\n')
  const definitions = new Map<string, string>()
  for (const line of lines) {
    const definition = /^\[([^\]^]+)\]:\s*(\S+)/.exec(line)
    if (definition?.[1] && definition[2]) {
      definitions.set(definition[1].toLowerCase(), definition[2])
    }
  }

  const links: Array<{ target: string; line: number; label?: string }> = []
  for (const [index, line] of lines.entries()) {
    const expression = /(?<!!)\[[^\]]*\]\(([^\s)]+)(?:\s+['"][^'"]*['"])?\)/g
    for (const match of line.matchAll(expression)) {
      const target = match[1]
      if (target) links.push({ target, line: index + 1 })
    }
    const referenceExpression = /(?<!!)\[([^\]]+)\]\[([^\]]*)\]/g
    for (const match of line.matchAll(referenceExpression)) {
      const label = (match[2] || match[1])?.trim()
      const target = label ? definitions.get(label.toLowerCase()) : undefined
      if (label && target) links.push({ target, line: index + 1, label })
    }
  }
  return links
}

export function inspectCitations(
  document: WorkspaceDocument,
): WorkspaceCitation[] {
  const lines = document.text.split('\n')
  const definitions = new Map<string, { line: number; text: string }>()
  for (const [index, line] of lines.entries()) {
    const definition = /^\[\^([^\]]+)\]:\s*(.*)$/.exec(line)
    if (definition?.[1])
      definitions.set(definition[1], {
        line: index + 1,
        text: definition[2] ?? '',
      })
  }

  const citations: WorkspaceCitation[] = []
  for (const [index, line] of lines.entries()) {
    if (/^\[\^[^\]]+\]:/.test(line)) continue
    for (const match of line.matchAll(/\[\^([^\]]+)\]/g)) {
      const label = match[1]
      if (!label) continue
      citations.push({
        path: document.path,
        line: index + 1,
        kind: 'footnote',
        label,
        valid: definitions.has(label),
      })
    }
  }
  for (const link of markdownLinks(document.text)) {
    if (!/^https?:\/\//i.test(link.target)) continue
    citations.push({
      path: document.path,
      line: link.line,
      kind: 'link',
      label: link.label ?? link.target,
      target: link.target,
      valid: true,
    })
  }
  return citations
}

export function findBacklinks(
  documents: readonly WorkspaceDocument[],
  route: string,
): WorkspaceBacklink[] {
  const requested = normalizedRoute(route)
  return documents
    .filter((document) =>
      markdownLinks(document.text).some(
        (link) => targetRoute(document, link.target) === requested,
      ),
    )
    .map(({ path: file, route: sourceRoute, title }) => ({
      path: file,
      route: sourceRoute,
      title,
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
}

export function auditDocuments(
  documents: readonly WorkspaceDocument[],
  options: {
    artifacts: ReadonlySet<string>
    indexFresh: boolean
  },
): WorkspaceAuditResult {
  const routes = new Set(
    documents.map((document) => normalizedRoute(document.route)),
  )
  const issues: WorkspaceAuditIssue[] = []
  for (const document of documents) {
    for (const link of markdownLinks(document.text)) {
      const target = targetRoute(document, link.target)
      if (target && !routes.has(target)) {
        issues.push({
          code: 'broken-link',
          path: document.path,
          message: `Broken internal link ${link.target} on line ${link.line}`,
        })
      }
    }
    for (const citation of inspectCitations(document)) {
      if (!citation.valid) {
        issues.push({
          code: 'citation',
          path: document.path,
          message: `Missing footnote definition ${citation.label} on line ${citation.line}`,
        })
      }
    }
  }
  for (const artifact of ['llms.txt', 'llms-full.txt', 'ai-index.json']) {
    if (!options.artifacts.has(artifact)) {
      issues.push({
        code: 'artifact',
        path: `.silen/dist/${artifact}`,
        message: `Missing generated AI artifact ${artifact}`,
      })
    }
  }
  if (!options.indexFresh) {
    issues.push({
      code: 'index',
      path: '.silen/ai/index.json',
      message: 'The deterministic workspace index is missing or stale',
    })
  }
  return { ok: issues.length === 0, filesChecked: documents.length, issues }
}
