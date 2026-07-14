import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { createWorkspace } from '../../src/ai/workspace'

const fixture = path.resolve('tests/fixtures/ai-workspace')

afterAll(async () => {
  await Promise.all([
    rm(path.join(fixture, '.silen/ai'), { force: true, recursive: true }),
    rm(path.join(fixture, '.silen/dist'), { force: true, recursive: true }),
    rm(path.join(fixture, '.silen/.temp'), { force: true, recursive: true }),
    rm(path.join(fixture, 'wiki'), { force: true, recursive: true }),
  ])
})

describe('read-only AI workspace', () => {
  it('rejects traversal, absolute paths, and escaping symlinks', async () => {
    const boundaryFixture = await mkdtemp(
      path.resolve('tests/fixtures/.ai-workspace-boundary-'),
    )
    await cp(fixture, boundaryFixture, { recursive: true })
    const workspace = await createWorkspace(boundaryFixture)
    const escapeLink = path.join(boundaryFixture, 'escape-link')
    await symlink(path.resolve('tests/fixtures/secret.txt'), escapeLink)
    try {
      await expect(workspace.read('../secret.txt')).rejects.toThrow(
        'Path is outside the content root',
      )
      await expect(
        workspace.read(path.resolve('tests/fixtures/secret.txt')),
      ).rejects.toThrow('Path is outside the content root')
      await expect(workspace.read('escape-link')).rejects.toThrow(
        'Path is outside the content root',
      )
      await expect(workspace.list('.')).rejects.toThrow(
        'Path is outside the content root',
      )
    } finally {
      await rm(boundaryFixture, { force: true, recursive: true })
    }
  })

  it('lists, reads, searches, and relates only workspace-relative documents', async () => {
    const workspace = await createWorkspace(fixture)
    const listed = await workspace.list('.')
    expect(listed.files.map((file) => file.path)).toEqual([
      'guide/getting-started.mdx',
      'index.mdx',
    ])
    expect(JSON.stringify(listed)).not.toContain(fixture)

    const read = await workspace.read({
      path: 'guide/getting-started.mdx',
      startLine: 6,
      endLine: 8,
    })
    expect(read.path).toBe('guide/getting-started.mdx')
    expect(read.text).toContain('deterministic workspace tools')

    const search = await workspace.search('deterministic workspace', 10)
    expect(search.results[0]).toMatchObject({
      path: 'guide/getting-started.mdx',
      route: '/guide/getting-started',
    })
    expect(JSON.stringify(search)).not.toContain(fixture)

    const backlinks = await workspace.backlinks('/guide/getting-started')
    expect(backlinks.backlinks).toContainEqual(
      expect.objectContaining({ path: 'index.mdx', route: '/' }),
    )
    const citations = await workspace.citations('guide/getting-started.mdx')
    expect(citations.citations).toContainEqual(
      expect.objectContaining({ label: 'cache', valid: true }),
    )
    const allCitations = await workspace.citations()
    expect(allCitations.citations).toContainEqual(
      expect.objectContaining({
        kind: 'link',
        label: 'source',
        target: 'https://example.com/source',
        valid: true,
      }),
    )
  })

  it('initializes and reindexes rebuildable cache without changing content', async () => {
    const root = path.resolve('.silen/.temp/workspace-init-test')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })
    await writeFile(path.join(root, 'index.mdx'), '# Existing\n', 'utf8')
    try {
      const workspace = await createWorkspace(root)
      await workspace.init()
      const indexed = await workspace.reindex()
      expect(indexed).toMatchObject({
        fileCount: 1,
        index: '.silen/ai/index.json',
      })
      expect(await readFile(path.join(root, 'index.mdx'), 'utf8')).toBe(
        '# Existing\n',
      )
      expect(
        await readFile(path.join(root, '.silen/ai/.gitignore'), 'utf8'),
      ).toBe('*\n!.gitignore\n')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('guides, builds, and audits with relative structured diagnostics', async () => {
    const workspace = await createWorkspace(fixture)
    expect(await workspace.guide()).toContain('read-only')
    await workspace.reindex()
    const built = await workspace.build()
    expect(built.outDir).toBe('.silen/dist')
    expect(built.routes).toContainEqual({ path: '/', file: 'index.mdx' })
    expect(JSON.stringify(built)).not.toContain(fixture)
    const audit = await workspace.audit()
    expect(audit).toMatchObject({ ok: true, filesChecked: 2, issues: [] })
    expect(JSON.stringify(audit)).not.toContain(fixture)
  }, 30_000)
})
