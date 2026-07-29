import { access, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runAiEvaluation } from '../src/ai/eval'
import { build, type BuildResult } from '../src/node/build'

let result: BuildResult

beforeAll(async () => {
  result = await build(path.resolve('website'))
})

afterAll(async () => {
  await Promise.all([
    rm(path.resolve('website/.silen/dist'), { recursive: true, force: true }),
    rm(path.resolve('website/.silen/.temp'), { recursive: true, force: true }),
  ])
})

describe('example website homepage', () => {
  it('includes the hidden Agent Contract directory in the Pages artifact', async () => {
    const workflow = await readFile('.github/workflows/pages.yml', 'utf8')

    expect(workflow).toContain(
      'test -f website/.silen/dist/.well-known/silen/manifest.json',
    )
    expect(workflow).toContain('uses: actions/configure-pages@v6')
    expect(workflow).toContain('uses: actions/upload-pages-artifact@v5')
    expect(workflow).toContain('include-hidden-files: true')
    expect(workflow).toContain('uses: actions/deploy-pages@v5')
  })

  it('derives each generated html lang from the resolved locale root', async () => {
    const [english, chinese] = await Promise.all([
      readFile(path.join(result.outDir, 'guide/index.html'), 'utf8'),
      readFile(path.join(result.outDir, 'zh/guide/index.html'), 'utf8'),
    ])

    expect(english).toContain('<html lang="en-US">')
    expect(chinese).toContain('<html lang="zh-CN">')
  })

  it('renders both reference pages with semantic tables', async () => {
    const [english, chinese] = await Promise.all([
      readFile(path.join(result.outDir, 'reference/index.html'), 'utf8'),
      readFile(path.join(result.outDir, 'zh/reference/index.html'), 'utf8'),
    ])

    for (const html of [english, chinese]) {
      expect(html.match(/<table>/g)).toHaveLength(3)
      expect(html.match(/<thead>/g)).toHaveLength(3)
      expect(html.match(/<tbody>/g)).toHaveLength(3)
      expect(html).not.toMatch(/<p>\|[^<]+-{3,}/)
    }
  })

  it('publishes canonical bilingual metadata and the official sitemap', async () => {
    const [english, chinese, sitemap] = await Promise.all([
      readFile(path.join(result.outDir, 'guide/index.html'), 'utf8'),
      readFile(path.join(result.outDir, 'zh/guide/index.html'), 'utf8'),
      readFile(path.join(result.outDir, 'sitemap.xml'), 'utf8'),
    ])

    expect(english).toContain(
      '<link rel="canonical" href="https://aicode-nexus.github.io/silen/guide/" data-silen-seo>',
    )
    expect(chinese).toContain(
      '<link rel="canonical" href="https://aicode-nexus.github.io/silen/zh/guide/" data-silen-seo>',
    )
    for (const html of [english, chinese]) {
      expect(html).toContain('hreflang="en-US"')
      expect(html).toContain('hreflang="zh-CN"')
      expect(html).toContain('hreflang="x-default"')
    }
    expect(sitemap).toContain(
      '<loc>https://aicode-nexus.github.io/silen/guide/</loc>',
    )
    expect(sitemap).toContain(
      '<loc>https://aicode-nexus.github.io/silen/zh/guide/</loc>',
    )
    expect(sitemap).not.toContain('404')
  })

  it('uses the exact Node engine contract and base-contained guide links', async () => {
    const [englishGuide, chineseGuide, englishAi, chineseAi] =
      await Promise.all([
        readFile(path.resolve('website/guide/index.mdx'), 'utf8'),
        readFile(path.resolve('website/zh/guide/index.mdx'), 'utf8'),
        readFile(path.resolve('website/ai/index.mdx'), 'utf8'),
        readFile(path.resolve('website/zh/ai/index.mdx'), 'utf8'),
      ])

    expect(englishGuide).toContain('Node.js `^20.19.0 || >=22.12.0`')
    expect(chineseGuide).toContain('Node.js `^20.19.0 || >=22.12.0`')
    expect(englishGuide).toContain('](/silen/ai/)')
    expect(chineseGuide).toContain('](/silen/zh/ai/)')
    expect(englishAi).toContain('](/silen/guide/)')
    expect(chineseAi).toContain('](/silen/zh/guide/)')
  })

  it.each(['silen-workflow.jpg', 'silen-workflow-dark.jpg'])(
    'ships %s as a compressed JPEG',
    async (file) => {
      const source = await readFile(path.resolve('website/public', file))
      expect([...source.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
      expect(source.byteLength).toBeLessThan(150_000)
    },
  )

  it('ships the AI Dev Hub QR code as a PNG', async () => {
    const source = await readFile(
      path.resolve('website/assets/wechat-ai-dev-hub.png'),
    )
    expect([...source.subarray(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
  })

  it.each([
    {
      file: 'website/index.mdx',
      markers: [
        'From folder to knowledge interface',
        'Live output from this build',
        'Useful to readers, agents, and maintainers',
        'Build the documentation layer with us',
        'AI Dev Hub on WeChat',
      ],
      hasQr: true,
    },
    {
      file: 'website/zh/index.mdx',
      markers: [
        '从文件夹到知识接口',
        '当前构建的真实产物',
        '同时服务读者、智能体与维护者',
        '一起完善文档基础设施',
        '微信公众号：AI Dev Hub',
      ],
      hasQr: true,
    },
  ])('keeps $file complete and localized', async ({ file, hasQr, markers }) => {
    const source = await readFile(path.resolve(file), 'utf8')
    for (const marker of markers) expect(source).toContain(marker)
    if (hasQr) {
      expect(source).toContain('wechat-ai-dev-hub.png')
      expect(source).toContain('width={344}')
      expect(source).toContain('height={344}')
      expect(source).toContain('loading="lazy"')
    } else {
      expect(source).not.toContain('wechat-ai-dev-hub')
    }
  })

  it('emits three non-nested lede paragraphs per locale', async () => {
    for (const file of ['index.html', 'zh/index.html']) {
      const html = await readFile(path.join(result.outDir, file), 'utf8')
      const ledes = [
        ...html.matchAll(/<p class="silen-home-lede">([\s\S]*?)<\/p>/g),
      ]

      expect(ledes, file).toHaveLength(3)
      for (const [, content] of ledes) {
        expect(content, file).not.toMatch(/<\/?p(?:\s|>)/)
        expect(content?.trim(), file).not.toBe('')
      }
    }
  })

  it('emits browser-safe paragraph and action markup on both homepages', async () => {
    for (const [file, copyText] of [
      ['index.html', 'Copy'],
      ['zh/index.html', '复制'],
    ] as const) {
      const html = await readFile(path.join(result.outDir, file), 'utf8')
      const actions = [
        ...html.matchAll(/<a class="silen-home-action"[^>]*>([\s\S]*?)<\/a>/g),
      ]

      expect(html, file).not.toMatch(/<p(?:\s[^>]*)?>\s*<p(?:\s|>)/)
      expect(html, file).toContain(`data-copy-text="${copyText}"`)
      expect(actions, file).toHaveLength(2)
      for (const [, content] of actions) {
        expect(content, file).not.toMatch(/<\/?p(?:\s|>)/)
      }
    }
  })

  it('links each homepage to real base-aware generated artifacts', async () => {
    const [english, chinese] = await Promise.all([
      readFile(path.join(result.outDir, 'index.html'), 'utf8'),
      readFile(path.join(result.outDir, 'zh/index.html'), 'utf8'),
    ])

    for (const html of [english, chinese]) {
      for (const href of [
        '/silen/llms.txt',
        '/silen/llms-full.txt',
        '/silen/ai-index.json',
        '/silen/.well-known/silen/manifest.json',
      ]) {
        expect(html).toContain(`href="${href}"`)
      }
    }
    expect(english).toContain('href="/silen/guide/index.md"')
    expect(chinese).toContain('href="/silen/zh/guide/index.md"')
    expect(english).toContain('wechat-ai-dev-hub')

    for (const artifact of [
      'llms.txt',
      'llms-full.txt',
      'ai-index.json',
      '.well-known/silen/manifest.json',
      'guide/index.md',
      'zh/guide/index.md',
    ]) {
      await expect(
        readFile(path.join(result.outDir, artifact)),
      ).resolves.toBeDefined()
    }
  })

  it('dogfoods a base-aware bilingual Agent Contract without local paths', async () => {
    const contractRoot = path.join(result.outDir, '.well-known/silen')
    const [manifestSource, apiSource, guide, englishTask, chineseTask] =
      await Promise.all([
        readFile(path.join(contractRoot, 'manifest.json'), 'utf8'),
        readFile(path.join(contractRoot, 'api.json'), 'utf8'),
        readFile(path.join(contractRoot, 'guide.md'), 'utf8'),
        readFile(path.join(contractRoot, 'tasks/create-site.md'), 'utf8'),
        readFile(
          path.join(contractRoot, 'locales/zh-CN/tasks/create-site.md'),
          'utf8',
        ),
      ])
    const manifest = JSON.parse(manifestSource) as {
      site: { base: string; lang: string }
      resources: Array<{ id: string; url: string; lang?: string }>
      tasks: Array<{ id: string; url: string; lang?: string }>
    }
    const api = JSON.parse(apiSource) as {
      config: { fields: Array<{ path: string }> }
    }

    expect(manifest.site).toMatchObject({ base: '/silen/', lang: 'en-US' })
    expect(manifest.resources).toContainEqual(
      expect.objectContaining({
        id: 'silen-manifest',
        url: '/silen/.well-known/silen/manifest.json',
      }),
    )
    for (const reference of [...manifest.resources, ...manifest.tasks]) {
      expect(reference.url).toMatch(/^\/silen\//)
    }
    expect(
      manifest.tasks
        .filter((task) => task.lang === 'en-US')
        .map((task) => task.id),
    ).toEqual(
      manifest.tasks
        .filter((task) => task.lang === 'zh-CN')
        .map((task) => task.id),
    )
    expect(api.config.fields.map((field) => field.path)).toEqual(
      expect.arrayContaining(['analytics', 'plugins']),
    )
    expect(guide).toContain('# Silen official Agent instructions')
    expect(englishTask).toContain('title: Create a Silen knowledge base')
    expect(chineseTask).toContain('title: 创建 Silen 知识库')

    const publicContract = [
      manifestSource,
      apiSource,
      guide,
      englishTask,
      chineseTask,
    ].join('\n')
    expect(publicContract).not.toContain(process.cwd())
    expect(publicContract).not.toContain(path.resolve('website'))
  })

  it('dogfoods the 24-case bilingual AI evaluation suite', async () => {
    type Target = { route: string; heading?: string }
    type OfficialCase = {
      id: string
      lang?: string
      expected: {
        acceptable: Target[]
        forbidden: Target[]
        maxRank: number
      }
    }
    const suite = JSON.parse(
      await readFile(path.resolve('website/.silen/ai-evals.json'), 'utf8'),
    ) as {
      schemaVersion: number
      topK: number
      cases: OfficialCase[]
    }

    expect(suite.schemaVersion).toBe(3)
    expect(suite.topK).toBe(5)
    expect(suite.cases).toHaveLength(24)
    expect(suite.cases.filter(({ lang }) => lang === 'en-US')).toHaveLength(11)
    expect(suite.cases.filter(({ lang }) => lang === 'zh-CN')).toHaveLength(11)
    expect(suite.cases.filter(({ lang }) => lang === undefined)).toHaveLength(2)
    for (const [prefix, count] of [
      ['direct-', 6],
      ['natural-', 4],
      ['long-', 4],
      ['synonym-', 4],
      ['typo-', 2],
      ['cross-lang-', 2],
      ['hidden-', 2],
    ] as const) {
      expect(
        suite.cases.filter(({ id }) => id.startsWith(prefix)),
        prefix,
      ).toHaveLength(count)
    }
    expect(
      suite.cases
        .filter(({ id }) => id.startsWith('direct-'))
        .every(({ expected }) => expected.maxRank === 1),
    ).toBe(true)
    expect(
      suite.cases.every(
        ({ expected }) =>
          Array.isArray(expected.acceptable) &&
          Array.isArray(expected.forbidden) &&
          Number.isInteger(expected.maxRank),
      ),
    ).toBe(true)
    expect(
      suite.cases.filter(({ expected }) => expected.acceptable.length > 1)
        .length,
    ).toBeGreaterThanOrEqual(2)
    expect(
      suite.cases
        .filter(({ id }) => id.startsWith('cross-lang-'))
        .map(({ id, lang }) => ({ id, lang })),
    ).toEqual([
      { id: 'cross-lang-en-to-zh', lang: undefined },
      { id: 'cross-lang-zh-to-en', lang: undefined },
    ])
    const hidden = suite.cases.filter(({ id }) => id.startsWith('hidden-'))
    expect(
      hidden.every(
        ({ expected }) =>
          expected.acceptable.length === 0 &&
          expected.forbidden.length === 1 &&
          expected.maxRank === suite.topK,
      ),
    ).toBe(true)

    const [
      searchSource,
      aiIndexSource,
      llmsSummary,
      llmsFull,
      draftHtml,
      disabledHtml,
    ] = await Promise.all([
      readFile(path.join(result.outDir, 'search-index.json'), 'utf8'),
      readFile(path.join(result.outDir, 'ai-index.json'), 'utf8'),
      readFile(path.join(result.outDir, 'llms.txt'), 'utf8'),
      readFile(path.join(result.outDir, 'llms-full.txt'), 'utf8'),
      readFile(
        path.join(result.outDir, 'eval-fixtures/draft-sentinel/index.html'),
        'utf8',
      ),
      readFile(
        path.join(
          result.outDir,
          'zh/eval-fixtures/ai-disabled-sentinel/index.html',
        ),
        'utf8',
      ),
    ])
    const search = JSON.parse(searchSource) as {
      index: { storedFields: Record<string, { route?: string }> }
    }
    const aiIndex = JSON.parse(aiIndexSource) as {
      pages: Array<{ route: string }>
    }
    const excludedRoutes = [
      '/eval-fixtures/draft-sentinel/',
      '/zh/eval-fixtures/ai-disabled-sentinel/',
    ]
    const searchRoutes = Object.values(search.index.storedFields).map(
      ({ route }) => route,
    )
    const aiRoutes = aiIndex.pages.map(({ route }) => route)

    expect(draftHtml).toContain('Quartz harbor lantern')
    expect(disabledHtml).toContain('星槎 雾港 灯塔')
    for (const route of excludedRoutes) {
      expect(searchRoutes).not.toContain(route)
      expect(aiRoutes).not.toContain(route)
    }
    for (const sentinel of ['Quartz harbor lantern', '星槎 雾港 灯塔']) {
      expect(aiIndexSource).not.toContain(sentinel)
      expect(llmsSummary).not.toContain(sentinel)
      expect(llmsFull).not.toContain(sentinel)
    }
    await expect(
      access(path.join(result.outDir, 'eval-fixtures/draft-sentinel/index.md')),
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      access(
        path.join(
          result.outDir,
          'zh/eval-fixtures/ai-disabled-sentinel/index.md',
        ),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' })

    await expect(
      runAiEvaluation(path.resolve('website')),
    ).resolves.toMatchObject({
      schemaVersion: 3,
      ok: true,
      summary: { total: 24, passed: 24, failed: 0 },
    })
  })
})
