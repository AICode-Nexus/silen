import { randomBytes } from 'node:crypto'
import { constants, type Stats } from 'node:fs'
import {
  lstat,
  link,
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
  auditAgentContract,
  auditDocuments,
  findBacklinks,
  inspectCitations,
  readBuiltSiteBase,
  type AgentContractAuditInput,
  type WorkspaceAuditIssue,
  type WorkspaceAuditNotice,
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
const workspaceOperationLocks = new Map<string, Promise<void>>()

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
  notices: WorkspaceAuditNotice[]
}

export interface WorkspaceOptions {
  readonly resolveAuditBase?: () => Promise<string>
}

export interface WorkspaceWriteInput {
  path: string
  content: string
}

export interface WorkspaceLinkInput {
  path: string
  target: string
  label: string
}

export interface WorkspaceMutationResult {
  path: string
  created: boolean
  bytesBefore: number
  bytesAfter: number
  diff: string
  index: { fileCount: number; index: string; fingerprint: string }
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
  write(input: WorkspaceWriteInput): Promise<WorkspaceMutationResult>
  link(input: WorkspaceLinkInput): Promise<WorkspaceMutationResult>
  append(input: WorkspaceWriteInput): Promise<WorkspaceMutationResult>
  build(): Promise<WorkspaceBuildResult>
  audit(): Promise<WorkspaceAuditResult>
}

interface PathSnapshot {
  physical: string
  stats: Stats
}

interface MutationState {
  before: string
  created: boolean
  target?: PathSnapshot
}

interface StagedFile {
  target: string
  parent: PathSnapshot
  before?: PathSnapshot
  temporary: string
  temporaryStats: Stats
  backup?: string
  installed: boolean
  originalRemoved: boolean
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

function sameIdentityAndMode(left: Stats, right: Stats): boolean {
  return sameIdentity(left, right) && left.mode === right.mode
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

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0)!
    return code <= 0x1f || code === 0x7f
  })
}

function normalizedPathSegment(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US')
}

function isIgnoredDirectory(value: string): boolean {
  return ignoredDirectories.has(normalizedPathSegment(value))
}

function normalizeMutationPath(value: string): string {
  validatePathInput(value)
  const components = value.split('/')
  if (
    components.some(
      (component) =>
        !component ||
        component === '.' ||
        component === '..' ||
        containsControlCharacter(component),
    )
  ) {
    throw new WorkspaceError('OUTSIDE_ROOT', 'Path is outside the content root')
  }
  if (!/\.mdx?$/i.test(value)) {
    throw new WorkspaceError(
      'UNSUPPORTED_FILE',
      'Only Markdown and MDX files can be changed',
    )
  }
  if (components.some(isIgnoredDirectory)) {
    throw new WorkspaceError(
      'UNSUPPORTED_FILE',
      'Only indexed Markdown and MDX files can be changed',
    )
  }
  return components.join('/')
}

function normalizeMutationContent(value: string): string {
  if (typeof value !== 'string') {
    throw new WorkspaceError('INVALID_CONTENT', 'Content must be UTF-8 text')
  }
  const normalized = value.replace(/\r\n?/g, '\n')
  const encoded = Buffer.from(normalized, 'utf8')
  if (encoded.toString('utf8') !== normalized) {
    throw new WorkspaceError('INVALID_CONTENT', 'Content must be UTF-8 text')
  }
  if (encoded.byteLength > MAX_FILE_BYTES) {
    throw new WorkspaceError(
      'FILE_TOO_LARGE',
      'Workspace file exceeds the 2 MiB byte limit',
    )
  }
  return normalized
}

function validateMutationDocument(value: string): void {
  try {
    matter(value)
  } catch {
    throw new WorkspaceError(
      'INVALID_CONTENT',
      'Markdown frontmatter could not be parsed',
    )
  }
}

function appendWithSeparator(existing: string, addition: string): string {
  const left = existing.replace(/\n+$/g, '')
  const right = addition.replace(/^\n+/g, '')
  if (!right) {
    throw new WorkspaceError(
      'INVALID_CONTENT',
      'Appended content must not be empty',
    )
  }
  return left ? `${left}\n${right}` : right
}

function escapeLinkLabel(label: string): string {
  if (
    typeof label !== 'string' ||
    !label ||
    label.length > 500 ||
    containsControlCharacter(label)
  ) {
    throw new WorkspaceError(
      'INVALID_LINK_LABEL',
      'Link label must contain between 1 and 500 safe characters',
    )
  }
  return label
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
}

