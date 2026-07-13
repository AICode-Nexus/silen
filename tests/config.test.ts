import { rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveConfig } from '../src/node/config'

describe('resolveConfig', () => {
  const fixtureRoots = [
    'configured',
    'invalid-base',
    'invalid-base-path',
    'reloadable',
  ].map((name) => path.resolve('tests/fixtures', name))

  afterEach(async () => {
    vi.restoreAllMocks()
    await Promise.all(
      fixtureRoots.map((root) =>
        rm(path.join(root, '.silen/.temp'), { recursive: true, force: true }),
      ),
    )
  })

  it('loads .silen/config.ts and normalizes base', async () => {
    const root = path.resolve('tests/fixtures/configured')
    const config = await resolveConfig(root, 'build')
    expect(config.title).toBe('Configured Docs')
    expect(config.base).toBe('/project/')
    expect(config.outDir).toBe(path.join(root, '.silen/dist'))
    expect(config).toEqual({
      title: 'Configured Docs',
      description: '',
      lang: 'en-US',
      base: '/project/',
      outDir: path.join(root, '.silen/dist'),
      onBrokenLinks: 'error',
      themeConfig: {},
      command: 'build',
      root,
      configFile: path.join(root, '.silen/config.ts'),
    })
  })

  it('rejects base values without a leading slash', async () => {
    await expect(
      resolveConfig(path.resolve('tests/fixtures/invalid-base'), 'build'),
    ).rejects.toThrow('base must start with /')
  })

  it('rejects base values with URL or traversal ambiguity', async () => {
    await expect(
      resolveConfig(path.resolve('tests/fixtures/invalid-base-path'), 'build'),
    ).rejects.toThrow('base must be a normalized absolute pathname')
  })

  it('evaluates every concurrent load when Date.now collides', async () => {
    const root = path.resolve('tests/fixtures/reloadable')
    vi.spyOn(Date, 'now').mockReturnValue(1_234_567_890)

    const configs = await Promise.all([
      resolveConfig(root, 'serve'),
      resolveConfig(root, 'serve'),
    ])

    expect(new Set(configs.map((config) => config.title)).size).toBe(2)
  })
})
