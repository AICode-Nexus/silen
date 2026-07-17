import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generateAiArtifacts } from '../../src/ai/artifacts'
import { generateSiteContract } from '../../src/ai/contract/site'
import { build, type BuildResult } from '../../src/node/build'
import { resolveConfig } from '../../src/node/config'
import { SILEN_VERSION } from '../../src/shared/version'

const root = path.resolve('tests/fixtures/ai-contract-site')
const assetDir = path.resolve('dist/agent')
let result: BuildResult

beforeAll(async () => {
  result = await build(root)
})

afterAll(async () => {
  await rm(path.join(root, '.silen/dist'), { recursive: true, force: true })
  await rm(path.join(root, '.silen/.temp'), { recursive: true, force: true })
})

describe('Site Agent Contract', () => {
  it('emits a base-aware bilingual contract with explicit public additions', async () => {
    const contractRoot = path.join(result.outDir, '.well-known/silen')
    const [manifestSource, apiSource, guide, customTask, llms] =
      await Promise.all([
        readFile(path.join(contractRoot, 'manifest.json'), 'utf8'),
        readFile(path.join(contractRoot, 'api.json'), 'utf8'),
        readFile(path.join(contractRoot, 'guide.md'), 'utf8'),
        readFile(path.join(contractRoot, 'tasks/summarize-site.md'), 'utf8'),
        readFile(path.join(result.outDir, 'llms.txt'), 'utf8'),
      ])
    const manifest = JSON.parse(manifestSource) as {
      kind: string
      generator: { version: string }
      resources: Array<{ id: string; url: string }>
      tasks: Array<{ id: string; url: string }>
    }
    const api = JSON.parse(apiSource) as {
      config: { fields: unknown[] }
      cli: { commands: unknown[] }
      mcp: { tools: unknown[] }
      exports: unknown[]
    }

    expect(manifest.kind).toBe('silen-site')
    expect(manifest.generator.version).toBe(SILEN_VERSION)
    expect(manifest.resources).toContainEqual(
      expect.objectContaining({
        id: 'silen-manifest',
        url: '/handbook/.well-known/silen/manifest.json',
      }),
    )
    expect(manifest.resources.map((resource) => resource.id)).not.toContain(
      'llms-full',
    )
    expect(manifest.resources.map((resource) => resource.id)).not.toContain(
      'ai-index',
    )
    expect(manifest.tasks).toContainEqual(
      expect.objectContaining({
        id: 'summarize-site',
        url: '/handbook/.well-known/silen/tasks/summarize-site.md',
      }),
    )
    expect(api.config.fields).toHaveLength(16)
    expect(api.cli.commands).toHaveLength(6)
    expect(api.mcp.tools).toHaveLength(10)
    expect(api.exports.length).toBeGreaterThan(100)
    expect(guide).toContain('# Public site instructions')
    expect(customTask).toContain('id: summarize-site')
    expect(llms).toContain(
      '[Silen Agent Contract](/handbook/.well-known/silen/manifest.json)',
    )
    await access(path.join(contractRoot, 'locales/zh-CN/tasks/create-site.md'))

    const publicContract = `${manifestSource}\n${apiSource}\n${guide}\n${customTask}`
    for (const forbidden of [
      root,
      process.cwd(),
      'LOCAL_AGENT_SECRET_MUST_NOT_SHIP',
      'LOCAL_CLAUDE_SECRET_MUST_NOT_SHIP',
    ]) {
      expect(publicContract).not.toContain(forbidden)
    }
  })

  it('supports root-base output and disables only the new contract layer', async () => {
    const config = await resolveConfig(root, 'build')
    const rootOutput = await mkdtemp(
      path.join(os.tmpdir(), 'silen-root-contract-'),
    )
    const disabledOutput = await mkdtemp(
      path.join(os.tmpdir(), 'silen-disabled-contract-'),
    )
    try {
      await generateSiteContract({
        outDir: rootOutput,
        assetDir,
        config: { ...config, base: '/', outDir: rootOutput },
      })
      const rootManifest = await readFile(
        path.join(rootOutput, '.well-known/silen/manifest.json'),
        'utf8',
      )
      expect(rootManifest).toContain(
        '"url": "/.well-known/silen/manifest.json"',
      )

      const disabledConfig = {
        ...config,
        outDir: disabledOutput,
        ai: {
          ...config.ai,
          index: true,
          contract: { ...config.ai.contract, enabled: false },
        },
      }
      await generateAiArtifacts({
        outDir: disabledOutput,
        site: disabledConfig,
        pages: [{ route: '/', title: 'Home', markdown: '# Home\n' }],
        config: disabledConfig.ai,
      })
      await expect(
        generateSiteContract({
          outDir: disabledOutput,
          assetDir,
          config: disabledConfig,
        }),
      ).resolves.toEqual({ files: [] })
      await access(path.join(disabledOutput, 'llms.txt'))
      await access(path.join(disabledOutput, 'ai-index.json'))
      await expect(
        access(path.join(disabledOutput, '.well-known/silen/manifest.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' })
      expect(
        await readFile(path.join(disabledOutput, 'llms.txt'), 'utf8'),
      ).not.toContain('Silen Agent Contract')
    } finally {
      await Promise.all([
        rm(rootOutput, { recursive: true, force: true }),
        rm(disabledOutput, { recursive: true, force: true }),
      ])
    }
  })

  it('refuses a pre-existing reserved contract output', async () => {
    const config = await resolveConfig(root, 'build')
    const outDir = await mkdtemp(
      path.join(os.tmpdir(), 'silen-contract-collision-'),
    )
    try {
      await mkdir(path.join(outDir, '.well-known/silen'), { recursive: true })
      await expect(
        generateSiteContract({ outDir, assetDir, config }),
      ).rejects.toThrow('Reserved output collision at .well-known/silen')
    } finally {
      await rm(outDir, { recursive: true, force: true })
    }
  })
})
