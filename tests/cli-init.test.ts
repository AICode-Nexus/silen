import {
  access,
  link,
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

    await expect(
      initializeSite(root, {
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
      }),
    ).rejects.toThrow('injected promotion race')

    expect(await readFile(configFile, 'utf8')).toBe(
      'concurrent unrelated content\n',
    )
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

  it.each(['EXDEV', 'EOPNOTSUPP'])(
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
