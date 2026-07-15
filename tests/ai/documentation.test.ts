import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('AI Alpha documentation contract', () => {
  it('documents artifacts, MCP permissions, AI commands, and endpoint-only Ask AI', async () => {
    const readme = await readFile('README.md', 'utf8')

    for (const value of [
      '/handbook/llms.txt',
      '/handbook/llms-full.txt',
      '/handbook/ai-index.json',
      '/handbook/guide/index.md',
      'draft: true',
      'ai: false',
      'llmsTxt',
      'llmsFullTxt',
      'markdownRoutes',
      'index',
      'emerging convention',
    ]) {
      expect(readme).toContain(value)
    }

    expect(readme).toContain('"command": "pnpm"')
    expect(readme).toContain('"args": ["silen", "mcp", "docs"]')
    for (const tool of [
      '`guide`',
      '`list`',
      '`search`',
      '`read`',
      '`backlinks`',
      '`citations`',
      '`build`',
    ]) {
      expect(readme).toContain(tool)
    }
    expect(readme).toMatch(/build.*preflight/is)
    expect(readme).toContain('--allow-write')
    expect(readme).toContain('2 MiB')

    for (const value of [
      '@aicode-nexus/silen/agent/manifest.json',
      '@aicode-nexus/silen/agent/api.json',
      '@aicode-nexus/silen/agent/tasks/create-site.md',
      '/handbook/.well-known/silen/manifest.json',
      "instructions: '.silen/ai-public.md'",
      "tasksDir: '.silen/ai-tasks'",
      'Codex, Claude Code, Cursor',
      'fall back to linked public Markdown and remain read-only',
    ]) {
      expect(readme).toContain(value)
    }

    for (const command of ['ai init', 'ai index', 'ai audit']) {
      expect(readme).toContain(command)
    }
    expect(readme).toContain('application/x-ndjson')
    expect(readme).toContain('Provider keys stay on the server')
    expect(readme).toMatch(/no\s+endpoint.*no Ask AI.*bundle/is)
  })
})
