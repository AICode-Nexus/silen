import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  rmdir,
  unlink,
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

interface RollbackHooks {
  readonly inspect?: (target: string) => Promise<Stats | undefined>
  readonly removeFile?: (target: string) => Promise<void>
  readonly removeDirectory?: (target: string) => Promise<void>
}

export interface InitSiteOptions {
  readonly writeStagedFile?: (file: string, source: string) => Promise<void>
  readonly promoteFile?: (
    stagedFile: string,
    targetFile: string,
  ) => Promise<void>
  readonly beforePromote?: (targetFile: string) => Promise<void>
  readonly afterPromote?: (targetFile: string) => Promise<void>
  readonly snapshotStaging?: (stagingPath: string) => Promise<void>
  readonly beforeCleanupStaging?: (stagingPath: string) => Promise<void>
  readonly removeStaging?: (stagingPath: string) => Promise<void>
}

interface InternalInitSiteOptions extends InitSiteOptions {
  readonly cleanupHooks?: StagingCleanupHooks
  readonly rollbackHooks?: RollbackHooks
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

interface StagedFile extends FileIdentity {
  readonly path: string
}

interface StagingState {
  readonly path: string
  readonly files: StagedFile[]
  identity?: DirectoryIdentity
  configDirectory?: DirectoryIdentity
}

interface StagingCleanupHooks {
  readonly beforeRemove?: (target: string) => Promise<void>
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

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
  hooks: RollbackHooks = {},
): Promise<void> {
  const failures: Error[] = []

  for (const file of [...promotedFiles].reverse()) {
    let current: Stats | undefined
    try {
      current = await (hooks.inspect ?? optionalStat)(file.target)
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') {
        failures.push(
          rollbackActionError('inspect promoted file', file.target, error),
        )
      }
      continue
    }
    if (!current) continue
    if (
      current.isSymbolicLink() ||
      !current.isFile() ||
      !sameIdentity(current, file)
    ) {
      failures.push(rollbackIdentityError('promoted file', file.target))
      continue
    }
    try {
      if (hooks.removeFile) {
        await hooks.removeFile(file.target)
      } else {
        await rm(file.target, { force: true })
      }
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') {
        failures.push(
          rollbackActionError('remove promoted file', file.target, error),
        )
      }
    }
  }

  for (const directory of [...createdDirectories].reverse()) {
    let current: Stats | undefined
    try {
      current = await (hooks.inspect ?? optionalStat)(directory.path)
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') {
        failures.push(
          rollbackActionError(
            'inspect created directory',
            directory.path,
            error,
          ),
        )
      }
      continue
    }
    if (!current) continue
    if (
      current.isSymbolicLink() ||
      !current.isDirectory() ||
      !sameIdentity(current, directory)
    ) {
      failures.push(rollbackIdentityError('created directory', directory.path))
      continue
    }
    try {
      if (hooks.removeDirectory) {
        await hooks.removeDirectory(directory.path)
      } else {
        await rmdir(directory.path)
      }
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') {
        failures.push(
          rollbackActionError(
            'remove created directory',
            directory.path,
            error,
          ),
        )
      }
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `Silen init rollback failed with ${failures.length} errors: ${failures.map(errorDetail).join('; ')}`,
      { cause: failures[0] },
    )
  }
}

function rollbackActionError(
  action: string,
  target: string,
  cause: unknown,
): Error {
  return new Error(
    `Silen init rollback ${action} failed for ${target}: ${errorDetail(cause)}`,
    { cause },
  )
}

function rollbackIdentityError(kind: string, target: string): Error {
  return new Error(
    `Silen init rollback identity mismatch for ${kind} ${target}; replacement preserved`,
  )
}

function stagingCleanupError(stagingPath: string, cause: unknown): Error {
  return new Error(
    `Silen init staging cleanup failed for ${stagingPath}: ${errorDetail(cause)}`,
    { cause },
  )
}

async function verifyStagingAbsent(
  stagingPath: string,
  expected?: FileIdentity,
): Promise<void> {
  let current: Stats
  try {
    current = await lstat(stagingPath)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return
    throw stagingCleanupError(stagingPath, error)
  }
  if (expected && !sameIdentity(current, expected)) {
    throw replacedPath('staging directory', stagingPath)
  }
  throw new Error(`Silen init staging directory still exists: ${stagingPath}`)
}

async function cleanupProvisionalStaging(stagingPath: string): Promise<void> {
  let current: Stats
  try {
    current = await lstat(stagingPath)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return
    throw stagingCleanupError(stagingPath, error)
  }
  if (current.isSymbolicLink() || !current.isDirectory()) {
    throw replacedPath('provisional staging path', stagingPath)
  }
  try {
    await rmdir(stagingPath)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return
    throw new Error(
      `Silen init could not safely remove unresolved provisional staging path ${stagingPath}: ${errorDetail(error)}`,
      { cause: error },
    )
  }
  await verifyStagingAbsent(stagingPath)
}

