import { stat } from 'node:fs/promises'
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import { build as buildSite } from '../node/build.js'
import {
  auditDocuments,
  findBacklinks,
  inspectCitations,
  type WorkspaceAuditResult,
  type WorkspaceBacklink,
  type WorkspaceCitation,
  type WorkspaceDocument,
} from './audit.js'
import {
  createWorkspaceSearch,
  fingerprintDocuments,
  type SerializedWorkspaceIndex,
  type WorkspaceSearchResult,
} from './search.js'

const MAX_PATH_LENGTH = 1024
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_READ_LINES = 4000
const MAX_LIST_FILES = 10_000
const ignoredDirectories = new Set(['.git', '.silen', 'node_modules'])

export class WorkspaceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'WorkspaceError'
  }
}

export interface WorkspaceFile {
  path: string
  route: string
  title: string
}

export interface WorkspaceReadOptions {
  path: string
  startLine?: number
  endLine?: number
}

export interface WorkspaceReadResult {
  path: string
  route: string
  startLine: number
  endLine: number
  totalLines: number
  text: string
  truncated: boolean
}

export interface Workspace {
  readonly relativeRoot: string
  resolve(requestedPath: string): Promise<string>
  init(): Promise<{ directories: string[] }>
  reindex(): Promise<{ fileCount: number; index: string; fingerprint: string }>
  guide(): Promise<string>
  list(
    requestedPath?: string,
  ): Promise<{ path: string; files: WorkspaceFile[] }>
  read(input: string | WorkspaceReadOptions): Promise<WorkspaceReadResult>
  search(
    query: string,
    limit?: number,
  ): Promise<{ query: string; results: WorkspaceSearchResult[] }>
  backlinks(
    route: string,
  ): Promise<{ route: string; backlinks: WorkspaceBacklink[] }>
  citations(requestedPath?: string): Promise<{ citations: WorkspaceCitation[] }>
  build(): Promise<{
    outDir: string
    routes: Array<{ path: string; file: string }>
  }>
  audit(): Promise<WorkspaceAuditResult>
}

function posixPath(value: string): string {
  return value.split(path.sep).join('/')
}

function containsPath(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return (
    relative === '' ||
    (!path.isAbsolute(relative) &&
      relative !== '..' &&
      !relative.startsWith(`..${path.sep}`))
  )
}

function routeForFile(file: string): string {
  const normalized = file.replace(/\.mdx?$/i, '')
  if (normalized === 'index') return '/'
  if (normalized.endsWith('/index')) return `/${normalized.slice(0, -6)}`
  return `/${normalized}`
}

function documentTitle(markdown: string, file: string): string {
  const parsed = matter(markdown)
  if (typeof parsed.data.title === 'string' && parsed.data.title.trim())
    return parsed.data.title.trim()
  const heading = /^#\s+(.+)$/m.exec(parsed.content)?.[1]?.trim()
  return heading || path.posix.basename(file).replace(/\.mdx?$/i, '')
}

function validatePathInput(value: string): void {
  if (
    !value ||
    value.length > MAX_PATH_LENGTH ||
    value.includes('\0') ||
    value.includes('\\') ||
    path.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  ) {
    throw new WorkspaceError('OUTSIDE_ROOT', 'Path is outside the content root')
  }
}

function validateReadOptions(options: WorkspaceReadOptions): {
  startLine: number
  endLine?: number
} {
  const startLine = options.startLine ?? 1
  const endLine = options.endLine
  if (
    !Number.isInteger(startLine) ||
    startLine < 1 ||
    (endLine !== undefined &&
      (!Number.isInteger(endLine) ||
        endLine < startLine ||
        endLine > MAX_READ_LINES))
  ) {
    throw new WorkspaceError(
      'INVALID_RANGE',
      `Read range must be between 1 and ${MAX_READ_LINES} lines`,
    )
  }
  return endLine === undefined ? { startLine } : { startLine, endLine }
}

