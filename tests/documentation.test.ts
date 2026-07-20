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
      expect(content, home.file).not.toContain('pnpm add react')
      expect(content, home.file).toContain('pnpm add -D @aicode-nexus/silen')
      expect(content, home.file).not.toContain('--allow-build=esbuild')
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

  it('documents draft as AI exclusion without implying route privacy', async () => {
    const [english, chinese] = await Promise.all([
      source('website/guide/markdown-mdx/index.mdx'),
      source('website/zh/guide/markdown-mdx/index.mdx'),
    ])

    expect(english).toContain(
      '`draft: true` excludes the page from AI-readable artifacts and indexes only.',
    )
    expect(english).toContain(
      'does not stop route scanning, building, or publishing',
    )
    expect(english).toMatch(
      /Never store private\s+content in the content tree\./,
    )
    expect(chinese).toContain(
      '`draft: true` 只会让页面退出 AI 可读产物与索引。',
    )
    expect(chinese).toContain('不会阻止路由扫描、构建或发布')
    expect(chinese).toContain('不要把私密内容放入内容树。')
  })

  it('distinguishes compiler routes from generated and served paths', async () => {
    const [english, chinese] = await Promise.all([
      source('website/guide/project-structure/index.mdx'),
      source('website/zh/guide/project-structure/index.mdx'),
    ])

    expect(english).toMatch(/`guide\/index\.mdx`[^.]*compiler route `\/guide`/)
    expect(english).toContain('`guide/index.html`')
    expect(english).toContain('usual browser URL `/guide/`')
    expect(english).not.toContain('`guide/index.mdx` maps to `/guide/`')
    expect(chinese).toMatch(/`guide\/index\.mdx`[^。]*编译器路由是 `\/guide`/)
    expect(chinese).toContain('`guide/index.html`')
    expect(chinese).toContain('通常以 `/guide/` 访问')
    expect(chinese).not.toContain('`guide/index.mdx` 对应 `/guide/`')
  })

  it('documents actual nav link and locale language resolution semantics', async () => {
    const [english, chinese] = await Promise.all([
      source('website/theme/index.mdx'),
      source('website/zh/theme/index.mdx'),
    ])

    expect(english).toMatch(
      /HTTP\(S\) nav links use ordinary\s+browser navigation in the current context\./,
    )
    expect(english).toMatch(
      /MDX-authored\s+links can explicitly set `target="_blank"` and `rel="noopener noreferrer"`/,
    )
    expect(english).toMatch(
      /The longest matching configured locale root\s+controls document and search language\./,
    )
    expect(english).toContain('Frontmatter `lang` does not override')
    expect(chinese).toContain(
      'HTTP(S) 导航链接会在当前上下文中按浏览器普通导航处理。',
    )
    expect(chinese).toContain(
      'MDX 正文链接可显式设置 `target="_blank"` 与 `rel="noopener noreferrer"`',
    )
    expect(chinese).toContain(
      '匹配长度最长的已配置 locale root 决定文档与搜索语言。',
    )
    expect(chinese).toContain('frontmatter `lang` 不会覆盖')
  })

  it('limits siteUrl claims to SEO and keeps AI artifact URLs base-relative', async () => {
    const [
      englishCli,
      chineseCli,
      englishConfig,
      chineseConfig,
      englishContract,
      chineseContract,
    ] = await Promise.all([
      source('website/guide/cli-deployment/index.mdx'),
      source('website/zh/guide/cli-deployment/index.mdx'),
      source('website/guide/configuration/index.mdx'),
      source('website/zh/guide/configuration/index.mdx'),
      source('website/ai/agent-contract/index.mdx'),
      source('website/zh/ai/agent-contract/index.mdx'),
    ])

    expect(englishCli).toMatch(
      /Markdown and Agent Contract\s+URLs remain base-relative\./,
    )
    expect(chineseCli).toContain(
      'Markdown 与 Agent Contract URL 仍是 base 相对路径。',
    )
    expect(englishConfig).toMatch(
      /Markdown and Agent Contract URLs remain\s+base-relative\./,
    )
    expect(chineseConfig).toContain(
      'Markdown 与 Agent Contract URL 仍是 base 相对路径。',
    )
    expect(englishContract).toContain(
      'The manifest schema has no deployment origin field.',
    )
    expect(chineseContract).toContain(
      'manifest schema 不包含部署 origin 字段。',
    )

    for (const content of [englishCli, englishConfig, englishContract]) {
      expect(content).not.toMatch(/Agent Contract URLs?[^.]*siteUrl/i)
      expect(content).not.toMatch(/manifest[^.]*deployed origin/i)
    }
    for (const content of [chineseCli, chineseConfig, chineseContract]) {
      expect(content).not.toMatch(/Agent Contract URL[^。]*siteUrl/i)
      expect(content).not.toMatch(/manifest[^。]*部署来源/i)
    }
  })

  it('keeps homepage imports limited to rendered symbols', async () => {
    const english = await source('website/index.mdx')

    expect(english).not.toContain('FileTextIcon')
  })

  it('keeps README as a concise npm quick reference with official links', async () => {
    const readme = await source('README.md')

    expect(readme.length).toBeLessThan(8_000)
    expect(readme).toContain('Node.js `^20.19.0 || >=22.12.0`')
    expect(readme).not.toContain('pnpm add react')
    expect(readme).toContain('React runtime automatically')
    expect(readme).toContain('pnpm silen init docs')
    expect(readme).toContain('pnpm add -D @aicode-nexus/silen')
    expect(readme).not.toContain('--allow-build=esbuild')
    expect(readme).toContain('pnpm silen dev docs')
    expect(readme).toContain('pnpm silen build docs')
    expect(readme).toContain('GFM tables')
    expect(readme).toContain('light/dark hero artwork')
    expect(readme).toContain('https://aicode-nexus.github.io/silen/guide/')
    expect(readme).toContain('https://aicode-nexus.github.io/silen/reference/')
    expect(readme).toContain('https://aicode-nexus.github.io/silen/ai/')
    expect(readme).toContain('MIT')
    expect(readme).toContain('Contributing')
  })

  it('documents the bundled React runtime in both quick-start guides', async () => {
    const guides = await Promise.all([
      source('website/guide/index.mdx'),
      source('website/zh/guide/index.mdx'),
    ])

    for (const guide of guides) {
      const silen = guide.indexOf('pnpm add -D @aicode-nexus/silen')

      expect(silen).toBeGreaterThan(-1)
      expect(guide).not.toContain('pnpm add react')
      expect(guide).not.toContain('--allow-build=esbuild')
      expect(guide).toMatch(/automatically|自动安装/)
      expect(guide).toContain('react/jsx-runtime')
    }
  })

  it('keeps esbuild approval conditional in troubleshooting', async () => {
    const references = await Promise.all([
      source('website/reference/index.mdx'),
      source('website/zh/reference/index.mdx'),
    ])

    for (const reference of references) {
      expect(reference).toContain('pnpm approve-builds esbuild')
      expect(reference).toMatch(/build already succeeds|构建已经成功/)
    }
  })

  it('records the dated 0.3.0 and 0.2.x documentation checkpoints', async () => {
    const changelog = await source('CHANGELOG.md')

    expect(changelog).toContain('## [0.3.0] - 2026-07-20')
    expect(changelog).toContain('GitHub-flavored Markdown')
    expect(changelog).toContain('ThemeHomeImage.darkSrc')
    expect(changelog).toContain('## [0.2.1] - 2026-07-18')
    expect(changelog).toContain('react/jsx-runtime')
    expect(changelog).toContain('## [0.2.0] - 2026-07-17')
    expect(changelog).toContain('silen init')
    expect(changelog).toContain('search v2')
    expect(changelog).toContain('SEO')
    expect(changelog).toContain('bilingual')
    expect(changelog).toContain('## [0.1.4] - 2026-07-17')
  })
})
