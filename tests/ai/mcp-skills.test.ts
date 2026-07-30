import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadPackagedReadOnlyAgentSkill } from '../../src/ai/contract/package-assets'
import {
  AGENT_SKILLS_MCP_EXTENSION,
  READ_ONLY_AGENT_SKILL_INDEX_URI,
} from '../../src/ai/mcp/skill-resources'
import { createMcpServer } from '../../src/ai/mcp/server'
import { createWorkspace } from '../../src/ai/workspace'

let root: string
const clients: Client[] = []

beforeEach(async () => {
  root = await mkdtemp(path.resolve('tests/fixtures/.agent-skills-mcp-'))
  await cp(path.resolve('tests/fixtures/ai-workspace'), root, {
    recursive: true,
  })
})

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
  await rm(root, { recursive: true, force: true })
})

async function startClient(
  experimental: boolean,
  allowWrite = false,
): Promise<Client> {
  const workspace = await createWorkspace(root)
  const bundle = experimental
    ? await loadPackagedReadOnlyAgentSkill()
    : undefined
  const server = createMcpServer({
    workspace,
    allowWrite,
    ...(bundle === undefined ? {} : { readOnlyAgentSkill: bundle }),
  })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'silen-skills-test', version: '1.0.0' })
  clients.push(client)
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return client
}

function resourceText(
  result: Awaited<ReturnType<Client['readResource']>>,
): string {
  const content = result.contents[0]
  if (content === undefined || !('text' in content)) {
    throw new TypeError('Expected a text MCP Resource')
  }
  return content.text
}

describe('experimental read-only Agent Skills MCP resources', () => {
  it('keeps the default server free of Skill capability and Resources', async () => {
    const client = await startClient(false)
    const capabilities = client.getServerCapabilities()

    expect(
      capabilities?.extensions?.[AGENT_SKILLS_MCP_EXTENSION],
    ).toBeUndefined()
    expect(capabilities?.resources).toBeUndefined()
    expect((await client.listTools()).tools).toHaveLength(7)
  })

  it('serves one deterministic index and the five packaged files when opted in', async () => {
    process.env.SILEN_MCP_SKILL_TEST_SECRET = 'must-not-appear-over-mcp'
    const packaged = await loadPackagedReadOnlyAgentSkill()
    const client = await startClient(true)
    const capabilities = client.getServerCapabilities()

    expect(capabilities?.extensions?.[AGENT_SKILLS_MCP_EXTENSION]).toEqual({})
    expect(capabilities?.resources).toEqual({ listChanged: true })
    const listed = await client.listResources()
    expect(listed.resources.map(({ uri }) => uri)).toEqual([
      READ_ONLY_AGENT_SKILL_INDEX_URI,
      'skill://silen-docs-readonly/SKILL.md',
      'skill://silen-docs-readonly/references/audit-site.md',
      'skill://silen-docs-readonly/references/audit-site-zh-cn.md',
      'skill://silen-docs-readonly/references/read-site.md',
      'skill://silen-docs-readonly/references/read-site-zh-cn.md',
    ])
    expect(listed.resources[0]).toMatchObject({
      name: 'silen-agent-skills-index',
      mimeType: 'application/json',
      description: 'Enumerates the explicitly enabled read-only Silen Skill.',
    })
    for (const resource of listed.resources.slice(1)) {
      expect(resource.mimeType).toBe('text/markdown')
      expect(resource.description).toBeTypeOf('string')
      expect(resource.description).not.toBe('')
    }
    expect(
      listed.resources.find(({ uri }) => uri.endsWith('/SKILL.md')),
    ).toMatchObject({
      name: 'silen-docs-readonly',
      mimeType: 'text/markdown',
      description:
        'Use this skill when reading, searching, citing, or performing a model-free audit of Silen documentation or knowledge bases, including requests to 阅读、检索、引用或审计 Silen 文档. It is read-only and does not grant shell, network, filesystem-write, commit, push, or deployment permission.',
    })

    const index = await client.readResource({
      uri: READ_ONLY_AGENT_SKILL_INDEX_URI,
    })
    expect(JSON.parse(resourceText(index))).toEqual({
      $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
      skills: [
        {
          name: 'silen-docs-readonly',
          type: 'skill-md',
          description:
            'Use this skill when reading, searching, citing, or performing a model-free audit of Silen documentation or knowledge bases, including requests to 阅读、检索、引用或审计 Silen 文档. It is read-only and does not grant shell, network, filesystem-write, commit, push, or deployment permission.',
          url: 'skill://silen-docs-readonly/SKILL.md',
        },
      ],
    })

    for (const [relativePath, expected] of Object.entries(packaged.files)) {
      const result = await client.readResource({
        uri: `skill://silen-docs-readonly/${relativePath}`,
      })
      expect(result.contents).toEqual([
        {
          uri: `skill://silen-docs-readonly/${relativePath}`,
          mimeType: 'text/markdown',
          text: expected,
        },
      ])
    }

    const allContent = JSON.stringify([
      listed,
      index,
      ...Object.values(packaged.files),
    ])
    expect(allContent).not.toContain(root)
    expect(allContent).not.toContain('must-not-appear-over-mcp')
    expect((await client.listTools()).tools).toHaveLength(7)
  })

  it('keeps the Skill read-only when write tools are separately authorized', async () => {
    const client = await startClient(true, true)
    expect((await client.listTools()).tools).toHaveLength(10)
    expect((await client.listResources()).resources).toHaveLength(6)
    const skill = await client.readResource({
      uri: 'skill://silen-docs-readonly/SKILL.md',
    })
    const text = resourceText(skill)

    expect(text).toContain('read-only')
    expect(text).not.toContain('create-site')
    expect(text).not.toContain('maintain-site')
    expect(text).not.toContain('deploy-site')
  })
})
