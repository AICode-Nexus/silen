import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises'
import type { Stats } from 'node:fs'
import path from 'node:path'

const configSource = `import { defineConfig } from '@aicode-nexus/silen'

export default defineConfig({
  title: 'My Silen Site',
  description: 'A knowledge base for people and AI.',
  themeConfig: {
    nav: [{ text: 'Home', link: '/' }],
    sidebar: [
      {
        text: 'Start here',
        items: [{ text: 'Home', link: '/' }],
      },
    ],
    search: true,
    home: {
      hero: {
        name: 'My Silen Site',
        text: 'A useful home for your knowledge.',
        tagline: 'Write in MDX and publish for people and AI from one source.',
        actions: [{ text: 'Start writing', link: '/', theme: 'brand' }],
      },
      features: [
        {
          title: 'React-powered MDX',
          details: 'Use familiar Markdown and add React components when they help.',
        },
        {
          title: 'Local search',
          details: 'Give readers fast search without a hosted search dependency.',
        },
        {
          title: 'AI-ready output',
          details: 'Generate Markdown routes, llms.txt, and a deterministic AI index.',
        },
      ],
    },
  },
  ai: {
    llmsTxt: true,
    llmsFullTxt: true,
    markdownRoutes: true,
    index: true,
    contract: { enabled: true },
  },
})
`

const homepageSource = `---
layout: home
title: My Silen Site
description: A knowledge base for people and AI.
---

## Start writing

Replace this page with your project overview, then add more \`.md\` or \`.mdx\`
files beside it. Silen will turn the same content into a searchable static site
and AI-readable artifacts.

## Next steps

1. Describe what this knowledge base is for.
2. Add a guide for the first task readers should complete.
3. Run \`pnpm silen dev .\` while you write.
`

const scaffoldFiles = [
  { relativePath: '.silen/config.ts', source: configSource },
  { relativePath: 'index.mdx', source: homepageSource },
] as const

export interface InitResult {
  readonly root: string
  readonly createdPaths: readonly string[]
}

export interface InitSiteOptions {
  readonly writeStagedFile?: (file: string, source: string) => Promise<void>
  readonly promoteFile?: (
    stagedFile: string,
    targetFile: string,
  ) => Promise<void>
  readonly beforePromote?: (targetFile: string) => Promise<void>
  readonly afterPromote?: (targetFile: string) => Promise<void>
}

interface FileIdentity {
  readonly device: number
  readonly inode: number
}

interface DirectoryIdentity extends FileIdentity {
  readonly path: string
  readonly realPath: string
}

interface PromotedFile extends FileIdentity {
  readonly target: string
}

const unsupportedHardLinkCodes = new Set([
  'EXDEV',
  'ENOTSUP',
  'EOPNOTSUPP',
  'EPERM',
])

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined
}

async function optionalStat(file: string): Promise<Stats | undefined> {
  try {
    return await lstat(file)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined
    throw error
  }
}

function identityOf(stat: Stats): FileIdentity {
  return { device: stat.dev, inode: stat.ino }
}

function sameIdentity(stat: Stats, identity: FileIdentity): boolean {
  return stat.dev === identity.device && stat.ino === identity.inode
}

function replacedPath(label: string, target: string, cause?: unknown): Error {
  return new Error(`Silen init ${label} was replaced: ${target}`, { cause })
}

async function snapshotDirectory(
  directory: string,
  label: string,
): Promise<DirectoryIdentity> {
  let stat: Stats
  let resolved: string
  try {
    stat = await lstat(directory)
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw replacedPath(label, directory)
    }
    resolved = await realpath(directory)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Silen init ')) {
      throw error
    }
    throw replacedPath(label, directory, error)
  }
  return { path: directory, realPath: resolved, ...identityOf(stat) }
}

async function validateDirectory(
  identity: DirectoryIdentity,
  label: string,
): Promise<void> {
  let current: Stats
  let resolved: string
  try {
    current = await lstat(identity.path)
    resolved = await realpath(identity.path)
  } catch (error) {
    throw replacedPath(label, identity.path, error)
  }
  if (
    current.isSymbolicLink() ||
    !current.isDirectory() ||
    !sameIdentity(current, identity) ||
    resolved !== identity.realPath
  ) {
    throw replacedPath(label, identity.path)
  }
}

function assertDirectChild(
  parent: DirectoryIdentity,
  child: DirectoryIdentity,
  label: string,
): void {
  if (path.dirname(child.realPath) !== parent.realPath) {
    throw new Error(`Silen init ${label} escaped its parent: ${child.path}`)
  }
}