function splitDiffLines(value: string): string[] {
  if (!value) return []
  const lines = value.split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines
}

function boundedDiffLine(prefix: '-' | '+', value: string): string {
  const maximumCharacters = 240
  const safe =
    value.length > maximumCharacters
      ? `${value.slice(0, maximumCharacters)}…`
      : value
  return `${prefix}${safe}`
}

function unifiedDiffSummary(
  relative: string,
  before: string,
  after: string,
): string {
  const beforeLines = splitDiffLines(before)
  const afterLines = splitDiffLines(after)
  let prefix = 0
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1
  }
  let suffix = 0
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - suffix - 1] ===
      afterLines[afterLines.length - suffix - 1]
  ) {
    suffix += 1
  }
  const removed = beforeLines.slice(prefix, beforeLines.length - suffix)
  const added = afterLines.slice(prefix, afterLines.length - suffix)
  const maximumLinesPerSide = 24
  const body = [
    ...removed
      .slice(0, maximumLinesPerSide)
      .map((line) => boundedDiffLine('-', line)),
    ...(removed.length > maximumLinesPerSide
      ? [`-… ${removed.length - maximumLinesPerSide} more lines omitted`]
      : []),
    ...added
      .slice(0, maximumLinesPerSide)
      .map((line) => boundedDiffLine('+', line)),
    ...(added.length > maximumLinesPerSide
      ? [`+… ${added.length - maximumLinesPerSide} more lines omitted`]
      : []),
  ]
  const oldStart = beforeLines.length === 0 ? 0 : prefix + 1
  const newStart = afterLines.length === 0 ? 0 : prefix + 1
  return [
    `--- a/${relative}`,
    `+++ b/${relative}`,
    `@@ -${oldStart},${removed.length} +${newStart},${added.length} @@`,
    ...body,
  ].join('\n')
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

async function withNamedLock<T>(
  locks: Map<string, Promise<void>>,
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve()
  let release: () => void = () => undefined
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  locks.set(key, current)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (locks.get(key) === current) locks.delete(key)
  }
}

