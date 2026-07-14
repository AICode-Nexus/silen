import { expect, it } from 'vitest'
import { serializePageMarkdown } from '../../src/node/markdown-output'

it('removes executable imports while preserving prose and fenced code', () => {
  const output = serializePageMarkdown({
    route: '/guide/',
    source:
      "import { Demo } from './Demo'\n\n# Guide\n\n```ts\nconst x = 1\n```",
    frontmatter: { title: 'Guide' },
  } as never)

  expect(output).not.toContain('import { Demo }')
  expect(output).toContain('# Guide')
  expect(output).toContain('```ts')
  expect(output).toContain('const x = 1')
})

it('omits empty interactive JSX while preserving authored callout text', () => {
  const output = serializePageMarkdown({
    route: '/guide/',
    source: [
      "import { Demo } from './Demo'",
      '',
      '# Guide',
      '',
      '<Demo client:load />',
      '',
      '<Callout>Read the [install guide](/install/).</Callout>',
      '',
      '- Keep list content',
      '',
      '| Command | Purpose |',
      '| --- | --- |',
      '| `pnpm` | Install |',
    ].join('\n'),
    frontmatter: { title: 'Guide' },
  } as never)

  expect(output).not.toContain('Demo')
  expect(output).not.toContain('Callout')
  expect(output).toContain('Read the [install guide](/install/).')
  expect(output).toContain('- Keep list content')
  expect(output).toContain('| Command | Purpose |')
  expect(output).toContain('| `pnpm` | Install |')
})

it('normalizes identical pages to byte-identical LF-terminated Markdown', () => {
  const page = {
    route: '/guide/',
    source: '# Guide\r\n\r\nParagraph.\r\n',
    frontmatter: { title: 'Guide' },
  } as never

  const first = serializePageMarkdown(page)
  const second = serializePageMarkdown(page)

  expect(first).toBe(second)
  expect(first).not.toContain('\r')
  expect(first.endsWith('\n')).toBe(true)
  expect(first.endsWith('\n\n')).toBe(false)
})
