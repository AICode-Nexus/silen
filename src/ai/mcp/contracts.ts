import type {
  McpServer,
  ToolCallback,
} from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { SilenMcpToolAnnotations } from '../../shared/ai-contract.js'
import { WorkspaceError, type Workspace } from '../workspace.js'

export interface McpToolDescriptor {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: z.ZodType<Record<string, unknown>>
  readonly annotations: SilenMcpToolAnnotations
  readonly requiresExplicitAuthorization: boolean
  register(server: McpServer, workspace: Workspace): void
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

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

function textResult(
  text: string,
  structuredContent?: Record<string, unknown>,
): CallToolResult {
  return {
    content: [{ type: 'text' as const, text }],
    ...(structuredContent ? { structuredContent } : {}),
  }
}

function jsonResult(value: unknown): CallToolResult {
  const structuredContent =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { value }
  return textResult(JSON.stringify(value, null, 2), structuredContent)
}

function safeFailure(error: unknown): CallToolResult {
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

interface DescriptorOptions<Schema extends z.ZodType<Record<string, unknown>>> {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: Schema
  readonly annotations: SilenMcpToolAnnotations
  readonly requiresExplicitAuthorization: boolean
  readonly result?: 'json' | 'text'
  execute(workspace: Workspace, input: z.output<Schema>): Promise<unknown>
}

function createToolDescriptor<
  Schema extends z.ZodType<Record<string, unknown>>,
>(options: DescriptorOptions<Schema>): McpToolDescriptor {
  return {
    name: options.name,
    title: options.title,
    description: options.description,
    inputSchema: options.inputSchema,
    annotations: options.annotations,
    requiresExplicitAuthorization: options.requiresExplicitAuthorization,
    register(server, workspace) {
      const callback = async (
        input: z.output<Schema>,
      ): Promise<CallToolResult> => {
        try {
          const value = await options.execute(workspace, input)
          return options.result === 'text'
            ? textResult(String(value))
            : jsonResult(value)
        } catch (error) {
          return safeFailure(error)
        }
      }
      server.registerTool(
        options.name,
        {
          title: options.title,
          description: options.description,
          inputSchema: options.inputSchema,
          annotations: options.annotations,
        },
        callback as ToolCallback<Schema>,
      )
    },
  }
}

export const readToolDescriptors: readonly McpToolDescriptor[] = [
  createToolDescriptor({
    name: 'guide',
    title: 'Guide to the Silen workspace',
    description: 'Explain the Silen workspace and safe read-only workflow.',
    inputSchema: z.object({}).strict(),
    annotations: readOnlyAnnotations,
    requiresExplicitAuthorization: false,
    result: 'text',
    execute: (workspace) => workspace.guide(),
  }),
  createToolDescriptor({
    name: 'list',
    title: 'List documentation',
    description:
      'List documentation files and routes below a workspace-relative path.',
    inputSchema: z.object({ path: z.string().max(1024).default('.') }).strict(),
    annotations: readOnlyAnnotations,
    requiresExplicitAuthorization: false,
    execute: (workspace, input) => workspace.list(input.path),
  }),
  createToolDescriptor({
    name: 'search',
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
    requiresExplicitAuthorization: false,
    execute: (workspace, input) => workspace.search(input.query, input.limit),
  }),
  createToolDescriptor({
    name: 'read',
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
    requiresExplicitAuthorization: false,
    execute: (workspace, input) =>
      workspace.read({
        path: input.path,
        startLine: input.startLine,
        ...(input.endLine === undefined ? {} : { endLine: input.endLine }),
      }),
  }),
  createToolDescriptor({
    name: 'backlinks',
    title: 'List backlinks',
    description: 'List documentation pages linking to a route.',
    inputSchema: z
      .object({ route: z.string().max(1024).startsWith('/') })
      .strict(),
    annotations: readOnlyAnnotations,
    requiresExplicitAuthorization: false,
    execute: (workspace, input) => workspace.backlinks(input.route),
  }),
  createToolDescriptor({
    name: 'citations',
    title: 'Inspect citations',
    description:
      'Inspect citation links and footnote references in one file or the workspace.',
    inputSchema: z.object({ path: z.string().max(1024).optional() }).strict(),
    annotations: readOnlyAnnotations,
    requiresExplicitAuthorization: false,
    execute: (workspace, input) => workspace.citations(input.path),
  }),
  createToolDescriptor({
    name: 'build',
    title: 'Validate build readiness',
    description:
      'Run a read-only build preflight over bounded Markdown inputs and existing artifacts. This never executes workspace code, invokes Vite, or writes files.',
    inputSchema: z.object({}).strict(),
    annotations: readOnlyAnnotations,
    requiresExplicitAuthorization: false,
    execute: (workspace) => workspace.build(),
  }),
]

export const writeToolDescriptors: readonly McpToolDescriptor[] = [
  createToolDescriptor({
    name: 'write',
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
    requiresExplicitAuthorization: true,
    execute: (workspace, input) =>
      workspace.write({ path: input.path, content: input.content }),
  }),
  createToolDescriptor({
    name: 'link',
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
    requiresExplicitAuthorization: true,
    execute: (workspace, input) =>
      workspace.link({
        path: input.path,
        target: input.target,
        label: input.label,
      }),
  }),
  createToolDescriptor({
    name: 'append',
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
    requiresExplicitAuthorization: true,
    execute: (workspace, input) =>
      workspace.append({ path: input.path, content: input.content }),
  }),
]
