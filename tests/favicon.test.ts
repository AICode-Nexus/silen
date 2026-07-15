import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  defaultFaviconSvg,
  ensureBuildFavicon,
  resolveSourceFavicon,
} from '../src/node/favicon'

const temporaryDirectories: string[] = []

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  )
})

describe('favicon defaults', () => {
  it('keeps the website logo and packaged favicon on the high-contrast brand palette', async () => {
    const websiteLogo = await readFile(
      new URL('../website/public/logo.svg', import.meta.url),
      'utf8',
    )

    for (const brandAsset of [websiteLogo, defaultFaviconSvg]) {
      expect(brandAsset).toContain('#7c3aed')
      expect(brandAsset).toContain('#2563eb')
      expect(brandAsset).toContain('fill="#fff"')
      expect(brandAsset).not.toContain('#0b1020')
      expect(brandAsset).not.toContain('#8b5cf6')
    }
  })

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
