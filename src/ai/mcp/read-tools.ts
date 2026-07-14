import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { WorkspaceError, type Workspace } from '../workspace.js'

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

function textResult(text: string, structuredContent?: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text }],
    ...(structuredContent ? { structuredContent } : {}),
  }
}

function jsonResult(value: unknown) {
  const structuredContent =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { value }
  return textResult(JSON.stringify(value, null, 2), structuredContent)
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

async function runTool<T>(operation: () => Promise<T>) {
  try {
    return jsonResult(await operation())
  } catch (error) {
    return safeFailure(error)
  }
}

export function registerReadTools(
  server: McpServer,
  workspace: Workspace,
): void {
  server.registerTool(
    'guide',
    {
      title: 'Guide to the Silen workspace',
      description: 'Explain the Silen workspace and safe read-only workflow.',
      inputSchema: z.object({}).strict(),
      annotations: readOnlyAnnotations,
    },
    async () => {
      try {
        return textResult(await workspace.guide())
      } catch (error) {
        return safeFailure(error)
      }
    },
  )
  server.registerTool(
    'list',
    {
      title: 'List documentation',
      description:
        'List documentation files and routes below a workspace-relative path.',
      inputSchema: z
        .object({ path: z.string().max(1024).default('.') })
        .strict(),
      annotations: readOnlyAnnotations,
    },
    async ({ path: requestedPath }) =>
      runTool(() => workspace.list(requestedPath)),
  )
  server.registerTool(
    'search',
    {
      title: 'Search documentation',
      description:
        'Search documentation text with the deterministic local index.',
      inputSchema: z
        .object({
          query: z.string().min(1).max(500),
          limit: z.number().int().min(1).max(50).default(10),
        })
        .strict(),
      annotations: readOnlyAnnotations,
    },
    async ({ query, limit }) => runTool(() => workspace.search(query, limit)),
  )
  server.registerTool(
    'read',
    {
      title: 'Read documentation',
      description:
        'Read a bounded line range from a workspace-relative Markdown or MDX file.',
      inputSchema: z
        .object({
          path: z.string().min(1).max(1024),
          startLine: z.number().int().positive().max(4000).default(1),
          endLine: z.number().int().positive().max(4000).optional(),
        })
        .strict(),
      annotations: readOnlyAnnotations,
    },
    async ({ path, startLine, endLine }) =>
      runTool(() =>
        workspace.read({
          path,
          startLine,
          ...(endLine === undefined ? {} : { endLine }),
        }),
      ),
  )
  server.registerTool(
    'backlinks',
    {
      title: 'List backlinks',
      description: 'List documentation pages linking to a route.',
      inputSchema: z
        .object({ route: z.string().max(1024).startsWith('/') })
        .strict(),
      annotations: readOnlyAnnotations,
    },
    async ({ route }) => runTool(() => workspace.backlinks(route)),
  )
  server.registerTool(
    'citations',
    {
      title: 'Inspect citations',
      description:
        'Inspect citation links and footnote references in one file or the workspace.',
      inputSchema: z.object({ path: z.string().max(1024).optional() }).strict(),
      annotations: readOnlyAnnotations,
    },
    async ({ path: requestedPath }) =>
      runTool(() => workspace.citations(requestedPath)),
  )
  server.registerTool(
    'build',
    {
      title: 'Validate build readiness',
      description:
        'Run a read-only build preflight over bounded Markdown inputs and existing artifacts. This never executes workspace code, invokes Vite, or writes files.',
      inputSchema: z.object({}).strict(),
      annotations: readOnlyAnnotations,
    },
    async () => runTool(() => workspace.build()),
  )
}
