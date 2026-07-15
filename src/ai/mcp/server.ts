import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SILEN_VERSION } from '../../shared/version.js'
import type { Workspace } from '../workspace.js'
import { registerReadTools } from './read-tools.js'
import { registerWriteTools } from './write-tools.js'

export interface CreateMcpServerOptions {
  workspace: Workspace
  allowWrite?: boolean
}

export function createMcpServer(options: CreateMcpServerOptions): McpServer {
  const server = new McpServer(
    { name: 'silen', version: SILEN_VERSION },
    {
      instructions:
        'Use list or search before read. Paths are relative to the documentation root. Write tools are absent unless the server was started with explicit write permission.',
    },
  )
  registerReadTools(server, options.workspace)
  if (options.allowWrite === true) registerWriteTools(server, options.workspace)
  return server
}