export async function createWorkspace(
  root: string,
  options: WorkspaceOptions = {},
): Promise<Workspace> {
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

  async function withWorkspaceOperationLock<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    return withNamedLock(workspaceOperationLocks, contentRoot, operation)
  }

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
    validatePathInput(requestedPath)
    if (requestedPath.split('/').some(isIgnoredDirectory)) {
      throw new WorkspaceError(
        'UNSUPPORTED_FILE',
        'Only indexed Markdown and MDX files can be read',
      )
    }
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
          if (!isIgnoredDirectory(entry.name)) await visit(candidate)
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

  async function stageAtomicWrite(
    requestedPath: string,
    content: string,
    expected?: PathSnapshot,
  ): Promise<StagedFile> {
    const target = lexicalPath(requestedPath)
    const parentBefore = await snapshotPath(path.dirname(target))
    if (!parentBefore.stats.isDirectory()) throw unsafePath()
    const physicalTarget = path.join(
      parentBefore.physical,
      path.basename(target),
    )

    const targetExists = await assertNoSymlinkComponents(target, true)
    let targetBefore: PathSnapshot | undefined
    if (targetExists) {
      targetBefore = await snapshotPath(target)
      if (!targetBefore.stats.isFile()) {
        throw unsafePath('Safe workspace output path is not a file')
      }
    }
    if (
      (expected &&
        (!targetBefore ||
          expected.physical !== targetBefore.physical ||
          !sameIdentity(expected.stats, targetBefore.stats))) ||
      (!expected && targetBefore)
    ) {
      throw unsafePath()
    }

    const temporary = path.join(
      parentBefore.physical,
      `.${path.basename(target)}.${randomBytes(16).toString('hex')}.tmp`,
    )
    const backup = targetBefore
      ? path.join(
          parentBefore.physical,
          `.${path.basename(target)}.${randomBytes(16).toString('hex')}.backup`,
        )
      : undefined
    let handle
    let temporaryStats: Stats | undefined
    let keepStagedFiles = false
    try {
      const mode = targetBefore ? targetBefore.stats.mode & 0o7777 : 0o600
      handle = await open(temporary, OPEN_WRITE_FLAGS, mode)
      temporaryStats = await handle.stat()
      await handle.chmod(mode)
      await handle.writeFile(content, { encoding: 'utf8' })
      await handle.sync()
      await handle.close()
      handle = undefined

      const parentAfter = await snapshotPath(parentBefore.physical)
      assertSameSnapshot(parentBefore, parentAfter)
      const targetStillExists = await assertNoSymlinkComponents(target, true)
      if (targetBefore) {
        if (!targetStillExists) throw unsafePath()
        const currentTarget = await snapshotPath(target)
        if (!currentTarget.stats.isFile()) {
          throw unsafePath('Safe workspace output path is not a file')
        }
        assertSameSnapshot(targetBefore, currentTarget)
      } else if (targetStillExists) {
        throw unsafePath()
      }
      const temporarySnapshot = await snapshotPath(temporary)
      if (
        !temporaryStats ||
        !temporarySnapshot.stats.isFile() ||
        !sameIdentity(temporaryStats, temporarySnapshot.stats)
      ) {
        throw unsafePath()
      }
      if (targetBefore && backup) {
        await link(physicalTarget, backup)
        const [backupSnapshot, targetAfterBackup] = await Promise.all([
          snapshotPath(backup),
          snapshotPath(target),
        ])
        if (
          !sameIdentity(targetBefore.stats, backupSnapshot.stats) ||
          !sameIdentity(targetBefore.stats, targetAfterBackup.stats)
        ) {
          throw unsafePath()
        }
      }
      const parentAfterStage = await snapshotPath(parentBefore.physical)
      assertSameSnapshot(parentBefore, parentAfterStage)
      keepStagedFiles = true
      return {
        target: targetBefore?.physical ?? physicalTarget,
        parent: parentBefore,
        ...(targetBefore ? { before: targetBefore } : {}),
        temporary,
        temporaryStats,
        ...(backup ? { backup } : {}),
        installed: false,
        originalRemoved: false,
      }
    } catch (error) {
      if (error instanceof WorkspaceError) throw error
      throw unsafePath('Unable to stage a safe workspace file')
    } finally {
      await handle?.close().catch(() => undefined)
      if (!keepStagedFiles) {
        await unlink(temporary).catch(() => undefined)
        if (backup) await unlink(backup).catch(() => undefined)
      }
    }
  }

  async function currentSnapshot(
    target: string,
  ): Promise<PathSnapshot | undefined> {
    const exists = await assertNoSymlinkComponents(target, true)
    return exists ? snapshotPath(target) : undefined
  }

  async function commitStagedFile(staged: StagedFile): Promise<void> {
    try {
      const [parentImmediatelyBeforeCommit, current] = await Promise.all([
        snapshotPath(staged.parent.physical),
        currentSnapshot(staged.target),
      ])
      assertSameSnapshot(staged.parent, parentImmediatelyBeforeCommit)
      if (staged.before) {
        if (
          !current ||
          current.physical !== staged.before.physical ||
          !sameIdentityAndMode(current.stats, staged.before.stats)
        ) {
          throw unsafePath()
        }
        await rename(staged.temporary, staged.target)
        staged.originalRemoved = true
        staged.installed = true
      } else {
        if (current) throw unsafePath()
        await link(staged.temporary, staged.target)
        staged.installed = true
      }
      const installed = await snapshotPath(staged.target)
      if (!sameIdentity(staged.temporaryStats, installed.stats)) {
        throw unsafePath()
      }
      assertSameSnapshot(
        staged.parent,
        await snapshotPath(staged.parent.physical),
      )
    } catch (error) {
      if (error instanceof WorkspaceError) throw error
      throw unsafePath('Unable to commit a safe workspace file')
    }
  }

  async function rollbackStagedFile(staged: StagedFile): Promise<void> {
    try {
      let current = await currentSnapshot(staged.target)
      if (
        staged.installed &&
        current &&
        sameIdentity(current.stats, staged.temporaryStats)
      ) {
        if (staged.before && staged.backup) {
          await rename(staged.backup, staged.target)
          current = await snapshotPath(staged.target)
          if (!sameIdentityAndMode(current.stats, staged.before.stats)) {
            throw unsafePath('Unable to roll back a changed workspace target')
          }
          staged.originalRemoved = false
        } else {
          await unlink(staged.target)
          current = undefined
        }
        staged.installed = false
      }
      if (staged.before && staged.backup) {
        if (!current) {
          await link(staged.backup, staged.target)
          staged.originalRemoved = false
          current = await snapshotPath(staged.target)
        }
        if (!sameIdentity(current.stats, staged.before.stats)) {
          throw unsafePath('Unable to roll back a changed workspace target')
        }
      } else if (!staged.before && current) {
        throw unsafePath('Unable to roll back a changed workspace target')
      }
      assertSameSnapshot(
        staged.parent,
        await snapshotPath(staged.parent.physical),
      )
    } catch (error) {
      if (error instanceof WorkspaceError) throw error
      throw unsafePath('Unable to roll back a safe workspace file')
    }
  }

  async function cleanupStagedFile(staged: StagedFile): Promise<void> {
    await unlink(staged.temporary).catch(() => undefined)
    if (staged.backup) await unlink(staged.backup).catch(() => undefined)
  }

  async function safeAtomicWrite(
    requestedPath: string,
    content: string,
  ): Promise<void> {
    const target = lexicalPath(requestedPath)
    const exists = await assertNoSymlinkComponents(target, true)
    const expected = exists ? await snapshotPath(target) : undefined
    let staged: StagedFile | undefined
    try {
      staged = await stageAtomicWrite(requestedPath, content, expected)
      await commitStagedFile(staged)
    } catch (error) {
      if (staged) await rollbackStagedFile(staged)
      throw error
    } finally {
      if (staged) await cleanupStagedFile(staged)
    }
  }

  function serializeIndex(documents: WorkspaceDocument[]): {
    index: SerializedWorkspaceIndex
    text: string
  } {
    const index: SerializedWorkspaceIndex = {
      version: 1,
      fingerprint: fingerprintDocuments(documents),
      documents,
    }
    return { index, text: `${JSON.stringify(index)}\n` }
  }

  async function writeIndex(documents: WorkspaceDocument[]) {
    const serialized = serializeIndex(documents)
    await safeEnsureDirectory('.silen')
    await safeEnsureDirectory('.silen/ai')
    await safeAtomicWrite('.silen/ai/index.json', serialized.text)
    return serialized.index
  }

  async function refreshIndexUnlocked() {
    const documents = await documentsWithin()
    const index = await writeIndex(documents)
    return {
      fileCount: documents.length,
      index: '.silen/ai/index.json' as const,
      fingerprint: index.fingerprint,
    }
  }

  async function refreshIndex() {
    return withWorkspaceOperationLock(refreshIndexUnlocked)
  }

  async function prepareMutationIndex(
    relative: string,
    after: string,
    targetBefore?: PathSnapshot,
  ): Promise<{
    documents: WorkspaceDocument[]
    index: SerializedWorkspaceIndex
    text: string
  }> {
    const documents = await documentsWithin()
    const parent = await snapshotPath(path.dirname(lexicalPath(relative)))
    const finalRelative = posixPath(
      path.relative(
        contentRoot,
        targetBefore?.physical ??
          path.join(parent.physical, path.basename(relative)),
      ),
    )
    const pathKey = (value: string) =>
      process.platform === 'win32' || process.platform === 'darwin'
        ? value.normalize('NFKC').toLocaleLowerCase('en-US')
        : value
    const finalKey = pathKey(finalRelative)
    const withoutTarget = documents.filter(
      (document) => pathKey(document.path) !== finalKey,
    )
    withoutTarget.push({
      id: finalRelative,
      path: finalRelative,
      route: routeForFile(finalRelative),
      title: documentTitle(after, finalRelative),
      text: after,
    })
    withoutTarget.sort((left, right) => left.path.localeCompare(right.path))
    await safeEnsureDirectory('.silen')
    await safeEnsureDirectory('.silen/ai')
    return { documents: withoutTarget, ...serializeIndex(withoutTarget) }
  }

  async function readMutationState(
    relative: string,
    requireExisting: boolean,
  ): Promise<MutationState> {
    const target = lexicalPath(relative)
    const parent = await snapshotPath(path.dirname(target))
    if (!parent.stats.isDirectory()) {
      throw unsafePath('Workspace mutation parent is not a directory')
    }
    const exists = await assertNoSymlinkComponents(target, true)
    if (!exists) {
      if (requireExisting) {
        throw new WorkspaceError(
          'NOT_FOUND',
          `Workspace path does not exist: ${relative}`,
        )
      }
      return { before: '', created: true }
    }
    const targetBefore = await snapshotPath(target)
    const before = await secureReadText(target, relative, MAX_FILE_BYTES)
    assertSameSnapshot(targetBefore, await snapshotPath(target))
    return {
      before,
      created: false,
      target: targetBefore,
    }
  }

  async function assertLinkTarget(relative: string): Promise<void> {
    const target = lexicalPath(relative)
    await secureReadText(target, relative, MAX_FILE_BYTES)
  }

  async function mutate(
    relative: string,
    requireExisting: boolean,
    transform: (before: string) => string | Promise<string>,
  ): Promise<WorkspaceMutationResult> {
    return withWorkspaceOperationLock(async () => {
      const state = await readMutationState(relative, requireExisting)
      const { before, created } = state
      const after = normalizeMutationContent(await transform(before))
      validateMutationDocument(after)
      const prepared = await prepareMutationIndex(relative, after, state.target)
      const indexTarget = lexicalPath('.silen/ai/index.json')
      const indexExists = await assertNoSymlinkComponents(indexTarget, true)
      const indexBefore = indexExists
        ? await snapshotPath(indexTarget)
        : undefined
      let stagedIndex: StagedFile | undefined
      let stagedContent: StagedFile | undefined
      let failure: unknown
      try {
        stagedIndex = await stageAtomicWrite(
          '.silen/ai/index.json',
          prepared.text,
          indexBefore,
        )
        stagedContent = await stageAtomicWrite(relative, after, state.target)
        await commitStagedFile(stagedContent)
        await commitStagedFile(stagedIndex)
      } catch (error) {
        failure = error
        for (const staged of [stagedIndex, stagedContent]) {
          if (!staged) continue
          try {
            await rollbackStagedFile(staged)
          } catch (rollbackError) {
            failure = rollbackError
          }
        }
      } finally {
        if (stagedContent) await cleanupStagedFile(stagedContent)
        if (stagedIndex) await cleanupStagedFile(stagedIndex)
      }
      if (failure) {
        if (failure instanceof Error) throw failure
        throw unsafePath('Workspace mutation failed')
      }
      const index = {
        fileCount: prepared.documents.length,
        index: '.silen/ai/index.json' as const,
        fingerprint: prepared.index.fingerprint,
      }
      return {
        path: relative,
        created,
        bytesBefore: Buffer.byteLength(before, 'utf8'),
        bytesAfter: Buffer.byteLength(after, 'utf8'),
        diff: unifiedDiffSummary(relative, before, after),
        index,
      }
    })
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
    const llmsTxt = await readOptionalFile(
      '.silen/dist/llms.txt',
      MAX_FILE_BYTES,
    )
    const auditInput: AgentContractAuditInput = {
      ...(llmsTxt === undefined ? {} : { llmsTxt }),
      read(relativeOutputPath) {
        return readOptionalFile(relativeOutputPath, MAX_FILE_BYTES)
      },
    }
    const [contractIssues, builtBase] = await Promise.all([
      auditAgentContract(auditInput),
      readBuiltSiteBase(auditInput),
    ])
    const base = builtBase ?? (await options.resolveAuditBase?.())
    return auditDocuments(documents, {
      artifacts,
      indexFresh,
      contractIssues,
      ...(base === undefined ? {} : { base }),
    })
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
      return refreshIndex()
    },
    guide() {
      return Promise.resolve(
        'Silen exposes a read-only documentation workspace by default. Discover a built site through llms.txt and .well-known/silen/manifest.json, then use list or search before read; all paths are relative to the documentation root. Search runs purely in memory. The build tool performs a read-only preflight and never executes workspace config or MDX. Write tools appear only after explicit --allow-write authorization. After authorized changes, run audit and build, inspect the Git diff, and stop before commit or deployment unless separately authorized. No model, embeddings, or shell commands are used.',
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
    async write({ path: requestedPath, content }) {
      const relative = normalizeMutationPath(requestedPath)
      const normalized = normalizeMutationContent(content)
      return mutate(relative, false, () => normalized)
    },
    async link({ path: requestedPath, target, label }) {
      const relative = normalizeMutationPath(requestedPath)
      const relativeTarget = normalizeMutationPath(target)
      const escapedLabel = escapeLinkLabel(label)
      return mutate(relative, true, async (before) => {
        await assertLinkTarget(relativeTarget)
        const destination = path.posix
          .relative(path.posix.dirname(relative), relativeTarget)
          .split('/')
          .map((component) => encodeURIComponent(component))
          .join('/')
        return appendWithSeparator(before, `[${escapedLabel}](${destination})`)
      })
    },
    async append({ path: requestedPath, content }) {
      const relative = normalizeMutationPath(requestedPath)
      const normalized = normalizeMutationContent(content)
      return mutate(relative, true, (before) =>
        appendWithSeparator(before, normalized),
      )
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
        notices: result.notices,
      }
    },
    async audit() {
      const documents = await documentsWithin()
      return inspectWorkspace(documents)
    },
  }
  return workspace
}
