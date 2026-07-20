import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('shiki')
  vi.resetModules()
  vi.restoreAllMocks()
})

describe('server-side syntax highlighting', () => {
  it('emits escaped dual-theme Shiki markup without source paths', async () => {
    const { highlightCode } = await import('../../src/node/highlight')
    const highlighted = await highlightCode(
      'const element = "<script>alert(1)</script>"',
      'typescript',
    )

    expect(highlighted).toContain('class="shiki shiki-themes')
    expect(highlighted).toContain('--shiki-dark')
    expect(highlighted).toContain('class="line"')
    expect(highlighted).not.toContain('<script>')
    expect(highlighted).not.toContain(process.cwd())
    expect(highlighted).not.toContain('file://')
  })

  it('falls back safely when the requested language is unknown', async () => {
    const { highlightCode } = await import('../../src/node/highlight')

    await expect(
      highlightCode('<unknown>& value', 'not-a-real-language'),
    ).resolves.toMatch(/&#x3C;unknown>|&lt;unknown>/)
  })

  it.each([
    ['mdx', 'import Demo from "./Demo"'],
    ['python', 'def greet(name):\n    return f"Hello {name}"'],
  ])('loads the bundled %s grammar on demand', async (language, code) => {
    const { highlightCode } = await import('../../src/node/highlight')

    const highlighted = await highlightCode(code, language)

    expect(highlighted).toContain('<span style=')
  })

  it('highlights ndjson with the JSON Lines grammar', async () => {
    const { highlightCode } = await import('../../src/node/highlight')

    const highlighted = await highlightCode('{"type":"text"}', 'ndjson')

    expect(highlighted.match(/<span style=/g)?.length ?? 0).toBeGreaterThan(1)
  })

  it('creates one cached highlighter for concurrent and later calls', async () => {
    const codeToHtml = vi.fn(
      (code: string) => `<pre><code>${code}</code></pre>`,
    )
    const codeToHast = vi.fn(() => ({ type: 'root', children: [] }))
    const createHighlighter = vi.fn(() =>
      Promise.resolve({
        codeToHast,
        codeToHtml,
        getLoadedLanguages: () => ['text', 'typescript'],
      }),
    )
    vi.doMock('shiki', () => ({
      bundledLanguages: { typescript: () => Promise.resolve([]) },
      createHighlighter,
    }))
    const { highlightCode } = await import('../../src/node/highlight')

    await Promise.all([
      highlightCode('one', 'typescript'),
      highlightCode('two', 'typescript'),
    ])
    await highlightCode('three', 'typescript')

    expect(createHighlighter).toHaveBeenCalledTimes(1)
    expect(codeToHtml).toHaveBeenCalledTimes(3)
  })
})
