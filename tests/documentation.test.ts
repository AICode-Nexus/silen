import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const documentationRoutes = [
  'guide/index.mdx',
  'guide/plugins.mdx',
  'guide/project-structure/index.mdx',
  'guide/configuration/index.mdx',
  'guide/markdown-mdx/index.mdx',
  'guide/cli-deployment/index.mdx',
  'theme/index.mdx',
  'theme/tokens/index.mdx',
  'theme/extensions-accessibility/index.mdx',
  'integrations/index.mdx',
  'ai/index.mdx',
  'ai/agent-contract/index.mdx',
  'ai/local-workspace-mcp/index.mdx',
  'reference/index.mdx',
  'plugins/index.mdx',
] as const

const sidebarRoutes = [
  '/guide/',
  '/guide/plugins',
  '/guide/project-structure/',
  '/guide/configuration/',
  '/guide/markdown-mdx/',
  '/guide/cli-deployment/',
  '/theme/',
  '/theme/tokens/',
  '/theme/extensions-accessibility/',
  '/integrations/',
  '/ai/',
  '/ai/agent-contract/',
  '/ai/local-workspace-mcp/',
  '/reference/',
] as const

const outputPaths = [
  '/silen/llms.txt',
  '/silen/llms-full.txt',
  '/silen/ai-index.json',
  '/silen/.well-known/silen/manifest.json',
] as const

async function source(relativePath: string): Promise<string> {
  return readFile(path.resolve(relativePath), 'utf8')
}

describe('0.2.0 product documentation', () => {
  it('ships every planned route in mirrored English and Chinese trees', async () => {
    for (const route of documentationRoutes) {
      const [english, chinese] = await Promise.all([
        source(path.join('website', route)),
        source(path.join('website/zh', route)),
      ])

      expect(english, route).toMatch(/^---[\s\S]*?title:/)
      expect(chinese, `zh/${route}`).toMatch(/^---[\s\S]*?title:/)
      expect(english.length, route).toBeGreaterThan(500)
      expect(chinese.length, `zh/${route}`).toBeGreaterThan(300)
    }
  })

  it('keeps the complete route plan reachable from mirrored sidebars', async () => {
    const config = await source('website/.silen/config.ts')

    for (const route of sidebarRoutes) {
      expect(config, route).toContain(`link: '${route}'`)
      expect(config, `/zh${route}`).toContain(`link: '/zh${route}'`)
    }
  })

  it('orders one activation, live outputs, three proofs, then community', async () => {
    const homes = [
      {
        file: 'website/index.mdx',
        sections: [
          'activation-title',
          'live-outputs-title',
          'proof-title',
          'community-title',
        ],
        quickStart: '/silen/guide/',
        markdown: '/silen/guide/index.md',
      },
      {
        file: 'website/zh/index.mdx',
        sections: [
          'activation-title',
          'live-outputs-title',
          'proof-title',
          'community-title',
        ],
        quickStart: '/silen/zh/guide/',
        markdown: '/silen/zh/guide/index.md',
      },
    ] as const

    for (const home of homes) {
      const content = await source(home.file)
      const positions = home.sections.map((section) =>
        content.indexOf(`id="${section}"`),
      )
      expect(positions, home.file).toEqual([...positions].sort((a, b) => a - b))
      expect(positions[0], home.file).toBeGreaterThan(-1)
      expect(content, home.file).toContain('pnpm add -D @aicode-nexus/silen')
      expect(content, home.file).toContain('pnpm silen init docs')
      expect(content, home.file).toContain('pnpm silen dev docs')
      expect(content, home.file).toContain(`href="${home.quickStart}"`)
      expect(content, home.file).toContain(`href="${home.markdown}"`)
      for (const output of outputPaths) {
        expect(content, home.file).toContain(`href="${output}"`)
      }
      expect(
        content.match(/className="silen-home-proof"/g),
        home.file,
      ).toHaveLength(3)
    }
  })

  it('renders the QR only on the Chinese homepage and no config feature row', async () => {
    const [english, chinese, config] = await Promise.all([
      source('website/index.mdx'),
      source('website/zh/index.mdx'),
      source('website/.silen/config.ts'),
    ])

    expect(english).not.toContain('wechat-ai-dev-hub')
    expect(chinese).toContain('wechat-ai-dev-hub.png')
    expect(chinese).toContain('loading="lazy"')
    expect(config).not.toMatch(/home:\s*\{[\s\S]*?features:\s*\[/)
  })

  it('keeps README as a concise npm quick reference with official links', async () => {
    const readme = await source('README.md')

    expect(readme.length).toBeLessThan(8_000)
    expect(readme).toContain('Node.js `^20.19.0 || >=22.12.0`')
    expect(readme).toContain('pnpm silen init docs')
    expect(readme).toContain('pnpm silen dev docs')
    expect(readme).toContain('pnpm silen build docs')
    expect(readme).toContain('https://aicode-nexus.github.io/silen/guide/')
    expect(readme).toContain('https://aicode-nexus.github.io/silen/reference/')
    expect(readme).toContain('https://aicode-nexus.github.io/silen/ai/')
    expect(readme).toContain('MIT')
    expect(readme).toContain('Contributing')
  })

  it('records the dated 0.2.0 documentation checkpoint', async () => {
    const changelog = await source('CHANGELOG.md')

    expect(changelog).toContain('## [0.2.0] - 2026-07-17')
    expect(changelog).toContain('silen init')
    expect(changelog).toContain('search v2')
    expect(changelog).toContain('SEO')
    expect(changelog).toContain('bilingual')
    expect(changelog).toContain('## [0.1.4] - 2026-07-17')
  })
})
