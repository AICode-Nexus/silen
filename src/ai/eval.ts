import { constants, type Stats } from 'node:fs'
import { lstat, open, realpath } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import {
  queryRankedSearchIndex,
  type ReadableSearchIndex,
} from '../node/search.js'
import { normalizeSiteRoute } from './routes.js'

const SUITE_PATH = '.silen/ai-evals.json'
const INDEX_PATH = '.silen/dist/search-index.json'
const SUITE_MAXIMUM_BYTES = 1024 * 1024
const INDEX_MAXIMUM_BYTES = 64 * 1024 * 1024

export type AiEvalSetupCode =
  | 'ROOT_INVALID'
  | 'SUITE_MISSING'
  | 'SUITE_TOO_LARGE'
  | 'SUITE_JSON'
  | 'SUITE_SCHEMA'
  | 'INDEX_MISSING'
  | 'INDEX_TOO_LARGE'
  | 'INDEX_JSON'
  | 'INDEX_SCHEMA'
  | 'INDEX_VERSION'
  | 'UNSAFE_PATH'

export class AiEvalSetupError extends Error {
  constructor(
    public readonly code: AiEvalSetupCode,
    message: string,
    public readonly relativePath?: string,
    public readonly field?: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'AiEvalSetupError'
  }
}

export interface AiEvalActualResult {
  readonly rank: number
  readonly route: string
  readonly title: string
  readonly score: number
  readonly heading?: string
  readonly lang?: string
}

export interface AiEvalCaseResult {
  readonly id: string
  readonly ok: boolean
  readonly query: string
  readonly lang?: string
  readonly expected: { readonly route: string; readonly heading?: string }
  readonly actual: readonly AiEvalActualResult[]
}

export interface AiEvalReport {
  readonly schemaVersion: 1
  readonly ok: boolean
  readonly suite: '.silen/ai-evals.json'
  readonly index: '.silen/dist/search-index.json'
  readonly topK: number
  readonly summary: {
    readonly total: number
    readonly passed: number
    readonly failed: number
  }
  readonly cases: readonly AiEvalCaseResult[]
}

const normalizedTextSchema = (maximum: number) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(1).max(maximum))

