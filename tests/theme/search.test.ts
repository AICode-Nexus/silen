import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { build, type BuildResult } from '../../src/node/build'
import {
  createSearchIndex,
  querySearchIndex,
  serializeSearchIndex,
  type SearchDocument,
} from '../../src/node/search'
import {
  search as searchClientIndex,
  searchIndexUrl,
} from '../../src/theme-default/search'

const documents: SearchDocument[] = [
  {
    id: '/config',
    title: 'Configuration',
    headings: ['Site options'],
    text: 'Choose the site options for a project.',
    route: '/config',
  },
  {
    id: '/intro',
    title: 'Introduction',
    headings: ['Overview'],
    text: 'A configuration overview for new readers.',
    route: '/intro',
  },
]

describe('local search index', () => {
  it('serializes deterministically regardless of document input order', () => {
    const forward = serializeSearchIndex(createSearchIndex(documents))
    const reverse = serializeSearchIndex(
      createSearchIndex([...documents].reverse()),
    )

    expect(reverse).toBe(forward)
  })

  it('ranks title matches above body-only matches with prefix and fuzzy search', () => {
    const index = createSearchIndex(documents)

    expect(querySearchIndex(index, 'configuration')[0]?.route).toBe('/config')
    expect(querySearchIndex(index, 'configur')[0]?.route).toBe('/config')
    expect(querySearchIndex(index, 'configurtion')[0]?.route).toBe('/config')
  })

  it('escapes untrusted text before adding query highlights', () => {
    const index = createSearchIndex([
      {
        id: '/unsafe',
        title: 'Unsafe examples',
        text: 'Configure <img src=x onerror="globalThis.bad=true"> safely.',
        route: '/unsafe',
      },
    ])

    const result = querySearchIndex(index, 'configure')[0]
    expect(result?.snippet).toContain('<mark>Configure</mark>')
    expect(result?.snippet).toContain('&lt;img')
    expect(result?.snippet).not.toContain('<img')
    expect(result?.snippet).not.toContain('onerror="')
    expect(serializeSearchIndex(index)).not.toContain('<')
  })
})

describe('client search index loading', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses the encoded base URL and caches the fetched and parsed index', async () => {
    const serialized = serializeSearchIndex(createSearchIndex(documents))
    const fetchIndex = vi.fn(() =>
      Promise.resolve(
        new Response(serialized, {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchIndex)

    const base = '/%E6%96%87%E6%A1%A3/'
    expect(searchIndexUrl(base)).toBe('/%E6%96%87%E6%A1%A3/search-index.json')
    const results = await searchClientIndex('configuration', { base })
    expect(results[0]).toMatchObject({ route: '/config' })
    await searchClientIndex('intro', { base })

    expect(fetchIndex).toHaveBeenCalledTimes(1)
    expect(fetchIndex).toHaveBeenCalledWith(
      '/%E6%96%87%E6%A1%A3/search-index.json',
      { headers: { accept: 'application/json' } },
    )
  })

  it('rejects a missing index without permanently caching the failure', async () => {
    const fetchIndex = vi.fn(() =>
      Promise.resolve(new Response('Not found', { status: 404 })),
    )
    vi.stubGlobal('fetch', fetchIndex)

    await expect(
      searchClientIndex('configuration', { base: '/offline/' }),
    ).rejects.toThrow('404')
    await expect(
      searchClientIndex('configuration', { base: '/offline/' }),
    ).rejects.toThrow('404')
    expect(fetchIndex).toHaveBeenCalledTimes(2)
  })
})

describe('production search output', () => {
  let root: string
  let result: BuildResult

  beforeAll(async () => {
    const parent = path.resolve('.silen/.temp/tests')
    await mkdir(parent, { recursive: true })
    root = await mkdtemp(path.join(parent, 'silen-search-'))
    await mkdir(path.join(root, '.silen'), { recursive: true })
    await Promise.all([
      writeFile(
        path.join(root, '.silen/config.ts'),
        `import { defineConfig } from ${JSON.stringify(path.resolve('src/index.ts'))}
export default defineConfig({
  title: 'Search fixture',
  base: '/knowledge/',
  themeConfig: { search: true },
  privateToken: 'private-config-value'
})
`,
      ),
      writeFile(
        path.join(root, 'index.mdx'),
        `---
title: Home </script><script>unsafe()</script>
privateToken: private-frontmatter-value
---

export const secretSource = '/private/source/file'

# Search home

Public introduction content.
`,
      ),
      writeFile(
        path.join(root, 'guide.mdx'),
        `---
title: Configuration guide
---

# Configure Silen

## Site options

Choose public project settings.
`,
      ),
    ])
    result = await build(root)
  }, 60_000)

  afterAll(async () => {
    await rm(root, { force: true, recursive: true })
  })

  it('emits inline-safe public page data without source or config leakage', async () => {
    const file = path.join(result.outDir, 'search-index.json')
    const serialized = await readFile(file, 'utf8')
    const index = JSON.parse(serialized) as ReturnType<typeof createSearchIndex>

    expect(querySearchIndex(index, 'site options')[0]).toMatchObject({
      title: 'Configuration guide',
      route: '/guide',
    })
    expect(serialized).toContain('Public introduction content')
    expect(serialized).not.toContain('</script>')
    expect(serialized).not.toContain(root)
    expect(serialized).not.toContain('/private/source/file')
    expect(serialized).not.toContain('private-config-value')
    expect(serialized).not.toContain('private-frontmatter-value')
  })

  it('keeps MiniSearch and the dialog out of the initial client entry', async () => {
    const home = await readFile(path.join(result.outDir, 'index.html'), 'utf8')
    const clientUrl = /<script type="module" src="([^"]+)">/.exec(home)?.[1]
    expect(clientUrl).toBeDefined()

    const clientFile = path.basename(clientUrl!)
    const initialSource = await readFile(
      path.join(result.outDir, 'assets', clientFile),
      'utf8',
    )
    const javascriptFiles = (await readdir(path.join(result.outDir, 'assets')))
      .filter((file) => file.endsWith('.js'))
      .filter((file) => file !== clientFile)
    const lazySources = await Promise.all(
      javascriptFiles.map(async (file) => ({
        file,
        source: await readFile(
          path.join(result.outDir, 'assets', file),
          'utf8',
        ),
      })),
    )

    expect(initialSource).not.toContain(
      'Search all public documentation pages.',
    )
    expect(initialSource).not.toContain('MiniSearch')
    const dialogChunk = lazySources.find(({ source }) =>
      source.includes('Search all public documentation pages.'),
    )
    expect(dialogChunk).toBeDefined()
    expect(home).not.toContain(dialogChunk!.file)
  })

  it('omits the index and launcher when local search is disabled', async () => {
    const disabledRoot = path.join(root, 'disabled-site')
    await mkdir(path.join(disabledRoot, '.silen'), { recursive: true })
    await Promise.all([
      writeFile(
        path.join(disabledRoot, '.silen/config.ts'),
        `import { defineConfig } from ${JSON.stringify(path.resolve('src/index.ts'))}
export default defineConfig({ themeConfig: { search: false } })
`,
      ),
      writeFile(path.join(disabledRoot, 'index.mdx'), '# Disabled search\n'),
    ])

    const disabled = await build(disabledRoot)
    await expect(
      readFile(path.join(disabled.outDir, 'search-index.json'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    expect(
      await readFile(path.join(disabled.outDir, 'index.html'), 'utf8'),
    ).not.toContain('aria-label="Search documentation"')
  }, 60_000)
})