function collisionError(collisions: readonly string[]): Error {
  return new Error(
    [
      'Silen init found existing target paths:',
      ...collisions.map((file) => `- ${file}`),
    ].join('\n'),
  )
}

async function scaffoldCollisions(root: string): Promise<string[]> {
  const rootStat = await optionalStat(root)
  if (rootStat?.isSymbolicLink()) {
    throw new Error(`Silen init root must not be a symlink: ${root}`)
  }
  if (rootStat && !rootStat.isDirectory()) {
    throw new Error(`Silen init root must be a directory: ${root}`)
  }

  const configDirectory = path.join(root, '.silen')
  const configDirectoryStat = await optionalStat(configDirectory)
  const blockedConfigDirectory =
    configDirectoryStat !== undefined &&
    (configDirectoryStat.isSymbolicLink() || !configDirectoryStat.isDirectory())
  const collisions: string[] = []

  for (const file of scaffoldFiles) {
    const target = path.join(root, file.relativePath)
    if (
      (file.relativePath === '.silen/config.ts' && blockedConfigDirectory) ||
      (await optionalStat(target)) !== undefined
    ) {
      collisions.push(target)
    }
  }
  return collisions
}

async function ensureDirectory(
  directory: string,
  label: string,
  createdDirectories: DirectoryIdentity[],
): Promise<DirectoryIdentity> {
  let created = false
  try {
    await mkdir(directory)
    created = true
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error
  }
  const identity = await snapshotDirectory(directory, label)
  if (created) createdDirectories.push(identity)
  return identity
}

async function ensureParentDirectory(
  directory: string,
  createdDirectories: DirectoryIdentity[],
): Promise<DirectoryIdentity> {
  const missing: string[] = []
  let ancestor = directory
  while ((await optionalStat(ancestor)) === undefined) {
    missing.push(ancestor)
    const parent = path.dirname(ancestor)
    if (parent === ancestor) {
      throw new Error(`Silen init cannot resolve a parent for ${directory}`)
    }
    ancestor = parent
  }

  let parentIdentity = await snapshotDirectory(ancestor, 'root ancestor')
  for (const childPath of missing.reverse()) {
    await validateDirectory(parentIdentity, 'root ancestor')
    const childIdentity = await ensureDirectory(
      childPath,
      'root parent',
      createdDirectories,
    )
    await validateDirectory(parentIdentity, 'root ancestor')
    assertDirectChild(parentIdentity, childIdentity, 'root parent')
    parentIdentity = childIdentity
  }
  return parentIdentity
}

async function rollback(
  promotedFiles: readonly PromotedFile[],
  createdDirectories: readonly DirectoryIdentity[],
): Promise<void> {
  for (const file of [...promotedFiles].reverse()) {
    let current: Stats | undefined
    try {
      current = await optionalStat(file.target)
    } catch {
      continue
    }
    if (current && !current.isSymbolicLink() && sameIdentity(current, file)) {
      await rm(file.target, { force: true })
    }
  }
  for (const directory of [...createdDirectories].reverse()) {
    let current: Stats | undefined
    try {
      current = await optionalStat(directory.path)
    } catch {
      continue
    }
    if (
      !current ||
      current.isSymbolicLink() ||
      !current.isDirectory() ||
      !sameIdentity(current, directory)
    ) {
      continue
    }
    try {
      await rmdir(directory.path)
    } catch (error) {
      if (errorCode(error) !== 'ENOENT' && errorCode(error) !== 'ENOTEMPTY') {
        throw error
      }
    }
  }
}

async function cleanupStaging(
  staging: DirectoryIdentity | undefined,
): Promise<void> {
  if (!staging) return
  let current: Stats | undefined
  try {
    current = await optionalStat(staging.path)
  } catch {
    return
  }
  if (
    current &&
    !current.isSymbolicLink() &&
    current.isDirectory() &&
    sameIdentity(current, staging)
  ) {
    await rm(staging.path, { force: true, recursive: true })
  }
}

async function validateParents(
  root: DirectoryIdentity,
  configDirectory: DirectoryIdentity,
): Promise<void> {
  await validateDirectory(root, 'root parent')
  await validateDirectory(configDirectory, '.silen parent')
  assertDirectChild(root, configDirectory, '.silen parent')
}

