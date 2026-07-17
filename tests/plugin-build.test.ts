import { readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { build } from '../src/node/build'
import {
  querySearchIndex,
  type SerializedSearchIndex,
} from '../src/node/search'

const root = path.resolve('tests/fixtures/plugin-site')

afterAll(async () => {
  await rm(path.join(root, '.silen/dist'), { recursive: true, force: true })
  await rm(path.join(root, '.silen/.temp'), { recursive: true, force: true })
})

describe('plugin lifecycle build integration', () => {
  it('uses MDX, Vite, page data, head, client modules, and buildEnd together', async () => {
    const result = await build(root)
    const [html, viteAsset, buildEnd, aiIndex, searchIndex] = await Promise.all(
      [
        readFile(path.join(result.outDir, 'index.html'), 'utf8'),
        readFile(path.join(result.outDir, 'plugin-vite.txt'), 'utf8'),
        readFile(path.join(result.outDir, 'plugin-build-end.json'), 'utf8'),
        readFile(path.join(result.outDir, 'ai-index.json'), 'utf8'),
        readFile(path.join(result.outDir, 'search-index.json'), 'utf8'),
      ],
    )

    expect(html).toContain('<title>Transformed plugin page</title>')
    expect(html).toContain('MDX plugin active')
    expect(html).toContain('data-plugin-client-root=""')
    expect(html).toContain(
      '<meta content="community-ready" name="plugin-fixture">',
    )
    expect(html).toContain('https://plugin.example.com/preserved-canonical')
    expect(html).toContain('fixtureLabel')
    expect(viteAsset).toBe('community-ready')
    expect(JSON.parse(buildEnd)).toEqual({
      label: 'community-ready',
      routes: 1,
      pageTransforms: 1,
      pageKeys: [
        'data',
        'description',
        'frontmatter',
        'headings',
        'links',
        'title',
      ],
    })
    expect(JSON.parse(aiIndex)).toMatchObject({
      pages: [
        {
          title: 'Transformed plugin page',
          description: 'Transformed plugin description',
        },
      ],
    })
    expect(
      querySearchIndex(
        JSON.parse(searchIndex) as SerializedSearchIndex,
        'Transformed plugin description',
      )[0],
    ).toMatchObject({ title: 'Transformed plugin page' })
  })

  it('keeps installed core output and attributes buildEnd failures', async () => {
    process.env.SILEN_FIXTURE_BUILD_END_FAILURE = '1'
    try {
      await expect(build(root)).rejects.toThrow(
        'fixture-plugin:default failed in buildEnd: fixture post-build failed',
      )
      await expect(
        stat(path.join(root, '.silen/dist/index.html')),
      ).resolves.toMatchObject({})
    } finally {
      delete process.env.SILEN_FIXTURE_BUILD_END_FAILURE
    }
  })
})
