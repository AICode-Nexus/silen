import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import matter from 'gray-matter'
import { z } from 'zod'

export const MAX_TASK_BYTES = 256 * 1024
const MAX_GUIDE_BYTES = 512 * 1024

export const BUILT_IN_TASK_REFERENCES = new Set([
  'artifact:ai-index',
  'artifact:llms',
  'artifact:llms-full',
  'artifact:markdown-routes',
  'artifact:silen-manifest',
  'cli:ai',
  'cli:build',
  'cli:dev',
  'cli:mcp',
  'cli:preview',
  'config:ai',
  'config:base',
  'config:description',
  'config:lang',
  'config:title',
  'mcp:append',
  'mcp:backlinks',
  'mcp:build',
  'mcp:citations',
  'mcp:guide',
  'mcp:link',
  'mcp:list',
  'mcp:read',
  'mcp:search',
  'mcp:write',
])

interface TaskFrontmatterBase {
  id: string
  title: string
  contractVersion: 1
  mode: 'read' | 'write'
  references: string[]
}

export interface ReadTaskFrontmatter extends TaskFrontmatterBase {
  mode: 'read'
  requiresExplicitAuthorization?: false
}

export interface WriteTaskFrontmatter extends TaskFrontmatterBase {
  mode: 'write'
  requiresExplicitAuthorization: true
}

export type TaskFrontmatter = ReadTaskFrontmatter | WriteTaskFrontmatter

export interface ParsedTaskDocument {
  path: string
  metadata: TaskFrontmatter
  markdown: string
}

export interface TaskPack {
  locale: string
  guide: string
  tasks: ParsedTaskDocument[]
}

export class TaskContractError extends Error {
  readonly code: string
  readonly path: string

  constructor(code: string, relativePath: string, message: string) {
    super(relativePath + ': ' + message)
    this.name = 'TaskContractError'
    this.code = code
    this.path = relativePath
  }
}

const identifierSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)

const referenceSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(/^[a-z][a-z0-9-]*:[A-Za-z0-9._-]+$/)

const taskBase = {
  id: identifierSchema,
  title: z.string().min(1).max(500),
  contractVersion: z.literal(1),
  references: z.array(referenceSchema).default([]),
}

const taskFrontmatterSchema = z.discriminatedUnion('mode', [
  z
    .object({
      ...taskBase,
      mode: z.literal('read'),
      requiresExplicitAuthorization: z.literal(false).optional(),
    })
    .strict(),
  z
    .object({
      ...taskBase,
      mode: z.literal('write'),
      requiresExplicitAuthorization: z.literal(true),
    })
    .strict(),
])

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function normalizeMarkdown(value: string): string {
  return value.replace(/\r\n?/g, '\n').trimEnd() + '\n'
}

function safeTaskPath(relativePath: string): string {
  const normalized = relativePath.replaceAll('\\', '/')
  if (
    !normalized.endsWith('.md') ||
    path.posix.isAbsolute(normalized) ||
    normalized.split('/').includes('..') ||
    normalized.includes('\0')
  ) {
    throw new TaskContractError(
      'INVALID_TASK_PATH',
      relativePath,
      'Agent tasks must use a workspace-relative .md path',
    )
  }
  return normalized
}

