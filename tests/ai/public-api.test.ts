import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import {
  createMcpServer,
  createWorkspace,
  WorkspaceError,
  type Workspace,
} from '../../src/ai/index'

it('exports the promised workspace and MCP interfaces from @aicode-nexus/silen/ai', async () => {
  const root = await mkdtemp(path.resolve('.silen/.temp/public-ai-api-'))
  await writeFile(path.join(root, 'index.md'), '# Public API\n')
  try {
    const workspace: Workspace = await createWorkspace(root)
    expect((await workspace.list()).files).toHaveLength(1)
    expect(createMcpServer({ workspace, allowWrite: false })).toBeDefined()
    expect(new WorkspaceError('TEST', 'safe').code).toBe('TEST')
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
