import { readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build, routeOutputFile, type BuildResult } from '../src/node/build'
import type { JsonObject } from '../src/shared/page'

function hydrationData(document: string): JsonObject {
  const match =
    /<script>window\.__SILEN__=JSON\.parse\(("(?:\\.|[^"\\])*")\)<\/script>/.exec(
      document,
    )
  if (!match?.[1]) throw new Error('Expected inline hydration data')
  return JSON.parse(JSON.parse(match[1]) as string) as JsonObject
}

const root = path.resolve('tests/fixtures/basic')
let result: BuildResult
let home: string
let guide: string
let about: string
let notFound: string
let chineseNotFound: string

beforeAll(async () => {
  result = await build(root)
  ;[home, guide, about, notFound, chineseNotFound] = await Promise.all([
    readFile(path.join(result.outDir, 'index.html'), 'utf8'),
    readFile(path.join(result.outDir, 'guide/index.html'), 'utf8'),
    readFile(path.join(result.outDir, 'about/index.html'), 'utf8'),
    readFile(path.join(result.outDir, '404.html'), 'utf8'),
    readFile(path.join(result.outDir, 'zh/404.html'), 'utf8'),
  ])
})

afterAll(async () => {
  await rm(path.join(root, '.silen/dist'), { force: true, recursive: true })
  await rm(path.join(root, '.silen/.temp'), { force: true, recursive: true })
})

