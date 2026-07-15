import { z } from 'zod'
import type {
  SilenApiContract,
  SilenContractManifest,
} from '../../shared/ai-contract.js'

const identifierSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)

const publicUrlSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((value) => {
    if (
      value.includes('\\') ||
      /[\u0000-\u001f\u007f]/.test(value) ||
      /^[A-Za-z]:[\\/]/.test(value) ||
      value.startsWith('\\\\')
    ) {
      return false
    }
    if (value.startsWith('/') && !value.startsWith('//')) return true

    try {
      const parsed = new URL(value)
      return (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        parsed.username === '' &&
        parsed.password === ''
      )
    } catch {
      return false
    }
  }, 'Expected a safe site-relative or HTTP(S) public URL')

const siteRootSchema = z
  .string()
  .startsWith('/')
  .endsWith('/')
  .refine(
    (value) =>
      !value.startsWith('//') &&
      !value.includes('\\') &&
      !/[\u0000-\u001f\u007f]/.test(value),
    'Expected a safe site root',
  )

const generatorSchema = z
  .object({
    name: z.literal('Silen'),
    version: z.string().min(1).max(100),
  })
  .strict()

const localeSchema = z
  .object({
    lang: z.string().min(1).max(100),
    root: siteRootSchema,
    label: z.string().min(1).max(200).optional(),
  })
  .strict()

const resourceSchema = z
  .object({
    id: identifierSchema,
    format: z.string().min(1).max(200),
    url: publicUrlSchema,
    lang: z.string().min(1).max(100).optional(),
  })
  .strict()

const taskBaseSchema = z.object({
  id: identifierSchema,
  title: z.string().min(1).max(500),
  contractVersion: z.literal(1),
  url: publicUrlSchema,
  lang: z.string().min(1).max(100).optional(),
})

const taskSchema = z.discriminatedUnion('mode', [
  taskBaseSchema
    .extend({
      mode: z.literal('read'),
      requiresExplicitAuthorization: z.literal(false).optional(),
    })
    .strict(),
  taskBaseSchema
    .extend({
      mode: z.literal('write'),
      requiresExplicitAuthorization: z.literal(true),
    })
    .strict(),
])

const capabilitiesSchema = z
  .object({
    llmsTxt: z.boolean(),
    llmsFullTxt: z.boolean(),
    markdownRoutes: z.boolean(),
    index: z.boolean(),
    mcp: z
      .object({
        transport: z.literal('stdio'),
        localOnly: z.literal(true),
        readOnlyByDefault: z.literal(true),
        writeRequiresFlag: z.literal('--allow-write'),
      })
      .strict(),
  })
  .strict()

const siteSchema = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().max(2000),
    base: siteRootSchema,
    lang: z.string().min(1).max(100),
    locales: z.array(localeSchema),
  })
  .strict()

function uniqueKeys(
  values: readonly { id: string; lang?: string | undefined }[],
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>()
  for (const [index, value] of values.entries()) {
    const key = `${value.id}\u0000${value.lang ?? ''}`
    if (seen.has(key)) {
      context.addIssue({
        code: 'custom',
        path: [index],
        message: `Duplicate contract entry ${value.id} for ${value.lang ?? 'default language'}`,
      })
    }
    seen.add(key)
  }
}

const manifestBaseShape = {
  schemaVersion: z.literal(1),
  generator: generatorSchema,
  capabilities: capabilitiesSchema,
  resources: z
    .array(resourceSchema)
    .superRefine((values, context) => uniqueKeys(values, context)),
  tasks: z
    .array(taskSchema)
    .superRefine((values, context) => uniqueKeys(values, context)),
}

export const silenContractManifestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      ...manifestBaseShape,
      kind: z.literal('silen-framework'),
    })
    .strict(),
  z
    .object({
      ...manifestBaseShape,
      kind: z.literal('silen-site'),
      site: siteSchema,
    })
    .strict(),
])

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
)

const configFieldSchema = z
  .object({
    path: z.string().min(1).max(500),
    type: z.string().min(1).max(500),
    required: z.boolean(),
    default: jsonValueSchema.optional(),
    constraints: z.array(z.string().min(1).max(500)).optional(),
    description: z.string().min(1).max(2000),
    introduced: z.literal(1),
  })
  .strict()

const cliArgumentSchema = z
  .object({
    name: z.string().min(1).max(200),
    required: z.boolean(),
    variadic: z.boolean().optional(),
    description: z.string().min(1).max(1000).optional(),
  })
  .strict()

const cliOptionSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().min(1).max(1000),
    required: z.boolean(),
    default: jsonValueSchema.optional(),
  })
  .strict()

const cliCommandSchema = z
  .object({
    id: identifierSchema,
    syntax: z.string().min(1).max(500),
    description: z.string().min(1).max(1000),
    sideEffect: z.enum(['read', 'write', 'server', 'build']),
    arguments: z.array(cliArgumentSchema),
    options: z.array(cliOptionSchema),
  })
  .strict()

const mcpToolSchema = z
  .object({
    name: identifierSchema,
    title: z.string().min(1).max(500),
    description: z.string().min(1).max(2000),
    inputSchema: z.record(z.string(), jsonValueSchema),
    annotations: z
      .object({
        readOnlyHint: z.boolean(),
        destructiveHint: z.boolean(),
        idempotentHint: z.boolean(),
        openWorldHint: z.boolean(),
      })
      .strict(),
    requiresExplicitAuthorization: z.boolean(),
  })
  .strict()

const publicExportSchema = z
  .object({
    entryPoint: z.string().min(1).max(500),
    symbol: z.string().min(1).max(500),
    kind: z.string().min(1).max(100),
    signature: z.string().min(1).max(20_000),
    declaration: z.string().min(1).max(1000),
  })
  .strict()

export const silenApiContractSchema = z
  .object({
    schemaVersion: z.literal(1),
    generator: generatorSchema,
    config: z.object({ fields: z.array(configFieldSchema) }).strict(),
    cli: z.object({ commands: z.array(cliCommandSchema) }).strict(),
    mcp: z.object({ tools: z.array(mcpToolSchema) }).strict(),
    exports: z.array(publicExportSchema),
  })
  .strict()

export function parseContractManifest(value: unknown): SilenContractManifest {
  return silenContractManifestSchema.parse(value) as SilenContractManifest
}

export function parseApiContract(value: unknown): SilenApiContract {
  return silenApiContractSchema.parse(value) as SilenApiContract
}