function stagedFileAt(
  staging: StagingState,
  relativePath: string,
): StagedFile | undefined {
  const target = path.join(staging.path, relativePath)
  return staging.files.find((file) => file.path === target)
}

async function validateKnownStagedFile(file: StagedFile): Promise<void> {
  const current = await optionalStat(file.path)
  if (!current) return
  if (
    current.isSymbolicLink() ||
    !current.isFile() ||
    !sameIdentity(current, file)
  ) {
    throw replacedPath('staged file', file.path)
  }
}

async function validateExpectedEntries(
  directory: DirectoryIdentity,
  expected: ReadonlySet<string>,
): Promise<void> {
  await validateDirectory(directory, 'staging directory')
  const entries = await readdir(directory.path)
  await validateDirectory(directory, 'staging directory')
  const unexpected = entries.find((entry) => !expected.has(entry))
  if (unexpected !== undefined) {
    throw new Error(
      `Silen init unexpected staging entry was preserved: ${path.join(directory.path, unexpected)}`,
    )
  }
}

async function validateStagingTree(staging: StagingState): Promise<boolean> {
  if (!staging.identity) return false
  const current = await optionalStat(staging.path)
  if (!current) return false
  if (
    current.isSymbolicLink() ||
    !current.isDirectory() ||
    !sameIdentity(current, staging.identity)
  ) {
    throw replacedPath('staging directory', staging.path)
  }
  await validateDirectory(staging.identity, 'staging directory')

  if (staging.configDirectory) {
    const configCurrent = await optionalStat(staging.configDirectory.path)
    if (configCurrent) {
      await validateDirectory(
        staging.configDirectory,
        'staging .silen directory',
      )
      assertDirectChild(
        staging.identity,
        staging.configDirectory,
        'staging .silen directory',
      )
    }
  }
  for (const file of staging.files) await validateKnownStagedFile(file)

  const rootEntries = new Set<string>()
  if (staging.configDirectory) rootEntries.add('.silen')
  if (stagedFileAt(staging, 'index.mdx')) rootEntries.add('index.mdx')
  await validateExpectedEntries(staging.identity, rootEntries)

  if (staging.configDirectory) {
    const configCurrent = await optionalStat(staging.configDirectory.path)
    if (configCurrent) {
      const configEntries = new Set<string>()
      if (stagedFileAt(staging, '.silen/config.ts')) {
        configEntries.add('config.ts')
      }
      await validateExpectedEntries(staging.configDirectory, configEntries)
    }
  }
  return true
}

async function removeKnownStagedFile(file: StagedFile): Promise<void> {
  const current = await optionalStat(file.path)
  if (!current) return
  if (
    current.isSymbolicLink() ||
    !current.isFile() ||
    !sameIdentity(current, file)
  ) {
    throw replacedPath('staged file', file.path)
  }
  // Node exposes no portable unlinkat API. The identity check is therefore
  // immediate, and the remaining pathname race can unlink at most one leaf.
  try {
    await unlink(file.path)
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error
  }
}

async function removeKnownStagingDirectory(
  directory: DirectoryIdentity,
  label: string,
): Promise<void> {
  const current = await optionalStat(directory.path)
  if (!current) return
  await validateDirectory(directory, label)
  // A last-moment non-empty replacement is preserved by non-recursive rmdir.
  // An empty-directory swap remains irreducible without portable unlinkat.
  try {
    await rmdir(directory.path)
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error
  }
}

async function securelyRemoveStaging(
  staging: StagingState,
  hooks: StagingCleanupHooks = {},
): Promise<void> {
  if (!(await validateStagingTree(staging))) return

  for (const file of staging.files) {
    await hooks.beforeRemove?.(file.path)
    if (!(await validateStagingTree(staging))) return
    await removeKnownStagedFile(file)
  }

  if (staging.configDirectory) {
    await hooks.beforeRemove?.(staging.configDirectory.path)
    if (!(await validateStagingTree(staging))) return
    await removeKnownStagingDirectory(
      staging.configDirectory,
      'staging .silen directory',
    )
  }

  await hooks.beforeRemove?.(staging.path)
  if (!(await validateStagingTree(staging))) return
  await removeKnownStagingDirectory(staging.identity!, 'staging directory')
  await verifyStagingAbsent(staging.path, staging.identity)
}

