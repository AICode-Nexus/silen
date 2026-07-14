import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryRoots: string[] = []
const openClients: Client[] = []

afterEach(async () => {
  await Promise.all(openClients.splice(0).map((client) => client.close()))
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { force: true, recursive: true })),
  )
})

async function temporaryWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'silen-mcp-e2e-'))
  temporaryRoots.push(root)
  await cp(path.resolve('tests/fixtures/ai-workspace'), root, {
    recursive: true,
  })
  return root
}

async function startBuiltClient(root: string, allowWrite = false) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      path.resolve('dist/node/cli.js'),
      'mcp',
      root,
      ...(allowWrite ? ['--allow-write'] : []),
    ],
    cwd: process.cwd(),
    stderr: 'pipe',
  })
  const stderrStream = transport.stderr
  if (!(stderrStream instanceof Readable)) {
    throw new TypeError('Expected the built MCP stderr pipe')
  }
  let stderr = ''
  stderrStream.setEncoding('utf8')
  stderrStream.on('data', (chunk: string) => {
    stderr += chunk
  })
  const protocolErrors: Error[] = []
  const client = new Client({ name: 'silen-dist-test', version: '1.0.0' })
  client.onerror = (error) => protocolErrors.push(error)
  openClients.push(client)
  await client.connect(transport)
  return {
    client,
    transport,
    assertClean: async () => {
      await client.close()
      openClients.splice(openClients.indexOf(client), 1)
      expect(transport.pid).toBeNull()
      expect(protocolErrors).toEqual([])
      expect(stderr).toBe('')
    },
  }
}

function toolText(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content = (
    result as { content?: Array<{ type: string; text?: string }> }
  ).content
  return content?.[0]?.type === 'text' ? (content[0].text ?? '') : ''
}

describe('built MCP CLI interoperability', () => {
  it('serves exactly seven read-only tools with protocol-clean stdout', async () => {
    const root = await temporaryWorkspace()
    const session = await startBuiltClient(root)

    expect(
      (await session.client.listTools()).tools.map((tool) => tool.name),
    ).toEqual([
      'guide',
      'list',
      'search',
      'read',
      'backlinks',
      'citations',
      'build',
    ])
    const search = await session.client.callTool({
      name: 'search',
      arguments: { query: 'deterministic' },
    })
    const preflight = await session.client.callTool({
      name: 'build',
      arguments: {},
    })
    expect(toolText(search)).toContain('guide/getting-started.mdx')
    expect(toolText(preflight)).toContain('"outDir": ".silen/dist"')
    expect(`${toolText(search)}${toolText(preflight)}`).not.toContain(root)

    await session.assertClean()
  }, 30_000)

  it('registers ten tools only with --allow-write and safely writes a temporary workspace', async () => {
    const root = await temporaryWorkspace()
    await mkdir(path.join(root, 'wiki'), { recursive: true })
    const session = await startBuiltClient(root, true)

    expect(
      (await session.client.listTools()).tools.map((tool) => tool.name),
    ).toEqual([
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
    const written = await session.client.callTool({
      name: 'write',
      arguments: {
        path: 'wiki/interoperability.md',
        content:
          '# Interoperability\n\nWritten through explicit MCP permission.\n',
      },
    })
    expect(written.isError).not.toBe(true)
    expect(toolText(written)).toContain('wiki/interoperability.md')
    expect(toolText(written)).not.toContain(root)
    expect(
      await readFile(path.join(root, 'wiki/interoperability.md'), 'utf8'),
    ).toBe('# Interoperability\n\nWritten through explicit MCP permission.\n')

    await session.assertClean()
  }, 30_000)
})
