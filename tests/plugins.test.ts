import { describe, expect, it, vi } from 'vitest'
import { definePlugin } from '../src/index'
import { createPluginRunner, type PluginRunner } from '../src/node/plugins'
import type { UserConfig } from '../src/shared/config'
import type { SilenPlugin } from '../src/shared/plugin'

const context = {
  command: 'build' as const,
  root: '/project',
  configFile: '/project/.silen/config.ts',
}

async function runner(
  entries: NonNullable<UserConfig['plugins']>,
): Promise<PluginRunner> {
  return createPluginRunner(entries, context)
}

describe('Silen plugin runner', () => {
  it('resolves async factories, typed options, and conditional entries in order', async () => {
    const calls: string[] = []
    const first = definePlugin(async (_context, options: { label: string }) => {
      await Promise.resolve()
      calls.push(`factory:${options.label}`)
      return {
        name: 'first',
        config(config) {
          calls.push(`config:${config.title ?? ''}`)
          return { description: options.label }
        },
      }
    })
    const second = definePlugin(() => ({
      name: 'second',
      config(config) {
        calls.push(`second:${config.description ?? ''}`)
        return { lang: 'zh-CN' }
      },
    }))

    const plugins = await runner([
      [first, { label: 'plugin options' }],
      false,
      null,
      undefined,
      second,
    ])
    const configured = await plugins.runConfig({ title: 'Docs' })

    expect(plugins.identities).toEqual(['first:default', 'second:default'])
    expect(configured).toMatchObject({
      title: 'Docs',
      description: 'plugin options',
      lang: 'zh-CN',
    })
    expect(calls).toEqual([
      'factory:plugin options',
      'config:Docs',
      'second:plugin options',
    ])
  })

  it('supports distinct ids and rejects duplicate plugin identities', async () => {
    const instance = (id: string) => () => ({ name: 'multi', id })

    await expect(
      runner([instance('one'), instance('two')]),
    ).resolves.toHaveProperty('identities', ['multi:one', 'multi:two'])
    await expect(runner([instance('same'), instance('same')])).rejects.toThrow(
      'Duplicate Silen plugin multi:same',
    )
  })

  it('rejects unknown fields and config patches that replace plugins', async () => {
    await expect(
      runner([() => ({ name: 'typo', transformHeads: vi.fn() })]),
    ).rejects.toThrow('unknown field transformHeads')

    const plugins = await runner([
      () =>
        ({
          name: 'recursive',
          config() {
            return { plugins: [] }
          },
        }) as unknown as SilenPlugin,
    ])
    await expect(plugins.runConfig({ title: 'Docs' })).rejects.toThrow(
      'recursive:default failed in config',
    )
  })

  it('wraps hook errors with identity and retains the original cause', async () => {
    const original = new Error('provider unavailable')
    const plugins = await runner([
      () => ({
        name: 'broken',
        configResolved() {
          throw original
        },
      }),
    ])

    let failure: unknown
    try {
      await plugins.runConfigResolved({} as never)
    } catch (error) {
      failure = error
    }

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain(
      'Silen plugin broken:default failed in configResolved',
    )
    expect((failure as Error).cause).toBe(original)
  })

  it('rejects Vite transforms that replace protected Silen modules', async () => {
    const plugins = await runner([
      () => ({
        name: 'vite-collision',
        vite() {
          return {
            name: 'fixture-vite',
            transform() {
              return 'export default "replaced"'
            },
          }
        },
      }),
    ])
    const [vitePlugin] = await plugins.collectVitePlugins()
    const transform = vitePlugin?.transform
    const handler =
      typeof transform === 'function'
        ? transform
        : transform && typeof transform === 'object'
          ? transform.handler
          : undefined

    expect(handler).toBeTypeOf('function')
    expect(() =>
      handler?.call({} as never, 'const config = {}', '\0virtual:silen/config'),
    ).toThrow('vite-collision:default failed in vite.transform')
  })

  it('rejects unsafe client module protocols with plugin attribution', async () => {
    const plugins = await runner([
      () => ({
        name: 'unsafe-client',
        clientModules() {
          return [
            'node:fs',
            'https://example.com/extension.js',
            'java\nscript:alert(1)',
          ]
        },
      }),
    ])

    await expect(plugins.collectClientModules()).rejects.toThrow(
      'unsafe-client:default failed in clientModules',
    )
  })

  it('merges JSON page extension data and validates head entries', async () => {
    const plugins = await runner([
      () => ({
        name: 'metadata',
        transformPageData(page) {
          return { data: { ...page.data, readingTime: 2 } }
        },
        transformHead() {
          return [
            {
              tag: 'meta',
              attributes: { name: 'reading-time', content: '2' },
            },
          ]
        },
      }),
    ])
    const page = await plugins.transformPageData(
      {
        title: 'Guide',
        description: '',
        frontmatter: {},
        headings: [],
        links: [],
        data: { existing: true },
      },
      {
        command: 'build',
        route: '/guide/',
        file: '/project/guide.mdx',
        source: '# Guide',
      },
    )

    expect(page.data).toEqual({ existing: true, readingTime: 2 })
    await expect(
      plugins.transformHead(page, {
        command: 'build',
        route: '/guide/',
        file: '/project/guide.mdx',
        source: '# Guide',
      }),
    ).resolves.toEqual([
      {
        tag: 'meta',
        attributes: { name: 'reading-time', content: '2' },
      },
    ])
  })

  it('rejects values that JSON would otherwise drop or coerce', async () => {
    const dropped = await runner([
      () => ({
        name: 'dropped-data',
        transformPageData() {
          return { data: { unsafe: undefined } as never }
        },
      }),
    ])
    const coerced = await runner([
      () => ({
        name: 'coerced-data',
        transformPageData() {
          return { data: { unsafe: Number.NaN } }
        },
      }),
    ])
    const page = {
      title: 'Guide',
      description: '',
      frontmatter: {},
      headings: [],
      links: [],
      data: {},
    }
    const context = {
      command: 'build' as const,
      route: '/',
      file: 'index.mdx',
      source: '# Guide',
    }

    await expect(dropped.transformPageData(page, context)).rejects.toThrow(
      'page data.data.unsafe must be JSON-serializable',
    )
    await expect(coerced.transformPageData(page, context)).rejects.toThrow(
      'page data.data.unsafe must contain only finite numbers',
    )
  })

  it('keeps config snapshots immutable and rejects top-level page extensions', async () => {
    const original = { title: 'Docs', themeConfig: { search: true } }
    const plugins = await runner([
      () => ({
        name: 'strict-boundary',
        config(config) {
          expect(() => {
            ;(config.themeConfig as { search: boolean }).search = false
          }).toThrow()
        },
        transformPageData() {
          return { route: '/replaced/' } as never
        },
      }),
    ])

    await plugins.runConfig(original)
    expect(original.themeConfig.search).toBe(true)
    await expect(
      plugins.transformPageData(
        {
          title: 'Guide',
          description: '',
          frontmatter: {},
          headings: [],
          links: [],
          data: {},
        },
        {
          command: 'build',
          route: '/',
          file: 'index.mdx',
          source: '# Guide',
        },
      ),
    ).rejects.toThrow(
      'strict-boundary:default failed in transformPageData: page data has unknown field route; extension values belong in data (route /)',
    )
  })

  it('rejects executable URL protocols in typed head attributes', async () => {
    const plugins = await runner([
      () => ({
        name: 'unsafe-head',
        transformHead() {
          return [
            { tag: 'script', attributes: { src: 'java\nscript:alert(1)' } },
          ]
        },
      }),
    ])

    await expect(
      plugins.transformHead(
        {
          title: 'Guide',
          description: '',
          frontmatter: {},
          headings: [],
          links: [],
          data: {},
        },
        {
          command: 'build',
          route: '/',
          file: 'index.mdx',
          source: '# Guide',
        },
      ),
    ).rejects.toThrow(
      'unsafe-head:default failed in transformHead: unsafe URL protocol for head attribute src (route /)',
    )
  })

  it('collects build contributions once and returns stable snapshots', async () => {
    const calls = { mdx: 0, vite: 0, client: 0 }
    const plugins = await runner([
      () => ({
        name: 'collected-once',
        extendMdx() {
          calls.mdx += 1
          return { remarkPlugins: [] }
        },
        vite() {
          calls.vite += 1
          return { name: 'collected-once:vite' }
        },
        clientModules() {
          calls.client += 1
          return './client.tsx'
        },
      }),
    ])

    const [firstMdx, firstVite, firstClient] = await Promise.all([
      plugins.collectMdxExtensions(),
      plugins.collectVitePlugins(),
      plugins.collectClientModules(),
    ])
    const [secondMdx, secondVite, secondClient] = await Promise.all([
      plugins.collectMdxExtensions(),
      plugins.collectVitePlugins(),
      plugins.collectClientModules(),
    ])

    expect(calls).toEqual({ mdx: 1, vite: 1, client: 1 })
    expect(secondMdx).toEqual(firstMdx)
    expect(secondVite).toEqual(firstVite)
    expect(secondClient).toEqual(firstClient)
    expect(secondMdx).not.toBe(firstMdx)
    expect(secondVite).not.toBe(firstVite)
    expect(secondClient).not.toBe(firstClient)
  })
})
