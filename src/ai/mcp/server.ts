import { McpServer } from '@modelcontextprotocol/server'
import { SILEN_VERSION } from '../../shared/version.js'
import type { ReadOnlyAgentSkillBundle } from '../contract/agent-skills.js'
import type { Workspace } from '../workspace.js'
import { registerReadTools } from './read-tools.js'
import {
  AGENT_SKILLS_MCP_EXTENSION,
  registerReadOnlyAgentSkillResources,
} from './skill-resources.js'
import { registerWriteTools } from './write-tools.js'

export interface CreateMcpServerOptions {
  workspace: Workspace
  allowWrite?: boolean
  readOnlyAgentSkill?: ReadOnlyAgentSkillBundle
}

export function createMcpServer(options: CreateMcpServerOptions): McpServer {
  const server = new McpServer(
    { name: 'silen', version: SILEN_VERSION },
    {
      ...(options.readOnlyAgentSkill === undefined
        ? {}
        : {
            capabilities: {
              extensions: { [AGENT_SKILLS_MCP_EXTENSION]: {} },
            },
          }),
      instructions:
        'Discover contract facts from llms.txt and .well-known/silen/manifest.json. Use list or search before read. Paths are relative to the documentation root. The build tool is a safe preflight and does not execute workspace MDX. Write tools are absent unless the server was started with explicit --allow-write permission. After authorized changes, audit, build, and inspect the Git diff before any separately authorized commit or deployment.' +
        (options.readOnlyAgentSkill === undefined
          ? ''
          : ' The optional read-only Skill is available at skill://silen-docs-readonly/SKILL.md.'),
    },
  )
  registerReadTools(server, options.workspace)
  if (options.readOnlyAgentSkill !== undefined) {
    registerReadOnlyAgentSkillResources(server, options.readOnlyAgentSkill)
  }
  if (options.allowWrite === true) registerWriteTools(server, options.workspace)
  return server
}
