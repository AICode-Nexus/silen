import { z } from 'zod'
import type {
  SilenApiContract,
  SilenJsonValue,
} from '../../shared/ai-contract.js'
import type { McpToolDescriptor } from '../mcp/contracts.js'

function publicJsonSchema(
  schema: z.ZodType,
  io: 'input' | 'output',
): Record<string, SilenJsonValue> {
  return JSON.parse(JSON.stringify(z.toJSONSchema(schema, { io }))) as Record<
    string,
    SilenJsonValue
  >
}

export function createMcpApiContract(
  descriptors: readonly McpToolDescriptor[],
): SilenApiContract['mcp'] {
  return {
    tools: descriptors.map((descriptor) => ({
      name: descriptor.name,
      title: descriptor.title,
      description: descriptor.description,
      inputSchema: publicJsonSchema(descriptor.inputSchema, 'input'),
      outputSchema: publicJsonSchema(descriptor.outputSchema, 'output'),
      annotations: { ...descriptor.annotations },
      requiresExplicitAuthorization: descriptor.requiresExplicitAuthorization,
    })),
  }
}
