import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  generateAiArtifacts,
  renderLlmsTxt,
  type ArtifactOptions,
} from '../../src/ai/artifacts'
import { build, type BuildResult } from '../../src/node/build'

const root = path.resolve('tests/fixtures/ai-site')
let result: BuildResult

beforeAll(async () => {
  result = await build(root)
})

afterAll(async () => {
  await rm(path.join(root, '.silen/dist'), { force: true, recursive: true })
  await rm(path.join(root, '.silen/.temp'), { force: true, recursive: true })
})

async function expectMissing(file: string): Promise<void> {
  await expect(access(file)).rejects.toMatchObject({ code: 'ENOENT' })
}

describe('AI build artifacts', () => {
  it.each([
    ['root', '/', '/docs/'],
    ['index route', '/guide/', '/docs/guide/'],
    ['query and hash', '/guide?mode=raw#setup', '/docs/guide?mode=raw#setup'],
    ['ordinary route', '/guide/intro', '/docs/guide/intro'],
    ['route that repeats the base prefix', '/docs/intro', '/docs/docs/intro'],
  ])(
    'joins the base with a %s without prefix deduplication',
    (_name, route, expected) => {
      const manifest = renderLlmsTxt(
        { title: 'Docs', description: 'Docs.', base: '/docs/' },
        [{ route, title: 'Page', markdown: '# Page\n' }],
        false,
      )

      expect(manifest).toContain(`- [Page](${expected})`)
    },
  )

  it('emits canonical per-page Markdown and excludes drafts and opted-out pages', async () => {
    const [home, guide] = await Promise.all([
      readFile(path.join(result.outDir, 'index.md'), 'utf8'),
      readFile(path.join(result.outDir, 'guide/getting-started.md'), 'utf8'),
    ])

    expect(home).toBe(
      '# AI Fixture Home\n\nRead the [getting started guide](/guide/getting-started).\n',
    )
    expect(guide).toContain('# Getting Started\n')
    expect(guide).toContain('```sh\npnpm add silen\n```')
    await expectMissing(path.join(result.outDir, 'draft.md'))
    await expectMissing(path.join(result.outDir, 'guide/hidden.md'))
  })

  it('emits a base-aware llms manifest whose Markdown links resolve', async () => {
    const manifest = await readFile(
      path.join(result.outDir, 'llms.txt'),
      'utf8',
    )

    expect(manifest).toBe(
      [
        '# AI Fixture',
        '',
        '> Machine-readable documentation.',
        '',
        '## Documentation',
        '',
        '- [Getting Started](/knowledge/guide/getting-started.md): Install Silen',
        '- [AI Fixture Home](/knowledge/index.md): Explore the documentation',
        '',
      ].join('\n'),
    )
    const links = [...manifest.matchAll(/\]\(([^)]+\.md)\)/g)].map(
      (match) => match[1]!,
    )
    expect(links).toEqual([
      '/knowledge/guide/getting-started.md',
      '/knowledge/index.md',
    ])
    await Promise.all(
      links.map((link) =>
        access(path.join(result.outDir, link.slice('/knowledge/'.length))),
      ),
    )
  })

  it('uses base-aware HTML routes in llms.txt when Markdown routes are disabled', async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), 'silen-ai-html-links-'))
    try {
      await generateAiArtifacts({
        outDir,
        site: {
          title: 'HTML-only Docs',
          description: 'Public HTML routes.',
          base: '/project/',
        },
        pages: [
          {
            route: '/guide/',
            title: 'Guide',
            markdown: '# Guide\n',
          },
          {
            route: '/reference/api',
            title: 'API',
            markdown: '# API\n',
          },
        ],
        config: {
          llmsTxt: true,
          llmsFullTxt: true,
          markdownRoutes: false,
          index: true,
        },
      })

      const manifest = await readFile(path.join(outDir, 'llms.txt'), 'utf8')
      expect(manifest).toContain('- [Guide](/project/guide/)')
      expect(manifest).toContain('- [API](/project/reference/api)')
      expect(manifest).not.toContain('.md)')
      await expectMissing(path.join(outDir, 'guide/index.md'))
    } finally {
      await rm(outDir, { force: true, recursive: true })
    }
  })

  it('rewrites only internal Markdown destinations to mounted public routes in every AI artifact', async () => {
    const linksRoot = path.resolve('tests/fixtures/ai-links-site')
    const linksResult = await build(linksRoot)
    try {
      const [markdown, full, serializedIndex] = await Promise.all([
        readFile(
          path.join(linksResult.outDir, 'guide/getting-started.md'),
          'utf8',
        ),
        readFile(path.join(linksResult.outDir, 'llms-full.txt'), 'utf8'),
        readFile(path.join(linksResult.outDir, 'ai-index.json'), 'utf8'),
      ])
      const index = JSON.parse(serializedIndex) as {
        pages: Array<{ route: string; markdown: string }>
        chunks: Array<{ route: string; links: string[] }>
      }
      const indexedPage = index.pages.find(
        (page) => page.route === '/guide/getting-started',
      )
      const indexedLinks = index.chunks
        .filter((chunk) => chunk.route === '/guide/getting-started')
        .flatMap((chunk) => chunk.links)
      const publicOutputs = [markdown, full, indexedPage?.markdown ?? '']

      for (const output of publicOutputs) {
        expect(output).toContain(
          '/knowledge/guide/getting-started?from=relative#package-manager',
        )
        expect(output).toContain(
          '/knowledge/guide/getting-started?from=absolute#package-manager',
        )
        expect(output).toContain(
          '/knowledge/guide/getting-started?from=base#package-manager',
        )
        expect(output).toContain(
          '/knowledge/guide/getting-started?view=diagram#package-manager',
        )
        expect(output).toContain(
          '/knowledge/guide/getting-started?from=reference#package-manager',
        )
        expect(output).toContain(
          'https://example.com/reference.html?keep=1#top',
        )
        expect(output).toContain('mailto:docs@example.com')
        expect(output).toContain('](#package-manager)')
        expect(output).toContain('plain path guide/getting-started.md')
        expect(output).toContain(
          '[fenced example](./getting-started.md?from=fence#package-manager)',
        )
      }

      expect(indexedLinks).toEqual(
        expect.arrayContaining([
          '/knowledge/guide/getting-started?from=relative#package-manager',
          '/knowledge/guide/getting-started?from=absolute#package-manager',
          '/knowledge/guide/getting-started?from=base#package-manager',
          '/knowledge/guide/getting-started?from=reference#package-manager',
          'https://example.com/reference.html?keep=1#top',
          'mailto:docs@example.com',
          '#package-manager',
        ]),
      )
    } finally {
      await rm(path.join(linksRoot, '.silen/dist'), {
        force: true,
        recursive: true,
      })
      await rm(path.join(linksRoot, '.silen/.temp'), {
        force: true,
        recursive: true,
      })
    }
  })

  it('emits LF-terminated full context and stable two-space JSON without private fields', async () => {
    const [full, serializedIndex] = await Promise.all([
      readFile(path.join(result.outDir, 'llms-full.txt'), 'utf8'),
      readFile(path.join(result.outDir, 'ai-index.json'), 'utf8'),
    ])
    const index = JSON.parse(serializedIndex) as Record<string, unknown>
    const publicOutput = `${full}\n${serializedIndex}`

    expect(full).toContain('# Getting Started')
    expect(full).toContain('# AI Fixture Home')
    expect(full).not.toContain('Draft page')
    expect(full).not.toContain('Hidden page')
    expect(full).not.toContain('\r')
    expect(full.endsWith('\n')).toBe(true)
    expect(full.endsWith('\n\n')).toBe(false)

    expect(index.version).toBe(1)
    expect(index.generatedBy).toBe('Silen')
    expect(index.pages).toEqual([
      {
        route: '/guide/getting-started',
        title: 'Getting Started',
        markdown:
          '# Getting Started\n\nInstall the package.\n\n## Package manager\n\n```sh\npnpm add silen\n```\n',
        description: 'Install Silen',
      },
      {
        route: '/',
        title: 'AI Fixture Home',
        markdown:
          '# AI Fixture Home\n\nRead the [getting started guide](/guide/getting-started).\n',
        description: 'Explore the documentation',
      },
    ])
    expect(index.chunks).toEqual(expect.any(Array))
    expect(
      (index.chunks as Array<Record<string, unknown>>)[0],
    ).not.toHaveProperty('file')
    expect(serializedIndex).toBe(`${JSON.stringify(index, null, 2)}\n`)
    expect(publicOutput).not.toContain('\r')
    expect(publicOutput).not.toContain(root)
    expect(publicOutput).not.toContain(process.cwd())
    expect(publicOutput).not.toContain('.mdx')
    expect(publicOutput).not.toContain('never-publish-this-token')
    expect(publicOutput).not.toContain('privateToken')
    expect(publicOutput).not.toContain('configFile')
    expect(publicOutput).not.toContain('outDir')
  })
})

