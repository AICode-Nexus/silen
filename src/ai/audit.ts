import path from 'node:path'
import { SILEN_VERSION } from '../shared/version.js'
import { parseApiContract, parseContractManifest } from './contract/schema.js'
import { parseTaskDocument } from './contract/tasks.js'
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
  code:
    | 'broken-link'
    | 'citation'
    | 'artifact'
    | 'index'
    | 'contract-missing'
    | 'contract-schema'
    | 'contract-version'
    | 'contract-resource'
    | 'contract-reference'
    | 'contract-locale'
    | 'contract-fallback'
  path: string
  message: string
}

export interface WorkspaceAuditResult {
  ok: boolean
  filesChecked: number
  issues: WorkspaceAuditIssue[]
}

export type WorkspaceDocument = WorkspaceSearchDocument

export interface AgentContractAuditInput {
  readonly llmsTxt?: string
  read(relativeOutputPath: string): Promise<string | undefined>
}

const manifestPath = '.silen/dist/.well-known/silen/manifest.json'
const apiPath = '.silen/dist/.well-known/silen/api.json'

function contractIssue(
  code: WorkspaceAuditIssue['code'],
  relativePath: string,
  message: string,
): WorkspaceAuditIssue {
  return { code, path: relativePath, message }
}

function outputPathForUrl(base: string, url: string): string | undefined {
  let pathname: string
  try {
    const parsed = new URL(url, 'https://silen.local')
    if (parsed.origin !== 'https://silen.local') return undefined
    pathname = decodeURIComponent(parsed.pathname)
  } catch {
    return undefined
  }
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const relative =
    normalizedBase === '/'
      ? pathname.slice(1)
      : pathname.startsWith(normalizedBase)
        ? pathname.slice(normalizedBase.length)
        : undefined
  if (
    relative === undefined ||
    !relative ||
    relative.includes('\\') ||
    relative
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return undefined
  }
  return `.silen/dist/${relative}`
}

function knownContractReferences(
  api: ReturnType<typeof parseApiContract>,
): Set<string> {
  const references = new Set([
    'artifact:ai-index',
    'artifact:llms',
    'artifact:llms-full',
    'artifact:markdown-routes',
    'artifact:silen-manifest',
  ])
  for (const field of api.config.fields) {
    const segments = field.path.split('.')
    for (let length = segments.length; length > 0; length -= 1) {
      references.add(`config:${segments.slice(0, length).join('.')}`)
    }
  }
  for (const command of api.cli.commands) references.add(`cli:${command.id}`)
  for (const tool of api.mcp.tools) references.add(`mcp:${tool.name}`)
  return references
}

export async function auditAgentContract(
  input: AgentContractAuditInput,
): Promise<WorkspaceAuditIssue[]> {
  if (!input.llmsTxt?.includes('.well-known/silen/manifest.json')) return []
  const manifestSource = await input.read(manifestPath)
  if (manifestSource === undefined) {
    return [
      contractIssue(
        'contract-missing',
        manifestPath,
        'llms.txt advertises a missing Silen Agent Contract manifest',
      ),
    ]
  }

  let rawManifest: unknown
  try {
    rawManifest = JSON.parse(manifestSource)
  } catch {
    return [
      contractIssue(
        'contract-schema',
        manifestPath,
        'The Silen Agent Contract manifest is not valid JSON',
      ),
    ]
  }
  if (
    typeof rawManifest === 'object' &&
    rawManifest !== null &&
    'schemaVersion' in rawManifest &&
    (rawManifest as { schemaVersion?: unknown }).schemaVersion !== 1
  ) {
    return [
      contractIssue(
        'contract-fallback',
        manifestPath,
        'Unsupported Agent Contract schema; use read-only Markdown fallback',
      ),
    ]
  }

  let manifest
  try {
    manifest = parseContractManifest(rawManifest)
  } catch {
    return [
      contractIssue(
        'contract-schema',
        manifestPath,
        'The Silen Agent Contract manifest does not match schema v1',
      ),
    ]
  }
  if (manifest.kind !== 'silen-site') {
    return [
      contractIssue(
        'contract-fallback',
        manifestPath,
        'Expected a site Agent Contract; use read-only Markdown fallback',
      ),
    ]
  }

  const issues: WorkspaceAuditIssue[] = []
  if (manifest.generator.version !== SILEN_VERSION) {
    issues.push(
      contractIssue(
        'contract-version',
        manifestPath,
        `Agent Contract version ${manifest.generator.version} does not match Silen ${SILEN_VERSION}`,
      ),
    )
  }
  const apiSource = await input.read(apiPath)
  let api: ReturnType<typeof parseApiContract> | undefined
  if (apiSource === undefined) {
    issues.push(
      contractIssue('contract-resource', apiPath, 'Missing Agent Contract API'),
    )
  } else {
    try {
      api = parseApiContract(JSON.parse(apiSource))
      if (api.generator.version !== SILEN_VERSION) {
        issues.push(
          contractIssue(
            'contract-version',
            apiPath,
            `Agent Contract API version ${api.generator.version} does not match Silen ${SILEN_VERSION}`,
          ),
        )
      }
    } catch {
      issues.push(
        contractIssue(
          'contract-schema',
          apiPath,
          'The Agent Contract API does not match schema v1',
        ),
      )
    }
  }

  const locales = new Set(manifest.site.locales.map((locale) => locale.lang))
  const resources = [...manifest.resources, ...manifest.tasks]
  const loadedTasks = new Map<string, string>()
  for (const resource of resources) {
    if (resource.lang !== undefined && !locales.has(resource.lang)) {
      issues.push(
        contractIssue(
          'contract-locale',
          manifestPath,
          `Contract entry ${resource.id} references unknown locale ${resource.lang}`,
        ),
      )
    }
    const relativePath = outputPathForUrl(manifest.site.base, resource.url)
    if (relativePath === undefined) {
      issues.push(
        contractIssue(
          'contract-resource',
          manifestPath,
          `Contract entry ${resource.id} has a non-local public URL`,
        ),
      )
      continue
    }
    const source = await input.read(relativePath)
    if (source === undefined) {
      issues.push(
        contractIssue(
          'contract-resource',
          relativePath,
          `Missing Agent Contract resource ${resource.id}`,
        ),
      )
    } else if ('mode' in resource) {
      loadedTasks.set(relativePath, source)
    }
  }

  if (api !== undefined) {
    const references = knownContractReferences(api)
    for (const task of manifest.tasks) {
      const relativePath = outputPathForUrl(manifest.site.base, task.url)
      const source = relativePath ? loadedTasks.get(relativePath) : undefined
      if (relativePath === undefined || source === undefined) continue
      try {
        const parsed = parseTaskDocument(source, relativePath, references)
        if (
          parsed.metadata.id !== task.id ||
          parsed.metadata.mode !== task.mode
        ) {
          throw new Error('metadata mismatch')
        }
      } catch {
        issues.push(
          contractIssue(
            'contract-reference',
            relativePath,
            `Task ${task.id} does not match the assembled Agent Contract`,
          ),
        )
      }
    }
  }
  return issues.sort(
    (left, right) =>
      left.path.localeCompare(right.path, 'en') ||
      left.code.localeCompare(right.code, 'en'),
  )
}

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
    contractIssues?: readonly WorkspaceAuditIssue[]
  },
): WorkspaceAuditResult {
  const routes = new Set(
    documents.map((document) => normalizedRoute(document.route)),
  )
  const issues: WorkspaceAuditIssue[] = []
  issues.push(...(options.contractIssues ?? []))
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
