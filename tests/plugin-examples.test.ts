import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import analyticsClientPlugin from '../examples/plugins/analytics-client'
import readingTimePlugin from '../examples/plugins/reading-time'
import sitemapPlugin from '../examples/plugins/sitemap'
import { createPluginRunner } from '../src/node/plugins'
import type { ResolvedConfig } from '../src/shared/config'

const temporaryDirectories: string[] = []

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('reference plugin examples', () => {
  it('adds deterministic reading-time page data', async () => {
    const runner = await createPluginRunner(
      [[readingTimePlugin, { wordsPerMinute: 2 }]],
      { command: 'build', root: '/docs', configFile: '/docs/.silen/config.ts' },
    )
    const page = await runner.transformPageData(
      {
        title: 'Example',
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
        source: 'one two three',
      },
    )

    expect(page.data).toEqual({ readingTimeMinutes: 2 })
  })

  it('writes a base-aware sitemap after a build', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'silen-sitemap-example-'))
    temporaryDirectories.push(outDir)
    const runner = await createPluginRunner(
      [[sitemapPlugin, { origin: 'https://docs.example.com' }]],
      { command: 'build', root: '/docs', configFile: '/docs/.silen/config.ts' },
    )
    await runner.runBuildEnd({
      config: { base: '/handbook/' } as ResolvedConfig,
      outDir,
      pages: [],
      routes: [
        { path: '/', file: '/docs/index.mdx', relativeFile: 'index.mdx' },
        { path: '/guide/', file: '/docs/guide.mdx', relativeFile: 'guide.mdx' },
      ],
    })

    const sitemap = await readFile(path.join(outDir, 'sitemap.xml'), 'utf8')
    expect(sitemap).toContain('https://docs.example.com/handbook/')
    expect(sitemap).toContain('https://docs.example.com/handbook/guide/')
  })

  it('registers an SSR-safe client extension module', async () => {
    const runner = await createPluginRunner(
      [[analyticsClientPlugin, { siteId: 'docs' }]],
      { command: 'build', root: '/docs', configFile: '/docs/.silen/config.ts' },
    )
    const [moduleId] = await runner.collectClientModules()
    const page = {
      title: 'Example',
      description: '',
      frontmatter: {},
      headings: [],
      links: [],
      data: {},
    }

    expect(moduleId).toMatch(/analytics-runtime\.tsx$/)
    await expect(
      runner.transformHead(page, {
        command: 'build',
        route: '/',
        file: 'index.mdx',
        source: '# Example',
      }),
    ).resolves.toEqual([
      {
        tag: 'meta',
        attributes: { name: 'example-site-id', content: 'docs' },
      },
    ])
  })
})
