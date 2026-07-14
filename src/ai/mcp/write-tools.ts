import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { WorkspaceError, type Workspace } from '../workspace.js'

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const

const additiveAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const

function jsonResult(value: unknown) {
  const structuredContent = value as Record<string, unknown>
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent,
  }
}

function safeFailure(error: unknown) {
  const failure =
    error instanceof WorkspaceError
      ? { code: error.code, reason: error.message }
      : {
          code: 'WORKSPACE_OPERATION_FAILED',
          reason:
            'The workspace operation failed without exposing internal details',
        }
  return {
    isError: true as const,
    content: [
      { type: 'text' as const, text: JSON.stringify(failure, null, 2) },
    ],
    structuredContent: failure,
  }
}

async function runTool(operation: () => Promise<unknown>) {
  try {
    return jsonResult(await operation())
  } catch (error) {
    return safeFailure(error)
  }
}

export function registerWriteTools(
  server: McpServer,
  workspace: Workspace,
): void {
  server.registerTool(
    'write',
    {
      title: 'Write documentation',
      description:
        'Create or exactly replace a workspace-relative Markdown or MDX file.',
      inputSchema: z
        .object({
          path: z.string().min(1).max(1024),
          content: z.string().max(2 * 1024 * 1024),
        })
        .strict(),
      annotations: writeAnnotations,
    },
    async ({ path, content }) =>
      runTool(() => workspace.write({ path, content })),
  )
  server.registerTool(
    'link',
    {
      title: 'Link documentation',
      description:
        'Append a standard relative Markdown link to an existing Markdown or MDX file.',
      inputSchema: z
        .object({
          path: z.string().min(1).max(1024),
          target: z.string().min(1).max(1024),
          label: z.string().min(1).max(500),
        })
        .strict(),
      annotations: additiveAnnotations,
    },
    async ({ path, target, label }) =>
      runTool(() => workspace.link({ path, target, label })),
  )
  server.registerTool(
    'append',
    {
      title: 'Append documentation',
      description:
        'Append UTF-8 text with one separating newline to an existing Markdown or MDX file.',
      inputSchema: z
        .object({
          path: z.string().min(1).max(1024),
          content: z.string().max(2 * 1024 * 1024),
        })
        .strict(),
      annotations: additiveAnnotations,
    },
    async ({ path, content }) =>
      runTool(() => workspace.append({ path, content })),
  )
}
