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