async function validatePromotedFile(
  promoted: PromotedFile,
  parent: DirectoryIdentity,
): Promise<void> {
  let current: Stats
  let resolved: string
  try {
    current = await lstat(promoted.target)
    resolved = await realpath(promoted.target)
  } catch (error) {
    throw replacedPath('promoted target', promoted.target, error)
  }
  if (
    current.isSymbolicLink() ||
    !current.isFile() ||
    !sameIdentity(current, promoted) ||
    path.dirname(resolved) !== parent.realPath
  ) {
    throw replacedPath('promoted target', promoted.target)
  }
}

async function promoteExclusively(
  stagedFile: string,
  targetFile: string,
  promotedFiles: PromotedFile[],
): Promise<PromotedFile> {
  const contents = await readFile(stagedFile)
  const handle = await open(targetFile, 'wx')
  try {
    const created = await handle.stat()
    const promoted = { target: targetFile, ...identityOf(created) }
    promotedFiles.push(promoted)
    await handle.writeFile(contents)
    await handle.sync()
    return promoted
  } finally {
    await handle.close()
  }
}

async function promoteStagedFile(
  stagedFile: string,
  targetFile: string,
  options: InitSiteOptions,
  promotedFiles: PromotedFile[],
): Promise<PromotedFile> {
  const staged = await lstat(stagedFile)
  const expected = { target: targetFile, ...identityOf(staged) }
  try {
    await (options.promoteFile ?? link)(stagedFile, targetFile)
    promotedFiles.push(expected)
    return expected
  } catch (error) {
    if (unsupportedHardLinkCodes.has(errorCode(error) ?? '')) {
      return promoteExclusively(stagedFile, targetFile, promotedFiles)
    }
    if (errorCode(error) !== 'EEXIST') {
      const current = await optionalStat(targetFile)
      if (
        current &&
        !current.isSymbolicLink() &&
        sameIdentity(current, expected)
      ) {
        promotedFiles.push(expected)
      }
    }
    throw error
  }
}

export async function initializeSite(
  inputRoot: string,
  options: InitSiteOptions = {},
): Promise<InitResult> {
  const root = path.resolve(inputRoot)
  const createdPaths: string[] = []
  const promotedFiles: PromotedFile[] = []
  const createdDirectories: DirectoryIdentity[] = []
  let staging: DirectoryIdentity | undefined

  try {
    const rootParent = await ensureParentDirectory(
      path.dirname(root),
      createdDirectories,
    )
    await validateDirectory(rootParent, 'root parent')
    const stagingRoot = await mkdtemp(
      path.join(path.dirname(root), `.${path.basename(root)}.silen-init-`),
    )
    staging = await snapshotDirectory(stagingRoot, 'staging directory')
    await validateDirectory(rootParent, 'root parent')
    assertDirectChild(rootParent, staging, 'staging directory')

    await mkdir(path.join(staging.path, '.silen'))
    for (const file of scaffoldFiles) {
      const stagedFile = path.join(staging.path, file.relativePath)
      if (options.writeStagedFile) {
        await options.writeStagedFile(stagedFile, file.source)
      } else {
        await writeFile(stagedFile, file.source, 'utf8')
      }
    }

    const collisions = await scaffoldCollisions(root)
    if (collisions.length > 0) throw collisionError(collisions)

    await validateDirectory(rootParent, 'root parent')
    const rootIdentity = await ensureDirectory(
      root,
      'root parent',
      createdDirectories,
    )
    await validateDirectory(rootParent, 'root parent')
    assertDirectChild(rootParent, rootIdentity, 'root parent')
    const configDirectory = await ensureDirectory(
      path.join(root, '.silen'),
      '.silen parent',
      createdDirectories,
    )
    await validateParents(rootIdentity, configDirectory)

    for (const file of scaffoldFiles) {
      const target = path.join(root, file.relativePath)
      const targetParent =
        file.relativePath === '.silen/config.ts'
          ? configDirectory
          : rootIdentity
      await options.beforePromote?.(target)
      // Node has no portable openat/renameat2 API. Bind the layered checks to
      // directory identities immediately around exclusive target creation.
      await validateParents(rootIdentity, configDirectory)
      const promoted = await promoteStagedFile(
        path.join(staging.path, file.relativePath),
        target,
        options,
        promotedFiles,
      )
      await options.afterPromote?.(target)
      await validateParents(rootIdentity, configDirectory)
      await validatePromotedFile(promoted, targetParent)
      createdPaths.push(target)
    }

    await cleanupStaging(staging)
    staging = undefined
    return { root, createdPaths }
  } catch (error) {
    await cleanupStaging(staging)
    await rollback(promotedFiles, createdDirectories)
    throw error
  }
}