describe('static production build', () => {
  it('omits internal Vite metadata from the installed output', async () => {
    await expect(
      readFile(path.join(result.outDir, '.vite/manifest.json'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not ship source maps in the static output', async () => {
    const assetFiles = await readdir(path.join(result.outDir, 'assets'))
    expect(assetFiles.some((file) => file.endsWith('.map'))).toBe(false)
  })

  it('keeps root, nested-index, and no-trailing routes inside outDir', () => {
    expect(routeOutputFile('/tmp/silen-out', '/')).toBe(
      '/tmp/silen-out/index.html',
    )
    expect(routeOutputFile('/tmp/silen-out', '/guide/')).toBe(
      '/tmp/silen-out/guide/index.html',
    )
    expect(routeOutputFile('/tmp/silen-out', '/about')).toBe(
      '/tmp/silen-out/about/index.html',
    )
    expect(() => routeOutputFile('/tmp/silen-out', '/../escape')).toThrow(
      'Unsafe static route',
    )
    expect(() => routeOutputFile('/tmp/silen-out', '/%2e%2e/escape')).toThrow(
      'Unsafe static route',
    )
  })

  it('renders every canonical route to its static output path', () => {
    expect(result.outDir).toBe(path.join(root, '.silen/dist'))
    expect(result.routes).toEqual([
      { path: '/about', file: path.join(root, 'about.mdx') },
      { path: '/guide/', file: path.join(root, 'guide/index.mdx') },
      { path: '/', file: path.join(root, 'index.mdx') },
    ])
    expect(home).toContain('<h1')
    expect(home).toContain('Silen browser fixture</h1>')
    expect(home).toContain('<h2>Basic Docs</h2>')
    expect(home).toContain('The complete home document is server rendered.')
    expect(guide).toContain('<h1>Getting Started</h1>')
    expect(guide).toContain('<h2>Install</h2>')
    expect(about).toContain('<h1>About this fixture</h1>')
    expect(about).toContain('no-trailing canonical route')
    expect(home).toContain('data-custom-root=""')
    expect(about).toContain('data-demo=""')
    expect(about).toContain('Custom theme component')
  })

  it('emits themed default and configured-locale 404 pages', () => {
    for (const html of [notFound, chineseNotFound]) {
      expect(html).toContain('<h1>404</h1>')
      expect(html).toContain('Page not found')
      expect(html).toContain('href="/project/"')
    }
    expect(notFound).not.toBe(chineseNotFound)
  })

  it('uses manifest-resolved filenames without preloading non-critical assets', () => {
    expect(home).toContain(
      '<link rel="icon" type="image/svg+xml" href="/project/favicon.svg">',
    )
    const clientScript =
      /<script type="module" src="(\/project\/assets\/.+-[\w-]+\.js)"><\/script>/.exec(
        home,
      )?.[1]
    expect(clientScript).toBeDefined()
    expect(home).toContain(`<link rel="modulepreload" href="${clientScript}">`)
    expect(home).toMatch(
      /<link rel="stylesheet" href="\/project\/assets\/.+-[\w-]+\.css">/,
    )
    const head = home.slice(0, home.indexOf('</head>'))
    expect(head).not.toContain('<link rel="preload" as="image"')
    expect(head).not.toContain('<link rel="preload" as="font"')
    expect(home).not.toContain('/project/assets/entry.js')
  })

  it('emits the packaged default favicon when the site has no public favicon', async () => {
    const favicon = await readFile(path.join(result.outDir, 'favicon.svg'), {
      encoding: 'utf8',
    })

    expect(favicon).toContain('aria-label="Silen"')
    expect(favicon).toContain('silen-favicon-gradient')
  })

  it('embeds only public, hydration-safe page data', () => {
    const data = hydrationData(home)

    expect(home).toContain('window.__SILEN__=JSON.parse(')
    expect(home).toContain('&lt;Unsafe &amp; title&gt;')
    expect(home).toContain(
      'content="Description &quot;quoted&quot; &amp; safe"',
    )
    expect(home).not.toContain('do-not-serialize')
    expect(home).not.toContain('do-not-serialize-theme')
    expect(home).not.toContain(root)
    expect(home).not.toContain('configFile')
    expect(home).not.toContain('outDir')
    expect(data.themeConfig).toEqual({
      search: true,
      nav: [
        { text: 'Home', link: '/' },
        { text: 'Guide', link: '/guide/' },
        { text: 'About', link: '/about' },
      ],
      sidebar: [
        {
          text: 'Documentation',
          items: [
            { text: 'Getting Started', link: '/guide/' },
            { text: 'About', link: '/about' },
          ],
        },
      ],
      socialLinks: [
        {
          icon: 'github',
          link: 'https://github.com/AICode-Nexus/silen',
          ariaLabel: 'Silen on GitHub',
        },
      ],
      locales: [
        { lang: 'en-US', label: 'English', root: '/' },
        {
          lang: 'zh-CN',
          label: '中文',
          root: '/zh/',
          nav: [{ text: '指南', link: '/zh/guide/' }],
          sidebar: [
            {
              text: '中文文档',
              items: [{ text: '快速开始', link: '/zh/guide/' }],
            },
          ],
          home: {
            hero: {
              name: 'Silen',
              text: '去掉噪音的文档体验。',
            },
            features: [
              {
                title: 'React 优先',
                details: '使用 React 组件编写文档。',
              },
            ],
          },
        },
      ],
    })
    expect(data.route).toBe('/')
  })

  it('does not leak resolved config or private filesystem fields into client chunks', async () => {
    const assetFiles = await readdir(path.join(result.outDir, 'assets'))
    const chunks = await Promise.all(
      assetFiles
        .filter((file) => file.endsWith('.js'))
        .map((file) =>
          readFile(path.join(result.outDir, 'assets', file), 'utf8'),
        ),
    )
    const clientSource = chunks.join('\n')

    expect(clientSource).not.toContain(root)
    expect(clientSource).not.toContain(process.cwd())
    expect(clientSource).not.toContain('do-not-serialize')
    expect(clientSource).not.toContain('privateToken')
    expect(clientSource).not.toContain('configFile')
    expect(clientSource).not.toContain('outDir')
    expect(clientSource).not.toContain('jsxDEV')
    expect(clientSource).not.toContain('react-stack-top-frame')
    expect(clientSource).not.toContain('recentlyCreatedOwnerStacks')
  })
})

describe('canonical encoded base production build', () => {
  const encodedBaseRoot = path.resolve('tests/fixtures/build-encoded-base')

  afterAll(async () => {
    await rm(path.join(encodedBaseRoot, '.silen/dist'), {
      force: true,
      recursive: true,
    })
    await rm(path.join(encodedBaseRoot, '.silen/.temp'), {
      force: true,
      recursive: true,
    })
  })

  it('reuses the encoded base across client assets, SSR routing, and public data', async () => {
    const encodedBase = '/%E6%96%87%E6%A1%A3%20docs/'
    const encodedResult = await build(encodedBaseRoot)
    const [encodedHome, encodedGuide] = await Promise.all([
      readFile(path.join(encodedResult.outDir, 'index.html'), 'utf8'),
      readFile(path.join(encodedResult.outDir, 'guide/index.html'), 'utf8'),
    ])
    const data = hydrationData(encodedHome)

    expect(encodedHome).toContain('<h1>Encoded base home</h1>')
    expect(encodedGuide).toContain('<h1>Encoded base guide</h1>')
    expect(encodedHome).toMatch(
      /src="\/%E6%96%87%E6%A1%A3%20docs\/assets\/.+\.js"/,
    )
    expect(data.base).toBe(encodedBase)
    expect(data.route).toBe('/')
    expect(encodedHome).not.toContain('src="/文档 docs/')
  })
})
