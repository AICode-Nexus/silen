import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveConfig } from '../src/node/config'

describe('resolveConfig', () => {
  const temporaryRoots = new Set<string>()
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
    await Promise.all(
      [...temporaryRoots].map((root) =>
        rm(root, { recursive: true, force: true }),
      ),
    )
    temporaryRoots.clear()
  })

  async function resolveInlineBase(base: string) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'silen-base-'))
    temporaryRoots.add(root)
    await mkdir(path.join(root, '.silen'), { recursive: true })
    await writeFile(
      path.join(root, '.silen/config.ts'),
      `export default ${JSON.stringify({ base })}`,
      'utf8',
    )
    return resolveConfig(root, 'build')
  }

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
      ai: {
        llmsTxt: true,
        llmsFullTxt: true,
        markdownRoutes: true,
        index: true,
      },
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

  it.each([
    ['spaces', '/team docs', '/team%20docs/'],
    ['Unicode', '/文档', '/%E6%96%87%E6%A1%A3/'],
    [
      'mixed readable and encoded characters',
      '/产品%20docs/%7ealpha',
      '/%E4%BA%A7%E5%93%81%20docs/~alpha/',
    ],
    ['equivalent Unicode forms', '/café', '/caf%C3%A9/'],
    [
      'URL pathname-safe characters',
      "/a:b@c;d,e!$&'()*+=f",
      "/a:b@c;d,e!$&'()*+=f/",
    ],
    ['encoded URL pathname-safe characters', '/a%3ab%40c', '/a:b@c/'],
  ])(
    'canonicalizes %s in base to one encoded pathname',
    async (_, base, expected) => {
      await expect(resolveInlineBase(base)).resolves.toMatchObject({
        base: expected,
      })
    },
  )

  it.each([
    ['query', '/docs?mode=print', 'query or hash'],
    ['hash', '/docs#intro', 'query or hash'],
    ['backslash', String.raw`/docs\private`, 'backslashes'],
    ['dot segment', '/docs/../private', 'dot segments'],
    ['encoded dot segment', '/docs/%2e%2e/private', 'dot segments'],
    ['encoded forward separator', '/docs%2Fprivate', 'encoded path separators'],
    [
      'encoded backward separator',
      '/docs%5cprivate',
      'encoded path separators',
    ],
  ])(
    'rejects ambiguous %s base forms with a specific error',
    async (_, base, reason) => {
      await expect(resolveInlineBase(base)).rejects.toThrow(
        `base must be a normalized absolute pathname: ${reason}`,
      )
    },
  )

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