const expectedRouteSchema = z
  .string()
  .trim()
  .min(1)
  .max(1024)
  .startsWith('/')
  .refine(
    (value) =>
      !value.startsWith('//') &&
      !value.includes('\\') &&
      !/[?#]/.test(value) &&
      !value.split('/').some((part) => part === '.' || part === '..'),
    'Expected a base-free site route',
  )

const expectedSchema = z
  .object({
    route: expectedRouteSchema,
    heading: normalizedTextSchema(500).optional(),
  })
  .strict()

const caseSchema = z
  .object({
    id: normalizedTextSchema(100),
    query: normalizedTextSchema(500),
    lang: normalizedTextSchema(100).optional(),
    expected: expectedSchema,
  })
  .strict()

const suiteSchema = z
  .object({
    schemaVersion: z.literal(1),
    topK: z.number().int().min(1).max(20).default(5),
    cases: z.array(caseSchema).min(1).max(500),
  })
  .strict()
  .superRefine((suite, context) => {
    const ids = new Set<string>()
    for (const [index, item] of suite.cases.entries()) {
      if (ids.has(item.id)) {
        context.addIssue({
          code: 'custom',
          path: ['cases', index, 'id'],
          message: `Duplicate evaluation case id ${JSON.stringify(item.id)}`,
        })
      }
      ids.add(item.id)
    }
  })

type AiEvalSuite = z.output<typeof suiteSchema>

function missingMessage(code: 'SUITE_MISSING' | 'INDEX_MISSING'): string {
  return code === 'SUITE_MISSING'
    ? 'Missing .silen/ai-evals.json; create a version 1 evaluation suite'
    : 'Missing .silen/dist/search-index.json; run silen build <root> first'
}

function unsafePathError(
  relativePath: string,
  cause?: unknown,
): AiEvalSetupError {
  return new AiEvalSetupError(
    'UNSAFE_PATH',
    `Unable to safely read ${relativePath}`,
    relativePath,
    undefined,
    cause === undefined ? undefined : { cause },
  )
}

async function readBoundedFile(
  root: string,
  relativePath: string,
  maximumBytes: number,
  missingCode: 'SUITE_MISSING' | 'INDEX_MISSING',
  tooLargeCode: 'SUITE_TOO_LARGE' | 'INDEX_TOO_LARGE',
): Promise<string> {
  let physicalRoot: string
  try {
    physicalRoot = await realpath(path.resolve(root))
  } catch (error) {
    throw new AiEvalSetupError(
      'ROOT_INVALID',
      'The Silen content root is not a readable directory',
      undefined,
      undefined,
      { cause: error },
    )
  }

  let rootStats: Stats
  try {
    rootStats = await lstat(physicalRoot)
  } catch (error) {
    throw new AiEvalSetupError(
      'ROOT_INVALID',
      'The Silen content root is not a readable directory',
      undefined,
      undefined,
      { cause: error },
    )
  }
  if (!rootStats.isDirectory()) {
    throw new AiEvalSetupError(
      'ROOT_INVALID',
      'The Silen content root is not a readable directory',
    )
  }

  let target = physicalRoot
  const segments = relativePath.split('/')
  let snapshot: Stats | undefined
  for (const [index, segment] of segments.entries()) {
    target = path.join(target, segment)
    try {
      snapshot = await lstat(target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new AiEvalSetupError(
          missingCode,
          missingMessage(missingCode),
          relativePath,
        )
      }
      throw unsafePathError(relativePath, error)
    }
    if (
      snapshot.isSymbolicLink() ||
      (index < segments.length - 1 && !snapshot.isDirectory()) ||
      (index === segments.length - 1 && !snapshot.isFile())
    ) {
      throw unsafePathError(relativePath)
    }
  }

  let handle
  try {
    handle = await open(
      target,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    )
  } catch (error) {
    throw unsafePathError(relativePath, error)
  }
  try {
    const opened = await handle.stat()
    const after = await lstat(target)
    if (
      snapshot === undefined ||
      !opened.isFile() ||
      snapshot.dev !== opened.dev ||
      snapshot.ino !== opened.ino ||
      opened.dev !== after.dev ||
      opened.ino !== after.ino
    ) {
      throw unsafePathError(relativePath)
    }
    if (opened.size > maximumBytes) {
      throw new AiEvalSetupError(
        tooLargeCode,
        `${relativePath} exceeds the supported size limit`,
        relativePath,
      )
    }
    return await handle.readFile('utf8')
  } catch (error) {
    if (error instanceof AiEvalSetupError) throw error
    throw unsafePathError(relativePath, error)
  } finally {
    await handle.close()
  }
}

function parseJson(
  source: string,
  code: 'SUITE_JSON' | 'INDEX_JSON',
  relativePath: string,
): unknown {
  try {
    return JSON.parse(source) as unknown
  } catch (error) {
    throw new AiEvalSetupError(
      code,
      `${relativePath} is not valid JSON`,
      relativePath,
      undefined,
      { cause: error },
    )
  }
}

function parseSuite(source: string): AiEvalSuite {
  const value = parseJson(source, 'SUITE_JSON', SUITE_PATH)
  const result = suiteSchema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = issue?.path.map(String).join('.') || undefined
    throw new AiEvalSetupError(
      'SUITE_SCHEMA',
      issue?.message ?? 'The AI evaluation suite is invalid',
      SUITE_PATH,
      field,
      { cause: result.error },
    )
  }
  return result.data
}

function parseIndex(source: string): ReadableSearchIndex {
  const value = parseJson(source, 'INDEX_JSON', INDEX_PATH)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AiEvalSetupError(
      'INDEX_SCHEMA',
      `${INDEX_PATH} must contain a serialized Silen search index`,
      INDEX_PATH,
    )
  }
  const candidate = value as {
    readonly version?: unknown
    readonly index?: unknown
  }
  if (candidate.version !== 1 && candidate.version !== 2) {
    throw new AiEvalSetupError(
      'INDEX_VERSION',
      `${INDEX_PATH} uses an unsupported search index version`,
      INDEX_PATH,
      'version',
    )
  }
  if (
    typeof candidate.index !== 'object' ||
    candidate.index === null ||
    Array.isArray(candidate.index)
  ) {
    throw new AiEvalSetupError(
      'INDEX_SCHEMA',
      `${INDEX_PATH} must contain a serialized Silen search index`,
      INDEX_PATH,
      'index',
    )
  }
  return candidate as ReadableSearchIndex
}

