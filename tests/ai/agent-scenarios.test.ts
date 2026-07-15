import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createWorkspace } from '../../src/ai/workspace'
import {
  readToolDescriptors,
  writeToolDescriptors,
} from '../../src/ai/mcp/contracts'
import { build } from '../../src/node/build'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  )
})

async function temporaryRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.resolve(`tests/fixtures/.${prefix}-`))
  temporaryRoots.push(root)
  return root
}

describe('deterministic Agent scenarios', () => {
  it('creates a minimal site from only the packaged task and API contract', async () => {
    const [task, apiSource] = await Promise.all([
      readFile(path.resolve('dist/agent/tasks/create-site.md'), 'utf8'),
      readFile(path.resolve('dist/agent/api.json'), 'utf8'),
    ])
    const api = JSON.parse(apiSource) as {
      config: { fields: Array<{ path: string }> }
      cli: { commands: Array<{ id: string }> }
    }
    expect(task).toContain('id: create-site')
    expect(api.config.fields.map((field) => field.path)).toContain('title')
    expect(api.cli.commands.map((command) => command.id)).toContain('build')

    const root = await temporaryRoot('agent-create')
    await mkdir(path.join(root, '.silen'))
    await Promise.all([
      writeFile(
        path.join(root, '.silen/config.ts'),
        `import { defineConfig } from ${JSON.stringify(path.resolve('src/index'))}\nexport default defineConfig({ title: 'Agent-created docs', description: 'Created from the packaged Agent Contract.' })\n`,
      ),
      writeFile(
        path.join(root, 'index.mdx'),
        '# Agent-created docs\n\nThis site follows the installed Silen contract.\n',
      ),
    ])

    const built = await build(root)
    const workspace = await createWorkspace(root)
    await workspace.reindex()
    const audit = await workspace.audit()

    expect(built.routes.map((route) => route.path)).toContain('/')
    expect(audit).toMatchObject({ ok: true, filesChecked: 1, issues: [] })
    await expect(
      readFile(
        path.join(built.outDir, '.well-known/silen/manifest.json'),
        'utf8',
      ),
    ).resolves.toContain('"kind": "silen-site"')
  })

  it('discovers, explicitly writes, audits, builds, and returns a reviewable diff', async () => {
    const root = await temporaryRoot('agent-maintain')
    await cp(path.resolve('tests/fixtures/ai-workspace'), root, {
      recursive: true,
    })
    const firstBuild = await build(root)
    const manifest = JSON.parse(
      await readFile(
        path.join(firstBuild.outDir, '.well-known/silen/manifest.json'),
        'utf8',
      ),
    ) as { kind: string; capabilities: { mcp: { readOnlyByDefault: boolean } } }

    expect(manifest).toMatchObject({
      kind: 'silen-site',
      capabilities: { mcp: { readOnlyByDefault: true } },
    })
    expect(readToolDescriptors.map((tool) => tool.name)).not.toEqual(
      expect.arrayContaining(['write', 'link', 'append']),
    )
    expect(
      writeToolDescriptors.every((tool) => tool.requiresExplicitAuthorization),
    ).toBe(true)

    const workspace = await createWorkspace(root)
    const before = await readFile(path.join(root, 'index.mdx'), 'utf8')
    const changed = await workspace.write({
      path: 'index.mdx',
      content: `${before.trimEnd()}\n\n## Agent maintenance\n\nThis bounded update was explicitly authorized.\n`,
    })
    await workspace.reindex()
    await build(root)
    const [audit, preflight] = await Promise.all([
      workspace.audit(),
      workspace.build(),
    ])

    expect(changed).toMatchObject({
      path: 'index.mdx',
      created: false,
    })
    expect(changed.diff).toContain('+## Agent maintenance')
    expect(changed.diff).not.toContain(root)
    expect(audit.ok).toBe(true)
    expect(preflight.ok).toBe(true)
  })
})
