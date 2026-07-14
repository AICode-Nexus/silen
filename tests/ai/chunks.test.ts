import { expect, it } from 'vitest'
import { createAiChunks } from '../../src/ai/chunks'

it('creates stable section IDs from route and heading ancestry', () => {
  const chunks = createAiChunks({
    route: '/guide/',
    title: 'Guide',
    markdown:
      '# Guide\n\nIntroduction.\n\n## Install\n\nRun pnpm.\n\n### Windows\n\nUse PowerShell.',
  })

  expect(chunks.map((chunk) => chunk.id)).toEqual([
    '/guide/',
    '/guide/#install',
    '/guide/#install/windows',
  ])
  expect(chunks.map((chunk) => chunk.headingPath)).toEqual([
    [],
    ['Install'],
    ['Install', 'Windows'],
  ])
  expect(chunks.map((chunk) => chunk.order)).toEqual([0, 1, 2])
})

it('extracts prose, fenced code, and links into their section chunk', () => {
  const chunks = createAiChunks({
    route: '/guide/',
    title: 'Guide',
    markdown: [
      '# Guide',
      '',
      'Introduction.',
      '',
      '## Install',
      '',
      'Read the [setup notes](/setup/) before running:',
      '',
      '```sh',
      'pnpm install',
      '```',
    ].join('\n'),
  })

  expect(chunks[0]?.text).toContain('Introduction.')
  expect(chunks[1]).toMatchObject({
    title: 'Guide',
    headingPath: ['Install'],
    links: ['/setup/'],
    code: [{ language: 'sh', value: 'pnpm install' }],
  })
  expect(chunks[1]?.text).toContain('Read the setup notes before running:')
})

it('suffixes duplicate headings deterministically', () => {
  const page = {
    route: '/guide/',
    title: 'Guide',
    markdown: '# Guide\n\n## Install\n\nFirst.\n\n## Install\n\nSecond.',
  }

  const first = createAiChunks(page)
  const second = createAiChunks(page)

  expect(first).toEqual(second)
  expect(first.map((chunk) => chunk.id)).toEqual([
    '/guide/',
    '/guide/#install',
    '/guide/#install-1',
  ])
})

it('keeps generated IDs unique when authored slugs overlap duplicate suffixes', () => {
  const page = {
    route: '/guide/',
    title: 'Guide',
    markdown:
      '# Guide\n\n## A\n\nFirst.\n\n## A-1\n\nSecond.\n\n## A\n\nThird.',
  }

  const first = createAiChunks(page)
  const second = createAiChunks(page)
  const ids = first.map((chunk) => chunk.id)

  expect(first).toEqual(second)
  expect(ids).toEqual(['/guide/', '/guide/#a', '/guide/#a-1', '/guide/#a-2'])
  expect(new Set(ids).size).toBe(ids.length)
})

it('keeps H4 through H6 headings searchable without creating new chunks', () => {
  const chunks = createAiChunks({
    route: '/guide/',
    title: 'Guide',
    markdown: [
      '# Guide',
      '',
      '## Install',
      '',
      'Intro.',
      '',
      '#### Linux',
      '',
      'Linux notes.',
      '',
      '##### Package manager',
      '',
      'Choose pnpm.',
      '',
      '###### CI',
      '',
      'Run builds.',
      '',
      '### Advanced',
      '',
      'Advanced notes.',
    ].join('\n'),
  })

  expect(chunks).toHaveLength(3)
  expect(chunks[1]).toMatchObject({
    headingPath: ['Install'],
    text: 'Intro. Linux Linux notes. Package manager Choose pnpm. CI Run builds.',
  })
  expect(chunks[2]).toMatchObject({
    headingPath: ['Install', 'Advanced'],
    text: 'Advanced notes.',
  })
})

it('resolves reference-style links from definitions into their section chunk', () => {
  const chunks = createAiChunks({
    route: '/guide/',
    title: 'Guide',
    markdown: [
      '# Guide',
      '',
      '## Install',
      '',
      'Read the [setup notes][setup].',
      '',
      '## Next',
      '',
      'Continue reading.',
      '',
      '[setup]: /setup/ "Setup"',
    ].join('\n'),
  })

  expect(chunks[1]?.links).toEqual(['/setup/'])
})

it.each([{ draft: true as const }, { ai: false as const }])(
  'creates no chunks for an excluded page: %o',
  (control) => {
    expect(
      createAiChunks({
        route: '/private/',
        title: 'Private',
        markdown: '# Private',
        ...control,
      }),
    ).toEqual([])
  },
)
