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

export interface AiEvalTarget {
  readonly route: string
  readonly heading?: string
}

export type AiEvalExpectedV1 = AiEvalTarget

export interface AiEvalExpectedV2 extends AiEvalTarget {
  readonly maxRank: number
}

export interface AiEvalExpectedV3 {
  readonly acceptable: readonly AiEvalTarget[]
  readonly forbidden: readonly AiEvalTarget[]
  readonly maxRank: number
}

export interface AiEvalForbiddenMatch {
  readonly target: AiEvalTarget
  readonly rank: number
}

interface AiEvalCaseResultBase {
  readonly id: string
  readonly ok: boolean
  readonly query: string
  readonly lang?: string
  readonly actual: readonly AiEvalActualResult[]
}

export interface AiEvalCaseResultV1 extends AiEvalCaseResultBase {
  readonly expected: AiEvalExpectedV1
}

export interface AiEvalCaseResultV2 extends AiEvalCaseResultBase {
  readonly expected: AiEvalExpectedV2
  readonly matchedRank: number | null
}

export interface AiEvalCaseResultV3 extends AiEvalCaseResultBase {
  readonly expected: AiEvalExpectedV3
  readonly matchedTarget: AiEvalTarget | null
  readonly matchedRank: number | null
  readonly forbiddenMatches: readonly AiEvalForbiddenMatch[]
}

export type AiEvalCaseResult =
  AiEvalCaseResultV1 | AiEvalCaseResultV2 | AiEvalCaseResultV3

interface AiEvalReportBase {
  readonly ok: boolean
  readonly suite: '.silen/ai-evals.json'
  readonly index: '.silen/dist/search-index.json'
  readonly topK: number
  readonly summary: {
    readonly total: number
    readonly passed: number
    readonly failed: number
  }
}

export interface AiEvalReportV1 extends AiEvalReportBase {
  readonly schemaVersion: 1
  readonly cases: readonly AiEvalCaseResultV1[]
}

export interface AiEvalReportV2 extends AiEvalReportBase {
  readonly schemaVersion: 2
  readonly cases: readonly AiEvalCaseResultV2[]
}

export interface AiEvalReportV3 extends AiEvalReportBase {
  readonly schemaVersion: 3
  readonly cases: readonly AiEvalCaseResultV3[]
}

export type AiEvalReport = AiEvalReportV1 | AiEvalReportV2 | AiEvalReportV3

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

const expectedV1Schema = z
  .object({
    route: expectedRouteSchema,
    heading: normalizedTextSchema(500).optional(),
  })
  .strict()

const expectedV2Schema = z
  .object({
    route: expectedRouteSchema,
    heading: normalizedTextSchema(500).optional(),
    maxRank: z.number().int().min(1).max(20).optional(),
  })
  .strict()

const targetSchema = z
  .object({
    route: expectedRouteSchema,
    heading: normalizedTextSchema(500).optional(),
  })
  .strict()

const expectedV3Schema = z
  .object({
    acceptable: z.array(targetSchema).max(20),
    forbidden: z.array(targetSchema).max(20),
    maxRank: z.number().int().min(1).max(20),
  })
  .strict()

const caseV1Schema = z
  .object({
    id: normalizedTextSchema(100),
    query: normalizedTextSchema(500),
    lang: normalizedTextSchema(100).optional(),
    expected: expectedV1Schema,
  })
  .strict()

const caseV2Schema = z
  .object({
    id: normalizedTextSchema(100),
    query: normalizedTextSchema(500),
    lang: normalizedTextSchema(100).optional(),
    expected: expectedV2Schema,
  })
  .strict()

const caseV3Schema = z
  .object({
    id: normalizedTextSchema(100),
    query: normalizedTextSchema(500),
    lang: normalizedTextSchema(100).optional(),
    expected: expectedV3Schema,
  })
  .strict()

const suiteV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    topK: z.number().int().min(1).max(20).default(5),
    cases: z.array(caseV1Schema).min(1).max(500),
  })
  .strict()

