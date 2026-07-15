import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Workspace } from '../workspace.js'
import { writeToolDescriptors } from './contracts.js'

export function registerWriteTools(
  server: McpServer,
  workspace: Workspace,
): void {
  for (const descriptor of writeToolDescriptors) {
    descriptor.register(server, workspace)
  }
}
