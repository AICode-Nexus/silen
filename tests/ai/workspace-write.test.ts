import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createWorkspace } from '../../src/ai/workspace'

const fileSystemHooks = vi.hoisted(() => ({
  afterLink: undefined as
    | ((existingPath: string, newPath: string) => void | Promise<void>)
    | undefined,
  afterUnlink: undefined as
    ((target: string) => void | Promise<void>) | undefined,
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    link: async (existingPath: string, newPath: string) => {
      await actual.link(existingPath, newPath)
      await fileSystemHooks.afterLink?.(existingPath, newPath)
    },
    unlink: async (target: string) => {
      await actual.unlink(target)
      await fileSystemHooks.afterUnlink?.(target)
    },
  }
})

const roots: string[] = []

beforeAll(async () => {
  await mkdir(path.resolve('.silen/.temp'), { recursive: true })
})

afterEach(async () => {
  fileSystemHooks.afterLink = undefined
  fileSystemHooks.afterUnlink = undefined
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  )
})

async function temporaryRoot(prefix = 'workspace-write-') {
  const root = await mkdtemp(path.resolve(`.silen/.temp/${prefix}`))
  roots.push(root)
  return root
}

describe('workspace mutations', () => {
  it('rejects invalid frontmatter without changing content or leaving a stale index', async () => {
    const root = await temporaryRoot('workspace-frontmatter-')
    const existing = path.join(root, 'existing.md')
    await writeFile(existing, '# Existing\n')
    const workspace = await createWorkspace(root)
    await workspace.reindex()

    await expect(
      workspace.write({
        path: 'created.md',
        content: '---\ntitle: [unterminated\n---\n# Created\n',
      }),
    ).rejects.toBeDefined()
    await expect(
      workspace.write({
        path: 'existing.md',
        content: '---\ntitle: *missing\n---\n# Replaced\n',
      }),
    ).rejects.toBeDefined()

    await expect(lstat(path.join(root, 'created.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(await readFile(existing, 'utf8')).toBe('# Existing\n')
    expect((await workspace.audit()).issues).not.toContainEqual(
      expect.objectContaining({ code: 'index' }),
    )
    expect(
      (await readdir(root)).filter((entry) => /\.(?:tmp|backup)$/.test(entry)),
    ).toEqual([])
  })

  it('keeps existing and new content unchanged when the index cannot be replaced', async () => {
    const root = await temporaryRoot('workspace-index-failure-')
    const existing = path.join(root, 'existing.md')
    await writeFile(existing, '# Existing\n')
    await chmod(existing, 0o754)
    await mkdir(path.join(root, '.silen/ai/index.json'), { recursive: true })
    const workspace = await createWorkspace(root)

    await expect(
      workspace.write({ path: 'existing.md', content: '# Replaced\n' }),
    ).rejects.toBeDefined()
    await expect(
      workspace.write({ path: 'created.md', content: '# Created\n' }),
    ).rejects.toBeDefined()

    expect(await readFile(existing, 'utf8')).toBe('# Existing\n')
    expect((await stat(existing)).mode & 0o7777).toBe(0o754)
    await expect(lstat(path.join(root, 'created.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(
      (await readdir(root)).filter((entry) => /\.(?:tmp|backup)$/.test(entry)),
    ).toEqual([])
    expect(
      (await readdir(path.join(root, '.silen/ai'))).filter((entry) =>
        /\.(?:tmp|backup)$/.test(entry),
      ),
    ).toEqual([])
  })

  it('rolls content back and does not overwrite an externally swapped index target', async () => {
    const root = await temporaryRoot('workspace-index-swap-')
    const existing = path.join(root, 'existing.md')
    const index = path.join(root, '.silen/ai/index.json')
    await writeFile(existing, '# Existing\n')
    await chmod(existing, 0o754)
    const workspace = await createWorkspace(root)
    await workspace.reindex()

    let swapped = false
    fileSystemHooks.afterLink = async (source, destination) => {
      if (swapped || destination !== existing || !source.endsWith('.tmp')) {
        return
      }
      swapped = true
      await rm(index)
      await mkdir(index)
    }
    await expect(
      workspace.write({ path: 'existing.md', content: '# Replaced\n' }),
    ).rejects.toBeDefined()

    expect(swapped).toBe(true)
    expect(await readFile(existing, 'utf8')).toBe('# Existing\n')
    expect((await stat(existing)).mode & 0o7777).toBe(0o754)
    expect((await stat(index)).isDirectory()).toBe(true)
    expect(
      (await readdir(root)).filter((entry) => /\.(?:tmp|backup)$/.test(entry)),
    ).toEqual([])
    expect(
      (await readdir(path.join(root, '.silen/ai'))).filter((entry) =>
        /\.(?:tmp|backup)$/.test(entry),
      ),
    ).toEqual([])
  })

  it('does not overwrite an external file created after replacement unlinks the checked target', async () => {
    const root = await temporaryRoot('workspace-target-swap-')
    const page = path.join(root, 'page.md')
    await writeFile(page, '# Original\n')
    const workspace = await createWorkspace(root)
    await workspace.reindex()

    let swapped = false
    fileSystemHooks.afterUnlink = async (target) => {
      if (swapped || target !== page) return
      swapped = true
      await writeFile(page, '# External\n', { mode: 0o640 })
    }
    await expect(
      workspace.write({ path: 'page.md', content: '# Silen\n' }),
    ).rejects.toBeDefined()

    expect(swapped).toBe(true)
    expect(await readFile(page, 'utf8')).toBe('# External\n')
    expect((await stat(page)).mode & 0o7777).toBe(0o640)
    expect(
      (await readdir(root)).filter((entry) => /\.(?:tmp|backup)$/.test(entry)),
    ).toEqual([])
    expect(
      (await readdir(path.join(root, '.silen/ai'))).filter((entry) =>
        /\.(?:tmp|backup)$/.test(entry),
      ),
    ).toEqual([])
  })

  it('rejects ignored path segments at every depth and scans them case-insensitively', async () => {
    const root = await temporaryRoot('workspace-ignored-')
    const ignored = [
      'nested/.git/page.md',
      'nested/.SILEN/page.md',
      'nested/Node_Modules/page.md',
    ]
    for (const relative of ignored) {
      await mkdir(path.dirname(path.join(root, relative)), { recursive: true })
      await writeFile(path.join(root, relative), '# Private\n')
    }
    await mkdir(path.join(root, 'docs'))
    await writeFile(path.join(root, 'docs/public.md'), '# Public\n')
    const workspace = await createWorkspace(root)

    await expect(workspace.list()).resolves.toEqual({
      path: '.',
      files: [
        { path: 'docs/public.md', route: '/docs/public', title: 'Public' },
      ],
    })
    for (const relative of ignored) {
      await expect(
        workspace.list(path.posix.dirname(relative)),
      ).rejects.toMatchObject({
        code: 'UNSUPPORTED_FILE',
      })
      await expect(
        workspace.write({ path: relative, content: '# Changed\n' }),
      ).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE' })
      expect(await readFile(path.join(root, relative), 'utf8')).toBe(
        '# Private\n',
      )
    }
  })

  it('preserves permission bits for replace, append, and link while creates use a safe mode', async () => {
    const root = await temporaryRoot('workspace-mode-')
    const page = path.join(root, 'page.md')
    const target = path.join(root, 'target.md')
    await writeFile(page, '# Page\n')
    await chmod(page, 0o754)
    await writeFile(target, '# Target\n')
    const workspace = await createWorkspace(root)

    await workspace.write({ path: 'page.md', content: '# Replaced\n' })
    expect((await stat(page)).mode & 0o7777).toBe(0o754)
    await workspace.append({ path: 'page.md', content: 'Appended' })
    expect((await stat(page)).mode & 0o7777).toBe(0o754)
    await workspace.link({
      path: 'page.md',
      target: 'target.md',
      label: 'Target',
    })
    expect((await stat(page)).mode & 0o7777).toBe(0o754)

    const created = path.join(root, 'created.md')
    await workspace.write({ path: 'created.md', content: '# Created\n' })
    expect((await stat(created)).mode & 0o7777).toBe(0o600)
  })

  it.skipIf(process.platform !== 'darwin')(
    'serializes concurrent case-alias mutations across workspace instances',
    async () => {
      const root = await temporaryRoot('workspace-case-alias-')
      await mkdir(path.join(root, 'Docs'))
      const page = path.join(root, 'Docs/Page.md')
      await writeFile(page, '# Events\n')
      const first = await createWorkspace(root)
      const second = await createWorkspace(root)
      const additions = Array.from(
        { length: 24 },
        (_, index) => `entry-${index}`,
      )

      await Promise.all(
        additions.map((content, index) =>
          (index % 2 === 0 ? first : second).append({
            path: index % 2 === 0 ? 'Docs/Page.md' : 'docs/page.md',
            content,
          }),
        ),
      )

      const lines = (await readFile(page, 'utf8')).split('\n')
      expect(lines[0]).toBe('# Events')
      expect(lines.slice(1).sort()).toEqual([...additions].sort())
      expect((await first.audit()).issues).not.toContainEqual(
        expect.objectContaining({ code: 'index' }),
      )
    },
  )

  it('atomically creates and exactly replaces Markdown with LF content and a fresh index', async () => {
    const root = await temporaryRoot()
    await mkdir(path.join(root, 'docs'))
    const workspace = await createWorkspace(root)

    const created = await workspace.write({
      path: 'docs/page.md',
      content: '# Created\r\n\r\nBody\r\n',
    })
    expect(created).toMatchObject({ path: 'docs/page.md', created: true })
    expect(created.diff).toContain('--- a/docs/page.md')
    expect(created.diff).toContain('+++ b/docs/page.md')
    expect(created.diff).toContain('+# Created')
    expect(JSON.stringify(created)).not.toContain(root)
    expect(await readFile(path.join(root, 'docs/page.md'), 'utf8')).toBe(
      '# Created\n\nBody\n',
    )

    const replaced = await workspace.write({
      path: 'docs/page.md',
      content: '# Replaced\n',
    })
    expect(replaced).toMatchObject({ path: 'docs/page.md', created: false })
    expect(replaced.diff).toContain('-# Created')
    expect(replaced.diff).toContain('+# Replaced')
    expect(await readFile(path.join(root, 'docs/page.md'), 'utf8')).toBe(
      '# Replaced\n',
    )
    expect((await workspace.audit()).issues).not.toContainEqual(
      expect.objectContaining({ code: 'index' }),
    )
  })

  it('appends text and relative links with exactly one separating newline', async () => {
    const root = await temporaryRoot()
    await Promise.all([
      mkdir(path.join(root, 'docs')),
      mkdir(path.join(root, 'reference')),
    ])
    await Promise.all([
      writeFile(path.join(root, 'docs/page.md'), '# Page\n\nExisting\n\n'),
      writeFile(path.join(root, 'reference/api.mdx'), '# API\n'),
    ])
    const workspace = await createWorkspace(root)

    const appended = await workspace.append({
      path: 'docs/page.md',
      content: '\r\nAdded\r\n',
    })
    expect(appended).toMatchObject({ path: 'docs/page.md', created: false })
    expect(await readFile(path.join(root, 'docs/page.md'), 'utf8')).toBe(
      '# Page\n\nExisting\nAdded\n',
    )

    const linked = await workspace.link({
      path: 'docs/page.md',
      target: 'reference/api.mdx',
      label: 'API reference',
    })
    expect(linked.diff).toContain('+[API reference](../reference/api.mdx)')
    expect(await readFile(path.join(root, 'docs/page.md'), 'utf8')).toBe(
      '# Page\n\nExisting\nAdded\n[API reference](../reference/api.mdx)',
    )
  })

  it('serializes concurrent writes and appends per path without losing updates', async () => {
    const root = await temporaryRoot()
    await writeFile(path.join(root, 'events.md'), '# Before\n')
    const workspace = await createWorkspace(root)

    await Promise.all([
      workspace.write({ path: 'events.md', content: '# Events\n' }),
      workspace.append({ path: 'events.md', content: 'first' }),
      ...Array.from({ length: 20 }, (_, index) =>
        workspace.append({ path: 'events.md', content: `entry-${index}` }),
      ),
    ])

    expect(await readFile(path.join(root, 'events.md'), 'utf8')).toBe(
      [
        '# Events',
        'first',
        ...Array.from({ length: 20 }, (_, i) => `entry-${i}`),
      ].join('\n'),
    )
    expect((await workspace.audit()).issues).not.toContainEqual(
      expect.objectContaining({ code: 'index' }),
    )
  })

  it('rejects traversal, absolute paths, unsupported extensions, missing parents, and oversized output without changes', async () => {
    const root = await temporaryRoot()
    const sentinel = path.join(root, 'page.md')
    await writeFile(sentinel, '# Unchanged\n')
    const workspace = await createWorkspace(root)
    const attempts = [
      () => workspace.write({ path: '../outside.md', content: 'changed' }),
      () =>
        workspace.write({
          path: path.join(root, 'absolute.md'),
          content: 'changed',
        }),
      () => workspace.write({ path: 'page.txt', content: 'changed' }),
      () => workspace.write({ path: 'missing/page.md', content: 'changed' }),
      () => workspace.write({ path: 'page.md', content: '你'.repeat(700_000) }),
    ]

    for (const attempt of attempts)
      await expect(attempt()).rejects.toBeDefined()
    expect(await readFile(sentinel, 'utf8')).toBe('# Unchanged\n')
    await expect(lstat(path.join(root, 'page.txt'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(
      (await readdir(root)).filter((entry) => entry.endsWith('.tmp')),
    ).toEqual([])
  })

  it('rejects escaping parent symlinks and final symlinks without touching external files or leaving temporary files', async () => {
    const root = await temporaryRoot('workspace-boundary-')
    const outside = await temporaryRoot('workspace-outside-')
    const external = path.join(outside, 'external.md')
    await writeFile(external, '# External\n')
    await symlink(outside, path.join(root, 'escape'), 'dir')
    await symlink(external, path.join(root, 'final.md'))
    const workspace = await createWorkspace(root)

    await expect(
      workspace.write({ path: 'escape/new.md', content: '# Unsafe\n' }),
    ).rejects.toThrow(/outside|symlink/i)
    await expect(
      workspace.write({ path: 'final.md', content: '# Unsafe\n' }),
    ).rejects.toThrow(/outside|symlink/i)
    await expect(
      workspace.append({ path: 'final.md', content: 'Unsafe' }),
    ).rejects.toThrow(/outside|symlink/i)
    expect(await readFile(external, 'utf8')).toBe('# External\n')
    expect(
      (await readdir(root)).filter((entry) => entry.endsWith('.tmp')),
    ).toEqual([])
  })

  it('rejects appends and links that would exceed two MiB or target a symlink', async () => {
    const root = await temporaryRoot('workspace-budget-')
    const outside = await temporaryRoot('workspace-target-')
    const page = path.join(root, 'page.md')
    const target = path.join(outside, 'target.md')
    await writeFile(page, '# Page\n')
    await truncate(page, 2 * 1024 * 1024)
    await writeFile(target, '# Target\n')
    await symlink(target, path.join(root, 'target.md'))
    const before = await readFile(page)
    const workspace = await createWorkspace(root)

    await expect(
      workspace.append({ path: 'page.md', content: 'overflow' }),
    ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
    await expect(
      workspace.link({ path: 'page.md', target: 'target.md', label: 'Target' }),
    ).rejects.toThrow(/outside|symlink|2 MiB/i)
    expect(await readFile(page)).toEqual(before)
    expect(
      (await readdir(root)).filter((entry) => entry.endsWith('.tmp')),
    ).toEqual([])
  })
})
