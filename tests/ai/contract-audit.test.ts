import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  auditAgentContract,
  type WorkspaceAuditIssue,
} from '../../src/ai/audit'
import type { SilenSiteContractManifest } from '../../src/shared/ai-contract'
import { SILEN_VERSION } from '../../src/shared/version'

const manifestPath = '.silen/dist/.well-known/silen/manifest.json'
const apiPath = '.silen/dist/.well-known/silen/api.json'
const guidePath = '.silen/dist/.well-known/silen/guide.md'
const taskPath = '.silen/dist/.well-known/silen/tasks/create-site.md'
let apiSource: string
let taskSource: string

beforeAll(async () => {
  ;[apiSource, taskSource] = await Promise.all([
    readFile(path.resolve('dist/agent/api.json'), 'utf8'),
    readFile(path.resolve('dist/agent/tasks/create-site.md'), 'utf8'),
  ])
})

function manifest(): SilenSiteContractManifest {
  return {
    schemaVersion: 1,
    kind: 'silen-site',
    generator: { name: 'Silen', version: SILEN_VERSION },
    site: {
      title: 'Audit fixture',
      description: 'Contract audit fixture.',
      base: '/handbook/',
      lang: 'en-US',
      locales: [{ lang: 'en-US', root: '/' }],
    },
    capabilities: {
      llmsTxt: true,
      llmsFullTxt: false,
      markdownRoutes: true,
      index: false,
      mcp: {
        transport: 'stdio',
        localOnly: true,
        readOnlyByDefault: true,
        writeRequiresFlag: '--allow-write',
      },
    },
    resources: [
      {
        id: 'silen-manifest',
        format: 'application/json',
        url: '/handbook/.well-known/silen/manifest.json',
      },
      {
        id: 'api',
        format: 'application/json',
        url: '/handbook/.well-known/silen/api.json',
      },
      {
        id: 'guide',
        format: 'text/markdown',
        url: '/handbook/.well-known/silen/guide.md',
      },
    ],
    tasks: [
      {
        id: 'create-site',
        title: 'Create a Silen knowledge base',
        contractVersion: 1,
        mode: 'write',
        requiresExplicitAuthorization: true,
        lang: 'en-US',
        url: '/handbook/.well-known/silen/tasks/create-site.md',
      },
    ],
  }
}

function contractFiles(value = manifest()): Map<string, string> {
  return new Map([
    [manifestPath, `${JSON.stringify(value, null, 2)}\n`],
    [apiPath, apiSource],
    [guidePath, '# Guide\n'],
    [taskPath, taskSource],
  ])
}

async function audit(
  files: Map<string, string>,
  llmsTxt = '[Silen Agent Contract](/handbook/.well-known/silen/manifest.json)',
): Promise<WorkspaceAuditIssue[]> {
  return auditAgentContract({
    llmsTxt,
    read(relativePath) {
      return Promise.resolve(files.get(relativePath))
    },
  })
}

describe('Agent Contract audit', () => {
  it('passes a fresh contract and ignores an unadvertised disabled contract', async () => {
    await expect(audit(contractFiles())).resolves.toEqual([])
    await expect(audit(new Map(), '# Documentation only')).resolves.toEqual([])
  })

  it('reports a missing advertised manifest and unsupported schema fallback', async () => {
    expect(await audit(new Map())).toEqual([
      expect.objectContaining({
        code: 'contract-missing',
        path: manifestPath,
      }),
    ])
    const files = contractFiles()
    files.set(manifestPath, '{"schemaVersion":2}\n')
    expect(await audit(files)).toEqual([
      expect.objectContaining({
        code: 'contract-fallback',
        message: expect.stringContaining('read-only Markdown fallback'),
      }),
    ])
  })

  it('reports stale versions, missing resources, locales, and removed references safely', async () => {
    const current = manifest()
    const stale: SilenSiteContractManifest = {
      ...current,
      generator: { ...current.generator, version: '0.0.0-stale' },
      tasks: current.tasks.map((task) => ({ ...task, lang: 'fr-FR' })),
    }
    const files = contractFiles(stale)
    files.delete(guidePath)
    files.set(taskPath, taskSource.replace('cli:dev', 'cli:removed'))
    const issues = await audit(files)
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'contract-version',
          path: manifestPath,
        }),
        expect.objectContaining({ code: 'contract-resource', path: guidePath }),
        expect.objectContaining({ code: 'contract-locale' }),
        expect.objectContaining({ code: 'contract-reference', path: taskPath }),
      ]),
    )
    expect(JSON.stringify(issues)).not.toContain(process.cwd())
  })
})