const suiteV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    topK: z.number().int().min(1).max(20).default(5),
    cases: z.array(caseV2Schema).min(1).max(500),
  })
  .strict()

const suiteV3Schema = z
  .object({
    schemaVersion: z.literal(3),
    topK: z.number().int().min(1).max(20).default(5),
    cases: z.array(caseV3Schema).min(1).max(500),
  })
  .strict()

function comparableHeading(value: string | undefined): string | undefined {
  return value?.replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US')
}

function targetsOverlap(
  left: z.output<typeof targetSchema>,
  right: z.output<typeof targetSchema>,
): boolean {
  if (normalizeSiteRoute(left.route) !== normalizeSiteRoute(right.route)) {
    return false
  }
  const leftHeading = comparableHeading(left.heading)
  const rightHeading = comparableHeading(right.heading)
  return (
    leftHeading === undefined ||
    rightHeading === undefined ||
    leftHeading === rightHeading
  )
}

const suiteSchema = z
  .discriminatedUnion('schemaVersion', [
    suiteV1Schema,
    suiteV2Schema,
    suiteV3Schema,
  ])
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

    if (suite.schemaVersion === 2) {
      for (const [index, item] of suite.cases.entries()) {
        if (
          item.expected.maxRank === undefined ||
          item.expected.maxRank <= suite.topK
        ) {
          continue
        }
        context.addIssue({
          code: 'custom',
          path: ['cases', index, 'expected', 'maxRank'],
          message: 'maxRank must be less than or equal to topK',
        })
      }
      return
    }

    if (suite.schemaVersion !== 3) return
    for (const [caseIndex, item] of suite.cases.entries()) {
      const { acceptable, forbidden, maxRank } = item.expected
      if (acceptable.length === 0 && forbidden.length === 0) {
        context.addIssue({
          code: 'custom',
          path: ['cases', caseIndex, 'expected', 'acceptable'],
          message: 'At least one acceptable or forbidden target is required',
        })
      }
      if (maxRank > suite.topK) {
        context.addIssue({
          code: 'custom',
          path: ['cases', caseIndex, 'expected', 'maxRank'],
          message: 'maxRank must be less than or equal to topK',
        })
      }
      if (acceptable.length === 0 && maxRank !== suite.topK) {
        context.addIssue({
          code: 'custom',
          path: ['cases', caseIndex, 'expected', 'maxRank'],
          message: 'Negative-only cases must set maxRank equal to topK',
        })
      }

      for (const name of ['acceptable', 'forbidden'] as const) {
        const targets = item.expected[name]
        for (let current = 0; current < targets.length; current += 1) {
          for (let previous = 0; previous < current; previous += 1) {
            if (!targetsOverlap(targets[previous]!, targets[current]!)) continue
            context.addIssue({
              code: 'custom',
              path: ['cases', caseIndex, 'expected', name, current],
              message: `${name} target overlaps target ${previous}`,
            })
          }
        }
      }

      for (const [forbiddenIndex, blocked] of forbidden.entries()) {
        if (!acceptable.some((target) => targetsOverlap(target, blocked))) {
          continue
        }
        context.addIssue({
          code: 'custom',
          path: ['cases', caseIndex, 'expected', 'forbidden', forbiddenIndex],
          message: 'Forbidden target overlaps an acceptable target',
        })
      }
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

type EvaluationCaseInput = {
  readonly query: string
  readonly lang?: string | undefined
}

type EvaluationTargetInput = {
  readonly route: string
  readonly heading?: string | undefined
}

function queryActualResults(
  index: ReadableSearchIndex,
  item: EvaluationCaseInput,
  topK: number,
): AiEvalActualResult[] {
  return queryRankedSearchIndex(index, item.query, {
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
}

function findMatchedRank(
  actual: readonly AiEvalActualResult[],
  expected: EvaluationTargetInput,
): number | null {
  const expectedRoute = normalizeSiteRoute(expected.route)
  const expectedHeading = comparableHeading(expected.heading)
  const match = actual.find(
    (result) =>
      normalizeSiteRoute(result.route) === expectedRoute &&
      (expectedHeading === undefined ||
        comparableHeading(result.heading) === expectedHeading),
  )
  return match?.rank ?? null
}

function evaluateCaseV1(
  index: ReadableSearchIndex,
  item: z.output<typeof caseV1Schema>,
  topK: number,
): AiEvalCaseResultV1 {
  const actual = queryActualResults(index, item, topK)
  const matchedRank = findMatchedRank(actual, item.expected)

  return {
    id: item.id,
    ok: matchedRank !== null,
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

function evaluateCaseV2(
  index: ReadableSearchIndex,
  item: z.output<typeof caseV2Schema>,
  topK: number,
): AiEvalCaseResultV2 {
  const actual = queryActualResults(index, item, topK)
  const matchedRank = findMatchedRank(actual, item.expected)
  const maxRank = item.expected.maxRank ?? topK
  return {
    id: item.id,
    ok: matchedRank !== null && matchedRank <= maxRank,
    query: item.query,
    ...(item.lang === undefined ? {} : { lang: item.lang }),
    expected: {
      route: item.expected.route,
      ...(item.expected.heading === undefined
        ? {}
        : { heading: item.expected.heading }),
      maxRank,
    },
    matchedRank,
    actual,
  }
}

function matchesTarget(
  result: AiEvalActualResult,
  target: EvaluationTargetInput,
): boolean {
  const expectedRoute = normalizeSiteRoute(target.route)
  const expectedHeading = comparableHeading(target.heading)
  return (
    normalizeSiteRoute(result.route) === expectedRoute &&
    (expectedHeading === undefined ||
      comparableHeading(result.heading) === expectedHeading)
  )
}

function materializeTarget(target: EvaluationTargetInput): AiEvalTarget {
  return {
    route: target.route,
    ...(target.heading === undefined ? {} : { heading: target.heading }),
  }
}

function evaluateCaseV3(
  index: ReadableSearchIndex,
  item: z.output<typeof caseV3Schema>,
  topK: number,
): AiEvalCaseResultV3 {
  const actual = queryActualResults(index, item, topK)
  let matched:
    | { readonly target: z.output<typeof targetSchema>; readonly rank: number }
    | undefined

  for (const result of actual) {
    const target = item.expected.acceptable.find((candidate) =>
      matchesTarget(result, candidate),
    )
    if (target !== undefined) {
      matched = { target, rank: result.rank }
      break
    }
  }

  const forbiddenMatches: AiEvalForbiddenMatch[] = []
  for (const result of actual) {
    for (const target of item.expected.forbidden) {
      if (!matchesTarget(result, target)) continue
      forbiddenMatches.push({
        target: materializeTarget(target),
        rank: result.rank,
      })
    }
  }

  const positiveOk =
    item.expected.acceptable.length === 0 ||
    (matched !== undefined && matched.rank <= item.expected.maxRank)

  return {
    id: item.id,
    ok: positiveOk && forbiddenMatches.length === 0,
    query: item.query,
    ...(item.lang === undefined ? {} : { lang: item.lang }),
    expected: {
      acceptable: item.expected.acceptable.map(materializeTarget),
      forbidden: item.expected.forbidden.map(materializeTarget),
      maxRank: item.expected.maxRank,
    },
    matchedTarget:
      matched === undefined ? null : materializeTarget(matched.target),
    matchedRank: matched?.rank ?? null,
    forbiddenMatches,
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
  if (suite.schemaVersion === 1) {
    const cases = suite.cases.map((item) =>
      evaluateCaseV1(index, item, suite.topK),
    )
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

  if (suite.schemaVersion === 2) {
    const cases = suite.cases.map((item) =>
      evaluateCaseV2(index, item, suite.topK),
    )
    const passed = cases.filter((item) => item.ok).length
    const failed = cases.length - passed

    return {
      schemaVersion: 2,
      ok: failed === 0,
      suite: SUITE_PATH,
      index: INDEX_PATH,
      topK: suite.topK,
      summary: { total: cases.length, passed, failed },
      cases,
    }
  }

  const cases = suite.cases.map((item) =>
    evaluateCaseV3(index, item, suite.topK),
  )
  const passed = cases.filter((item) => item.ok).length
  const failed = cases.length - passed

  return {
    schemaVersion: 3,
    ok: failed === 0,
    suite: SUITE_PATH,
    index: INDEX_PATH,
    topK: suite.topK,
    summary: { total: cases.length, passed, failed },
    cases,
  }
}

function targetLabel(target: AiEvalTarget): string {
  return target.heading === undefined
    ? target.route
    : `${target.route} — ${target.heading}`
}

function expectedLabel(result: AiEvalCaseResult): string {
  if ('forbiddenMatches' in result) {
    const acceptable =
      result.expected.acceptable.length === 0
        ? '(none)'
        : result.expected.acceptable.map(targetLabel).join(' | ')
    const forbidden =
      result.expected.forbidden.length === 0
        ? '(none)'
        : result.expected.forbidden.map(targetLabel).join(' | ')
    return `Acceptable: ${acceptable}; Forbidden: ${forbidden}`
  }
  return targetLabel(result.expected)
}

function actualLabel(result: AiEvalActualResult): string {
  const details = [
    result.heading === undefined ? undefined : `heading=${result.heading}`,
    result.lang === undefined ? undefined : `lang=${result.lang}`,
    `score=${result.score}`,
  ].filter((value): value is string => value !== undefined)
  return `${result.rank}. ${result.route} — ${result.title} (${details.join(', ')})`
}

function rankFailureLabel(
  result: AiEvalCaseResult,
  topK: number,
): string | undefined {
  if ('forbiddenMatches' in result) {
    if (
      result.expected.acceptable.length === 0 ||
      (result.matchedRank !== null &&
        result.matchedRank <= result.expected.maxRank)
    ) {
      return undefined
    }
  } else if (!('matchedRank' in result)) {
    return undefined
  }

  return result.matchedRank === null
    ? `No complete match in Top ${topK}; required rank ${result.expected.maxRank} or better.`
    : `Matched at rank ${result.matchedRank}; required rank ${result.expected.maxRank} or better.`
}

function forbiddenFailureLabels(result: AiEvalCaseResult): string[] {
  if (!('forbiddenMatches' in result) || result.forbiddenMatches.length === 0) {
    return []
  }
  return result.forbiddenMatches.map(
    ({ target, rank }) =>
      `  Forbidden: ${targetLabel(target)} at rank ${rank}.`,
  )
}

function remediationLabel(result: AiEvalCaseResult): string {
  if ('forbiddenMatches' in result && result.forbiddenMatches.length > 0) {
    return '  Improve an acceptable target, remove forbidden targets from search results, or correct the authored expectation.'
  }
  return '  Improve the relevant title, description, heading, or page text, or correct the authored expectation.'
}

export function formatAiEvalReport(report: AiEvalReport): string {
  const failedSuffix =
    report.summary.failed === 0 ? '' : ` (${report.summary.failed} failed)`
  const lines = [
    `Silen AI eval: ${report.summary.passed}/${report.summary.total} passed${failedSuffix}`,
  ]

  for (const result of report.cases) {
    if (result.ok) continue
    const rankFailure = rankFailureLabel(result, report.topK)
    lines.push(
      '',
      `FAIL ${result.id}`,
      `  Query: ${result.query}`,
      `  Expected: ${expectedLabel(result)}`,
      ...(rankFailure === undefined ? [] : [`  Rank: ${rankFailure}`]),
      ...forbiddenFailureLabels(result),
      '  Actual:',
    )
    if (result.actual.length === 0) {
      lines.push('    (no results)')
    } else {
      lines.push(...result.actual.map((item) => `    ${actualLabel(item)}`))
    }
    lines.push(remediationLabel(result))
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
