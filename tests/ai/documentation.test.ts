import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('AI Alpha documentation contract', () => {
  it('documents artifacts, MCP permissions, AI commands, and endpoint-only Ask AI', async () => {
    const [artifacts, contract, workspace, integrations] = await Promise.all([
      readFile('website/ai/index.mdx', 'utf8'),
      readFile('website/ai/agent-contract/index.mdx', 'utf8'),
      readFile('website/ai/local-workspace-mcp/index.mdx', 'utf8'),
      readFile('website/integrations/index.mdx', 'utf8'),
    ])

    for (const value of [
      'llms.txt',
      'llms-full.txt',
      'ai-index.json',
      'clean Markdown routes',
      'draft: true',
      'ai: false',
    ]) {
      expect(artifacts).toContain(value)
    }

    expect(workspace).toContain('"command": "pnpm"')
    expect(workspace).toContain('"args": ["silen", "mcp", "docs"]')
    for (const tool of [
      '`guide`',
      '`list`',
      '`search`',
      '`read`',
      '`backlinks`',
      '`citations`',
      '`build`',
    ]) {
      expect(workspace).toContain(tool)
    }
    expect(workspace).toMatch(/build.*preflight/is)
    expect(workspace).toContain('--allow-write')
    expect(workspace).toContain('2 MiB')

    for (const value of [
      '@aicode-nexus/silen/agent/manifest.json',
      "instructions: '.silen/ai-public.md'",
      "tasksDir: '.silen/ai-tasks'",
      'Codex, Claude Code, Cursor',
      'linked public Markdown and remain',
      'read-only',
    ]) {
      expect(contract).toContain(value)
    }

    for (const command of ['ai init', 'ai index', 'ai audit']) {
      expect(workspace).toContain(command)
    }
    expect(integrations).toContain('NDJSON')
    expect(integrations).toContain('provider keys')
    expect(integrations).toMatch(/no endpoint.*no Ask AI.*bundle/is)
  })
})
