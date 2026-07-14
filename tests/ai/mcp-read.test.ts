import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createMcpServer } from '../../src/ai/mcp/server'
import { createWorkspace } from '../../src/ai/workspace'

let fixture: string
const clients: Client[] = []

beforeAll(async () => {
  fixture = await mkdtemp(path.resolve('tests/fixtures/.ai-workspace-mcp-'))
  await cp(path.resolve('tests/fixtures/ai-workspace'), fixture, {
    recursive: true,
  })
})

afterAll(async () => {
  await rm(fixture, { force: true, recursive: true })
})

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
})

async function startClient() {
  const workspace = await createWorkspace(fixture)
  const server = createMcpServer({ workspace, allowWrite: false })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'silen-test', version: '1.0.0' })
  clients.push(client)
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return client
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

describe('read-only MCP server', () => {
  it('discovers exactly seven read-only tools with the SDK client', async () => {
    const client = await startClient()
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
    for (const tool of listed.tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      })
    }
  })

  it('calls search, read, and build and returns only relative structured data', async () => {
    const client = await startClient()
    const search = await client.callTool({
      name: 'search',
      arguments: { query: 'deterministic' },
    })
    expect(jsonResult(search)).toMatchObject({
      results: [{ path: 'guide/getting-started.mdx' }],
    })

    const read = await client.callTool({
      name: 'read',
      arguments: { path: 'index.mdx', startLine: 1, endLine: 8 },
    })
    expect(jsonResult(read)).toMatchObject({ path: 'index.mdx', route: '/' })

    const built = await client.callTool({ name: 'build', arguments: {} })
    expect(jsonResult(built)).toMatchObject({ outDir: '.silen/dist' })
    expect(text(built)).not.toContain(fixture)
  }, 30_000)

  it('turns domain failures into safe tool errors', async () => {
    const client = await startClient()
    const result = await client.callTool({
      name: 'read',
      arguments: { path: '../secret.txt' },
    })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('Path is outside the content root')
    expect(text(result)).not.toContain(path.dirname(fixture))
  })

  it('keeps stdio stdout protocol-clean during discovery and calls', async () => {
    const client = new Client({ name: 'silen-stdio-test', version: '1.0.0' })
    clients.push(client)
    const transport = new StdioClientTransport({
      command: path.resolve('node_modules/.bin/jiti'),
      args: [path.resolve('src/node/cli.ts'), 'mcp', fixture],
      cwd: process.cwd(),
      stderr: 'pipe',
    })
    await client.connect(transport)
    expect((await client.listTools()).tools).toHaveLength(7)
    const guide = await client.callTool({ name: 'guide', arguments: {} })
    expect(text(guide)).toContain('read-only')
  }, 20_000)
})
