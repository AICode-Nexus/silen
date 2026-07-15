import { z } from 'zod'
import type {
  SilenApiContract,
  SilenJsonValue,
} from '../../shared/ai-contract.js'
import type { McpToolDescriptor } from '../mcp/contracts.js'

function publicJsonSchema(
  descriptor: McpToolDescriptor,
): Record<string, SilenJsonValue> {
  return JSON.parse(
    JSON.stringify(z.toJSONSchema(descriptor.inputSchema, { io: 'input' })),
  ) as Record<string, SilenJsonValue>
}

export function createMcpApiContract(
  descriptors: readonly McpToolDescriptor[],
): SilenApiContract['mcp'] {
  return {
    tools: descriptors.map((descriptor) => ({
      name: descriptor.name,
      title: descriptor.title,
      description: descriptor.description,
      inputSchema: publicJsonSchema(descriptor),
      annotations: { ...descriptor.annotations },
      requiresExplicitAuthorization: descriptor.requiresExplicitAuthorization,
    })),
  }
}
