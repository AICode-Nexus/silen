import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import type { ResolvedAiContractConfig } from '../../shared/config.js'
import {
  BUILT_IN_TASK_REFERENCES,
  MAX_TASK_BYTES,
  parseTaskPack,
  type ParsedTaskDocument,
} from './tasks.js'

const MAX_GUIDE_BYTES = 512 * 1024
const MAX_PUBLIC_CONTENT_BYTES = 2 * 1024 * 1024

export interface PublicContractContent {
  readonly instructions?: string
  readonly tasks: readonly ParsedTaskDocument[]
}

function contentError(relativePath: string, reason: string): Error {
  return new Error(`Invalid public Agent content ${relativePath}: ${reason}`)
}

function containsPath(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  )
}

function safeRelativePath(relativePath: string): boolean {
  return (
    relativePath.length > 0 &&
    relativePath.length <= 1024 &&
    !path.isAbsolute(relativePath) &&
    !relativePath.includes('\\') &&
    !relativePath.includes('\0') &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(relativePath) &&
    relativePath
      .split('/')
      .every((part) => part && part !== '.' && part !== '..')
  )
}

async function readBoundedPublicFile(
  root: string,
  physicalRoot: string,
  relativePath: string,
  maximumBytes: number,
): Promise<string> {
  if (!safeRelativePath(relativePath) || !relativePath.endsWith('.md')) {
    throw contentError(relativePath, 'expected a relative Markdown file')
  }
  try {
    const physicalFile = await realpath(path.resolve(root, relativePath))
    if (!containsPath(physicalRoot, physicalFile)) {
      throw contentError(relativePath, 'path escapes the documentation root')
    }
    const details = await stat(physicalFile)
    if (!details.isFile()) throw contentError(relativePath, 'not a file')
    if (details.size > maximumBytes) {
      throw contentError(relativePath, `exceeds ${maximumBytes} bytes`)
    }
    return await readFile(physicalFile, 'utf8')
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid public')) {
      throw error
    }
    throw contentError(relativePath, 'cannot be read')
  }
}

export async function loadPublicContractContent(
  root: string,
  locale: string,
  config: ResolvedAiContractConfig,
): Promise<PublicContractContent> {
  const physicalRoot = await realpath(root)
  let totalBytes = 0
  let instructions: string | undefined

  if (config.instructions !== undefined) {
    const source = await readBoundedPublicFile(
      root,
      physicalRoot,
      config.instructions,
      MAX_GUIDE_BYTES,
    )
    totalBytes += Buffer.byteLength(source, 'utf8')
    instructions = parseTaskPack(
      locale,
      source,
      [],
      BUILT_IN_TASK_REFERENCES,
    ).guide
  }

  const documents: Array<{ path: string; source: string }> = []
  if (config.tasksDir !== undefined) {
    if (!safeRelativePath(config.tasksDir)) {
      throw contentError(config.tasksDir, 'expected a relative directory')
    }
    let physicalDirectory: string
    try {
      physicalDirectory = await realpath(path.resolve(root, config.tasksDir))
    } catch {
      throw contentError(config.tasksDir, 'cannot be read')
    }
    if (!containsPath(physicalRoot, physicalDirectory)) {
      throw contentError(config.tasksDir, 'path escapes the documentation root')
    }
    const entries = (
      await readdir(physicalDirectory, { withFileTypes: true })
    ).sort((left, right) => left.name.localeCompare(right.name, 'en'))
    for (const entry of entries) {
      const relativePath = `${config.tasksDir}/${entry.name}`
      if (!entry.name.endsWith('.md')) {
        throw contentError(
          relativePath,
          'task directories may contain only Markdown files',
        )
      }
      const source = await readBoundedPublicFile(
        root,
        physicalRoot,
        relativePath,
        MAX_TASK_BYTES,
      )
      totalBytes += Buffer.byteLength(source, 'utf8')
      documents.push({ path: `${locale}/tasks/${entry.name}`, source })
    }
  }

  if (totalBytes > MAX_PUBLIC_CONTENT_BYTES) {
    throw contentError(
      'configured files',
      'combined content exceeds 2097152 bytes',
    )
  }
  const tasks = parseTaskPack(
    locale,
    '',
    documents,
    BUILT_IN_TASK_REFERENCES,
  ).tasks
  return {
    ...(instructions === undefined ? {} : { instructions }),
    tasks,
  }
}
