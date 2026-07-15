import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execa } from 'execa'

const temporaryDirectories: string[] = []
const cliRunner = path.resolve('node_modules/.bin/jiti')
const cli = path.resolve('src/node/cli.ts')
let root: string

async function createSite(
  parent: string,
  configImport: string,
): Promise<string> {
  const site = path.join(parent, 'site')
  await mkdir(path.join(site, '.silen'), { recursive: true })
  await Promise.all([
    writeFile(
      path.join(site, '.silen/config.ts'),
      `import { defineConfig } from ${JSON.stringify(configImport)}
export default defineConfig({ title: 'CLI fixture', base: '/cli/' })
`,
    ),
    writeFile(path.join(site, 'index.mdx'), '# Built by the packed CLI\n'),
  ])
  return site
}

beforeAll(async () => {
  const testTemp = path.resolve('.silen/.temp/tests')
  await mkdir(testTemp, { recursive: true })
  root = await mkdtemp(path.join(testTemp, 'silen-cli-'))
  temporaryDirectories.push(root)
  await createSite(root, path.resolve('src/index.ts'))
})

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  )
})

describe('CLI dispatch', () => {
  it('prints the primary, AI, and MCP commands and version', async () => {
    const help = await execa(cliRunner, [cli, '--help'])
    expect(help.stdout).toContain('dev [root]')
    expect(help.stdout).toContain('build [root]')
    expect(help.stdout).toContain('preview [root]')
    expect(help.stdout).toContain('ai <action> [root]')
    expect(help.stdout).toContain('mcp [root]')

    const version = await execa(cliRunner, [cli, '--version'])
    expect(version.stdout).toContain('silen/0.1.0-alpha.1')
  })

  it('awaits a successful build and writes static HTML', async () => {
    const site = path.join(root, 'site')
    const result = await execa(cliRunner, [cli, 'build', site], {
      reject: false,
      all: true,
    })

    expect(result.exitCode, result.all).toBe(0)
    expect(result.all).toContain('built')
    expect(
      await readFile(path.join(site, '.silen/dist/index.html'), 'utf8'),
    ).toContain('<h1>Built by the packed CLI</h1>')
  }, 60_000)

  it('reports actionable errors and exits nonzero', async () => {
    const result = await execa(
      cliRunner,
      [cli, 'dev', path.join(root, 'site'), '--port', 'invalid'],
      { reject: false, all: true },
    )

    expect(result.exitCode).not.toBe(0)
    expect(result.all).toContain('Silen dev failed')
    expect(result.all).toContain('port')
  })

  it('reports unknown commands with a nonzero status', async () => {
    const result = await execa(cliRunner, [cli, 'unknown'], {
      reject: false,
      all: true,
    })
    expect(result.exitCode).not.toBe(0)
    expect(result.all).toContain('Unknown command')
  })

  it('initializes, indexes, and audits the local AI workspace', async () => {
    const site = path.join(root, 'site')
    const initialized = await execa(cliRunner, [cli, 'ai', 'init', site])
    expect(initialized.stdout).toContain('Initialized')

    const indexed = await execa(cliRunner, [cli, 'ai', 'index', site])
    expect(JSON.parse(indexed.stdout)).toMatchObject({
      fileCount: 1,
      index: '.silen/ai/index.json',
    })

    const audited = await execa(cliRunner, [cli, 'ai', 'audit', site])
    expect(JSON.parse(audited.stdout)).toMatchObject({ ok: true, issues: [] })
  }, 30_000)
})
