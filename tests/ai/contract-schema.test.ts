import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  parseApiContract,
  parseContractManifest,
} from '../../src/ai/contract/schema'
import { serializeContractJson } from '../../src/ai/contract/serialize'
import type {
  SilenApiContract,
  SilenContractManifest,
} from '../../src/shared/ai-contract'
import { SILEN_VERSION } from '../../src/shared/version'

const generator = { name: 'Silen' as const, version: SILEN_VERSION }

function frameworkManifest(): SilenContractManifest {
  return {
    schemaVersion: 1,
    kind: 'silen-framework',
    generator,
    capabilities: {
      llmsTxt: true,
      llmsFullTxt: true,
      markdownRoutes: true,
      index: true,
      mcp: {
        transport: 'stdio',
        localOnly: true,
        readOnlyByDefault: true,
        writeRequiresFlag: '--allow-write',
      },
    },
    resources: [
      {
        id: 'guide',
        format: 'text/markdown',
        url: '/agent/guide.md',
        lang: 'en-US',
      },
    ],
    tasks: [
      {
        id: 'read-site',
        title: 'Read a Silen site',
        contractVersion: 1,
        mode: 'read',
        url: '/agent/tasks/read-site.md',
        lang: 'en-US',
      },
    ],
  }
}

function apiContract(): SilenApiContract {
  return {
    schemaVersion: 1,
    generator,
    config: {
      fields: [
        {
          path: 'title',
          type: 'string',
          required: false,
          default: 'Silen',
          description: 'Public site title.',
          introduced: 1,
        },
      ],
    },
    cli: {
      commands: [
        {
          id: 'build',
          syntax: 'build [root]',
          description: 'Build a static site.',
          sideEffect: 'build',
          arguments: [],
          options: [],
        },
      ],
    },
    mcp: {
      tools: [
        {
          name: 'read',
          title: 'Read documentation',
          description: 'Read a bounded Markdown range.',
          inputSchema: { type: 'object' },
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
          requiresExplicitAuthorization: false,
        },
      ],
    },
    exports: [
      {
        entryPoint: '@aicode-nexus/silen',
        symbol: 'defineConfig',
        kind: 'function',
        signature: 'declare function defineConfig<T>(config: T): T',
        declaration: 'dist/index.d.ts',
      },
    ],
  }
}

describe('Silen Agent Contract v1', () => {
  it('accepts a framework manifest', () => {
    expect(parseContractManifest(frameworkManifest())).toEqual(
      frameworkManifest(),
    )
  })

  it('accepts a site manifest with base-aware resources and locales', () => {
    const manifest: SilenContractManifest = {
      ...frameworkManifest(),
      kind: 'silen-site',
      site: {
        title: 'Handbook',
        description: 'Team reference.',
        base: '/handbook/',
        lang: 'en-US',
        locales: [
          { lang: 'en-US', root: '/' },
          { lang: 'zh-CN', root: '/zh/' },
        ],
      },
      resources: [
        {
          id: 'manifest',
          format: 'application/json',
          url: '/handbook/.well-known/silen/manifest.json',
        },
      ],
    }

    expect(parseContractManifest(manifest)).toEqual(manifest)
  })

  it('rejects contract versions other than v1', () => {
    expect(() =>
      parseContractManifest({ ...frameworkManifest(), schemaVersion: 2 }),
    ).toThrow()
  })

  it('rejects write tasks without explicit authorization', () => {
    const task = {
      id: 'maintain-site',
      title: 'Maintain a Silen site',
      contractVersion: 1,
      mode: 'write',
      url: '/agent/tasks/maintain-site.md',
    }
    expect(() =>
      parseContractManifest({ ...frameworkManifest(), tasks: [task] }),
    ).toThrow()
  })

  it.each([
    'file:///Users/admin/private.md',
    'C:\\Users\\admin\\private.md',
    '\\\\server\\private.md',
  ])('rejects filesystem resource URL %s', (url) => {
    expect(() =>
      parseContractManifest({
        ...frameworkManifest(),
        resources: [{ id: 'private', format: 'text/markdown', url }],
      }),
    ).toThrow()
  })

  it('accepts and parses the API contract', () => {
    expect(parseApiContract(apiContract())).toEqual(apiContract())
  })

  it('serializes semantically identical unordered contracts byte-identically', () => {
    const base = apiContract()
    const left: SilenApiContract = {
      ...base,
      config: {
        fields: [
          {
            path: 'zeta',
            type: 'boolean',
            required: false,
            description: 'Last field.',
            introduced: 1,
          },
          ...base.config.fields.map((field) => ({
            ...field,
            default: { alpha: false, beta: true },
          })),
        ],
      },
      cli: {
        commands: [
          {
            id: 'preview',
            syntax: 'preview [root]',
            description: 'Preview a static site.',
            sideEffect: 'server',
            arguments: [],
            options: [],
          },
          ...base.cli.commands,
        ],
      },
      mcp: {
        tools: [
          {
            ...base.mcp.tools[0]!,
            inputSchema: {
              properties: {
                limit: { type: 'number' },
                query: { type: 'string' },
              },
              type: 'object',
            },
          },
        ],
      },
    }
    const right: SilenApiContract = {
      ...left,
      config: {
        fields: [...left.config.fields]
          .reverse()
          .map((field) =>
            field.path === 'title'
              ? { ...field, default: { beta: true, alpha: false } }
              : field,
          ),
      },
      cli: { commands: [...left.cli.commands].reverse() },
      mcp: {
        tools: [
          {
            ...left.mcp.tools[0]!,
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                limit: { type: 'number' },
              },
            },
          },
        ],
      },
    }

    expect(serializeContractJson(left)).toBe(serializeContractJson(right))
    expect(serializeContractJson(left)).toMatch(/\n$/)
    expect(serializeContractJson(left)).not.toMatch(/\n\n$/)
  })

  it('keeps the shared runtime version aligned with package.json', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      version: string
    }
    expect(SILEN_VERSION).toBe(packageJson.version)
    expect(SILEN_VERSION).toBe('0.1.4')
  })
})
