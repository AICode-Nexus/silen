import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ensureBuildFavicon, resolveSourceFavicon } from '../src/node/favicon'

const temporaryDirectories: string[] = []

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  )
})

describe('favicon defaults', () => {
  it('uses a site public favicon before the packaged default', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'silen-favicon-root-'))
    temporaryDirectories.push(root)
    await mkdir(path.join(root, 'public'), { recursive: true })
    await writeFile(path.join(root, 'public', 'favicon.ico'), 'site-icon')

    await expect(resolveSourceFavicon(root)).resolves.toEqual({
      file: 'favicon.ico',
      type: 'image/x-icon',
      source: 'public',
    })
  })

  it('emits the packaged SVG only when build output has no favicon', async () => {
    const withCustom = await mkdtemp(
      path.join(tmpdir(), 'silen-favicon-custom-'),
    )
    const withoutCustom = await mkdtemp(
      path.join(tmpdir(), 'silen-favicon-default-'),
    )
    temporaryDirectories.push(withCustom, withoutCustom)
    await writeFile(path.join(withCustom, 'favicon.png'), 'site-png')

    await expect(ensureBuildFavicon(withCustom)).resolves.toEqual({
      file: 'favicon.png',
      type: 'image/png',
      source: 'public',
    })
    await expect(
      readFile(path.join(withCustom, 'favicon.svg'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' })

    await expect(ensureBuildFavicon(withoutCustom)).resolves.toEqual({
      file: 'favicon.svg',
      type: 'image/svg+xml',
      source: 'default',
    })
    await expect(
      readFile(path.join(withoutCustom, 'favicon.svg'), 'utf8'),
    ).resolves.toContain('aria-label="Silen"')
  })
})
