import { randomBytes } from 'node:crypto'
import { constants, type Stats } from 'node:fs'
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
} from 'node:fs/promises'
import path from 'node:path'
import matter from 'gray-matter'
import {
  auditDocuments,
  findBacklinks,
  inspectCitations,
  type WorkspaceAuditIssue,
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
const MAX_CORPUS_BYTES = 32 * 1024 * 1024
const MAX_INDEX_BYTES = 64 * 1024 * 1024
const MAX_READ_LINES = 4000
const MAX_DOCUMENT_FILES = 10_000
const MAX_DIRECTORY_ENTRIES = 20_000
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0
const OPEN_READ_FLAGS = constants.O_RDONLY | NO_FOLLOW
const OPEN_WRITE_FLAGS =
  constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NO_FOLLOW
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

export interface WorkspaceBuildResult {
  outDir: '.silen/dist'
  routes: Array<{ path: string; file: string }>
  ok: boolean
  issues: WorkspaceAuditIssue[]
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
  build(): Promise<WorkspaceBuildResult>
  audit(): Promise<WorkspaceAuditResult>
}

interface PathSnapshot {
  physical: string
  stats: Stats
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

function sameIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino
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
    startLine > MAX_READ_LINES ||
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

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function unsafePath(reason = 'Workspace path changed during a safe operation') {
  return new WorkspaceError('UNSAFE_PATH', reason)
}

export async function createWorkspace(root: string): Promise<Workspace> {
  if (typeof root !== 'string' || !root || root.length > MAX_PATH_LENGTH) {
    throw new WorkspaceError(
      'INVALID_ROOT',
      'Workspace root must be an existing directory',
    )
  }

  let contentRoot: string
  let rootStats: Stats
  try {
    contentRoot = await realpath(path.resolve(root))
    rootStats = await stat(contentRoot)
    if (!rootStats.isDirectory()) throw new Error('not-directory')
  } catch {
    throw new WorkspaceError(
      'INVALID_ROOT',
      'Workspace root must be an existing directory',
    )
  }

  const relativeRoot = posixPath(
    path.relative(process.cwd(), contentRoot) || '.',
  )

  async function assertRootStable(): Promise<void> {
    try {
      const [physical, current] = await Promise.all([
        realpath(contentRoot),
        stat(contentRoot),
      ])
      if (
        physical !== contentRoot ||
        !current.isDirectory() ||
        !sameIdentity(rootStats, current)
      ) {
        throw unsafePath('Workspace root changed during a safe operation')
      }
    } catch (error) {
      if (error instanceof WorkspaceError) throw error
      throw unsafePath('Workspace root changed during a safe operation')
    }
  }

  function lexicalPath(requestedPath: string): string {
    validatePathInput(requestedPath)
    const lexical = path.resolve(contentRoot, requestedPath)
    if (!containsPath(contentRoot, lexical)) {
      throw new WorkspaceError(
        'OUTSIDE_ROOT',
        'Path is outside the content root',
      )
    }
    return lexical
  }

  async function assertNoSymlinkComponents(
    lexical: string,
    allowMissing: boolean,
  ): Promise<boolean> {
    await assertRootStable()
    const relative = path.relative(contentRoot, lexical)
    if (!containsPath(contentRoot, lexical)) {
      throw new WorkspaceError(
        'OUTSIDE_ROOT',
        'Path is outside the content root',
      )
    }
    let cursor = contentRoot
    for (const component of relative.split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, component)
      let info: Stats
      try {
        info = await lstat(cursor)
      } catch (error) {
        if (allowMissing && isMissing(error)) return false
        if (isMissing(error)) {
          throw new WorkspaceError(
            'NOT_FOUND',
            `Workspace path does not exist: ${posixPath(relative)}`,
          )
        }
        throw unsafePath()
      }
      if (info.isSymbolicLink()) {
        try {
          const physical = await realpath(cursor)
          if (!containsPath(contentRoot, physical)) {
            throw new WorkspaceError(
              'OUTSIDE_ROOT',
              'Path is outside the content root',
            )
          }
        } catch (error) {
          if (error instanceof WorkspaceError) throw error
        }
        throw unsafePath('Workspace symlinks are not allowed')
      }
    }
    return true
  }

  async function snapshotPath(lexical: string): Promise<PathSnapshot> {
    await assertNoSymlinkComponents(lexical, false)
    try {
      const beforePhysical = await realpath(lexical)
      const beforeStats = await stat(lexical)
      const afterPhysical = await realpath(lexical)
      const afterStats = await stat(lexical)
      if (
        !containsPath(contentRoot, beforePhysical) ||
        !containsPath(contentRoot, afterPhysical) ||
        beforePhysical !== afterPhysical ||
        !sameIdentity(beforeStats, afterStats)
      ) {
        throw unsafePath()
      }
      return { physical: afterPhysical, stats: afterStats }
    } catch (error) {
      if (error instanceof WorkspaceError) throw error
      throw unsafePath()
    }
  }

  function assertSameSnapshot(before: PathSnapshot, after: PathSnapshot): void {
    if (
      before.physical !== after.physical ||
      !sameIdentity(before.stats, after.stats)
    ) {
      throw unsafePath()
    }
  }

  async function secureReadText(
    lexical: string,
    relative: string,
    maximumBytes: number,
    corpus?: { bytes: number },
  ): Promise<string> {
    const before = await snapshotPath(lexical)
    if (!before.stats.isFile()) {
      throw new WorkspaceError(
        'NOT_FILE',
        `Workspace path is not a file: ${relative}`,
      )
    }
    let handle
    try {
      handle = await open(lexical, OPEN_READ_FLAGS)
      const opened = await handle.stat()
      if (!opened.isFile() || !sameIdentity(before.stats, opened)) {
        throw unsafePath()
      }
      if (opened.size > maximumBytes) {
        throw new WorkspaceError(
          'FILE_TOO_LARGE',
          `Workspace file exceeds the ${maximumBytes} byte limit: ${relative}`,
        )
      }
      if (corpus && corpus.bytes + opened.size > MAX_CORPUS_BYTES) {
        throw new WorkspaceError(
          'CORPUS_TOO_LARGE',
          `Workspace corpus exceeds the ${MAX_CORPUS_BYTES} byte limit`,
        )
      }
      const afterOpen = await snapshotPath(lexical)
      assertSameSnapshot(before, afterOpen)
      if (!sameIdentity(opened, afterOpen.stats)) throw unsafePath()
      const text = await handle.readFile({ encoding: 'utf8' })
      const afterReadHandle = await handle.stat()
      const afterReadPath = await snapshotPath(lexical)
      if (
        !sameIdentity(opened, afterReadHandle) ||
        !sameIdentity(opened, afterReadPath.stats)
      ) {
        throw unsafePath()
      }
      if (corpus) corpus.bytes += opened.size
      return text
    } catch (error) {
      if (error instanceof WorkspaceError) throw error
      throw unsafePath()
    } finally {
      await handle?.close().catch(() => undefined)
    }
  }

  async function resolve(requestedPath: string): Promise<string> {
    const lexical = lexicalPath(requestedPath)
    return (await snapshotPath(lexical)).physical
  }

  async function documentsWithin(
    requestedPath = '.',
  ): Promise<WorkspaceDocument[]> {
    const start = lexicalPath(requestedPath)
    const startSnapshot = await snapshotPath(start)
    const files: Array<{ lexical: string; relative: string }> = []
    let entriesVisited = 0

    async function visit(directory: string): Promise<void> {
      const before = await snapshotPath(directory)
      if (!before.stats.isDirectory()) throw unsafePath()
      let entries
      try {
        entries = await readdir(directory, { withFileTypes: true })
      } catch {
        throw unsafePath()
      }
      entriesVisited += entries.length
      if (entriesVisited > MAX_DIRECTORY_ENTRIES) {
        throw new WorkspaceError(
          'TOO_MANY_ENTRIES',
          `Workspace contains more than ${MAX_DIRECTORY_ENTRIES} directory entries`,
        )
      }
      const afterRead = await snapshotPath(directory)
      assertSameSnapshot(before, afterRead)

      for (const entry of entries) {
        const candidate = path.join(directory, entry.name)
        let entryStats: Stats
        try {
          entryStats = await lstat(candidate)
        } catch {
          throw unsafePath()
        }
        if (entryStats.isSymbolicLink()) {
          try {
            const physical = await realpath(candidate)
            if (!containsPath(contentRoot, physical)) {
              throw new WorkspaceError(
                'OUTSIDE_ROOT',
                'Path is outside the content root',
              )
            }
          } catch (error) {
            if (error instanceof WorkspaceError) throw error
          }
          throw unsafePath('Workspace symlinks are not allowed')
        }
        if (entryStats.isDirectory()) {
          if (!ignoredDirectories.has(entry.name)) await visit(candidate)
          continue
        }
        if (!entryStats.isFile() || !/\.mdx?$/i.test(entry.name)) continue
        files.push({
          lexical: candidate,
          relative: posixPath(path.relative(contentRoot, candidate)),
        })
        if (files.length > MAX_DOCUMENT_FILES) {
          throw new WorkspaceError(
            'TOO_MANY_FILES',
            `Workspace contains more than ${MAX_DOCUMENT_FILES} documentation files`,
          )
        }
      }
      const afterVisit = await snapshotPath(directory)
      assertSameSnapshot(before, afterVisit)
    }

    if (startSnapshot.stats.isDirectory()) {
      await visit(start)
    } else if (startSnapshot.stats.isFile() && /\.mdx?$/i.test(start)) {
      files.push({
        lexical: start,
        relative: posixPath(path.relative(contentRoot, start)),
      })
    } else {
      throw new WorkspaceError(
        'UNSUPPORTED_FILE',
        'Only Markdown and MDX files can be read',
      )
    }

    files.sort((left, right) => left.relative.localeCompare(right.relative))
    const corpus = { bytes: 0 }
    const documents: WorkspaceDocument[] = []
    for (const file of files) {
      const text = await secureReadText(
        file.lexical,
        file.relative,
        MAX_FILE_BYTES,
        corpus,
      )
      documents.push({
        id: file.relative,
        path: file.relative,
        route: routeForFile(file.relative),
        title: documentTitle(text, file.relative),
        text,
      })
    }
    return documents
  }

  async function safeEnsureDirectory(requestedPath: string): Promise<string> {
    const lexical = lexicalPath(requestedPath)
    const parent = path.dirname(lexical)
    const parentSnapshot = await snapshotPath(parent)
    if (!parentSnapshot.stats.isDirectory()) throw unsafePath()
    const exists = await assertNoSymlinkComponents(lexical, true)
    if (!exists) {
      try {
        await mkdir(lexical)
      } catch (error) {
        if (!(
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code?: unknown }).code === 'EEXIST'
        )) {
          throw unsafePath('Unable to create a safe workspace directory')
        }
      }
    }
    const afterParent = await snapshotPath(parent)
    assertSameSnapshot(parentSnapshot, afterParent)
    const created = await snapshotPath(lexical)
    if (!created.stats.isDirectory()) {
      throw unsafePath('Safe workspace directory path is not a directory')
    }
    return lexical
  }

  async function safeAtomicWrite(
    requestedPath: string,
    content: string,
  ): Promise<void> {
    const target = lexicalPath(requestedPath)
    const parent = path.dirname(target)
    const parentBefore = await snapshotPath(parent)
    if (!parentBefore.stats.isDirectory()) throw unsafePath()

    const targetExists = await assertNoSymlinkComponents(target, true)
    if (targetExists) {
      const existing = await snapshotPath(target)
      if (!existing.stats.isFile()) {
        throw unsafePath('Safe workspace output path is not a file')
      }
    }

    const temporary = path.join(
      parent,
      `.${path.basename(target)}.${randomBytes(16).toString('hex')}.tmp`,
    )
    let handle
    let temporaryStats: Stats | undefined
    try {
      handle = await open(temporary, OPEN_WRITE_FLAGS, 0o600)
      temporaryStats = await handle.stat()
      await handle.writeFile(content, { encoding: 'utf8' })
      await handle.sync()
      await handle.close()
      handle = undefined

      const parentAfter = await snapshotPath(parent)
      assertSameSnapshot(parentBefore, parentAfter)
      const targetStillExists = await assertNoSymlinkComponents(target, true)
      if (targetStillExists) {
        const currentTarget = await snapshotPath(target)
        if (!currentTarget.stats.isFile()) {
          throw unsafePath('Safe workspace output path is not a file')
        }
      }
      const temporarySnapshot = await snapshotPath(temporary)
      if (
        !temporaryStats ||
        !temporarySnapshot.stats.isFile() ||
        !sameIdentity(temporaryStats, temporarySnapshot.stats)
      ) {
        throw unsafePath()
      }
      const parentImmediatelyBeforeRename = await snapshotPath(parent)
      assertSameSnapshot(parentBefore, parentImmediatelyBeforeRename)
      await rename(temporary, target)
      const written = await snapshotPath(target)
      if (!sameIdentity(temporaryStats, written.stats)) throw unsafePath()
    } catch (error) {
      if (error instanceof WorkspaceError) throw error
      throw unsafePath('Unable to write a safe workspace cache file')
    } finally {
      await handle?.close().catch(() => undefined)
      await unlink(temporary).catch(() => undefined)
    }
  }

  async function writeIndex(documents: WorkspaceDocument[]) {
    const index: SerializedWorkspaceIndex = {
      version: 1,
      fingerprint: fingerprintDocuments(documents),
      documents,
    }
    await safeEnsureDirectory('.silen')
    await safeEnsureDirectory('.silen/ai')
    await safeAtomicWrite('.silen/ai/index.json', `${JSON.stringify(index)}\n`)
    return index
  }

  async function readOptionalFile(
    requestedPath: string,
    maximumBytes: number,
  ): Promise<string | undefined> {
    const lexical = lexicalPath(requestedPath)
    const exists = await assertNoSymlinkComponents(lexical, true)
    if (!exists) return undefined
    return secureReadText(lexical, requestedPath, maximumBytes)
  }

  async function existingFile(requestedPath: string): Promise<boolean> {
    const lexical = lexicalPath(requestedPath)
    const exists = await assertNoSymlinkComponents(lexical, true)
    if (!exists) return false
    const snapshot = await snapshotPath(lexical)
    if (!snapshot.stats.isFile()) return false
    let handle
    try {
      handle = await open(lexical, OPEN_READ_FLAGS)
      const opened = await handle.stat()
      const after = await snapshotPath(lexical)
      if (
        !opened.isFile() ||
        !sameIdentity(snapshot.stats, opened) ||
        !sameIdentity(opened, after.stats)
      ) {
        throw unsafePath()
      }
      return true
    } catch (error) {
      if (error instanceof WorkspaceError) throw error
      throw unsafePath()
    } finally {
      await handle?.close().catch(() => undefined)
    }
  }

  async function inspectWorkspace(
    documents: WorkspaceDocument[],
  ): Promise<WorkspaceAuditResult> {
    const expectedFingerprint = fingerprintDocuments(documents)
    let indexFresh = false
    const cachedText = await readOptionalFile(
      '.silen/ai/index.json',
      MAX_INDEX_BYTES,
    )
    if (cachedText !== undefined) {
      try {
        const cached = JSON.parse(
          cachedText,
        ) as Partial<SerializedWorkspaceIndex>
        indexFresh =
          cached.version === 1 && cached.fingerprint === expectedFingerprint
      } catch {
        indexFresh = false
      }
    }

    const artifacts = new Set<string>()
    for (const artifact of ['llms.txt', 'llms-full.txt', 'ai-index.json']) {
      if (await existingFile(`.silen/dist/${artifact}`)) {
        artifacts.add(artifact)
      }
    }
    return auditDocuments(documents, { artifacts, indexFresh })
  }

  const workspace: Workspace = {
    relativeRoot,
    resolve,
    async init() {
      await safeEnsureDirectory('.silen')
      await safeEnsureDirectory('.silen/ai')
      await safeEnsureDirectory('wiki')
      await safeAtomicWrite('.silen/ai/.gitignore', '*\n!.gitignore\n')
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
        'Silen exposes a read-only documentation workspace by default. Use list or search before read; all paths are relative to the documentation root. Search runs purely in memory. The build tool performs a read-only preflight and never executes workspace code. No model, embeddings, shell commands, or write tools are used.',
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
      const lexical = lexicalPath(options.path)
      await snapshotPath(lexical)
      if (!/\.mdx?$/i.test(options.path)) {
        throw new WorkspaceError(
          'UNSUPPORTED_FILE',
          'Only Markdown and MDX files can be read',
        )
      }
      const text = await secureReadText(
        lexical,
        posixPath(options.path),
        MAX_FILE_BYTES,
      )
      const lines = text.split('\n')
      const requestedEnd = range.endLine ?? range.startLine + MAX_READ_LINES - 1
      const endLine = Math.min(lines.length, requestedEnd)
      const relative = posixPath(path.relative(contentRoot, lexical))
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
      if (typeof query !== 'string' || !query.trim() || query.length > 500) {
        throw new WorkspaceError(
          'INVALID_QUERY',
          'Search query must contain between 1 and 500 characters',
        )
      }
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        throw new WorkspaceError(
          'INVALID_LIMIT',
          'Search limit must be between 1 and 50',
        )
      }
      const documents = await documentsWithin()
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
      ) {
        throw new WorkspaceError(
          'INVALID_ROUTE',
          'Backlink route must start with /',
        )
      }
      return { route, backlinks: findBacklinks(await documentsWithin(), route) }
    },
    async citations(requestedPath) {
      const documents = await documentsWithin(requestedPath ?? '.')
      return { citations: documents.flatMap(inspectCitations) }
    },
    async build() {
      const documents = await documentsWithin()
      const result = await inspectWorkspace(documents)
      return {
        outDir: '.silen/dist',
        routes: documents.map((document) => ({
          path: document.route,
          file: document.path,
        })),
        ok: result.ok,
        issues: result.issues,
      }
    },
    async audit() {
      const documents = await documentsWithin()
      return inspectWorkspace(documents)
    },
  }
  return workspace
}
