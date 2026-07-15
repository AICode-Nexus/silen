import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Workspace } from '../workspace.js'
import { readToolDescriptors } from './contracts.js'

export function registerReadTools(
  server: McpServer,
  workspace: Workspace,
): void {
  for (const descriptor of readToolDescriptors) {
    descriptor.register(server, workspace)
  }
}
