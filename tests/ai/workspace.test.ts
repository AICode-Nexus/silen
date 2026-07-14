import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  truncate,
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
  it('keeps search purely in memory and does not create cache files', async () => {
    const root = await mkdtemp(path.resolve('.silen/.temp/search-read-only-'))
    await writeFile(path.join(root, 'index.mdx'), '# Searchable\n\nneedle\n')
    try {
      const workspace = await createWorkspace(root)
      expect((await workspace.search('needle')).results).toHaveLength(1)
      await expect(lstat(path.join(root, '.silen'))).rejects.toMatchObject({
        code: 'ENOENT',
      })
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it('preflights build without executing workspace config or writing output', async () => {
    const root = await mkdtemp(path.resolve('.silen/.temp/build-preflight-'))
    const marker = path.join(
      path.dirname(root),
      `${path.basename(root)}.marker`,
    )
    await mkdir(path.join(root, '.silen'), { recursive: true })
    await Promise.all([
      writeFile(path.join(root, 'index.mdx'), '# Safe preflight\n'),
      writeFile(
        path.join(root, '.silen/config.ts'),
        `import { writeFile } from 'node:fs/promises'\nawait writeFile(${JSON.stringify(marker)}, 'executed')\nthrow new Error('workspace config executed')\n`,
      ),
    ])
    try {
      const result = await (await createWorkspace(root)).build()
      expect(result).toMatchObject({
        outDir: '.silen/dist',
        routes: [{ path: '/', file: 'index.mdx' }],
        ok: false,
      })
      expect(result.issues.length).toBeGreaterThan(0)
      await expect(lstat(marker)).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(lstat(path.join(root, '.silen/dist'))).rejects.toMatchObject(
        {
          code: 'ENOENT',
        },
      )
    } finally {
      await rm(marker, { force: true })
      await rm(root, { force: true, recursive: true })
    }
  })

  it.each([
    '.silen',
    '.silen/ai',
    '.silen/ai/.gitignore',
    '.silen/ai/index.json',
  ])(
    'never overwrites an external target through a pre-existing %s symlink',
    async (target) => {
      const root = await mkdtemp(path.resolve('.silen/.temp/write-boundary-'))
      const outside = await mkdtemp(path.resolve('.silen/.temp/write-outside-'))
      const sentinel = path.join(outside, 'sentinel')
      await writeFile(path.join(root, 'index.mdx'), '# Existing\n')
      await writeFile(sentinel, 'unchanged')
      if (target === '.silen') {
        await symlink(outside, path.join(root, '.silen'), 'dir')
      } else {
        await mkdir(path.join(root, '.silen'), { recursive: true })
        if (target === '.silen/ai') {
          await symlink(outside, path.join(root, '.silen/ai'), 'dir')
        } else {
          await mkdir(path.join(root, '.silen/ai'))
          await symlink(sentinel, path.join(root, target))
        }
      }
      try {
        const workspace = await createWorkspace(root)
        const operation = target.endsWith('index.json')
          ? workspace.reindex()
          : workspace.init()
        await expect(operation).rejects.toThrow(
          /symlink|safe workspace|outside the content root/i,
        )
        expect(await readFile(sentinel, 'utf8')).toBe('unchanged')
      } finally {
        await rm(root, { force: true, recursive: true })
        await rm(outside, { force: true, recursive: true })
      }
    },
  )

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

  it('rejects even contained file and directory symlinks during reads and scans', async () => {
    const root = await mkdtemp(path.resolve('.silen/.temp/contained-link-'))
    await mkdir(path.join(root, 'real'))
    await writeFile(path.join(root, 'real', 'page.mdx'), '# Real\n')
    await symlink(
      path.join(root, 'real', 'page.mdx'),
      path.join(root, 'page-link.mdx'),
    )
    await symlink(path.join(root, 'real'), path.join(root, 'directory-link'))
    try {
      const workspace = await createWorkspace(root)
      await expect(workspace.read('page-link.mdx')).rejects.toThrow(/symlink/i)
      await expect(workspace.list('.')).rejects.toThrow(/symlink/i)
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it('rejects a corpus larger than the total workspace byte budget', async () => {
    const root = await mkdtemp(path.resolve('.silen/.temp/corpus-budget-'))
    try {
      for (let index = 0; index < 17; index += 1) {
        const file = path.join(root, `${index}.md`)
        await writeFile(file, '# Budget\n')
        await truncate(file, 2 * 1024 * 1024)
      }
      const workspace = await createWorkspace(root)
      await expect(workspace.search('budget')).rejects.toMatchObject({
        code: 'CORPUS_TOO_LARGE',
      })
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })

  it('rejects a single Markdown file larger than two MiB', async () => {
    const root = await mkdtemp(path.resolve('.silen/.temp/file-budget-'))
    const file = path.join(root, 'oversized.md')
    try {
      await writeFile(file, '# Oversized\n')
      await truncate(file, 2 * 1024 * 1024 + 1)
      const workspace = await createWorkspace(root)
      await expect(workspace.read('oversized.md')).rejects.toMatchObject({
        code: 'FILE_TOO_LARGE',
      })
    } finally {
      await rm(root, { force: true, recursive: true })
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
    expect(built.ok).toBe(false)
    expect(built.issues.length).toBeGreaterThan(0)
    const audit = await workspace.audit()
    expect(audit).toMatchObject({
      ok: false,
      filesChecked: 2,
    })
    expect(audit.issues.length).toBeGreaterThan(0)
    expect(JSON.stringify(audit)).not.toContain(fixture)
  }, 30_000)
})