function comparableHeading(value: string | undefined): string | undefined {
  return value?.replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US')
}

function evaluateCase(
  index: ReadableSearchIndex,
  item: AiEvalSuite['cases'][number],
  topK: number,
): AiEvalCaseResult {
  const actual = queryRankedSearchIndex(index, item.query, {
    ...(item.lang === undefined ? {} : { lang: item.lang }),
  })
    .slice(0, topK)
    .map((result, resultIndex): AiEvalActualResult => ({
      rank: resultIndex + 1,
      route: result.route,
      title: result.title,
      score: result.score,
      ...(result.heading === undefined ? {} : { heading: result.heading }),
      ...(result.lang === undefined ? {} : { lang: result.lang }),
    }))

  const expectedRoute = normalizeSiteRoute(item.expected.route)
  const expectedHeading = comparableHeading(item.expected.heading)
  const ok = actual.some(
    (result) =>
      normalizeSiteRoute(result.route) === expectedRoute &&
      (expectedHeading === undefined ||
        comparableHeading(result.heading) === expectedHeading),
  )

  return {
    id: item.id,
    ok,
    query: item.query,
    ...(item.lang === undefined ? {} : { lang: item.lang }),
    expected: {
      route: item.expected.route,
      ...(item.expected.heading === undefined
        ? {}
        : { heading: item.expected.heading }),
    },
    actual,
  }
}

export async function runAiEvaluation(root: string): Promise<AiEvalReport> {
  const suiteSource = await readBoundedFile(
    root,
    SUITE_PATH,
    SUITE_MAXIMUM_BYTES,
    'SUITE_MISSING',
    'SUITE_TOO_LARGE',
  )
  const suite = parseSuite(suiteSource)
  const indexSource = await readBoundedFile(
    root,
    INDEX_PATH,
    INDEX_MAXIMUM_BYTES,
    'INDEX_MISSING',
    'INDEX_TOO_LARGE',
  )
  const index = parseIndex(indexSource)
  const cases = suite.cases.map((item) => evaluateCase(index, item, suite.topK))
  const passed = cases.filter((item) => item.ok).length
  const failed = cases.length - passed

  return {
    schemaVersion: 1,
    ok: failed === 0,
    suite: SUITE_PATH,
    index: INDEX_PATH,
    topK: suite.topK,
    summary: { total: cases.length, passed, failed },
    cases,
  }
}

function expectedLabel(result: AiEvalCaseResult): string {
  return result.expected.heading === undefined
    ? result.expected.route
    : `${result.expected.route} — ${result.expected.heading}`
}

function actualLabel(result: AiEvalActualResult): string {
  const details = [
    result.heading === undefined ? undefined : `heading=${result.heading}`,
    result.lang === undefined ? undefined : `lang=${result.lang}`,
    `score=${result.score}`,
  ].filter((value): value is string => value !== undefined)
  return `${result.rank}. ${result.route} — ${result.title} (${details.join(', ')})`
}

export function formatAiEvalReport(report: AiEvalReport): string {
  const failedSuffix =
    report.summary.failed === 0 ? '' : ` (${report.summary.failed} failed)`
  const lines = [
    `Silen AI eval: ${report.summary.passed}/${report.summary.total} passed${failedSuffix}`,
  ]

  for (const result of report.cases) {
    if (result.ok) continue
    lines.push(
      '',
      `FAIL ${result.id}`,
      `  Query: ${result.query}`,
      `  Expected: ${expectedLabel(result)}`,
      '  Actual:',
    )
    if (result.actual.length === 0) {
      lines.push('    (no results)')
    } else {
      lines.push(...result.actual.map((item) => `    ${actualLabel(item)}`))
    }
    lines.push(
      '  Improve the relevant title, description, heading, or page text, or correct the authored expectation.',
    )
  }

  return `${lines.join('\n')}\n`
}

export function serializeAiEvalReport(report: AiEvalReport): string {
  return `${JSON.stringify(report, null, 2)}\n`
}

export function serializeAiEvalSetupError(error: AiEvalSetupError): string {
  const document = {
    schemaVersion: 1 as const,
    ok: false as const,
    error: {
      code: error.code,
      message: error.message,
      ...(error.relativePath === undefined ? {} : { path: error.relativePath }),
      ...(error.field === undefined ? {} : { field: error.field }),
    },
  }
  return `${JSON.stringify(document, null, 2)}\n`
}
