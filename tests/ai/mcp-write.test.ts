import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMcpServer } from '../../src/ai/mcp/server'
import { createWorkspace } from '../../src/ai/workspace'

const clients: Client[] = []
const roots: string[] = []

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  )
})

async function startTestMcp(options: { allowWrite?: boolean } = {}) {
  const root = await mkdtemp(path.resolve('.silen/.temp/mcp-write-'))
  roots.push(root)
  const workspace = await createWorkspace(root)
  const server = createMcpServer({ workspace, ...options })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'silen-write-test', version: '1.0.0' })
  clients.push(client)
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return { client, root }
}

function text(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = (
    result as { content?: Array<{ type: string; text?: string }> }
  ).content
  const block = content?.[0]
  return block?.type === 'text' ? (block.text ?? '') : ''
}

function jsonResult(
  result: Awaited<ReturnType<Client['callTool']>>,
): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text(result))
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('Expected an object tool result')
  }
  return parsed as Record<string, unknown>
}

describe('MCP write permission gate', () => {
  it('keeps the default server at exactly seven read-only tools', async () => {
    const { client } = await startTestMcp()
    const listed = await client.listTools()
    expect(listed.tools.map((tool) => tool.name)).toEqual([
      'guide',
      'list',
      'search',
      'read',
      'backlinks',
      'citations',
      'build',
    ])
  })

  it('registers mutation tools only with explicit permission and accurate annotations', async () => {
    const { client } = await startTestMcp({ allowWrite: true })
    const listed = await client.listTools()
    expect(listed.tools.map((tool) => tool.name)).toEqual([
      'guide',
      'list',
      'search',
      'read',
      'backlinks',
      'citations',
      'build',
      'write',
      'link',
      'append',
    ])

    const write = listed.tools.find((tool) => tool.name === 'write')
    expect(write?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    })
    for (const name of ['link', 'append']) {
      const tool = listed.tools.find((candidate) => candidate.name === name)
      expect(tool?.annotations).toEqual({
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      })
    }
  })

  it('calls create, replace, append, and relative-link mutations', async () => {
    const { client, root } = await startTestMcp({ allowWrite: true })
    await mkdir(path.join(root, 'docs'))
    await writeFile(path.join(root, 'target.mdx'), '# Target\n')

    const created = await client.callTool({
      name: 'write',
      arguments: { path: 'docs/page.md', content: '# Created\r\n' },
    })
    expect(created.isError).not.toBe(true)
    expect(jsonResult(created)).toMatchObject({
      path: 'docs/page.md',
      created: true,
    })
    const replaced = await client.callTool({
      name: 'write',
      arguments: { path: 'docs/page.md', content: '# Replaced\n' },
    })
    expect(jsonResult(replaced)).toMatchObject({ created: false })
    await client.callTool({
      name: 'append',
      arguments: { path: 'docs/page.md', content: 'Details' },
    })
    await client.callTool({
      name: 'link',
      arguments: {
        path: 'docs/page.md',
        target: 'target.mdx',
        label: 'Target',
      },
    })

    expect(await readFile(path.join(root, 'docs/page.md'), 'utf8')).toBe(
      '# Replaced\nDetails\n[Target](../target.mdx)',
    )
    expect(text(created)).not.toContain(root)
  })

  it('turns mutation domain failures into safe MCP errors', async () => {
    const { client, root } = await startTestMcp({ allowWrite: true })
    const result = await client.callTool({
      name: 'write',
      arguments: { path: '../outside.md', content: 'unsafe' },
    })

    expect(result.isError).toBe(true)
    expect(jsonResult(result)).toEqual({
      code: 'OUTSIDE_ROOT',
      reason: 'Path is outside the content root',
    })
    expect(text(result)).not.toContain(path.dirname(root))
  })

  it('returns an error without changing content when index replacement fails', async () => {
    const { client, root } = await startTestMcp({ allowWrite: true })
    const existing = path.join(root, 'existing.md')
    await writeFile(existing, '# Existing\n')
    await mkdir(path.join(root, '.silen/ai/index.json'), { recursive: true })

    const replaced = await client.callTool({
      name: 'write',
      arguments: { path: 'existing.md', content: '# Replaced\n' },
    })
    const created = await client.callTool({
      name: 'write',
      arguments: { path: 'created.md', content: '# Created\n' },
    })

    expect(replaced.isError).toBe(true)
    expect(created.isError).toBe(true)
    expect(await readFile(existing, 'utf8')).toBe('# Existing\n')
    await expect(lstat(path.join(root, 'created.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })
})
