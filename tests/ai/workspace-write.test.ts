import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createWorkspace } from '../../src/ai/workspace'

const roots: string[] = []

beforeAll(async () => {
  await mkdir(path.resolve('.silen/.temp'), { recursive: true })
})

afterEach(async () => {
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
