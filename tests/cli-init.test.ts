import {
  access,
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  symlink,
  writeFile,
} from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import type { Stats } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execa } from 'execa'
import { initializeSite } from '../src/node/init'

const temporaryDirectories: string[] = []
const cliRunner = path.resolve('node_modules/.bin/jiti')
const cli = path.resolve('src/node/cli.ts')
let parent: string

async function runInit(root?: string) {
  return execa(
    cliRunner,
    [cli, 'init', ...(root === undefined ? [] : [root])],
    {
      reject: false,
      all: true,
    },
  )
}

async function expectMissing(file: string): Promise<void> {
  await expect(access(file)).rejects.toMatchObject({ code: 'ENOENT' })
}

async function expectNoStagingDirectory(root: string): Promise<void> {
  const prefix = `.${path.basename(root)}.silen-init-`
  expect(
    (await readdir(path.dirname(root))).filter((name) =>
      name.startsWith(prefix),
    ),
  ).toEqual([])
}

async function optionalLstat(file: string) {
  try {
    return await lstat(file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

interface RollbackTestHooks {
  readonly inspect?: typeof optionalLstat
  readonly removeFile?: (target: string) => Promise<void>
  readonly removeDirectory?: (target: string) => Promise<void>
}

interface InitSiteTestOptions extends NonNullable<
  Parameters<typeof initializeSite>[1]
> {
  readonly rollbackHooks: RollbackTestHooks
}

function initializeSiteWithRollbackHooks(
  root: string,
  options: InitSiteTestOptions,
) {
  return initializeSite(root, options)
}

interface ExclusivePromotionTestHooks {
  readonly writeFile?: (handle: FileHandle, contents: Buffer) => Promise<void>
  readonly sync?: (handle: FileHandle) => Promise<void>
  readonly finalStat?: (handle: FileHandle) => Promise<Stats>
  readonly afterFailureSnapshot?: (target: string) => Promise<void>
  readonly close?: (handle: FileHandle) => Promise<void>
}

interface ExclusivePromotionTestOptions extends NonNullable<
  Parameters<typeof initializeSite>[1]
> {
  readonly exclusivePromotionHooks: ExclusivePromotionTestHooks
}

function initializeSiteWithExclusivePromotionHooks(
  root: string,
  options: ExclusivePromotionTestOptions,
) {
  return initializeSite(root, options)
}

interface StagingCleanupTestHooks {
  readonly beforeRemove: (target: string) => Promise<void>
}

interface InitSiteCleanupTestOptions extends NonNullable<
  Parameters<typeof initializeSite>[1]
> {
  readonly cleanupHooks: StagingCleanupTestHooks
}

function initializeSiteWithCleanupHooks(
  root: string,
  options: InitSiteCleanupTestOptions,
) {
  return initializeSite(root, options)
}

beforeAll(async () => {
  const testTemp = path.resolve('.silen/.temp/tests')
  await mkdir(testTemp, { recursive: true })
  parent = await mkdtemp(path.join(testTemp, 'silen-init-'))
  temporaryDirectories.push(parent)
})

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  )
})

