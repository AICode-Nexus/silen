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

    for (const command of ['ai init', 'ai index', 'ai audit', 'ai eval']) {
      expect(workspace).toContain(command)
    }
    for (const documentation of [artifacts, workspace]) {
      expect(documentation).toMatch(/without (?:an AI )?model|no model/i)
    }
    expect(workspace).toContain('.silen/ai-evals.json')
    expect(workspace).toContain('search-index.json')
    expect(workspace).toMatch(/optional.*\.silen\/ai\/index\.json/is)
    expect(integrations).toContain('NDJSON')
    expect(integrations).toContain('provider keys')
    expect(integrations).toMatch(/no endpoint.*no Ask AI.*bundle/is)
  })

  it('documents the exact bilingual Ask AI request and streaming protocol', async () => {
    const [english, chinese] = await Promise.all([
      readFile('website/integrations/index.mdx', 'utf8'),
      readFile('website/zh/integrations/index.mdx', 'utf8'),
    ])

    for (const documentation of [english, chinese]) {
      for (const value of [
        'Content-Type: application/json',
        'route: string',
        'selectedText?: string',
        "role: 'user' | 'assistant'",
        'content: string',
        '"route": "/guide/"',
        '"messages": [',
        'application/x-ndjson',
        'application/ndjson',
        '{"type":"text","value":"Install with pnpm."}',
        '{"type":"citation","title":"Quick start","url":"/guide/"}',
        '{"type":"error","message":"Unable to answer."}',
        'AbortSignal',
      ]) {
        expect(documentation).toContain(value)
      }
    }

    expect(english).toContain('server-side authentication')
    expect(english).toContain('provider keys')
    expect(english).toMatch(/raw\s+provider errors/)
    expect(english).toContain('cancellation')
    expect(english).toMatch(/no endpoint.*no Ask AI control.*bundle/is)
    expect(chinese).toContain('服务端鉴权')
    expect(chinese).toContain('provider key')
    expect(chinese).toContain('原始 provider 错误')
    expect(chinese).toContain('取消')
    expect(chinese).toMatch(/未配置端点.*Ask AI 控件.*bundle/is)
  })
})
