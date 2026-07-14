import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Workspace } from '../workspace.js'
import { createMcpServer } from './server.js'

export interface CreateMcpOptions {
  workspace: Workspace
  allowWrite: boolean
}

export async function serveMcp(options: CreateMcpOptions): Promise<void> {
  const server = createMcpServer(options)
  let closing = false
  const close = (): void => {
    if (closing) return
    closing = true
    process.off('SIGINT', close)
    process.off('SIGTERM', close)
    void server.close().finally(() => process.exit(0))
  }
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
  await server.connect(new StdioServerTransport())
}
