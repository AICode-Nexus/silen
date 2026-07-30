import type { McpServer } from '@modelcontextprotocol/server'
import {
  READ_ONLY_AGENT_SKILL_DESCRIPTION,
  READ_ONLY_AGENT_SKILL_FILES,
  validateReadOnlyAgentSkillBundle,
  type ReadOnlyAgentSkillBundle,
} from '../contract/agent-skills.js'
import { SILEN_VERSION } from '../../shared/version.js'

export const AGENT_SKILLS_MCP_EXTENSION =
  'io.modelcontextprotocol/skills' as const
export const READ_ONLY_AGENT_SKILL_INDEX_URI = 'skill://index.json' as const

function skillUri(
  bundle: ReadOnlyAgentSkillBundle,
  relativePath: string,
): string {
  return `skill://${bundle.name}/${relativePath}`
}

export function serializeReadOnlyAgentSkillIndex(
  bundle: ReadOnlyAgentSkillBundle,
): string {
  validateReadOnlyAgentSkillBundle(bundle, SILEN_VERSION)
  return `${JSON.stringify(
    {
      $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
      skills: [
        {
          name: bundle.name,
          type: 'skill-md',
          description: READ_ONLY_AGENT_SKILL_DESCRIPTION,
          url: skillUri(bundle, 'SKILL.md'),
        },
      ],
    },
    null,
    2,
  )}\n`
}

export function registerReadOnlyAgentSkillResources(
  server: McpServer,
  bundle: ReadOnlyAgentSkillBundle,
): void {
  Object.freeze(bundle.files)
  Object.freeze(bundle)
  validateReadOnlyAgentSkillBundle(bundle, SILEN_VERSION)
  const index = serializeReadOnlyAgentSkillIndex(bundle)
  server.registerResource(
    'silen-agent-skills-index',
    READ_ONLY_AGENT_SKILL_INDEX_URI,
    {
      title: 'Silen Agent Skills index',
      description: 'Enumerates the explicitly enabled read-only Silen Skill.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'application/json', text: index }],
    }),
  )

  for (const relativePath of READ_ONLY_AGENT_SKILL_FILES) {
    const uri = skillUri(bundle, relativePath)
    const root = relativePath === 'SKILL.md'
    server.registerResource(
      root
        ? bundle.name
        : `${bundle.name}-${relativePath.replaceAll('/', '-')}`,
      uri,
      {
        title: root
          ? 'Silen read-only documentation workflows'
          : `Silen Skill reference: ${relativePath}`,
        description: root
          ? READ_ONLY_AGENT_SKILL_DESCRIPTION
          : `Canonical packaged ${bundle.name} file ${relativePath}.`,
        mimeType: 'text/markdown',
      },
      async (resourceUri) => ({
        contents: [
          {
            uri: resourceUri.href,
            mimeType: 'text/markdown',
            text: bundle.files[relativePath]!,
          },
        ],
      }),
    )
  }
}
