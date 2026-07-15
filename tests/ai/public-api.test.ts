import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import {
  createMcpServer,
  createWorkspace,
  WorkspaceError,
  type SilenContractManifest,
  type Workspace,
} from '../../src/ai/index'

it('exports the promised workspace and MCP interfaces from @aicode-nexus/silen/ai', async () => {
  const root = await mkdtemp(path.resolve('.silen/.temp/public-ai-api-'))
  await writeFile(path.join(root, 'index.md'), '# Public API\n')
  try {
    const workspace: Workspace = await createWorkspace(root)
    const manifest: SilenContractManifest = {
      schemaVersion: 1,
      kind: 'silen-framework',
      generator: { name: 'Silen', version: 'test' },
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
      resources: [],
      tasks: [],
    }
    expect((await workspace.list()).files).toHaveLength(1)
    expect(manifest.kind).toBe('silen-framework')
    expect(createMcpServer({ workspace, allowWrite: false })).toBeDefined()
    expect(new WorkspaceError('TEST', 'safe').code).toBe('TEST')
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
