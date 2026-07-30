import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { Client } from '@modelcontextprotocol/client'
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'

const temporaryRoots: string[] = []
const openClients: Client[] = []
type VerifiedEra = 'legacy' | 'modern'

const verifiedEras = [
  'legacy',
  'modern',
] as const satisfies readonly VerifiedEra[]
const LEGACY_PROTOCOL_VERSION = '2025-11-25'
const MODERN_PROTOCOL_VERSION = '2026-07-28'

interface BuiltClientOptions {
  readonly allowWrite?: boolean
  readonly experimentalSkills?: boolean
}

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

function createVerifiedClient(era: VerifiedEra): Client {
  return new Client(
    { name: `silen-${era}-test`, version: '1.0.0' },
    era === 'legacy'
      ? { supportedProtocolVersions: [LEGACY_PROTOCOL_VERSION] }
      : {
          supportedProtocolVersions: [
            LEGACY_PROTOCOL_VERSION,
            MODERN_PROTOCOL_VERSION,
          ],
          versionNegotiation: { mode: { pin: MODERN_PROTOCOL_VERSION } },
        },
  )
}

async function startBuiltClient(
  root: string,
  era: VerifiedEra,
  options: BuiltClientOptions = {},
) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      path.resolve('dist/node/cli.js'),
      'mcp',
      root,
      ...(options.allowWrite ? ['--allow-write'] : []),
      ...(options.experimentalSkills ? ['--experimental-skills-over-mcp'] : []),
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
  const client = createVerifiedClient(era)
  client.onerror = (error) => protocolErrors.push(error)
  openClients.push(client)
  await client.connect(transport)
  expect(client.getProtocolEra()).toBe(era)
  expect(client.getNegotiatedProtocolVersion()).toBe(
    era === 'legacy' ? LEGACY_PROTOCOL_VERSION : MODERN_PROTOCOL_VERSION,
  )
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
  it.each(verifiedEras)(
    'serves exactly seven read-only tools over the %s protocol era',
    async (era) => {
      const root = await temporaryWorkspace()
      const session = await startBuiltClient(root, era)
      const listed = await session.client.listTools()

      expect(
        session.client.getServerCapabilities()?.extensions?.[
          'io.modelcontextprotocol/skills'
        ],
      ).toBeUndefined()
      expect(session.client.getServerCapabilities()?.resources).toBeUndefined()

      expect(listed.tools.map((tool) => tool.name)).toEqual([
        'guide',
        'list',
        'search',
        'read',
        'backlinks',
        'citations',
        'build',
      ])
      const guideTool = listed.tools.find((tool) => tool.name === 'guide')
      const guide = await session.client.callTool({
        name: 'guide',
        arguments: {},
      })
      if (era === 'modern') {
        expect(guide.structuredContent).toContain('read-only')
        expect(guideTool?.outputSchema).toMatchObject({ type: 'string' })
      } else {
        const legacyGuide = guide.structuredContent
        if (
          typeof legacyGuide !== 'object' ||
          legacyGuide === null ||
          Array.isArray(legacyGuide)
        ) {
          throw new TypeError('Expected a legacy guide result wrapper')
        }
        const result = (legacyGuide as Record<string, unknown>).result
        expect(result).toBeTypeOf('string')
        expect(result).toContain('read-only')
        expect(guideTool?.outputSchema).toMatchObject({
          type: 'object',
          properties: { result: { type: 'string' } },
        })
      }

      const search = await session.client.callTool({
        name: 'search',
        arguments: { query: 'deterministic' },
      })
      const preflight = await session.client.callTool({
        name: 'build',
        arguments: {},
      })
      expect(search.structuredContent).toMatchObject({
        results: [{ path: 'guide/getting-started.mdx' }],
      })
      expect(toolText(preflight)).toContain('"outDir": ".silen/dist"')
      expect(
        `${toolText(search)}${toolText(preflight)}${JSON.stringify(search.structuredContent)}${JSON.stringify(preflight.structuredContent)}`,
      ).not.toContain(root)

      await session.assertClean()
    },
    60_000,
  )

  it.each(verifiedEras)(
    'registers ten tools only with --allow-write over the %s protocol era',
    async (era) => {
      const root = await temporaryWorkspace()
      await mkdir(path.join(root, 'wiki'), { recursive: true })
      const session = await startBuiltClient(root, era, { allowWrite: true })

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
      expect(written.structuredContent).toMatchObject({
        path: 'wiki/interoperability.md',
      })
      expect(
        `${toolText(written)}${JSON.stringify(written.structuredContent)}`,
      ).not.toContain(root)
      expect(
        await readFile(path.join(root, 'wiki/interoperability.md'), 'utf8'),
      ).toBe('# Interoperability\n\nWritten through explicit MCP permission.\n')

      await session.assertClean()
    },
    60_000,
  )

  it.each(verifiedEras)(
    'serves only the packaged read-only Skill Resources over the %s protocol era when opted in',
    async (era) => {
      const root = await temporaryWorkspace()
      const session = await startBuiltClient(root, era, {
        experimentalSkills: true,
      })

      expect(
        session.client.getServerCapabilities()?.extensions?.[
          'io.modelcontextprotocol/skills'
        ],
      ).toEqual({})
      const listed = await session.client.listResources()
      expect(listed.resources).toHaveLength(6)
      expect(listed.resources.map(({ uri }) => uri)).toContain(
        'skill://silen-docs-readonly/SKILL.md',
      )
      const skill = await session.client.readResource({
        uri: 'skill://silen-docs-readonly/SKILL.md',
      })
      const skillContent = skill.contents[0]
      if (skillContent === undefined || !('text' in skillContent)) {
        throw new TypeError('Expected a text Skill Resource')
      }
      expect(skillContent.text).toBe(
        await readFile(
          path.resolve('dist/agent/skills/silen-docs-readonly/SKILL.md'),
          'utf8',
        ),
      )
      expect(JSON.stringify([listed, skill])).not.toContain(root)
      expect((await session.client.listTools()).tools).toHaveLength(7)

      await session.assertClean()
    },
    60_000,
  )
})
