import { z } from 'zod'

const workspaceFileSchema = z
  .object({ path: z.string(), route: z.string(), title: z.string() })
  .strict()

const searchResultSchema = z
  .object({
    path: z.string(),
    route: z.string(),
    title: z.string(),
    score: z.number().finite(),
    excerpt: z.string(),
  })
  .strict()

const backlinkSchema = z
  .object({ path: z.string(), route: z.string(), title: z.string() })
  .strict()

const citationSchema = z
  .object({
    path: z.string(),
    line: z.number().int().positive(),
    kind: z.enum(['footnote', 'link']),
    label: z.string(),
    target: z.string().optional(),
    valid: z.boolean(),
  })
  .strict()

const auditIssueSchema = z
  .object({
    code: z.enum([
      'broken-link',
      'citation',
      'artifact',
      'index',
      'contract-missing',
      'contract-schema',
      'contract-version',
      'contract-resource',
      'contract-reference',
      'contract-locale',
      'contract-fallback',
    ]),
    path: z.string(),
    message: z.string(),
  })
  .strict()

const auditNoticeSchema = z
  .object({
    code: z.enum(['base-unknown', 'index-cache']),
    path: z.string(),
    message: z.string(),
  })
  .strict()

const mutationSchema = z
  .object({
    path: z.string(),
    created: z.boolean(),
    bytesBefore: z.number().int().nonnegative(),
    bytesAfter: z.number().int().nonnegative(),
    diff: z.string(),
    index: z
      .object({
        fileCount: z.number().int().nonnegative(),
        index: z.string(),
        fingerprint: z.string(),
      })
      .strict(),
  })
  .strict()

export const mcpOutputSchemas = {
  guide: z.string(),
  list: z
    .object({ path: z.string(), files: z.array(workspaceFileSchema) })
    .strict(),
  search: z
    .object({ query: z.string(), results: z.array(searchResultSchema) })
    .strict(),
  read: z
    .object({
      path: z.string(),
      route: z.string(),
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
      totalLines: z.number().int().nonnegative(),
      text: z.string(),
      truncated: z.boolean(),
    })
    .strict(),
  backlinks: z
    .object({ route: z.string(), backlinks: z.array(backlinkSchema) })
    .strict(),
  citations: z.object({ citations: z.array(citationSchema) }).strict(),
  build: z
    .object({
      outDir: z.literal('.silen/dist'),
      routes: z.array(
        z.object({ path: z.string(), file: z.string() }).strict(),
      ),
      ok: z.boolean(),
      issues: z.array(auditIssueSchema),
      notices: z.array(auditNoticeSchema),
    })
    .strict(),
  write: mutationSchema,
  link: mutationSchema,
  append: mutationSchema,
} as const
