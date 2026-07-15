import { describe, expect, it } from 'vitest'
import { createMcpApiContract } from '../../src/ai/contract/mcp-api'
import {
  readToolDescriptors,
  writeToolDescriptors,
} from '../../src/ai/mcp/contracts'

describe('MCP Agent Contract registry', () => {
  it('keeps the documented read and write sets exact', () => {
    expect(readToolDescriptors.map((tool) => tool.name)).toEqual([
      'guide',
      'list',
      'search',
      'read',
      'backlinks',
      'citations',
      'build',
    ])
    expect(writeToolDescriptors.map((tool) => tool.name)).toEqual([
      'write',
      'link',
      'append',
    ])
  })

  it('marks every write descriptor as explicitly authorized', () => {
    for (const descriptor of readToolDescriptors) {
      expect(descriptor.requiresExplicitAuthorization).toBe(false)
      expect(descriptor.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      })
    }
    for (const descriptor of writeToolDescriptors) {
      expect(descriptor.requiresExplicitAuthorization).toBe(true)
      expect(descriptor.annotations.readOnlyHint).toBe(false)
      expect(descriptor.annotations.openWorldHint).toBe(false)
    }
  })

  it('generates JSON Schemas and omits handlers from the API contract', () => {
    const contract = createMcpApiContract([
      ...readToolDescriptors,
      ...writeToolDescriptors,
    ])
    const read = contract.tools.find((tool) => tool.name === 'read')
    expect(read?.inputSchema).toMatchObject({
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1, maxLength: 1024 },
      },
      required: ['path'],
      additionalProperties: false,
    })
    const write = contract.tools.find((tool) => tool.name === 'write')
    expect(write).toMatchObject({
      requiresExplicitAuthorization: true,
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
      },
    })
    expect(Object.keys(contract.tools[0] ?? {})).toEqual([
      'name',
      'title',
      'description',
      'inputSchema',
      'annotations',
      'requiresExplicitAuthorization',
    ])
    const serialized = JSON.stringify(contract)
    expect(serialized).not.toContain('shell')
    expect(serialized).not.toContain(process.cwd())
  })
})