async function cleanupStaging(
  staging: StagingState | undefined,
  options: InitSiteOptions,
): Promise<void> {
  if (!staging) return
  try {
    await options.beforeCleanupStaging?.(staging.path)
  } catch (error) {
    throw stagingCleanupError(staging.path, error)
  }
  if (!staging.identity) {
    await cleanupProvisionalStaging(staging.path)
    return
  }
  if (options.removeStaging) {
    await validateStagingTree(staging)
    try {
      await options.removeStaging(staging.path)
    } catch (error) {
      throw stagingCleanupError(staging.path, error)
    }
    await verifyStagingAbsent(staging.path, staging.identity)
    return
  }
  try {
    await securelyRemoveStaging(
      staging,
      (options as InternalInitSiteOptions).cleanupHooks,
    )
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Silen init ')) {
      throw error
    }
    throw stagingCleanupError(staging.path, error)
  }
}

function combinedFailure(
  errors: readonly unknown[],
  primary: unknown,
): unknown {
  if (errors.length === 1) return errors[0]
  return new AggregateError(
    errors,
    `Silen init failed with multiple errors: ${errors.map(errorDetail).join('; ')}`,
    { cause: primary },
  )
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

async function prepareStagedFile(
  staging: StagingState,
  relativePath: string,
): Promise<StagedFile> {
  if (!staging.identity) {
    throw new Error('Silen init staging identity is unavailable')
  }
  await validateDirectory(staging.identity, 'staging directory')
  if (staging.configDirectory) {
    await validateDirectory(staging.configDirectory, 'staging .silen directory')
    assertDirectChild(
      staging.identity,
      staging.configDirectory,
      'staging .silen directory',
    )
  }

  const stagedPath = path.join(staging.path, relativePath)
  const expectedParent = relativePath.startsWith('.silen/')
    ? staging.configDirectory
    : staging.identity
  if (!expectedParent) {
    throw new Error(`Silen init staging parent is unavailable: ${stagedPath}`)
  }
  const handle = await open(stagedPath, 'wx')
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile()) {
      throw new Error(`Silen init staged path is not a file: ${stagedPath}`)
    }
    const staged = { path: stagedPath, ...identityOf(metadata) }
    staging.files.push(staged)
    await validateDirectory(expectedParent, 'staging file parent')
    return staged
  } finally {
    await handle.close()
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
  let staging: StagingState | undefined
  let result: InitResult | undefined
  let operationError: unknown
  let operationFailed = false

  try {
    const rootParent = await ensureParentDirectory(
      path.dirname(root),
      createdDirectories,
    )
    await validateDirectory(rootParent, 'root parent')
    const stagingRoot = await mkdtemp(
      path.join(path.dirname(root), `.${path.basename(root)}.silen-init-`),
    )
    staging = { path: stagingRoot, files: [] }
    staging.identity = await snapshotDirectory(stagingRoot, 'staging directory')
    await options.snapshotStaging?.(stagingRoot)
    await validateDirectory(rootParent, 'root parent')
    assertDirectChild(rootParent, staging.identity, 'staging directory')

    const stagingConfigDirectory = path.join(staging.path, '.silen')
    await mkdir(stagingConfigDirectory)
    staging.configDirectory = await snapshotDirectory(
      stagingConfigDirectory,
      'staging .silen directory',
    )
    await validateDirectory(staging.identity, 'staging directory')
    assertDirectChild(
      staging.identity,
      staging.configDirectory,
      'staging .silen directory',
    )
    for (const file of scaffoldFiles) {
      const stagedFile = (await prepareStagedFile(staging, file.relativePath))
        .path
      if (options.writeStagedFile) {
        await options.writeStagedFile(stagedFile, file.source)
      } else {
        await writeFile(stagedFile, file.source, 'utf8')
      }
      await validateStagingTree(staging)
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

    result = { root, createdPaths }
  } catch (error) {
    operationFailed = true
    operationError = error
  }

  let cleanupError: unknown
  try {
    await cleanupStaging(staging, options)
  } catch (error) {
    cleanupError = error
  }

  if (operationFailed || cleanupError !== undefined) {
    let rollbackError: unknown
    try {
      await rollback(
        promotedFiles,
        createdDirectories,
        (options as InternalInitSiteOptions).rollbackHooks,
      )
    } catch (error) {
      rollbackError = error
    }
    const errors = [
      ...(operationFailed ? [operationError] : []),
      ...(cleanupError === undefined ? [] : [cleanupError]),
      ...(rollbackError === undefined ? [] : [rollbackError]),
    ]
    throw combinedFailure(errors, operationFailed ? operationError : errors[0])
  }

  if (!result) throw new Error('Silen init finished without a result')
  return result
}
