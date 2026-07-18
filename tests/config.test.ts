import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveConfig } from '../src/node/config'
import { pluginRunnerFor } from '../src/node/plugins'

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

  async function resolveInlineConfig(config: unknown) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'silen-base-'))
    temporaryRoots.add(root)
    await mkdir(path.join(root, '.silen'), { recursive: true })
    await writeFile(
      path.join(root, '.silen/config.ts'),
      `export default ${JSON.stringify(config)}`,
      'utf8',
    )
    return resolveConfig(root, 'build')
  }

  async function resolveInlineBase(base: string) {
    return resolveInlineConfig({ base })
  }

  async function resolveInlineSiteUrl(siteUrl: string) {
    return resolveInlineConfig({ siteUrl })
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
      analytics: [],
      plugins: [],
      ai: {
        llmsTxt: true,
        llmsFullTxt: true,
        markdownRoutes: true,
        index: true,
        contract: { enabled: true },
      },
      command: 'build',
      root,
      configFile: path.join(root, '.silen/config.ts'),
    })
  })

  it.each([
    [
      'canonical HTTPS origin',
      'HTTPS://Docs.Example.COM:443/',
      'https://docs.example.com',
    ],
    [
      'HTTP origin with a custom port',
      'http://localhost:8080',
      'http://localhost:8080',
    ],
    [
      'IPv4 origin with a custom port and root slash',
      'https://127.0.0.1:8443/',
      'https://127.0.0.1:8443',
    ],
    [
      'bracketed IPv6 origin with a custom port',
      'http://[::1]:8080/',
      'http://[::1]:8080',
    ],
    [
      'bracketed IPv6 origin without a port',
      'https://[2001:db8::1]/',
      'https://[2001:db8::1]',
    ],
    [
      'HTTP origin with its default port',
      'http://example.com:80/',
      'http://example.com',
    ],
  ])('canonicalizes %s in siteUrl', async (_, siteUrl, expected) => {
    await expect(resolveInlineSiteUrl(siteUrl)).resolves.toMatchObject({
      siteUrl: expected,
    })
  })

  it('keeps siteUrl absent when it is not configured', async () => {
    const config = await resolveInlineConfig({ base: '/docs/' })

    expect(Object.hasOwn(config, 'siteUrl')).toBe(false)
  })

  it('rejects locale roots that normalize to the same pathname', async () => {
    await expect(
      resolveInlineConfig({
        themeConfig: {
          locales: [
            { lang: 'en-US', label: 'English', root: '/en' },
            { lang: 'fr-FR', label: 'Français', root: '/en/' },
          ],
        },
      }),
    ).rejects.toThrow(/duplicate.*locale.*root.*\/en\//i)
  })

  it('rejects locale roots whose percent-triplet hex case is equivalent', async () => {
    await expect(
      resolveInlineConfig({
        themeConfig: {
          locales: [
            { lang: 'fr-FR', label: 'Français', root: '/caf%C3%A9/' },
            { lang: 'fr-CA', label: 'Français canadien', root: '/caf%c3%a9/' },
          ],
        },
      }),
    ).rejects.toThrow(/duplicate.*locale.*root.*\/caf%C3%A9\//i)
  })

  it('keeps ordinary pathname character case distinct in locale roots', async () => {
    await expect(
      resolveInlineConfig({
        themeConfig: {
          locales: [
            { lang: 'en-US', label: 'Uppercase path', root: '/EN/' },
            { lang: 'en-GB', label: 'Lowercase path', root: '/en/' },
          ],
        },
      }),
    ).resolves.toMatchObject({
      themeConfig: {
        locales: [
          { lang: 'en-US', root: '/EN/' },
          { lang: 'en-GB', root: '/en/' },
        ],
      },
    })
  })

  it('keeps distinct longest-prefix locale roots valid', async () => {
    await expect(
      resolveInlineConfig({
        themeConfig: {
          locales: [
            { lang: 'en', label: 'English', root: '/en/' },
            { lang: 'en-US', label: 'English (US)', root: '/en-us/' },
          ],
        },
      }),
    ).resolves.toMatchObject({
      themeConfig: {
        locales: [
          { lang: 'en', root: '/en/' },
          { lang: 'en-US', root: '/en-us/' },
        ],
      },
    })
  })

  it.each([
    ['a relative URL', 'docs.example.com'],
    ['a scheme without an authority delimiter', 'https:docs.example.com'],
    ['an empty authority', 'https:///docs.example.com'],
    ['a non-HTTP protocol', 'ftp://docs.example.com'],
    ['credentials', 'https://user:secret@docs.example.com'],
    ['an empty userinfo delimiter', 'https://@example.com'],
    ['empty userinfo with a password delimiter', 'https://:@example.com'],
    ['a backslash root', 'https://example.com\\'],
    ['an empty port delimiter', 'https://example.com:'],
    ['an empty port delimiter before root', 'https://example.com:/'],
    ['a deployment path', 'https://docs.example.com/project/'],
    ['a dot deployment path', 'https://docs.example.com/.'],
    ['a query', 'https://docs.example.com/?preview=true'],
    ['an empty query', 'https://docs.example.com/?'],
    ['a fragment', 'https://docs.example.com/#guide'],
    ['an empty fragment', 'https://docs.example.com/#'],
  ])('rejects siteUrl with %s actionably', async (_, siteUrl) => {
    await expect(resolveInlineSiteUrl(siteUrl)).rejects.toThrow(
      /siteUrl.*absolute http.*https.*origin.*base/i,
    )
  })

  it('can disable only the Agent Contract while retaining AI artifacts', async () => {
    await expect(
      resolveInlineConfig({ ai: { contract: { enabled: false } } }),
    ).resolves.toMatchObject({
      ai: {
        llmsTxt: true,
        llmsFullTxt: true,
        markdownRoutes: true,
        index: true,
        contract: { enabled: false },
      },
    })
  })

  it('preserves npm plugin module locations while loading TypeScript config', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'silen-package-plugin-'))
    temporaryRoots.add(root)
    const pluginDirectory = path.join(root, 'node_modules', 'fixture-plugin')
    await mkdir(path.join(root, '.silen'), { recursive: true })
    await mkdir(pluginDirectory, { recursive: true })
    await Promise.all([
      writeFile(
        path.join(pluginDirectory, 'package.json'),
        JSON.stringify({
          name: 'fixture-plugin',
          type: 'module',
          exports: './index.js',
        }),
        'utf8',
      ),
      writeFile(
        path.join(pluginDirectory, 'index.js'),
        `import { fileURLToPath } from 'node:url'
export default () => ({
  name: 'fixture-package',
  clientModules() {
    return fileURLToPath(new URL('./client.js', import.meta.url))
  },
})
`,
        'utf8',
      ),
      writeFile(
        path.join(pluginDirectory, 'client.js'),
        'export const setup = () => {}\n',
        'utf8',
      ),
      writeFile(
        path.join(root, '.silen/config.ts'),
        `import fixturePlugin from 'fixture-plugin'
export default { plugins: [fixturePlugin] }
`,
        'utf8',
      ),
    ])

    const config = await resolveConfig(root, 'build')
    await expect(
      pluginRunnerFor(config).collectClientModules(),
    ).resolves.toEqual([
      await realpath(path.join(pluginDirectory, 'client.js')),
    ])
  })

  it('rejects base values without a leading slash', async () => {
    await expect(
      resolveConfig(path.resolve('tests/fixtures/invalid-base'), 'build'),
    ).rejects.toThrow('base must start with /')
  })

  it('validates preset and custom analytics providers', async () => {
    await expect(
      resolveInlineConfig({
        analytics: [
          { provider: 'google', id: 'G-EXAMPLE' },
          { provider: 'baidu', id: 'baidu-example' },
          {
            provider: 'custom',
            name: 'self-hosted',
            scripts: [
              {
                src: 'https://analytics.example.com/script.js',
                defer: true,
                attributes: { 'data-site': 'docs' },
              },
            ],
          },
        ],
      }),
    ).resolves.toMatchObject({
      analytics: [
        { provider: 'google', id: 'G-EXAMPLE' },
        { provider: 'baidu', id: 'baidu-example' },
        {
          provider: 'custom',
          name: 'self-hosted',
          scripts: [
            {
              src: 'https://analytics.example.com/script.js',
              defer: true,
              attributes: { 'data-site': 'docs' },
            },
          ],
        },
      ],
    })
  })

  it('rejects ambiguous custom analytics scripts and reserved attributes', async () => {
    await expect(
      resolveInlineConfig({
        analytics: [
          {
            provider: 'custom',
            scripts: [{ src: '/analytics.js', content: 'void 0' }],
          },
        ],
      }),
    ).rejects.toThrow('exactly one of src or content')

    await expect(
      resolveInlineConfig({
        analytics: [
          {
            provider: 'custom',
            scripts: [
              { src: '/analytics.js', attributes: { src: '/other.js' } },
            ],
          },
        ],
      }),
    ).rejects.toThrow('must use its typed field')

    await expect(
      resolveInlineConfig({
        analytics: [
          {
            provider: 'custom',
            scripts: [{ src: 'java\nscript:alert(1)' }],
          },
        ],
      }),
    ).rejects.toThrow('unsafe analytics script URL')
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
