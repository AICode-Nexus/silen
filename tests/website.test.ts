import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
  it('ships the generated workflow illustration as a web-sized PNG', async () => {
    const source = await readFile(
      path.resolve('website/public/silen-workflow.png'),
    )
    expect([...source.subarray(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
    expect(source.readUInt32BE(16)).toBe(1200)
    expect(source.readUInt32BE(20)).toBe(800)
  })

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
        'Start in seconds',
        'One source, two audiences',
        'What every build ships',
        'Stay connected',
        'AI Dev Hub on WeChat',
      ],
    },
    {
      file: 'website/zh/index.mdx',
      markers: [
        '几秒内开始',
        '一份内容，两类读者',
        '每次构建都会产出',
        '联系与关注',
        '微信公众号：AI Dev Hub',
      ],
    },
  ])('keeps $file complete and localized', async ({ file, markers }) => {
    const source = await readFile(path.resolve(file), 'utf8')
    for (const marker of markers) expect(source).toContain(marker)
    expect(source).toContain('wechat-ai-dev-hub.png')
    expect(source).toContain('width={344}')
    expect(source).toContain('height={344}')
    expect(source).toContain('loading="lazy"')
  })

  it('emits four non-nested lede paragraphs per locale', async () => {
    for (const file of ['index.html', 'zh/index.html']) {
      const html = await readFile(path.join(result.outDir, file), 'utf8')
      const ledes = [
        ...html.matchAll(/<p class="silen-home-lede">([\s\S]*?)<\/p>/g),
      ]

      expect(ledes, file).toHaveLength(4)
      for (const [, content] of ledes) {
        expect(content, file).not.toMatch(/<\/?p(?:\s|>)/)
        expect(content?.trim(), file).not.toBe('')
      }
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
})
