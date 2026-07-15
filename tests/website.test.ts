import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('example website homepage', () => {
  it('ships an explanatory workflow SVG', async () => {
    const source = await readFile(
      path.resolve('website/public/silen-workflow.svg'),
      'utf8',
    )
    expect(source).toContain('<svg')
    expect(source).toContain('MDX')
    expect(source).toContain('Static HTML')
    expect(source).toContain('llms.txt')
    expect(source).toContain('MCP')
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
})
