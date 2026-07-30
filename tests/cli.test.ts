import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execa } from 'execa'
import { SILEN_VERSION } from '../src/shared/version'

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
    expect(help.stdout).toContain('ai <action> [path]')
    expect(help.stdout).toContain('mcp [root]')

    const version = await execa(cliRunner, [cli, '--version'])
    expect(version.stdout).toContain(`silen/${SILEN_VERSION}`)
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

    await writeFile(
      path.join(site, '.silen/ai-evals.json'),
      JSON.stringify({
        schemaVersion: 1,
        cases: [
          {
            id: 'built-page',
            query: 'Built by the packed CLI',
            expected: { route: '/' },
          },
        ],
      }),
    )

    const passed = await execa(cliRunner, [cli, 'ai', 'eval', site], {
      reject: false,
      all: true,
    })
    expect(passed.exitCode, passed.all).toBe(0)
    expect(passed.stdout).toContain('1/1 passed')

    const json = await execa(cliRunner, [cli, 'ai', 'eval', site, '--json'], {
      reject: false,
      all: true,
    })
    expect(json.exitCode, json.all).toBe(0)
    expect(JSON.parse(json.stdout)).toMatchObject({
      schemaVersion: 1,
      ok: true,
      summary: { total: 1, passed: 1, failed: 0 },
    })
  }, 30_000)

  it('materializes the packaged read-only Agent Skill only at an explicit destination', async () => {
    const destination = path.join(root, 'agent-skills')
    const installed = await execa(
      cliRunner,
      [cli, 'ai', 'skills', destination],
      { reject: false, all: true },
    )
    const skill = path.join(destination, 'silen-docs-readonly')

    expect(installed.exitCode, installed.all).toBe(0)
    expect(installed.stdout).toContain(`Created ${skill}`)
    expect(await readFile(path.join(skill, 'SKILL.md'), 'utf8')).toContain(
      'name: silen-docs-readonly',
    )
    expect(
      await readFile(path.join(skill, 'references/read-site.md'), 'utf8'),
    ).toContain('# Read a deployed Silen site')
    await expect(stat(path.join(destination, '.silen'))).rejects.toMatchObject({
      code: 'ENOENT',
    })

    const repeated = await execa(
      cliRunner,
      [cli, 'ai', 'skills', destination],
      { reject: false, all: true },
    )
    expect(repeated.exitCode).not.toBe(0)
    expect(repeated.all).toContain('SILEN_AGENT_SKILL_TARGET_EXISTS')

    const missing = await execa(cliRunner, [cli, 'ai', 'skills'], {
      reject: false,
      all: true,
    })
    expect(missing.exitCode).not.toBe(0)
    expect(missing.all).toContain('Silen ai skills requires a destination path')
  }, 30_000)

  it('uses stable AI eval failure and setup exit codes', async () => {
    const site = path.join(root, 'site')
    await writeFile(
      path.join(site, '.silen/ai-evals.json'),
      JSON.stringify({
        schemaVersion: 1,
        cases: [
          {
            id: 'wrong-route',
            query: 'Built by the packed CLI',
            expected: { route: '/missing/' },
          },
        ],
      }),
    )
    const failed = await execa(cliRunner, [cli, 'ai', 'eval', site], {
      reject: false,
      all: true,
    })
    expect(failed.exitCode, failed.all).toBe(1)
    expect(failed.stdout).toContain('0/1 passed (1 failed)')
    expect(failed.stdout).toContain('1. /')

    await writeFile(
      path.join(site, '.silen/ai-evals.json'),
      JSON.stringify({
        schemaVersion: 2,
        topK: 1,
        cases: [
          {
            id: 'ranked-miss',
            query: 'Built by the packed CLI',
            expected: { route: '/missing/', maxRank: 1 },
          },
        ],
      }),
    )
    const ranked = await execa(cliRunner, [cli, 'ai', 'eval', site, '--json'], {
      reject: false,
      all: true,
    })
    expect(ranked.exitCode, ranked.all).toBe(1)
    expect(JSON.parse(ranked.stdout)).toMatchObject({
      schemaVersion: 2,
      ok: false,
      cases: [
        {
          id: 'ranked-miss',
          expected: { route: '/missing/', maxRank: 1 },
          matchedRank: null,
        },
      ],
    })

    await writeFile(
      path.join(site, '.silen/ai-evals.json'),
      JSON.stringify({
        schemaVersion: 3,
        topK: 1,
        cases: [
          {
            id: 'forbidden-built-page',
            query: 'Built by the packed CLI',
            expected: {
              acceptable: [],
              forbidden: [{ route: '/' }],
              maxRank: 1,
            },
          },
        ],
      }),
    )
    const forbidden = await execa(
      cliRunner,
      [cli, 'ai', 'eval', site, '--json'],
      { reject: false, all: true },
    )
    expect(forbidden.exitCode, forbidden.all).toBe(1)
    expect(JSON.parse(forbidden.stdout)).toMatchObject({
      schemaVersion: 3,
      ok: false,
      cases: [
        {
          id: 'forbidden-built-page',
          matchedTarget: null,
          matchedRank: null,
          forbiddenMatches: [{ target: { route: '/' }, rank: 1 }],
        },
      ],
    })

    const missingSuite = path.join(root, 'missing-suite')
    await mkdir(missingSuite)
    const missing = await execa(cliRunner, [cli, 'ai', 'eval', missingSuite], {
      reject: false,
      all: true,
    })
    expect(missing.exitCode, missing.all).toBe(2)
    expect(missing.stdout).toContain('.silen/ai-evals.json')

    const missingJson = await execa(
      cliRunner,
      [cli, 'ai', 'eval', missingSuite, '--json'],
      { reject: false, all: true },
    )
    expect(missingJson.exitCode, missingJson.all).toBe(2)
    expect(JSON.parse(missingJson.stdout)).toMatchObject({
      schemaVersion: 1,
      ok: false,
      error: { code: 'SUITE_MISSING', path: '.silen/ai-evals.json' },
    })

    const missingIndex = path.join(root, 'missing-index')
    await mkdir(path.join(missingIndex, '.silen'), { recursive: true })
    await writeFile(
      path.join(missingIndex, '.silen/ai-evals.json'),
      JSON.stringify({
        schemaVersion: 1,
        cases: [{ id: 'page', query: 'page', expected: { route: '/' } }],
      }),
    )
    const unbuilt = await execa(cliRunner, [cli, 'ai', 'eval', missingIndex], {
      reject: false,
      all: true,
    })
    expect(unbuilt.exitCode, unbuilt.all).toBe(2)
    expect(unbuilt.stdout).toContain('silen build <root>')
  }, 30_000)
})