describe('generateAiArtifacts', () => {
  const site = {
    title: 'Deterministic Docs',
    description: 'Stable output.',
    base: '/project/',
  }
  const pages = [
    {
      route: '/guide/',
      title: 'Guide',
      description: 'Read the guide',
      markdown: '# Guide\r\n\r\nStable content.\r\n',
    },
  ]
  const allEnabled = {
    llmsTxt: true,
    llmsFullTxt: true,
    markdownRoutes: true,
    index: true,
  }

  it('produces byte-identical artifacts for identical input', async () => {
    const [firstRoot, secondRoot] = await Promise.all([
      mkdtemp(path.join(os.tmpdir(), 'silen-ai-first-')),
      mkdtemp(path.join(os.tmpdir(), 'silen-ai-second-')),
    ])
    const options = (outDir: string): ArtifactOptions => ({
      outDir,
      site,
      pages,
      config: allEnabled,
    })

    try {
      await Promise.all([
        generateAiArtifacts(options(firstRoot)),
        generateAiArtifacts(options(secondRoot)),
      ])
      const files = [
        'guide/index.md',
        'llms.txt',
        'llms-full.txt',
        'ai-index.json',
      ]
      const [first, second] = await Promise.all(
        [firstRoot, secondRoot].map((directory) =>
          Promise.all(
            files.map((file) => readFile(path.join(directory, file), 'utf8')),
          ),
        ),
      )

      expect(first).toEqual(second)
    } finally {
      await Promise.all([
        rm(firstRoot, { force: true, recursive: true }),
        rm(secondRoot, { force: true, recursive: true }),
      ])
    }
  })

  it.each([
    ['llmsTxt', 'llms.txt'],
    ['llmsFullTxt', 'llms-full.txt'],
    ['markdownRoutes', 'guide/index.md'],
    ['index', 'ai-index.json'],
  ] as const)('can disable only %s', async (flag, disabledFile) => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), `silen-ai-${flag}-`))
    try {
      await generateAiArtifacts({
        outDir,
        site,
        pages,
        config: { ...allEnabled, [flag]: false },
      })
      await expectMissing(path.join(outDir, disabledFile))
      const expectedFiles = [
        ['llmsTxt', 'llms.txt'],
        ['llmsFullTxt', 'llms-full.txt'],
        ['markdownRoutes', 'guide/index.md'],
        ['index', 'ai-index.json'],
      ] as const
      await Promise.all(
        expectedFiles
          .filter(([enabledFlag]) => enabledFlag !== flag)
          .map(([, file]) => access(path.join(outDir, file))),
      )
    } finally {
      await rm(outDir, { force: true, recursive: true })
    }
  })
})