export async function createWorkspace(root: string): Promise<Workspace> {
  if (typeof root !== 'string' || !root || root.length > MAX_PATH_LENGTH) {
    throw new WorkspaceError(
      'INVALID_ROOT',
      'Workspace root must be an existing directory',
    )
  }
  let contentRoot: string
  try {
    contentRoot = await realpath(path.resolve(root))
    if (!(await stat(contentRoot)).isDirectory())
      throw new Error('not-directory')
  } catch {
    throw new WorkspaceError(
      'INVALID_ROOT',
      'Workspace root must be an existing directory',
    )
  }

  const relativeRoot = posixPath(
    path.relative(process.cwd(), contentRoot) || '.',
  )

  async function resolve(requestedPath: string): Promise<string> {
    validatePathInput(requestedPath)
    const lexical = path.resolve(contentRoot, requestedPath)
    if (!containsPath(contentRoot, lexical)) {
      throw new WorkspaceError(
        'OUTSIDE_ROOT',
        'Path is outside the content root',
      )
    }
    let physical: string
    try {
      physical = await realpath(lexical)
    } catch {
      throw new WorkspaceError(
        'NOT_FOUND',
        `Workspace path does not exist: ${posixPath(requestedPath)}`,
      )
    }
    if (!containsPath(contentRoot, physical)) {
      throw new WorkspaceError(
        'OUTSIDE_ROOT',
        'Path is outside the content root',
      )
    }
    return physical
  }

  async function documentsWithin(
    requestedPath = '.',
  ): Promise<WorkspaceDocument[]> {
    const start = await resolve(requestedPath)
    const startStat = await stat(start)
    const files: string[] = []

    async function visit(directory: string): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (files.length >= MAX_LIST_FILES) {
          throw new WorkspaceError(
            'TOO_MANY_FILES',
            `Workspace contains more than ${MAX_LIST_FILES} documentation files`,
          )
        }
        if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
        const candidate = path.join(directory, entry.name)
        if (entry.isSymbolicLink()) {
          let physical: string
          try {
            physical = await realpath(candidate)
          } catch {
            throw new WorkspaceError(
              'INVALID_SYMLINK',
              `Workspace symlink cannot be resolved: ${posixPath(path.relative(contentRoot, candidate))}`,
            )
          }
          if (!containsPath(contentRoot, physical)) {
            throw new WorkspaceError(
              'OUTSIDE_ROOT',
              'Path is outside the content root',
            )
          }
          const physicalStat = await stat(physical)
          if (physicalStat.isFile() && entry.name.match(/\.mdx?$/i)) {
            files.push(physical)
          }
          continue
        }
        if (entry.isDirectory()) {
          await visit(candidate)
          continue
        }
        if (!entry.name.match(/\.mdx?$/i)) continue
        let physical: string
        try {
          physical = await realpath(candidate)
        } catch {
          continue
        }
        if (!containsPath(contentRoot, physical)) continue
        if ((await stat(physical)).isFile()) files.push(physical)
      }
    }

    if (startStat.isDirectory()) await visit(start)
    else if (start.match(/\.mdx?$/i)) files.push(start)
    else
      throw new WorkspaceError(
        'UNSUPPORTED_FILE',
        'Only Markdown and MDX files can be read',
      )

    return Promise.all(
      files
        .map((file) => ({
          file,
          relative: posixPath(path.relative(contentRoot, file)),
        }))
        .sort((left, right) => left.relative.localeCompare(right.relative))
        .map(async ({ file, relative }) => {
          const info = await stat(file)
          if (info.size > MAX_FILE_BYTES) {
            throw new WorkspaceError(
              'FILE_TOO_LARGE',
              `Workspace file exceeds the ${MAX_FILE_BYTES} byte limit: ${relative}`,
            )
          }
          const text = await readFile(file, 'utf8')
          return {
            id: relative,
            path: relative,
            route: routeForFile(relative),
            title: documentTitle(text, relative),
            text,
          }
        }),
    )
  }

  async function writeIndex(documents: WorkspaceDocument[]) {
    const index: SerializedWorkspaceIndex = {
      version: 1,
      fingerprint: fingerprintDocuments(documents),
      documents,
    }
    await mkdir(path.join(contentRoot, '.silen/ai'), { recursive: true })
    await writeFile(
      path.join(contentRoot, '.silen/ai/index.json'),
      `${JSON.stringify(index)}\n`,
      'utf8',
    )
    return index
  }

  const workspace: Workspace = {
    relativeRoot,
    resolve,
    async init() {
      await Promise.all([
        mkdir(path.join(contentRoot, 'wiki'), { recursive: true }),
        mkdir(path.join(contentRoot, '.silen/ai'), { recursive: true }),
      ])
      await writeFile(
        path.join(contentRoot, '.silen/ai/.gitignore'),
        '*\n!.gitignore\n',
        { encoding: 'utf8', flag: 'w' },
      )
      return { directories: ['wiki', '.silen/ai'] }
    },
    async reindex() {
      const documents = await documentsWithin()
      const index = await writeIndex(documents)
      return {
        fileCount: documents.length,
        index: '.silen/ai/index.json',
        fingerprint: index.fingerprint,
      }
    },
    guide() {
      return Promise.resolve(
        'Silen exposes a read-only documentation workspace by default. Use list or search before read; all paths are relative to the documentation root. Search indexes are deterministic and rebuildable. No model, embeddings, shell commands, or write tools are used.',
      )
    },
    async list(requestedPath = '.') {
      validatePathInput(requestedPath)
      const documents = await documentsWithin(requestedPath)
      return {
        path: posixPath(path.normalize(requestedPath)) || '.',
        files: documents.map(({ path: file, route, title }) => ({
          path: file,
          route,
          title,
        })),
      }
    },
    async read(input) {
      const options = typeof input === 'string' ? { path: input } : input
      validatePathInput(options.path)
      const range = validateReadOptions(options)
      const file = await resolve(options.path)
      if (!file.match(/\.mdx?$/i))
        throw new WorkspaceError(
          'UNSUPPORTED_FILE',
          'Only Markdown and MDX files can be read',
        )
      const info = await stat(file)
      if (!info.isFile())
        throw new WorkspaceError(
          'NOT_FILE',
          `Workspace path is not a file: ${options.path}`,
        )
      if (info.size > MAX_FILE_BYTES)
        throw new WorkspaceError(
          'FILE_TOO_LARGE',
          `Workspace file exceeds the ${MAX_FILE_BYTES} byte limit: ${options.path}`,
        )
      const text = await readFile(file, 'utf8')
      const lines = text.split('\n')
      const requestedEnd = range.endLine ?? range.startLine + MAX_READ_LINES - 1
      const endLine = Math.min(lines.length, requestedEnd)
      const relative = posixPath(path.relative(contentRoot, file))
      return {
        path: relative,
        route: routeForFile(relative),
        startLine: range.startLine,
        endLine,
        totalLines: lines.length,
        text: lines.slice(range.startLine - 1, endLine).join('\n'),
        truncated: endLine < lines.length,
      }
    },
    async search(query, limit = 10) {
      if (typeof query !== 'string' || !query.trim() || query.length > 500)
        throw new WorkspaceError(
          'INVALID_QUERY',
          'Search query must contain between 1 and 500 characters',
        )
      if (!Number.isInteger(limit) || limit < 1 || limit > 50)
        throw new WorkspaceError(
          'INVALID_LIMIT',
          'Search limit must be between 1 and 50',
        )
      const documents = await documentsWithin()
      await writeIndex(documents)
      return {
        query,
        results: createWorkspaceSearch(documents).search(query, limit),
      }
    },
    async backlinks(route) {
      if (
        typeof route !== 'string' ||
        !route.startsWith('/') ||
        route.length > MAX_PATH_LENGTH
      )
        throw new WorkspaceError(
          'INVALID_ROUTE',
          'Backlink route must start with /',
        )
      return { route, backlinks: findBacklinks(await documentsWithin(), route) }
    },
    async citations(requestedPath) {
      const documents = await documentsWithin(requestedPath ?? '.')
      return { citations: documents.flatMap(inspectCitations) }
    },
    async build() {
      try {
        const result = await buildSite(contentRoot)
        return {
          outDir: posixPath(path.relative(contentRoot, result.outDir) || '.'),
          routes: result.routes.map((route) => ({
            path: route.path,
            file: posixPath(path.relative(contentRoot, route.file)),
          })),
        }
      } catch {
        throw new WorkspaceError(
          'BUILD_FAILED',
          'Silen build failed inside the documentation workspace',
        )
      }
    },
    async audit() {
      const documents = await documentsWithin()
      const expectedFingerprint = fingerprintDocuments(documents)
      let indexFresh: boolean
      try {
        const cached = JSON.parse(
          await readFile(
            path.join(contentRoot, '.silen/ai/index.json'),
            'utf8',
          ),
        ) as Partial<SerializedWorkspaceIndex>
        indexFresh =
          cached.version === 1 && cached.fingerprint === expectedFingerprint
      } catch {
        indexFresh = false
      }
      const artifacts = new Set<string>()
      for (const artifact of ['llms.txt', 'llms-full.txt', 'ai-index.json']) {
        try {
          if (
            (
              await stat(path.join(contentRoot, '.silen/dist', artifact))
            ).isFile()
          )
            artifacts.add(artifact)
        } catch {
          // Missing artifacts are reported below.
        }
      }
      return auditDocuments(documents, { artifacts, indexFresh })
    },
  }
  return workspace
}