function executableMarkdown(markdown: string): boolean {
  let fenced = false
  for (const line of markdown.split('\n')) {
    if (/^\s*(?:`{3,}|~{3,})/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    if (/^\s*(?:import|export)\s/.test(line)) return true
    if (/<\/?[A-Z][A-Za-z0-9.]*(?:\s|\/?>)/.test(line)) return true
  }
  return false
}

export function parseTaskDocument(
  source: string,
  relativePath: string,
  knownReferences: ReadonlySet<string>,
): ParsedTaskDocument {
  const safePath = safeTaskPath(relativePath)
  if (byteLength(source) > MAX_TASK_BYTES) {
    throw new TaskContractError(
      'TASK_SIZE_LIMIT',
      safePath,
      'Agent task exceeds the ' + MAX_TASK_BYTES + ' byte size limit',
    )
  }

  const normalized = normalizeMarkdown(source)
  if (executableMarkdown(normalized)) {
    throw new TaskContractError(
      'EXECUTABLE_TASK',
      safePath,
      'Agent tasks must be plain Markdown without executable MDX',
    )
  }

  const parsed = matter(normalized)
  const result = taskFrontmatterSchema.safeParse(parsed.data)
  if (!result.success) {
    throw new TaskContractError(
      'INVALID_TASK_FRONTMATTER',
      safePath,
      result.error.issues.map((issue) => issue.message).join('; '),
    )
  }

  for (const reference of result.data.references) {
    if (!knownReferences.has(reference)) {
      throw new TaskContractError(
        'UNKNOWN_TASK_REFERENCE',
        safePath,
        'Unknown Agent Contract reference ' + reference,
      )
    }
  }

  if (
    result.data.mode === 'write' &&
    !/^##\s+(?:Verification|验证)(?:\s|$)/im.test(parsed.content)
  ) {
    throw new TaskContractError(
      'MISSING_TASK_VERIFICATION',
      safePath,
      'Write tasks must contain an H2 Verification section',
    )
  }

  const metadata: TaskFrontmatter =
    result.data.mode === 'write'
      ? result.data
      : {
          id: result.data.id,
          title: result.data.title,
          contractVersion: result.data.contractVersion,
          mode: result.data.mode,
          references: result.data.references,
          ...(result.data.requiresExplicitAuthorization === false
            ? { requiresExplicitAuthorization: false }
            : {}),
        }

  return {
    path: safePath,
    metadata,
    markdown: normalized,
  }
}

export function parseTaskPack(
  locale: string,
  guide: string,
  documents: readonly { path: string; source: string }[],
  knownReferences: ReadonlySet<string>,
): TaskPack {
  if (byteLength(guide) > MAX_GUIDE_BYTES) {
    throw new TaskContractError(
      'GUIDE_SIZE_LIMIT',
      locale + '/guide.md',
      'Agent guide exceeds the ' + MAX_GUIDE_BYTES + ' byte size limit',
    )
  }
  const normalizedGuide = normalizeMarkdown(guide)
  if (executableMarkdown(normalizedGuide)) {
    throw new TaskContractError(
      'EXECUTABLE_GUIDE',
      locale + '/guide.md',
      'Agent guides must be plain Markdown without executable MDX',
    )
  }

  const tasks = documents
    .map(({ path: relativePath, source }) =>
      parseTaskDocument(source, relativePath, knownReferences),
    )
    .sort((left, right) =>
      left.metadata.id.localeCompare(right.metadata.id, 'en'),
    )
  const seen = new Set<string>()
  for (const task of tasks) {
    if (seen.has(task.metadata.id)) {
      throw new TaskContractError(
        'DUPLICATE_TASK_ID',
        task.path,
        'Duplicate Agent task id ' + task.metadata.id + ' in ' + locale,
      )
    }
    seen.add(task.metadata.id)
  }

  return { locale, guide: normalizedGuide, tasks }
}

export async function loadBuiltInTaskPack(
  locale: 'en-US' | 'zh-CN',
): Promise<TaskPack> {
  const localeRoot = fileURLToPath(
    new URL('./content/' + locale + '/', import.meta.url),
  )
  const taskRoot = path.join(localeRoot, 'tasks')
  const entries = (await readdir(taskRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
  const [guide, documents] = await Promise.all([
    readFile(path.join(localeRoot, 'guide.md'), 'utf8'),
    Promise.all(
      entries.map(async (entry) => ({
        path: locale + '/tasks/' + entry.name,
        source: await readFile(path.join(taskRoot, entry.name), 'utf8'),
      })),
    ),
  ])
  return parseTaskPack(locale, guide, documents, BUILT_IN_TASK_REFERENCES)
}