describe('silen init', () => {
  it('appears in help and rejects a missing root argument', async () => {
    const help = await execa(cliRunner, [cli, '--help'])
    expect(help.stdout).toContain('init <root>')

    const result = await runInit()
    expect(result.exitCode).not.toBe(0)
    expect(result.all).toMatch(/missing|required/i)
    expect(result.all).not.toContain('Unknown command')
  })

  it('creates exactly the starter files in a new directory', async () => {
    const root = path.join(parent, 'new-site')
    const result = await runInit(root)

    expect(result.exitCode, result.all).toBe(0)
    expect(await readdir(root)).toEqual(['.silen', 'index.mdx'])
    expect(await readdir(path.join(root, '.silen'))).toEqual(['config.ts'])
    expect(result.all).toContain(path.join(root, '.silen/config.ts'))
    expect(result.all).toContain(path.join(root, 'index.mdx'))
    expect(result.all).toContain(`pnpm silen dev ${root}`)

    const config = await readFile(path.join(root, '.silen/config.ts'), 'utf8')
    expect(config).toContain("title: 'My Silen Site'")
    expect(config).toContain('description:')
    expect(config).toContain('nav:')
    expect(config).toContain('sidebar:')
    expect(config).toContain('search: true')
    expect(config).toContain('llmsTxt: true')
    expect(config).toContain('llmsFullTxt: true')
    expect(config).toContain('markdownRoutes: true')
    expect(config).toContain('index: true')
    expect(await readFile(path.join(root, 'index.mdx'), 'utf8')).toContain(
      'Start writing',
    )
    await expectNoStagingDirectory(root)
  })

  it('activates an existing empty directory', async () => {
    const root = path.join(parent, 'empty-site')
    await mkdir(root)

    const result = await runInit(root)

    expect(result.exitCode, result.all).toBe(0)
    expect(await readdir(root)).toEqual(['.silen', 'index.mdx'])
    await expectNoStagingDirectory(root)
  })

  it('does not mutate consumer package metadata or install dependencies', async () => {
    const root = path.join(parent, 'existing-site')
    const packageFile = path.join(root, 'package.json')
    const packageSource = '{"name":"existing-consumer","private":true}\n'
    await mkdir(root)
    await writeFile(packageFile, packageSource)

    const result = await runInit(root)

    expect(result.exitCode, result.all).toBe(0)
    expect(await readFile(packageFile, 'utf8')).toBe(packageSource)
    await expectMissing(path.join(root, 'node_modules'))
    expect(await readdir(root)).toEqual(['.silen', 'index.mdx', 'package.json'])
    await expectNoStagingDirectory(root)
  })

  it.each([
    ['both target files', ['.silen/config.ts', 'index.mdx']],
    ['only the config', ['.silen/config.ts']],
    ['only the homepage', ['index.mdx']],
  ])(
    'reports every collision for %s and performs no root writes',
    async (_label, collisions) => {
      const root = path.join(
        parent,
        `collision-${collisions.join('-').replaceAll('/', '-')}`,
      )
      await mkdir(path.join(root, '.silen'), { recursive: true })
      await writeFile(path.join(root, 'unrelated.txt'), 'keep me\n')
      for (const relativeFile of collisions) {
        await writeFile(
          path.join(root, relativeFile),
          `existing ${relativeFile}\n`,
        )
      }
      const before = await Promise.all(
        collisions.map((relativeFile) =>
          readFile(path.join(root, relativeFile), 'utf8'),
        ),
      )

      const result = await runInit(root)

      expect(result.exitCode).not.toBe(0)
      for (const relativeFile of collisions) {
        expect(result.all).toContain(path.join(root, relativeFile))
      }
      expect(await readFile(path.join(root, 'unrelated.txt'), 'utf8')).toBe(
        'keep me\n',
      )
      if (!collisions.includes('.silen/config.ts')) {
        await expectMissing(path.join(root, '.silen/config.ts'))
      }
      if (!collisions.includes('index.mdx')) {
        await expectMissing(path.join(root, 'index.mdx'))
      }
      await Promise.all(
        collisions.map(async (relativeFile, index) => {
          expect(await readFile(path.join(root, relativeFile), 'utf8')).toBe(
            before[index],
          )
        }),
      )
      await expectNoStagingDirectory(root)
    },
  )

  it('treats a target-file symlink as a collision without following it', async () => {
    const root = path.join(parent, 'symlink-site')
    const outside = path.join(parent, 'outside.mdx')
    await mkdir(root)
    await writeFile(outside, 'outside remains unchanged\n')
    await symlink(outside, path.join(root, 'index.mdx'))

    const result = await runInit(root)

    expect(result.exitCode).not.toBe(0)
    expect(result.all).toContain(path.join(root, 'index.mdx'))
    expect(await readFile(outside, 'utf8')).toBe('outside remains unchanged\n')
    await expectMissing(path.join(root, '.silen/config.ts'))
    await expectNoStagingDirectory(root)
  })

  it('rolls back only command-created paths when promotion fails', async () => {
    const root = path.join(parent, 'promotion-failure-site')
    const unrelatedRootFile = path.join(root, 'notes.txt')
    const unrelatedSilenFile = path.join(root, '.silen/keep.txt')
    await mkdir(path.join(root, '.silen'), { recursive: true })
    await writeFile(unrelatedRootFile, 'root content stays\n')
    await writeFile(unrelatedSilenFile, 'silen content stays\n')
    let promotions = 0

    await expect(
      initializeSite(root, {
        async promoteFile(stagedFile: string, targetFile: string) {
          promotions += 1
          if (promotions === 2) throw new Error('injected promotion failure')
          await link(stagedFile, targetFile)
        },
      }),
    ).rejects.toThrow('injected promotion failure')

    expect(promotions).toBe(2)
    expect(await readFile(unrelatedRootFile, 'utf8')).toBe(
      'root content stays\n',
    )
    expect(await readFile(unrelatedSilenFile, 'utf8')).toBe(
      'silen content stays\n',
    )
    await expectMissing(path.join(root, '.silen/config.ts'))
    await expectMissing(path.join(root, 'index.mdx'))
    expect(await readdir(root)).toEqual(['.silen', 'notes.txt'])
    expect(await readdir(path.join(root, '.silen'))).toEqual(['keep.txt'])
    await expectNoStagingDirectory(root)
  })

  it('preserves a target replaced by unrelated content before rollback', async () => {
    const root = path.join(parent, 'promotion-race-site')
    const configFile = path.join(root, '.silen/config.ts')
    await mkdir(path.join(root, '.silen'), { recursive: true })
    let promotions = 0

    const error = await initializeSite(root, {
      async promoteFile(stagedFile: string, targetFile: string) {
        promotions += 1
        if (promotions === 1) {
          await link(stagedFile, targetFile)
          return
        }
        await rm(configFile)
        await writeFile(configFile, 'concurrent unrelated content\n')
        throw new Error('injected promotion race')
      },
    }).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as Error).message).toContain('injected promotion race')
    expect((error as Error).message).toMatch(/rollback.*identity.*config\.ts/i)
    expect(await readFile(configFile, 'utf8')).toBe(
      'concurrent unrelated content\n',
    )
    await expectMissing(path.join(root, 'index.mdx'))
    await expectNoStagingDirectory(root)
  })

  it('preserves an in-place content edit that keeps the promoted inode', async () => {
    const root = path.join(parent, 'promotion-in-place-content-race-site')
    const configFile = path.join(root, '.silen/config.ts')
    await mkdir(path.join(root, '.silen'), { recursive: true })
    let promotions = 0
    let promotedIdentity: Awaited<ReturnType<typeof lstat>> | undefined

    const error = await initializeSite(root, {
      async promoteFile(stagedFile: string, targetFile: string) {
        promotions += 1
        if (promotions === 1) {
          await link(stagedFile, targetFile)
          promotedIdentity = await lstat(targetFile)
          return
        }

        await writeFile(configFile, 'concurrent in-place content\n')
        const editedIdentity = await lstat(configFile)
        expect(editedIdentity.dev).toBe(promotedIdentity?.dev)
        expect(editedIdentity.ino).toBe(promotedIdentity?.ino)
        throw new Error('injected in-place content race')
      },
    }).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as Error).message).toContain('injected in-place content race')
    expect((error as Error).message).toMatch(
      /rollback.*(?:content|metadata).*config\.ts/i,
    )
    expect(await readFile(configFile, 'utf8')).toBe(
      'concurrent in-place content\n',
    )
    await expectMissing(path.join(root, 'index.mdx'))
    await expectNoStagingDirectory(root)
  })

  it('preserves an in-place mode edit that keeps content and inode', async () => {
    const root = path.join(parent, 'promotion-in-place-mode-race-site')
    const configFile = path.join(root, '.silen/config.ts')
    await mkdir(path.join(root, '.silen'), { recursive: true })
    let promotions = 0
    let promotedIdentity: Awaited<ReturnType<typeof lstat>> | undefined
    let editedMode = 0

    const error = await initializeSite(root, {
      async promoteFile(stagedFile: string, targetFile: string) {
        promotions += 1
        if (promotions === 1) {
          await link(stagedFile, targetFile)
          promotedIdentity = await lstat(targetFile)
          return
        }

        editedMode = (Number(promotedIdentity?.mode ?? 0) & 0o777) ^ 0o100
        await chmod(configFile, editedMode)
        const editedIdentity = await lstat(configFile)
        expect(editedIdentity.dev).toBe(promotedIdentity?.dev)
        expect(editedIdentity.ino).toBe(promotedIdentity?.ino)
        throw new Error('injected in-place mode race')
      },
    }).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as Error).message).toContain('injected in-place mode race')
    expect((error as Error).message).toMatch(
      /rollback.*(?:content|metadata).*config\.ts/i,
    )
    expect((await lstat(configFile)).mode & 0o777).toBe(editedMode)
    await expectMissing(path.join(root, 'index.mdx'))
    await expectNoStagingDirectory(root)
  })

  it('rejects a root identity swap before promotion without writing outside', async () => {
    const root = path.join(parent, 'root-swap-site')
    const displacedRoot = path.join(parent, 'root-swap-owned')
    const outside = path.join(parent, 'root-swap-outside')
    await mkdir(outside)
    await writeFile(path.join(outside, 'keep.txt'), 'outside stays\n')
    let swaps = 0

    await expect(
      initializeSite(root, {
        async beforePromote() {
          swaps += 1
          await rename(root, displacedRoot)
          await symlink(outside, root, 'dir')
        },
      }),
    ).rejects.toThrow(/root.*replaced|parent.*replaced/i)

    expect(swaps).toBe(1)
    expect(await readFile(path.join(outside, 'keep.txt'), 'utf8')).toBe(
      'outside stays\n',
    )
    await expectMissing(path.join(outside, '.silen/config.ts'))
    await expectMissing(path.join(outside, 'index.mdx'))
    await expectNoStagingDirectory(root)
  })

  it('rejects a .silen identity swap before promotion without writing outside', async () => {
    const root = path.join(parent, 'silen-swap-site')
    const displacedSilen = path.join(root, '.silen-owned')
    const outside = path.join(parent, 'silen-swap-outside')
    await mkdir(root)
    await mkdir(outside)
    await writeFile(path.join(outside, 'keep.txt'), 'outside stays\n')
    let swaps = 0

    await expect(
      initializeSite(root, {
        async beforePromote() {
          swaps += 1
          await rename(path.join(root, '.silen'), displacedSilen)
          await symlink(outside, path.join(root, '.silen'), 'dir')
        },
      }),
    ).rejects.toThrow(/\.silen.*replaced|parent.*replaced/i)

    expect(swaps).toBe(1)
    expect(await readFile(path.join(outside, 'keep.txt'), 'utf8')).toBe(
      'outside stays\n',
    )
    await expectMissing(path.join(outside, 'config.ts'))
    await expectMissing(path.join(root, 'index.mdx'))
    await expectNoStagingDirectory(root)
  })

  it('rolls back its file when the root is swapped during promotion', async () => {
    const root = path.join(parent, 'root-mid-promotion-site')
    const displacedRoot = path.join(parent, 'root-mid-promotion-owned')
    const outside = path.join(parent, 'root-mid-promotion-outside')
    await mkdir(path.join(outside, '.silen'), { recursive: true })
    await writeFile(path.join(outside, 'keep.txt'), 'outside stays\n')
    let promotions = 0

    await expect(
      initializeSite(root, {
        async promoteFile(stagedFile: string, targetFile: string) {
          promotions += 1
          if (promotions === 1) {
            await rename(root, displacedRoot)
            await symlink(outside, root, 'dir')
          }
          await link(stagedFile, targetFile)
        },
      }),
    ).rejects.toThrow(/root.*replaced|parent.*replaced/i)

    expect(promotions).toBe(1)
    expect(await readFile(path.join(outside, 'keep.txt'), 'utf8')).toBe(
      'outside stays\n',
    )
    await expectMissing(path.join(outside, '.silen/config.ts'))
    await expectMissing(path.join(outside, 'index.mdx'))
    await expectNoStagingDirectory(root)
  })

  it('rolls back its file when .silen is swapped during promotion', async () => {
    const root = path.join(parent, 'silen-mid-promotion-site')
    const displacedSilen = path.join(root, '.silen-owned')
    const outside = path.join(parent, 'silen-mid-promotion-outside')
    await mkdir(root)
    await mkdir(outside)
    await writeFile(path.join(outside, 'keep.txt'), 'outside stays\n')
    let promotions = 0

    await expect(
      initializeSite(root, {
        async promoteFile(stagedFile: string, targetFile: string) {
          promotions += 1
          if (promotions === 1) {
            await rename(path.join(root, '.silen'), displacedSilen)
            await symlink(outside, path.join(root, '.silen'), 'dir')
          }
          await link(stagedFile, targetFile)
        },
      }),
    ).rejects.toThrow(/\.silen.*replaced|parent.*replaced/i)

    expect(promotions).toBe(1)
    expect(await readFile(path.join(outside, 'keep.txt'), 'utf8')).toBe(
      'outside stays\n',
    )
    await expectMissing(path.join(outside, 'config.ts'))
    await expectMissing(path.join(root, 'index.mdx'))
    await expectNoStagingDirectory(root)
  })

  it('preserves an unrelated directory replacement after promotion', async () => {
    const root = path.join(parent, 'directory-replacement-site')
    const configDirectory = path.join(root, '.silen')
    const configFile = path.join(configDirectory, 'config.ts')
    const keepFile = path.join(configDirectory, 'keep.txt')
    await mkdir(root)
    let replacements = 0

    await expect(
      initializeSite(root, {
        async afterPromote() {
          replacements += 1
          await rm(configFile)
          await rmdir(configDirectory)
          await mkdir(configDirectory)
          await writeFile(keepFile, 'replacement stays\n')
        },
      }),
    ).rejects.toThrow(/\.silen.*replaced|parent.*replaced/i)

    expect(replacements).toBe(1)
    expect(await readFile(keepFile, 'utf8')).toBe('replacement stays\n')
    await expectMissing(configFile)
    await expectMissing(path.join(root, 'index.mdx'))
    await expectNoStagingDirectory(root)
  })

  it('recovers a created hard link when promotion reports a later failure', async () => {
    const root = path.join(parent, 'bookkeeping-failure-site')
    await mkdir(root)
    let promotions = 0

    await expect(
      initializeSite(root, {
        async promoteFile(stagedFile: string, targetFile: string) {
          promotions += 1
          await link(stagedFile, targetFile)
          throw new Error('injected post-link failure')
        },
      }),
    ).rejects.toThrow('injected post-link failure')

    expect(promotions).toBe(1)
    await expectMissing(path.join(root, '.silen/config.ts'))
    await expectMissing(path.join(root, 'index.mdx'))
    expect(await readdir(root)).toEqual([])
    await expectNoStagingDirectory(root)
  })

  it.each(['EXDEV', 'ENOTSUP', 'EOPNOTSUPP', 'EPERM'])(
    'falls back to exclusive file creation when hard links fail with %s',
    async (code) => {
      const root = path.join(parent, `fallback-${code.toLowerCase()}-site`)
      let hardLinkAttempts = 0

      const result = await initializeSite(root, {
        promoteFile() {
          hardLinkAttempts += 1
          return Promise.reject(
            Object.assign(new Error(`injected ${code}`), { code }),
          )
        },
      })

      expect(hardLinkAttempts).toBe(2)
      expect(result.createdPaths).toEqual([
        path.join(root, '.silen/config.ts'),
        path.join(root, 'index.mdx'),
      ])
      expect(
        await readFile(path.join(root, '.silen/config.ts'), 'utf8'),
      ).toContain("title: 'My Silen Site'")
      expect(await readFile(path.join(root, 'index.mdx'), 'utf8')).toContain(
        'Start writing',
      )
      await expectNoStagingDirectory(root)
    },
  )

  it('rolls back an exclusive fallback target after later failure', async () => {
    const root = path.join(parent, 'fallback-rollback-site')
    let hardLinkAttempts = 0

    await expect(
      initializeSite(root, {
        promoteFile() {
          hardLinkAttempts += 1
          return Promise.reject(
            Object.assign(new Error('injected EXDEV'), { code: 'EXDEV' }),
          )
        },
        afterPromote() {
          return Promise.reject(
            new Error('injected fallback bookkeeping failure'),
          )
        },
      }),
    ).rejects.toThrow('injected fallback bookkeeping failure')

    expect(hardLinkAttempts).toBe(1)
    await expectMissing(path.join(root, '.silen/config.ts'))
    await expectMissing(path.join(root, 'index.mdx'))
    await expectMissing(root)
    await expectNoStagingDirectory(root)
  })

  it('removes an unchanged exclusive partial target after a write failure', async () => {
    const root = path.join(parent, 'fallback-partial-write-site')
    const failure = Object.assign(new Error('injected partial write failure'), {
      code: 'ENOSPC',
    })

    const error = await initializeSiteWithExclusivePromotionHooks(root, {
      promoteFile() {
        return Promise.reject(
          Object.assign(new Error('injected EXDEV'), { code: 'EXDEV' }),
        )
      },
      exclusivePromotionHooks: {
        async writeFile(handle, contents) {
          const partial = contents.subarray(0, 32)
          await handle.write(partial, 0, partial.length, 0)
          throw failure
        },
      },
    }).catch((caught: unknown) => caught)

    expect(error).toBe(failure)
    await expectMissing(path.join(root, '.silen/config.ts'))
    await expectMissing(path.join(root, 'index.mdx'))
    await expectMissing(root)
    await expectNoStagingDirectory(root)

    await expect(initializeSite(root)).resolves.toMatchObject({ root })
  })

  it('removes an unchanged exclusive target after sync and close failures', async () => {
    const root = path.join(parent, 'fallback-sync-close-site')
    const syncFailure = Object.assign(new Error('injected sync failure'), {
      code: 'EIO',
    })
    const closeFailure = Object.assign(new Error('injected close failure'), {
      code: 'EIO',
    })

    const error = await initializeSiteWithExclusivePromotionHooks(root, {
      promoteFile() {
        return Promise.reject(
          Object.assign(new Error('injected EXDEV'), { code: 'EXDEV' }),
        )
      },
      exclusivePromotionHooks: {
        sync() {
          return Promise.reject(syncFailure)
        },
        async close(handle) {
          await handle.close()
          throw closeFailure
        },
      },
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as Error).message).toContain('injected sync failure')
    expect((error as Error).message).toContain('injected close failure')
    expect((error as Error & { cause?: unknown }).cause).toBe(syncFailure)
    await expectMissing(path.join(root, '.silen/config.ts'))
    await expectMissing(path.join(root, 'index.mdx'))
    await expectMissing(root)
    await expectNoStagingDirectory(root)

    await expect(initializeSite(root)).resolves.toMatchObject({ root })
  })

  it('removes an unchanged exclusive target after final stat failure', async () => {
    const root = path.join(parent, 'fallback-final-stat-site')
    const failure = Object.assign(new Error('injected final stat failure'), {
      code: 'EIO',
    })

    const error = await initializeSiteWithExclusivePromotionHooks(root, {
      promoteFile() {
        return Promise.reject(
          Object.assign(new Error('injected EXDEV'), { code: 'EXDEV' }),
        )
      },
      exclusivePromotionHooks: {
        finalStat() {
          return Promise.reject(failure)
        },
      },
    }).catch((caught: unknown) => caught)

    expect(error).toBe(failure)
    await expectMissing(path.join(root, '.silen/config.ts'))
    await expectMissing(path.join(root, 'index.mdx'))
    await expectMissing(root)
    await expectNoStagingDirectory(root)

    await expect(initializeSite(root)).resolves.toMatchObject({ root })
  })

  it('preserves a user edit made after an exclusive failure snapshot', async () => {
    const root = path.join(parent, 'fallback-post-snapshot-edit-site')
    const configFile = path.join(root, '.silen/config.ts')
    const failure = Object.assign(new Error('injected partial write failure'), {
      code: 'ENOSPC',
    })
    let identityBeforeEdit: Awaited<ReturnType<typeof lstat>> | undefined

    const error = await initializeSiteWithExclusivePromotionHooks(root, {
      promoteFile() {
        return Promise.reject(
          Object.assign(new Error('injected EXDEV'), { code: 'EXDEV' }),
        )
      },
      exclusivePromotionHooks: {
        async writeFile(handle, contents) {
          const partial = contents.subarray(0, 32)
          await handle.write(partial, 0, partial.length, 0)
          throw failure
        },
        async afterFailureSnapshot(target) {
          identityBeforeEdit = await lstat(target)
          await writeFile(target, 'user edit after partial snapshot\n')
          const edited = await lstat(target)
          expect(edited.dev).toBe(identityBeforeEdit.dev)
          expect(edited.ino).toBe(identityBeforeEdit.ino)
        },
      },
    }).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as Error).message).toContain('injected partial write failure')
    expect((error as Error).message).toMatch(
      /rollback.*(?:content|metadata).*config\.ts/i,
    )
    expect(await readFile(configFile, 'utf8')).toBe(
      'user edit after partial snapshot\n',
    )
    await expectMissing(path.join(root, 'index.mdx'))
    await expectNoStagingDirectory(root)
  })

  it('creates a new root beneath missing parent components', async () => {
    const root = path.join(parent, 'nested', 'missing', 'site')

    const result = await runInit(root)

    expect(result.exitCode, result.all).toBe(0)
    expect(await readdir(root)).toEqual(['.silen', 'index.mdx'])
    expect(await readdir(path.join(root, '.silen'))).toEqual(['config.ts'])
    await expectNoStagingDirectory(root)
  })

  it('removes command-created parent components after staged write failure', async () => {
    const nestedParent = path.join(parent, 'failed-nested')
    const root = path.join(nestedParent, 'missing', 'site')

    await expect(
      initializeSite(root, {
        writeStagedFile() {
          return Promise.reject(new Error('injected nested staging failure'))
        },
      }),
    ).rejects.toThrow('injected nested staging failure')

    await expectMissing(nestedParent)
  })

  it('rolls back a successful scaffold when staging removal fails', async () => {
    const root = path.join(parent, 'cleanup-after-success-site')
    let stagingPath = ''

    const error = await initializeSite(root, {
      removeStaging(staging) {
        stagingPath = staging
        return Promise.reject(new Error('injected staging removal failure'))
      },
    }).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain(
      'injected staging removal failure',
    )
    expect(stagingPath).not.toBe('')
    await access(stagingPath)
    await expectMissing(path.join(root, '.silen/config.ts'))
    await expectMissing(path.join(root, 'index.mdx'))
    await expectMissing(root)
  })

  it('rejects a successful no-op staging remover and rolls back', async () => {
    const root = path.join(parent, 'cleanup-noop-site')
    let stagingPath = ''

    const error = await initializeSite(root, {
      removeStaging(staging) {
        stagingPath = staging
        return Promise.resolve()
      },
    }).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/staging.*still exists|cleanup/i)
    expect(stagingPath).not.toBe('')
    await access(stagingPath)
    await expectMissing(path.join(root, '.silen/config.ts'))
    await expectMissing(path.join(root, 'index.mdx'))
    await expectMissing(root)
  })

  it('reports operation and staging cleanup failures after rollback', async () => {
    const root = path.join(parent, 'cleanup-after-operation-failure-site')
    let stagingPath = ''

    const error = await initializeSite(root, {
      afterPromote() {
        return Promise.reject(new Error('injected operation failure'))
      },
      removeStaging(staging) {
        stagingPath = staging
        return Promise.reject(new Error('injected cleanup failure'))
      },
    }).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toHaveLength(2)
    expect((error as Error).message).toContain('injected operation failure')
    expect((error as Error).message).toContain('injected cleanup failure')
    expect((error as Error & { cause?: unknown }).cause).toMatchObject({
      message: 'injected operation failure',
    })
    expect(stagingPath).not.toBe('')
    await access(stagingPath)
    await expectMissing(path.join(root, '.silen/config.ts'))
    await expectMissing(path.join(root, 'index.mdx'))
    await expectMissing(root)
  })

  it('continues rollback after a promoted-file inspection failure', async () => {
    const root = path.join(parent, 'rollback-file-stat-failure-site')
    const configFile = path.join(root, '.silen/config.ts')
    const homepage = path.join(root, 'index.mdx')
    const inspected: string[] = []
    const removedFiles: string[] = []
    const removedDirectories: string[] = []

    const error = await initializeSiteWithRollbackHooks(root, {
      afterPromote(target) {
        return target === homepage
          ? Promise.reject(new Error('injected operation failure'))
          : Promise.resolve()
      },
      rollbackHooks: {
        async inspect(target) {
          inspected.push(target)
          if (target === homepage) {
            throw Object.assign(new Error('injected file stat failure'), {
              code: 'EIO',
            })
          }
          return optionalLstat(target)
        },
        async removeFile(target) {
          removedFiles.push(target)
          await rm(target, { force: true })
        },
        async removeDirectory(target) {
          removedDirectories.push(target)
          await rmdir(target)
        },
      },
    }).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as Error).message).toMatch(
      /rollback.*inspect.*index\.mdx.*file stat failure/i,
    )
    expect(inspected).toEqual([
      homepage,
      configFile,
      path.join(root, '.silen'),
      root,
    ])
    expect(removedFiles).toEqual([configFile])
    expect(removedDirectories).toEqual([path.join(root, '.silen'), root])
    await access(homepage)
    await expectMissing(configFile)
  })

  it('continues rollback after a promoted-file removal failure', async () => {
    const root = path.join(parent, 'rollback-file-rm-failure-site')
    const configFile = path.join(root, '.silen/config.ts')
    const homepage = path.join(root, 'index.mdx')
    const removedFiles: string[] = []
    const removedDirectories: string[] = []

    const error = await initializeSiteWithRollbackHooks(root, {
      afterPromote(target) {
        return target === homepage
          ? Promise.reject(new Error('injected operation failure'))
          : Promise.resolve()
      },
      rollbackHooks: {
        inspect: optionalLstat,
        async removeFile(target) {
          removedFiles.push(target)
          if (target === homepage) {
            throw Object.assign(new Error('injected file rm failure'), {
              code: 'EACCES',
            })
          }
          await rm(target, { force: true })
        },
        async removeDirectory(target) {
          removedDirectories.push(target)
          await rmdir(target)
        },
      },
    }).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as Error).message).toMatch(
      /rollback.*remove.*index\.mdx.*file rm failure/i,
    )
    expect(removedFiles).toEqual([homepage, configFile])
    expect(removedDirectories).toEqual([path.join(root, '.silen'), root])
    await access(homepage)
    await expectMissing(configFile)
  })

  it('continues rollback after a created-directory inspection failure', async () => {
    const root = path.join(parent, 'rollback-directory-stat-failure-site')
    const configDirectory = path.join(root, '.silen')
    const homepage = path.join(root, 'index.mdx')
    const inspected: string[] = []
    const removedDirectories: string[] = []

    const error = await initializeSiteWithRollbackHooks(root, {
      afterPromote(target) {
        return target === homepage
          ? Promise.reject(new Error('injected operation failure'))
          : Promise.resolve()
      },
      rollbackHooks: {
        async inspect(target) {
          inspected.push(target)
          if (target === configDirectory) {
            throw Object.assign(new Error('injected directory stat failure'), {
              code: 'EIO',
            })
          }
          return optionalLstat(target)
        },
        async removeFile(target) {
          await rm(target, { force: true })
        },
        async removeDirectory(target) {
          removedDirectories.push(target)
          await rmdir(target)
        },
      },
    }).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as Error).message).toMatch(
      /rollback.*inspect.*\.silen.*directory stat failure/i,
    )
    expect(inspected).toContain(root)
    expect(removedDirectories).toEqual([root])
    await access(configDirectory)
    await expectMissing(homepage)
  })

  it('continues rollback after a created-directory removal failure', async () => {
    const root = path.join(parent, 'rollback-directory-rmdir-failure-site')
    const configDirectory = path.join(root, '.silen')
    const homepage = path.join(root, 'index.mdx')
    const removedDirectories: string[] = []

    const error = await initializeSiteWithRollbackHooks(root, {
      afterPromote(target) {
        return target === homepage
          ? Promise.reject(new Error('injected operation failure'))
          : Promise.resolve()
      },
      rollbackHooks: {
        inspect: optionalLstat,
        async removeFile(target) {
          await rm(target, { force: true })
        },
        async removeDirectory(target) {
          removedDirectories.push(target)
          if (target === configDirectory) {
            throw Object.assign(new Error('injected directory rmdir failure'), {
              code: 'EACCES',
            })
          }
          await rmdir(target)
        },
      },
    }).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as Error).message).toMatch(
      /rollback.*remove.*\.silen.*directory rmdir failure/i,
    )
    expect(removedDirectories).toEqual([configDirectory, root])
    await access(configDirectory)
    await expectMissing(homepage)
  })

  it('aggregates every rollback failure with operation and cleanup failures', async () => {
    const root = path.join(parent, 'rollback-multiple-failures-site')
    const configFile = path.join(root, '.silen/config.ts')
    const homepage = path.join(root, 'index.mdx')
    const configDirectory = path.join(root, '.silen')
    const rollbackAttempts: string[] = []

    const error = await initializeSiteWithRollbackHooks(root, {
      afterPromote(target) {
        return target === homepage
          ? Promise.reject(new Error('injected operation failure'))
          : Promise.resolve()
      },
      removeStaging() {
        return Promise.reject(new Error('injected cleanup failure'))
      },
      rollbackHooks: {
        async inspect(target) {
          rollbackAttempts.push(`inspect:${target}`)
          return optionalLstat(target)
        },
        removeFile(target) {
          rollbackAttempts.push(`remove-file:${target}`)
          return Promise.reject(
            Object.assign(new Error(`injected rm failure for ${target}`), {
              code: 'EACCES',
            }),
          )
        },
        removeDirectory(target) {
          rollbackAttempts.push(`remove-directory:${target}`)
          return Promise.reject(
            Object.assign(new Error(`injected rmdir failure for ${target}`), {
              code: 'EACCES',
            }),
          )
        },
      },
    }).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(AggregateError)
    const outer = error as AggregateError
    const outerErrors = outer.errors as unknown[]
    expect(outerErrors).toHaveLength(3)
    expect(outerErrors[0]).toMatchObject({
      message: 'injected operation failure',
    })
    expect(outerErrors[1]).toBeInstanceOf(Error)
    expect((outerErrors[1] as Error).message).toContain(
      'injected cleanup failure',
    )
    expect(outerErrors[2]).toBeInstanceOf(AggregateError)
    expect((outerErrors[2] as AggregateError).errors).toHaveLength(4)
    expect((outer as Error & { cause?: unknown }).cause).toBe(outerErrors[0])
    expect(rollbackAttempts).toEqual([
      `inspect:${homepage}`,
      `remove-file:${homepage}`,
      `inspect:${configFile}`,
      `remove-file:${configFile}`,
      `inspect:${configDirectory}`,
      `remove-directory:${configDirectory}`,
      `inspect:${root}`,
      `remove-directory:${root}`,
    ])
  })

  it('safely removes staging after the snapshot hook fails', async () => {
    const root = path.join(parent, 'staging-snapshot-failure-site')
    let stagingPath = ''

    await expect(
      initializeSite(root, {
        snapshotStaging(staging) {
          stagingPath = staging
          return Promise.reject(new Error('injected staging snapshot failure'))
        },
      }),
    ).rejects.toThrow('injected staging snapshot failure')

    expect(stagingPath).not.toBe('')
    await expectMissing(stagingPath)
    await expectMissing(root)
  })

  it('preserves an empty staging replacement swapped by the snapshot hook', async () => {
    const root = path.join(parent, 'staging-provisional-replacement-site')
    let stagingPath = ''
    let displacedStaging = ''

    const error = await initializeSite(root, {
      async snapshotStaging(staging) {
        stagingPath = staging
        displacedStaging = `${staging}-owned`
        await rename(staging, displacedStaging)
        await mkdir(staging)
        throw new Error('injected snapshot replacement failure')
      },
    }).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as Error).message).toContain(
      'injected snapshot replacement failure',
    )
    expect((error as Error).message).toMatch(/staging.*replaced/i)
    await access(stagingPath)
    await access(displacedStaging)
    await expectMissing(root)
  })

  it('preserves a replacement staging identity and rolls back the scaffold', async () => {
    const root = path.join(parent, 'staging-replacement-site')
    let stagingPath = ''
    let displacedStaging = ''

    await expect(
      initializeSite(root, {
        async beforeCleanupStaging(staging) {
          stagingPath = staging
          displacedStaging = `${staging}-owned`
          await rename(staging, displacedStaging)
          await mkdir(staging)
          await writeFile(path.join(staging, 'keep.txt'), 'replacement stays\n')
        },
      }),
    ).rejects.toThrow(/staging.*replaced/i)

    expect(await readFile(path.join(stagingPath, 'keep.txt'), 'utf8')).toBe(
      'replacement stays\n',
    )
    await access(displacedStaging)
    await expectMissing(path.join(root, '.silen/config.ts'))
    await expectMissing(path.join(root, 'index.mdx'))
    await expectMissing(root)
  })

  it('preserves a non-empty staging replacement swapped immediately before removal', async () => {
    const root = path.join(parent, 'staging-last-moment-replacement-site')
    let stagingPath = ''
    let displacedStaging = ''
    let injected = false

    const error = await initializeSiteWithCleanupHooks(root, {
      snapshotStaging(staging) {
        stagingPath = staging
        return Promise.resolve()
      },
      cleanupHooks: {
        async beforeRemove() {
          if (injected) return
          injected = true
          displacedStaging = `${stagingPath}-owned`
          await rename(stagingPath, displacedStaging)
          await mkdir(path.join(stagingPath, 'replacement'), {
            recursive: true,
          })
          await writeFile(
            path.join(stagingPath, 'replacement/keep.txt'),
            'replacement stays\n',
          )
        },
      },
    }).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/staging.*replaced/i)
    expect(
      await readFile(path.join(stagingPath, 'replacement/keep.txt'), 'utf8'),
    ).toBe('replacement stays\n')
    await access(displacedStaging)
    await expectMissing(root)
  })

  it('preserves an unexpected non-empty tree inserted immediately before removal', async () => {
    const root = path.join(parent, 'staging-unexpected-tree-site')
    let stagingPath = ''
    let injected = false

    const error = await initializeSiteWithCleanupHooks(root, {
      snapshotStaging(staging) {
        stagingPath = staging
        return Promise.resolve()
      },
      cleanupHooks: {
        async beforeRemove() {
          if (injected) return
          injected = true
          await mkdir(path.join(stagingPath, 'unexpected/nested'), {
            recursive: true,
          })
          await writeFile(
            path.join(stagingPath, 'unexpected/nested/keep.txt'),
            'unexpected stays\n',
          )
        },
      },
    }).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/unexpected.*staging/i)
    expect(
      await readFile(
        path.join(stagingPath, 'unexpected/nested/keep.txt'),
        'utf8',
      ),
    ).toBe('unexpected stays\n')
    await expectMissing(root)
  })

  it('preserves a known staged leaf replaced before cleanup', async () => {
    const root = path.join(parent, 'staging-leaf-replacement-site')
    let stagingPath = ''
    let displacedConfig = ''

    const error = await initializeSite(root, {
      snapshotStaging(staging) {
        stagingPath = staging
        return Promise.resolve()
      },
      async beforeCleanupStaging() {
        const config = path.join(stagingPath, '.silen/config.ts')
        displacedConfig = `${config}.owned`
        await rename(config, displacedConfig)
        await writeFile(config, 'concurrent replacement\n')
      },
    }).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/staged file.*replaced/i)
    expect(
      await readFile(path.join(stagingPath, '.silen/config.ts'), 'utf8'),
    ).toBe('concurrent replacement\n')
    await access(displacedConfig)
    await expectMissing(root)
  })

  it('preserves a staged symlink created by a custom writer', async () => {
    const root = path.join(parent, 'staging-writer-symlink-site')
    const outside = path.join(parent, 'staging-writer-outside.txt')
    let stagingPath = ''
    await writeFile(outside, 'outside stays\n')

    const error = await initializeSite(root, {
      snapshotStaging(staging) {
        stagingPath = staging
        return Promise.resolve()
      },
      async writeStagedFile(file) {
        await rm(file, { force: true })
        await symlink(outside, file)
        throw new Error('injected staged symlink failure')
      },
    }).catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as Error).message).toContain(
      'injected staged symlink failure',
    )
    expect((error as Error).message).toMatch(/staged file.*replaced|symlink/i)
    expect(
      (
        await lstat(path.join(stagingPath, '.silen/config.ts'))
      ).isSymbolicLink(),
    ).toBe(true)
    expect(await readFile(outside, 'utf8')).toBe('outside stays\n')
    await expectMissing(root)
  })

  it('cleans a partial staged file when a custom writer throws after writing', async () => {
    const root = path.join(parent, 'staging-partial-write-site')
    let writes = 0

    await expect(
      initializeSite(root, {
        async writeStagedFile(file, source) {
          writes += 1
          await writeFile(file, source, 'utf8')
          throw new Error('injected failure after partial staged write')
        },
      }),
    ).rejects.toThrow('injected failure after partial staged write')

    expect(writes).toBe(1)
    await expectMissing(root)
    await expectNoStagingDirectory(root)
  })

  it('does not touch the root when writing staged content fails', async () => {
    const root = path.join(parent, 'staging-failure-site')
    const unrelatedFile = path.join(root, 'notes.txt')
    await mkdir(root)
    await writeFile(unrelatedFile, 'keep staged failure content\n')
    let writes = 0

    await expect(
      initializeSite(root, {
        async writeStagedFile(file: string, source: string) {
          writes += 1
          if (writes === 2) throw new Error('injected staging write failure')
          await writeFile(file, source, 'utf8')
        },
      }),
    ).rejects.toThrow('injected staging write failure')

    expect(writes).toBe(2)
    expect(await readFile(unrelatedFile, 'utf8')).toBe(
      'keep staged failure content\n',
    )
    expect(await readdir(root)).toEqual(['notes.txt'])
    await expectNoStagingDirectory(root)
  })

  it('builds the generated site with search and AI artifacts', async () => {
    const root = path.join(parent, 'buildable-site')
    const initialized = await runInit(root)
    expect(initialized.exitCode, initialized.all).toBe(0)

    const built = await execa(cliRunner, [cli, 'build', root], {
      reject: false,
      all: true,
    })

    expect(built.exitCode, built.all).toBe(0)
    const output = path.join(root, '.silen/dist')
    expect(await readFile(path.join(output, 'index.html'), 'utf8')).toContain(
      'My Silen Site',
    )
    await Promise.all(
      [
        'search-index.json',
        'llms.txt',
        'llms-full.txt',
        'ai-index.json',
        'index.md',
        '.well-known/silen/manifest.json',
      ].map((relativeFile) => access(path.join(output, relativeFile))),
    )
  }, 60_000)
})
