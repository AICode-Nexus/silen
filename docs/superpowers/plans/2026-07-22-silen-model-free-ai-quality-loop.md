# Silen Model-Free AI Quality Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, model-free retrieval quality gate that evaluates authored questions against Silen's production search index, while fixing base-aware AI audit behavior and making the local workspace index cache non-blocking.

**Architecture:** A scored Node-side search seam exposes the same MiniSearch ranking used for production index verification without changing the public site result shape. A read-only evaluator validates `.silen/ai-evals.json`, queries `.silen/dist/search-index.json`, and renders stable human or JSON reports. Audit receives an explicit or safely discovered deployment base, keeps MCP config-free, and separates blocking issues from informational notices.

**Tech Stack:** TypeScript 7.0.2, Zod 4.4.3, MiniSearch 7.2.0, CAC 7.0.0, Vitest 4.1.10, execa 9.6.1, pnpm 10.34.0.

**Design:** `docs/superpowers/specs/2026-07-22-silen-model-free-ai-quality-loop-design.md`

**Chinese design:** `docs/superpowers/specs/2026-07-22-silen-model-free-ai-quality-loop-design-zh-CN/translation.md`

## Global Constraints

- The complete build, audit, evaluation, local search, AI artifact, and read-only MCP path must work without a model, embeddings, provider SDK, API key, hosted endpoint, or network request.
- `ai eval` is read-only: it must not execute `.silen/config.ts` or MDX, create files, mutate caches, inspect model configuration, call `fetch`, or modify the Git worktree.
- The committed suite path is `.silen/ai-evals.json`; the evaluated index path is `.silen/dist/search-index.json`.
- Suite schema version is exactly `1`; default `topK` is `5` and the allowed range is 1 through 20.
- A suite contains 1 through 500 cases; IDs are unique and at most 100 characters; normalized queries contain 1 through 500 characters; the suite is at most 1 MiB.
- Expected routes are base-free. A case passes when its route and optional heading appear on the same result within Top K.
- Scores are rounded to six decimal places for diagnostics and never determine pass/fail.
- Human and JSON reports contain no timestamp, duration, absolute path, environment value, provider state, or random identifier.
- Exit status `0` means all cases passed, `1` means retrieval cases failed, and `2` means evaluation could not run.
- `.silen/ai/index.json` is an optional cache. Missing or stale cache state is a notice and cannot make audit `ok` false.
- Direct CLI audit may lazily resolve trusted config only when a built site manifest cannot provide `base`. MCP preflight never executes workspace config.
- Ask AI remains endpoint-only and optional. No endpoint still means no Ask AI control and no Ask AI client bundle.
- Use the existing dependency set. Do not add a model, vector, telemetry, or network dependency.
- Use TDD for every behavior slice and keep each task in a focused commit.

---

## Planned File Map

```text
src/node/search.ts
  Preserve the existing public search result shape and expose scored ranked
  results for deterministic evaluator diagnostics.

src/ai/routes.ts
  Normalize compiler/search routes and remove one exact deployment base.

src/ai/eval.ts
  Validate the versioned suite, read bounded fixed workspace files safely,
  execute model-free retrieval cases, and render stable reports/errors.

src/ai/audit.ts
  Apply base-aware link checks, discover a built manifest base, and separate
  blocking issues from non-blocking notices.

src/ai/workspace.ts
  Resolve audit base lazily, expose notices through audit/MCP preflight, and
  keep the optional local cache out of the blocking result.

src/node/commands.ts
  Register the eval action and --json option, route exit codes, and provide
  trusted CLI-only audit base fallback.

tests/theme/search.test.ts
tests/ai/eval.test.ts
tests/ai/audit.test.ts
tests/ai/workspace.test.ts
tests/cli.test.ts
tests/ai/cli-contract.test.ts
  Gate ranking parity, evaluation, audit safety, and CLI behavior.

website/.silen/ai-evals.json
website/ai/index.mdx
website/zh/ai/index.mdx
website/ai/local-workspace-mcp/index.mdx
website/zh/ai/local-workspace-mcp/index.mdx
website/guide/cli-deployment/index.mdx
website/zh/guide/cli-deployment/index.mdx
website/reference/index.mdx
website/zh/reference/index.mdx
  Dogfood and document the bilingual no-model quality loop.
```

### Task 1: Preserve production search ranking with scored diagnostics

**Files:**

- Modify: `src/node/search.ts:23-305`
- Modify: `tests/theme/search.test.ts:17-25`
- Modify: `tests/theme/search.test.ts:145-220`

**Interfaces:**

- Consumes: `ReadableSearchIndex`, `SearchOptions`, and the existing MiniSearch sorting and result-mapping helpers.
- Produces: `RankedSearchResult extends SearchResult` and `queryRankedSearchIndex(index, query, options): RankedSearchResult[]`.
- Preserves: `querySearchIndex(index, query, options): SearchResult[]` without a public `score` property.

- [ ] **Step 1: Write failing scored-search tests**

Add the import and focused assertions:

```ts
import {
  createSearchIndex,
  createPageSearchDocuments,
  markdownToSearchText,
  queryRankedSearchIndex,
  querySearchIndex,
  serializeSearchIndex,
  type SearchDocument,
} from '../../src/node/search'

it('exposes rounded diagnostic scores without changing public search results', () => {
  const index = createSearchIndex(documents)
  const ranked = queryRankedSearchIndex(index, 'configuration')
  const plain = querySearchIndex(index, 'configuration')

  expect(ranked.map(({ route }) => route)).toEqual(
    plain.map(({ route }) => route),
  )
  expect(ranked[0]?.score).toBeGreaterThan(0)
  expect(String(ranked[0]?.score)).toMatch(/^\d+(?:\.\d{1,6})?$/)
  expect(plain[0]).not.toHaveProperty('score')
})

it('keeps language preference and deterministic tie breaks in the scored path', () => {
  const index = createSearchIndex([
    {
      id: '/en/configuration',
      lang: 'en-US',
      title: 'Configuration',
      text: 'Configuration reference.',
      route: '/en/configuration',
    },
    {
      id: '/zh/api',
      lang: 'zh-CN',
      title: 'API',
      text: 'Configuration reference.',
      route: '/zh/api',
    },
  ])

  expect(
    queryRankedSearchIndex(index, 'configuration', { lang: 'zh-CN' }).map(
      ({ route }) => route,
    ),
  ).toEqual(['/zh/api', '/en/configuration'])
})
```

- [ ] **Step 2: Run the focused test and verify the missing export**

Run:

```bash
corepack pnpm test tests/theme/search.test.ts
```

Expected: FAIL because `queryRankedSearchIndex` is not exported.

- [ ] **Step 3: Add the scored query seam**

Add the type and make the ranked function own the existing search pipeline:

```ts
export interface RankedSearchResult extends SearchResult {
  readonly score: number
}

export function queryRankedSearchIndex(
  serialized: ReadableSearchIndex,
  query: string,
  options: SearchOptions = {},
): RankedSearchResult[] {
  const normalizedQuery = normalizedText(query)
  if (!normalizedQuery) return []
  if (serialized.version !== 1 && serialized.version !== 2) {
    throw new TypeError(
      `Unsupported Silen search index version ${String((serialized as { readonly version: unknown }).version)}`,
    )
  }

  const miniSearch = MiniSearch.loadJSON<IndexedSearchDocument>(
    JSON.stringify(serialized.index),
    SEARCH_OPTIONS,
  )
  return miniSearch
    .search(normalizedQuery)
    .sort((left, right) =>
      compareSearchResults(
        left,
        right,
        serialized.version === 2 ? options.lang : undefined,
      ),
    )
    .map((result): RankedSearchResult => {
      const terms = [...result.terms, ...result.queryTerms]
      const title = typeof result.title === 'string' ? result.title : ''
      const route = typeof result.route === 'string' ? result.route : ''
      const description =
        typeof result.description === 'string' ? result.description : ''
      const text = typeof result.text === 'string' ? result.text : title
      const heading = matchingHeading(result, terms)
      const lang =
        serialized.version === 2 && typeof result.lang === 'string'
          ? result.lang
          : undefined
      return {
        id: String(result.id),
        title,
        route,
        snippet: highlightSnippet(
          snippetSource({ title, description, text, terms }),
          terms,
        ),
        score: Number(result.score.toFixed(6)),
        ...(lang === undefined ? {} : { lang }),
        ...(heading === undefined ? {} : { heading }),
      }
    })
}

export function querySearchIndex(
  serialized: ReadableSearchIndex,
  query: string,
  options: SearchOptions = {},
): SearchResult[] {
  return queryRankedSearchIndex(serialized, query, options).map(
    ({ score: _score, ...result }) => result,
  )
}
```

- [ ] **Step 4: Run search tests and typecheck**

Run:

```bash
corepack pnpm test tests/theme/search.test.ts
corepack pnpm typecheck
```

Expected: both commands PASS; existing client and Node search expectations remain unchanged.

- [ ] **Step 5: Commit the scored search seam**

```bash
git add src/node/search.ts tests/theme/search.test.ts docs/superpowers/plans/2026-07-22-silen-model-free-ai-quality-loop.md
git commit -m "refactor(search): expose ranked diagnostics"
```

### Task 2: Build the read-only model-free evaluation engine

**Files:**

- Create: `src/ai/routes.ts`
- Create: `src/ai/eval.ts`
- Create: `tests/ai/eval.test.ts`

**Interfaces:**

- Consumes: `queryRankedSearchIndex` and `ReadableSearchIndex` from Task 1.
- Produces: `normalizeSiteRoute`, `routeUnderBase`, `AiEvalSetupError`, `AiEvalReport`, `runAiEvaluation`, `formatAiEvalReport`, `serializeAiEvalReport`, and `serializeAiEvalSetupError`.
- Reads only: `.silen/ai-evals.json` up to 1 MiB and `.silen/dist/search-index.json` up to 64 MiB.

- [ ] **Step 1: Write failing evaluator behavior tests**

Create `tests/ai/eval.test.ts` with real temporary files and a generated production index:

```ts
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatAiEvalReport,
  runAiEvaluation,
  serializeAiEvalReport,
} from '../../src/ai/eval'
import {
  createSearchIndex,
  serializeSearchIndex,
} from '../../src/node/search'

const roots: string[] = []

async function temporaryRoot(): Promise<string> {
  await mkdir(path.resolve('.silen/.temp/tests'), { recursive: true })
  const value = await mkdtemp(path.resolve('.silen/.temp/tests/ai-eval-'))
  roots.push(value)
  return value
}

async function writeIndex(site: string): Promise<void> {
  await mkdir(path.join(site, '.silen/dist'), { recursive: true })
  const index = createSearchIndex([
    {
      id: '/ai',
      lang: 'en-US',
      title: 'AI-ready documentation',
      route: '/ai/',
      headings: ['Public AI artifacts'],
      text: 'Deterministic model-free public AI artifacts.',
    },
    {
      id: '/zh/ai',
      lang: 'zh-CN',
      title: 'AI-ready 文档',
      route: '/zh/ai/',
      headings: ['面向 AI 的公开产物'],
      text: '确定性、无模型的公开产物。',
    },
  ])
  await writeFile(
    path.join(site, '.silen/dist/search-index.json'),
    serializeSearchIndex(index),
  )
}

async function writeSuite(site: string, value: unknown): Promise<void> {
  await mkdir(path.join(site, '.silen'), { recursive: true })
  await writeFile(
    path.join(site, '.silen/ai-evals.json'),
    `${JSON.stringify(value, null, 2)}\n`,
  )
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(
    roots.splice(0).map((value) => rm(value, { recursive: true, force: true })),
  )
})

describe('model-free AI evaluation', () => {
  it('matches route and heading within Top K and reports rounded scores', async () => {
    const site = await temporaryRoot()
    await writeIndex(site)
    await writeSuite(site, {
      schemaVersion: 1,
      topK: 5,
      cases: [
        {
          id: 'public-artifacts',
          query: 'Public AI artifacts',
          lang: 'en-US',
          expected: {
            route: '/ai/',
            heading: 'public   ai ARTIFACTS',
          },
        },
      ],
    })

    const result = await runAiEvaluation(site)
    expect(result).toMatchObject({
      schemaVersion: 1,
      ok: true,
      summary: { total: 1, passed: 1, failed: 0 },
      cases: [
        {
          id: 'public-artifacts',
          ok: true,
          actual: [
            {
              rank: 1,
              route: '/ai/',
              heading: 'Public AI artifacts',
              lang: 'en-US',
            },
          ],
        },
      ],
    })
    expect(result.cases[0]?.actual[0]?.score).toBeGreaterThan(0)
  })

  it('collects all misses and keeps identical serialized output', async () => {
    const site = await temporaryRoot()
    await writeIndex(site)
    await writeSuite(site, {
      schemaVersion: 1,
      topK: 1,
      cases: [
        {
          id: 'missing-route',
          query: 'Public AI artifacts',
          expected: { route: '/missing/' },
        },
        {
          id: 'missing-query',
          query: 'no matching vocabulary',
          expected: { route: '/ai/' },
        },
      ],
    })

    const first = await runAiEvaluation(site)
    const second = await runAiEvaluation(site)
    expect(first.summary).toEqual({ total: 2, passed: 0, failed: 2 })
    expect(first.cases[1]?.actual).toEqual([])
    expect(serializeAiEvalReport(first)).toBe(serializeAiEvalReport(second))
    expect(formatAiEvalReport(first)).toContain('2 failed')
  })

  it.each([
    [{ schemaVersion: 2, cases: [] }, 'schemaVersion'],
    [{ schemaVersion: 1, cases: [] }, 'cases'],
    [
      {
        schemaVersion: 1,
        cases: [
          { id: 'same', query: 'one', expected: { route: '/' } },
          { id: 'same', query: 'two', expected: { route: '/' } },
        ],
      },
      'cases.1.id',
    ],
    [
      {
        schemaVersion: 1,
        cases: [
          {
            id: 'unknown',
            query: 'query',
            expected: { route: '/' },
            typo: true,
          },
        ],
      },
      'cases.0',
    ],
  ])('rejects invalid suite %# with a stable field path', async (suite, field) => {
    const site = await temporaryRoot()
    await writeIndex(site)
    await writeSuite(site, suite)
    await expect(runAiEvaluation(site)).rejects.toMatchObject({
      code: 'SUITE_SCHEMA',
      field,
    })
  })

  it('does not call fetch or create cache files', async () => {
    const site = await temporaryRoot()
    await writeIndex(site)
    await writeSuite(site, {
      schemaVersion: 1,
      cases: [
        {
          id: 'offline',
          query: 'Public AI artifacts',
          expected: { route: '/ai/' },
        },
      ],
    })
    const fetch = vi.fn(() => {
      throw new Error('network used')
    })
    vi.stubGlobal('fetch', fetch)
    const before = await readFile(path.join(site, '.silen/ai-evals.json'))
    await runAiEvaluation(site)
    expect(fetch).not.toHaveBeenCalled()
    expect(await readFile(path.join(site, '.silen/ai-evals.json'))).toEqual(
      before,
    )
    await expect(lstat(path.join(site, '.silen/ai'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('rejects a symlinked suite without reading outside the root', async () => {
    const site = await temporaryRoot()
    const outsideRoot = await temporaryRoot()
    const outside = path.join(outsideRoot, 'outside.json')
    await writeFile(outside, '{"schemaVersion":1,"cases":[]}')
    await mkdir(path.join(site, '.silen'))
    await symlink(outside, path.join(site, '.silen/ai-evals.json'))
    await expect(runAiEvaluation(site)).rejects.toMatchObject({
      code: 'UNSAFE_PATH',
    })
  })
})
```

In the same file add this schema matrix so every bound has a regression:

```ts
it.each([
  [
    {
      schemaVersion: 1,
      topK: 0,
      cases: [{ id: 'case', query: 'query', expected: { route: '/' } }],
    },
    'topK',
  ],
  [
    {
      schemaVersion: 1,
      topK: 21,
      cases: [{ id: 'case', query: 'query', expected: { route: '/' } }],
    },
    'topK',
  ],
  [
    {
      schemaVersion: 1,
      cases: [{ id: 'case', query: '   ', expected: { route: '/' } }],
    },
    'cases.0.query',
  ],
  [
    {
      schemaVersion: 1,
      cases: [
        { id: 'case', query: 'query', expected: { route: 'relative' } },
      ],
    },
    'cases.0.expected.route',
  ],
  [
    {
      schemaVersion: 1,
      cases: [
        { id: 'case', query: 'query', expected: { route: '/../outside' } },
      ],
    },
    'cases.0.expected.route',
  ],
])('rejects bounded schema input %#', async (suite, field) => {
  const site = await temporaryRoot()
  await writeIndex(site)
  await writeSuite(site, suite)
  await expect(runAiEvaluation(site)).rejects.toMatchObject({
    code: 'SUITE_SCHEMA',
    field,
  })
})
```

Add setup tests with one root per failure and use `truncate` for size limits:

```ts
async function expectSetupCode(
  site: string,
  code: string,
): Promise<void> {
  await expect(runAiEvaluation(site)).rejects.toMatchObject({ code })
}

it('distinguishes suite setup failures', async () => {
  const missing = await temporaryRoot()
  await expectSetupCode(missing, 'SUITE_MISSING')

  const malformed = await temporaryRoot()
  await mkdir(path.join(malformed, '.silen'))
  await writeFile(path.join(malformed, '.silen/ai-evals.json'), '{')
  await expectSetupCode(malformed, 'SUITE_JSON')

  const oversized = await temporaryRoot()
  await mkdir(path.join(oversized, '.silen'))
  const suite = path.join(oversized, '.silen/ai-evals.json')
  await writeFile(suite, '{}')
  await truncate(suite, 1024 * 1024 + 1)
  await expectSetupCode(oversized, 'SUITE_TOO_LARGE')
})

it('distinguishes production index setup failures', async () => {
  const validSuite = {
    schemaVersion: 1,
    cases: [{ id: 'case', query: 'query', expected: { route: '/' } }],
  }

  const missing = await temporaryRoot()
  await writeSuite(missing, validSuite)
  await expectSetupCode(missing, 'INDEX_MISSING')

  const malformed = await temporaryRoot()
  await writeSuite(malformed, validSuite)
  await mkdir(path.join(malformed, '.silen/dist'))
  await writeFile(path.join(malformed, '.silen/dist/search-index.json'), '{')
  await expectSetupCode(malformed, 'INDEX_JSON')

  const invalid = await temporaryRoot()
  await writeSuite(invalid, validSuite)
  await mkdir(path.join(invalid, '.silen/dist'))
  await writeFile(
    path.join(invalid, '.silen/dist/search-index.json'),
    '{"version":2,"index":[]}',
  )
  await expectSetupCode(invalid, 'INDEX_SCHEMA')

  const unsupported = await temporaryRoot()
  await writeSuite(unsupported, validSuite)
  await mkdir(path.join(unsupported, '.silen/dist'))
  await writeFile(
    path.join(unsupported, '.silen/dist/search-index.json'),
    '{"version":3,"index":{}}',
  )
  await expectSetupCode(unsupported, 'INDEX_VERSION')

  const oversized = await temporaryRoot()
  await writeSuite(oversized, validSuite)
  await mkdir(path.join(oversized, '.silen/dist'))
  const index = path.join(oversized, '.silen/dist/search-index.json')
  await writeFile(index, '{}')
  await truncate(index, 64 * 1024 * 1024 + 1)
  await expectSetupCode(oversized, 'INDEX_TOO_LARGE')
})
```

- [ ] **Step 2: Run the evaluator test and verify missing modules**

Run:

```bash
corepack pnpm test tests/ai/eval.test.ts
```

Expected: FAIL because `src/ai/eval.ts` does not exist.

- [ ] **Step 3: Implement shared route normalization**

Create `src/ai/routes.ts`:

```ts
function pathname(value: string): string {
  return value.split(/[?#]/, 1)[0] ?? value
}

export function normalizeSiteRoute(value: string): string {
  const withoutSuffix = pathname(value).replace(/\.(?:md|mdx|html)$/i, '')
  if (withoutSuffix === '/index') return '/'
  if (withoutSuffix.endsWith('/index')) {
    return withoutSuffix.slice(0, -6) || '/'
  }
  if (withoutSuffix.length > 1 && withoutSuffix.endsWith('/')) {
    return withoutSuffix.slice(0, -1)
  }
  return withoutSuffix || '/'
}

export function routeUnderBase(
  value: string,
  base: string | undefined,
): string {
  const target = pathname(value)
  if (!base || base === '/') return normalizeSiteRoute(target)
  const normalizedBase =
    (base.startsWith('/') ? base : `/${base}`).replace(/\/?$/, '/')
  const mount = normalizedBase.slice(0, -1)
  if (target === mount) return '/'
  if (target.startsWith(normalizedBase)) {
    return normalizeSiteRoute(`/${target.slice(normalizedBase.length)}`)
  }
  return normalizeSiteRoute(target)
}
```

- [ ] **Step 4: Implement strict suite parsing, safe reads, evaluation, and reports**

Create `src/ai/eval.ts` with these exact contracts:

```ts
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

export async function runAiEvaluation(root: string): Promise<AiEvalReport>
export function formatAiEvalReport(report: AiEvalReport): string
export function serializeAiEvalReport(report: AiEvalReport): string
export function serializeAiEvalSetupError(error: AiEvalSetupError): string
```

Use these strict schemas and normalize query whitespace before querying:

```ts
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
```

Validate the parsed index as an object with `version` equal to `1` or `2` and a non-array object `index`.

The fixed-file reader must:

1. Resolve the physical content root.
2. Walk each fixed path component with `lstat` and reject symbolic links.
3. Require directories for intermediate components and a regular file for the final component.
4. Open with `O_RDONLY | O_NOFOLLOW`.
5. Compare pre-open and post-open device/inode identity.
6. Enforce the byte limit before reading UTF-8.
7. Report only the stable relative path.

Implement the walk and identity check directly; the final helper must have this shape:

```ts
function missingMessage(
  code: 'SUITE_MISSING' | 'INDEX_MISSING',
): string {
  return code === 'SUITE_MISSING'
    ? 'Missing .silen/ai-evals.json; create a version 1 evaluation suite'
    : 'Missing .silen/dist/search-index.json; run silen build <root> first'
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
  const rootStats = await lstat(physicalRoot)
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
      throw new AiEvalSetupError(
        'UNSAFE_PATH',
        `Unable to safely read ${relativePath}`,
        relativePath,
        undefined,
        { cause: error },
      )
    }
    if (
      snapshot.isSymbolicLink() ||
      (index < segments.length - 1 && !snapshot.isDirectory()) ||
      (index === segments.length - 1 && !snapshot.isFile())
    ) {
      throw new AiEvalSetupError(
        'UNSAFE_PATH',
        `Unable to safely read ${relativePath}`,
        relativePath,
      )
    }
  }

  const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
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
      throw new AiEvalSetupError(
        'UNSAFE_PATH',
        `Unable to safely read ${relativePath}`,
        relativePath,
      )
    }
    if (opened.size > maximumBytes) {
      throw new AiEvalSetupError(
        tooLargeCode,
        `${relativePath} exceeds the supported size limit`,
        relativePath,
      )
    }
    return handle.readFile('utf8')
  } finally {
    await handle.close()
  }
}
```

For each case, call:

```ts
const actual = queryRankedSearchIndex(index, item.query, {
  ...(item.lang === undefined ? {} : { lang: item.lang }),
})
  .slice(0, topK)
  .map((result, resultIndex) => ({
    rank: resultIndex + 1,
    route: result.route,
    title: result.title,
    score: result.score,
    ...(result.heading === undefined ? {} : { heading: result.heading }),
    ...(result.lang === undefined ? {} : { lang: result.lang }),
  }))

const expectedRoute = normalizeSiteRoute(item.expected.route)
const expectedHeading = item.expected.heading
  ?.replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase('en-US')
const ok = actual.some(
  (result) =>
    normalizeSiteRoute(result.route) === expectedRoute &&
    (expectedHeading === undefined ||
      result.heading
        ?.replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase('en-US') === expectedHeading),
)
```

The human formatter prints the pass summary first. Each failed case prints query, expected route/heading, every actual rank/route/heading/lang/score, and this fixed remediation:

```text
Improve the relevant title, description, heading, or page text, or correct the authored expectation.
```

Use `Silen AI eval: <passed>/<total> passed` for a successful first line and append ` (<failed> failed)` when failures exist.

The structured setup-error document is:

```ts
const document = {
  schemaVersion: 1 as const,
  ok: false as const,
  error: {
    code: error.code,
    message: error.message,
    ...(error.relativePath === undefined
      ? {}
      : { path: error.relativePath }),
    ...(error.field === undefined ? {} : { field: error.field }),
  },
}
```

Both report and setup-error JSON serialization use `JSON.stringify(value, null, 2)` plus one trailing newline.

- [ ] **Step 5: Run evaluator, search, type, and lint checks**

Run:

```bash
corepack pnpm test tests/ai/eval.test.ts tests/theme/search.test.ts
corepack pnpm typecheck
corepack pnpm lint
```

Expected: all commands PASS.

- [ ] **Step 6: Commit the model-free evaluator**

```bash
git add src/ai/routes.ts src/ai/eval.ts tests/ai/eval.test.ts docs/superpowers/plans/2026-07-22-silen-model-free-ai-quality-loop.md
git commit -m "feat(ai): add model-free retrieval evaluation"
```

### Task 3: Make audit base-aware and cache state non-blocking

**Files:**

- Create: `tests/ai/audit.test.ts`
- Modify: `src/ai/audit.ts:5-47`
- Modify: `src/ai/audit.ts:291-329`
- Modify: `src/ai/audit.ts:423-473`
- Modify: `src/ai/workspace.ts:18-130`
- Modify: `src/ai/workspace.ts:1198-1241`
- Modify: `src/ai/workspace.ts:1400-1410`
- Modify: `src/ai/index.ts:18-34`
- Modify: `tests/ai/workspace.test.ts:27-78`
- Modify: `tests/ai/mcp-read.test.ts:96-109`

**Interfaces:**

- Consumes: `routeUnderBase` from Task 2 and the built site Agent Contract manifest.
- Produces: `WorkspaceAuditNotice`, `WorkspaceAuditResult.notices`, `WorkspaceBuildResult.notices`, `WorkspaceOptions.resolveAuditBase`, and `readBuiltSiteBase`.
- Preserves: `issues` as the only collection controlling `ok`.

- [ ] **Step 1: Add failing pure audit tests**

Create `tests/ai/audit.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { auditDocuments, type WorkspaceDocument } from '../../src/ai/audit'

const artifacts = new Set(['llms.txt', 'llms-full.txt', 'ai-index.json'])

function documents(target: string): WorkspaceDocument[] {
  return [
    {
      id: 'index.mdx',
      path: 'index.mdx',
      route: '/',
      title: 'Home',
      text: `# Home\n\n[Guide](${target})\n`,
    },
    {
      id: 'guide/index.mdx',
      path: 'guide/index.mdx',
      route: '/guide',
      title: 'Guide',
      text: '# Guide\n',
    },
  ]
}

describe('base-aware AI audit', () => {
  it('strips one exact deployment base from root-relative links', () => {
    const result = auditDocuments(documents('/silen/guide/'), {
      artifacts,
      base: '/silen/',
      indexFresh: false,
    })
    expect(result).toMatchObject({ ok: true, issues: [] })
    expect(result.notices).toEqual([
      expect.objectContaining({ code: 'index-cache' }),
    ])
  })

  it('does not strip a lookalike prefix', () => {
    const result = auditDocuments(documents('/silen-other/guide/'), {
      artifacts,
      base: '/silen/',
      indexFresh: true,
    })
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'broken-link' }),
    ])
  })

  it('keeps root-base and relative-link behavior', () => {
    expect(
      auditDocuments(documents('/guide/'), {
        artifacts,
        base: '/',
        indexFresh: true,
      }).issues,
    ).toEqual([])
    expect(
      auditDocuments(documents('guide/'), {
        artifacts,
        base: '/silen/',
        indexFresh: true,
      }).issues,
    ).toEqual([])
  })

  it('reports unknown base and stale cache only as notices', () => {
    const result = auditDocuments(documents('/guide/'), {
      artifacts,
      indexFresh: false,
    })
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.notices.map(({ code }) => code)).toEqual([
      'base-unknown',
      'index-cache',
    ])
  })
})
```

- [ ] **Step 2: Run the pure audit test and verify the missing notice contract**

Run:

```bash
corepack pnpm test tests/ai/audit.test.ts
```

Expected: FAIL because audit has no `base` option or `notices` collection.

- [ ] **Step 3: Add finding severity and exact base routing**

In `src/ai/audit.ts` add:

```ts
export interface WorkspaceAuditNotice {
  code: 'base-unknown' | 'index-cache'
  path: string
  message: string
}

export interface WorkspaceAuditResult {
  ok: boolean
  filesChecked: number
  issues: WorkspaceAuditIssue[]
  notices: WorkspaceAuditNotice[]
}
```

Pass `base` into `targetRoute` and normalize root-relative targets through `routeUnderBase`. Relative targets continue through `routeForFile` and `normalizeSiteRoute`.

Build notices separately:

```ts
const notices: WorkspaceAuditNotice[] = []
if (options.base === undefined) {
  notices.push({
    code: 'base-unknown',
    path: '.silen/dist/.well-known/silen/manifest.json',
    message:
      'The deployment base could not be verified; root-relative links were checked against /',
  })
}
if (!options.indexFresh) {
  notices.push({
    code: 'index-cache',
    path: '.silen/ai/index.json',
    message:
      'The optional workspace index cache is missing or stale; run silen ai index to refresh it while in-memory search remains available',
  })
}
return {
  ok: issues.length === 0,
  filesChecked: documents.length,
  issues,
  notices,
}
```

- [ ] **Step 4: Add built-manifest base discovery and lazy fallback**

Add `readBuiltSiteBase(input)` to `src/ai/audit.ts`:

```ts
export async function readBuiltSiteBase(
  input: AgentContractAuditInput,
): Promise<string | undefined> {
  const manifestSource = await input.read(manifestPath)
  if (manifestSource === undefined) return undefined
  try {
    const manifest = parseContractManifest(JSON.parse(manifestSource))
    return manifest.kind === 'silen-site' ? manifest.site.base : undefined
  } catch {
    return undefined
  }
}
```

In `src/ai/workspace.ts` add:

```ts
export interface WorkspaceOptions {
  readonly resolveAuditBase?: () => Promise<string>
}

export interface WorkspaceBuildResult {
  outDir: '.silen/dist'
  routes: Array<{ path: string; file: string }>
  ok: boolean
  issues: WorkspaceAuditIssue[]
  notices: WorkspaceAuditNotice[]
}

export async function createWorkspace(
  root: string,
  options: WorkspaceOptions = {},
): Promise<Workspace> {
```

Inside `inspectWorkspace`:

```ts
const auditInput = {
  ...(llmsTxt === undefined ? {} : { llmsTxt }),
  read(relativeOutputPath: string) {
    return readOptionalFile(relativeOutputPath, MAX_FILE_BYTES)
  },
}
const [contractIssues, builtBase] = await Promise.all([
  auditAgentContract(auditInput),
  readBuiltSiteBase(auditInput),
])
const base = builtBase ?? (await options.resolveAuditBase?.())
return auditDocuments(documents, {
  artifacts,
  indexFresh,
  contractIssues,
  ...(base === undefined ? {} : { base }),
})
```

Return `notices` from `workspace.build()` and export `WorkspaceOptions` plus `WorkspaceAuditNotice` through `src/ai/index.ts`.

- [ ] **Step 5: Extend workspace and MCP safety tests**

In `tests/ai/workspace.test.ts`:

- Assert an existing built `/handbook/` manifest prevents invocation of a fallback function that throws.
- Assert a missing manifest invokes the fallback exactly once.
- Extend the hostile-config MCP preflight case to assert the marker remains missing and a `base-unknown` notice is returned.
- Assert missing cache state is a notice and not an `index` issue.

In `tests/ai/mcp-read.test.ts` add:

```ts
expect(Array.isArray(builtResult.notices)).toBe(true)
expect(
  (builtResult.notices as Array<{ code?: string }>).some(
    ({ code }) => code === 'index-cache',
  ),
).toBe(true)
```

- [ ] **Step 6: Run audit, workspace, MCP, scenario, and type checks**

Run:

```bash
corepack pnpm test tests/ai/audit.test.ts tests/ai/workspace.test.ts tests/ai/mcp-read.test.ts tests/ai/agent-scenarios.test.ts tests/ai/workspace-write.test.ts
corepack pnpm typecheck
```

Expected: all commands PASS; stale cache expectations now use `notices`.

- [ ] **Step 7: Commit audit correctness**

```bash
git add src/ai/audit.ts src/ai/workspace.ts src/ai/index.ts tests/ai/audit.test.ts tests/ai/workspace.test.ts tests/ai/mcp-read.test.ts tests/ai/agent-scenarios.test.ts tests/ai/workspace-write.test.ts docs/superpowers/plans/2026-07-22-silen-model-free-ai-quality-loop.md
git commit -m "fix(ai): make workspace audit base-aware"
```

### Task 4: Integrate eval into the CLI with stable output and exit codes

**Files:**

- Modify: `src/node/commands.ts:1-310`
- Modify: `tests/cli.test.ts:1-150`
- Modify: `tests/ai/cli-contract.test.ts:1-92`

**Interfaces:**

- Consumes: `runAiEvaluation` and report/error serializers from Task 2; `WorkspaceOptions.resolveAuditBase` from Task 3; `resolveConfig(root, 'build')` for trusted fallback.
- Produces: `silen ai eval [root]`, `--json`, and stable `0`/`1`/`2` routing.
- Preserves: existing `init`, `index`, `audit` output and the grouped AI command's `write` side-effect classification.

- [ ] **Step 1: Add failing CLI contract and subprocess tests**

Update the unknown-action assertion:

```ts
expect(result.all).toContain(
  'Unknown AI command "unknown"; expected init, index, audit, or eval',
)
```

Assert the AI descriptor contains:

```ts
expect(commandDescriptors.find(({ id }) => id === 'ai')).toMatchObject({
  description: 'Initialize, index, audit, or evaluate the local AI workspace',
  options: [
    {
      name: '--json',
      required: false,
      default: false,
    },
  ],
})
```

In `tests/cli.test.ts`, after building the fixture, write a passing suite and test:

```ts
await writeFile(
  path.join(site, '.silen/ai-evals.json'),
  JSON.stringify({
    schemaVersion: 1,
    cases: [
      {
        id: 'built-page',
        query: 'Built by the packed CLI',
        expected: { route: '/' },
      },
    ],
  }),
)

const passed = await execa(cliRunner, [cli, 'ai', 'eval', site], {
  reject: false,
  all: true,
})
expect(passed.exitCode, passed.all).toBe(0)
expect(passed.stdout).toContain('1/1 passed')

const json = await execa(
  cliRunner,
  [cli, 'ai', 'eval', site, '--json'],
  { reject: false, all: true },
)
expect(json.exitCode, json.all).toBe(0)
expect(JSON.parse(json.stdout)).toMatchObject({
  schemaVersion: 1,
  ok: true,
  summary: { total: 1, passed: 1, failed: 0 },
})
```

Add separate subprocess assertions:

- Wrong expected route returns `1` and prints actual Top K.
- Missing suite returns `2` and names `.silen/ai-evals.json`.
- Missing built index returns `2` and prints `silen build <root>`.
- `--json` setup failure parses as one JSON error document.

- [ ] **Step 2: Run CLI tests and verify eval is rejected**

Run:

```bash
corepack pnpm test tests/cli.test.ts tests/ai/cli-contract.test.ts
```

Expected: FAIL because `eval` is not an accepted AI action and `--json` is absent.

- [ ] **Step 3: Wire evaluator dependencies and trusted audit fallback**

In `src/node/commands.ts` import evaluator functions and `resolveConfig`. Extend dependencies:

```ts
interface CommandDependencies {
  buildSite(root: string): Promise<BuildResult>
  createDevServer: ServerFactory
  createPreviewServer: ServerFactory
  createWorkspace: typeof createWorkspace
  initializeSite: typeof initializeSite
  resolveConfig: typeof resolveConfig
  runAiEvaluation: typeof runAiEvaluation
  serveMcp: typeof serveMcp
  output(message: string): void
  setExitCode(code: number): void
  waitForSignal(server: SilenServer): Promise<void>
}
```

Parse the option without accepting non-boolean values:

```ts
function commandAiOptions(value: unknown): { json: boolean } {
  if (value === undefined) return { json: false }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Silen AI options are invalid')
  }
  const json = (value as Record<string, unknown>).json
  if (json !== undefined && typeof json !== 'boolean') {
    throw new TypeError('Silen AI --json option is invalid')
  }
  return { json: json === true }
}
```

Update the AI action handler:

```ts
async execute(action: unknown, root: unknown, rawOptions: unknown) {
  if (
    action !== 'init' &&
    action !== 'index' &&
    action !== 'audit' &&
    action !== 'eval'
  ) {
    throw new Error(
      'Unknown AI command ' +
        JSON.stringify(action) +
        '; expected init, index, audit, or eval',
    )
  }
  const resolvedRoot = commandRoot(root)
  const options = commandAiOptions(rawOptions)
  if (action === 'eval') {
    try {
      const result = await dependencies.runAiEvaluation(resolvedRoot)
      dependencies.output(
        options.json
          ? serializeAiEvalReport(result).trimEnd()
          : formatAiEvalReport(result),
      )
      if (!result.ok) dependencies.setExitCode(1)
    } catch (error) {
      if (!(error instanceof AiEvalSetupError)) throw error
      dependencies.output(
        options.json
          ? serializeAiEvalSetupError(error).trimEnd()
          : error.message,
      )
      dependencies.setExitCode(2)
    }
    return
  }

  const workspace = await dependencies.createWorkspace(
    resolvedRoot,
    action === 'audit'
      ? {
          resolveAuditBase: async () =>
            (await dependencies.resolveConfig(resolvedRoot, 'build')).base,
        }
      : undefined,
  )
  if (action === 'init') {
    await workspace.init()
    dependencies.output('Initialized ' + workspace.relativeRoot)
    return
  }
  if (action === 'index') {
    dependencies.output(JSON.stringify(await workspace.reindex()))
    return
  }
  const result = await workspace.audit()
  dependencies.output(JSON.stringify(result, null, 2))
  if (!result.ok) dependencies.setExitCode(1)
}
```

Register:

```ts
options: [
  {
    name: '--json',
    description: 'Print the AI evaluation as JSON',
    required: false,
    default: false,
  },
],
```

The evaluator branch runs before `createWorkspace` so `ai eval` never receives the config fallback and never executes project code.

- [ ] **Step 4: Run CLI, contract, workspace, and package build checks**

Run:

```bash
corepack pnpm test tests/cli.test.ts tests/ai/cli-contract.test.ts tests/ai/workspace.test.ts
corepack pnpm typecheck
corepack pnpm build
```

Expected: all commands PASS, and generated `dist/agent/api.json` includes the updated AI command description and `--json` option.

- [ ] **Step 5: Commit CLI integration**

```bash
git add src/node/commands.ts tests/cli.test.ts tests/ai/cli-contract.test.ts dist/agent/api.json docs/superpowers/plans/2026-07-22-silen-model-free-ai-quality-loop.md
git commit -m "feat(cli): add deterministic AI eval command"
```

### Task 5: Dogfood the bilingual no-model quality loop

**Files:**

- Create: `website/.silen/ai-evals.json`
- Modify: `website/ai/index.mdx`
- Modify: `website/zh/ai/index.mdx`
- Modify: `website/ai/local-workspace-mcp/index.mdx`
- Modify: `website/zh/ai/local-workspace-mcp/index.mdx`
- Modify: `website/guide/cli-deployment/index.mdx`
- Modify: `website/zh/guide/cli-deployment/index.mdx`
- Modify: `website/reference/index.mdx`
- Modify: `website/zh/reference/index.mdx`
- Modify: `src/ai/contract/content/en-US/tasks/audit-site.md`
- Modify: `src/ai/contract/content/zh-CN/tasks/audit-site.md`
- Modify: `tests/ai/documentation.test.ts`
- Modify: `tests/website.test.ts`

**Interfaces:**

- Consumes: the committed schema, CLI, evaluator, and audit behavior from Tasks 2 through 4.
- Produces: a passing four-case bilingual official suite and matching human/Agent documentation.
- Preserves: Ask AI as a separate endpoint-only integration.

- [ ] **Step 1: Add failing documentation and website assertions**

Extend `tests/ai/documentation.test.ts`:

```ts
for (const command of ['ai init', 'ai index', 'ai audit', 'ai eval']) {
  expect(workspace).toContain(command)
}
for (const documentation of [artifacts, workspace]) {
  expect(documentation).toMatch(/without (?:an AI )?model|no model/i)
}
expect(workspace).toContain('.silen/ai-evals.json')
expect(workspace).toContain('search-index.json')
expect(workspace).toMatch(/optional.*\.silen\/ai\/index\.json/is)
```

Extend `tests/website.test.ts` to load the committed suite and call the evaluator after the existing build:

```ts
it('dogfoods the deterministic bilingual AI evaluation suite', async () => {
  const suite = JSON.parse(
    await readFile(path.resolve('website/.silen/ai-evals.json'), 'utf8'),
  ) as { cases: Array<{ lang?: string }> }
  expect(suite.cases.filter(({ lang }) => lang === 'en-US')).toHaveLength(2)
  expect(suite.cases.filter(({ lang }) => lang === 'zh-CN')).toHaveLength(2)
  await expect(runAiEvaluation(path.resolve('website'))).resolves.toMatchObject(
    {
      ok: true,
      summary: { total: 4, passed: 4, failed: 0 },
    },
  )
})
```

- [ ] **Step 2: Run docs and website tests and verify missing content**

Run:

```bash
corepack pnpm test tests/ai/documentation.test.ts tests/website.test.ts
```

Expected: FAIL because the suite and `ai eval` documentation do not exist.

- [ ] **Step 3: Add the official bilingual suite**

Create `website/.silen/ai-evals.json`:

```json
{
  "schemaVersion": 1,
  "topK": 5,
  "cases": [
    {
      "id": "en-public-ai-artifacts",
      "query": "Public AI artifacts",
      "lang": "en-US",
      "expected": {
        "route": "/ai/",
        "heading": "Public AI artifacts"
      }
    },
    {
      "id": "en-model-free-workspace",
      "query": "deterministic model-free workspace",
      "lang": "en-US",
      "expected": {
        "route": "/ai/local-workspace-mcp/"
      }
    },
    {
      "id": "zh-public-ai-artifacts",
      "query": "面向 AI 的公开产物",
      "lang": "zh-CN",
      "expected": {
        "route": "/zh/ai/",
        "heading": "面向 AI 的公开产物"
      }
    },
    {
      "id": "zh-model-free-workspace",
      "query": "确定性 无模型 工作区",
      "lang": "zh-CN",
      "expected": {
        "route": "/zh/ai/local-workspace-mcp/"
      }
    }
  ]
}
```

- [ ] **Step 4: Update bilingual human and Agent documentation**

Document this exact workflow in both languages:

```sh
pnpm silen build docs
pnpm silen ai audit docs
pnpm silen ai eval docs
```

State explicitly:

- No model, API key, endpoint, embeddings service, or network is required.
- `ai eval` reads `.silen/ai-evals.json` and `.silen/dist/search-index.json`.
- `.silen/ai/index.json` is an optional workspace snapshot; missing or stale state is a notice, while MCP search remains in memory.
- `0`/`1`/`2` mean pass/retrieval failure/setup failure.
- `--json` is the CI output mode.
- Ask AI still requires an explicitly configured endpoint and remains absent otherwise.

Change both reference tables to `silen ai <init|index|audit|eval> [root]`.

Update both `audit-site.md` task packs so the ordered read-only sequence is build, audit, then eval when `.silen/ai-evals.json` exists. Replace “stale indexes” with separate “production index” and “optional workspace-cache notice” language.

- [ ] **Step 5: Build and tune only authored queries if ranking evidence requires it**

Run:

```bash
corepack pnpm site:build
node dist/node/cli.js ai audit website
node dist/node/cli.js ai eval website
```

Expected:

- Build reports 32 routes.
- Audit JSON has `"ok": true`, no `broken-link` issues, and may contain an `index-cache` notice.
- Eval reports `4/4 passed`.

If a case fails, use the printed actual Top K evidence to change only that case's query or expected optional heading. Do not tune MiniSearch, add score thresholds, or weaken `topK` beyond 5.

- [ ] **Step 6: Run documentation, website, contract, and formatting tests**

Run:

```bash
corepack pnpm test tests/ai/documentation.test.ts tests/website.test.ts tests/ai/task-contract.test.ts tests/ai/framework-contract.test.ts
corepack pnpm format:check
```

Expected: all commands PASS.

- [ ] **Step 7: Rebuild generated Agent Contract and commit dogfooding**

```bash
corepack pnpm build
git add website/.silen/ai-evals.json website/ai/index.mdx website/zh/ai/index.mdx website/ai/local-workspace-mcp/index.mdx website/zh/ai/local-workspace-mcp/index.mdx website/guide/cli-deployment/index.mdx website/zh/guide/cli-deployment/index.mdx website/reference/index.mdx website/zh/reference/index.mdx src/ai/contract/content/en-US/tasks/audit-site.md src/ai/contract/content/zh-CN/tasks/audit-site.md tests/ai/documentation.test.ts tests/website.test.ts dist/agent docs/superpowers/plans/2026-07-22-silen-model-free-ai-quality-loop.md
git commit -m "docs(ai): dogfood model-free quality gates"
```

### Task 6: Close the no-model and determinism release gate

**Files:**

- Modify only when verification identifies an in-scope defect in files already named by Tasks 1 through 5.
- Update: `docs/superpowers/plans/2026-07-22-silen-model-free-ai-quality-loop.md` checkboxes.

**Interfaces:**

- Consumes: all behavior and documentation from Tasks 1 through 5.
- Produces: full repository proof, byte-stable evaluation output, clean Git state, and a final implementation commit when verification required a scoped correction.

- [ ] **Step 1: Run focused feature gates**

```bash
corepack pnpm test tests/theme/search.test.ts tests/ai/eval.test.ts tests/ai/audit.test.ts tests/ai/workspace.test.ts tests/ai/mcp-read.test.ts tests/ai/agent-scenarios.test.ts tests/cli.test.ts tests/ai/cli-contract.test.ts tests/ai/documentation.test.ts tests/website.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run static and full repository gates**

```bash
corepack pnpm format:check
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm exec publint
corepack pnpm pack --dry-run
```

Expected: every command exits `0`.

- [ ] **Step 3: Prove official site build, audit, and evaluation**

```bash
corepack pnpm site:build
node dist/node/cli.js ai audit website
node dist/node/cli.js ai eval website
node dist/node/cli.js ai eval website --json
```

Expected:

- Audit `ok` is true and contains no deployment-prefix broken-link issues.
- Human evaluation reports `4/4 passed`.
- JSON evaluation reports `"ok": true` and `"failed": 0`.

- [ ] **Step 4: Prove byte-identical evaluator output without model credentials**

```bash
diff \
  <(env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u GOOGLE_API_KEY node dist/node/cli.js ai eval website --json) \
  <(env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u GOOGLE_API_KEY node dist/node/cli.js ai eval website --json)
```

Expected: `diff` exits `0` with no output.

- [ ] **Step 5: Verify read-only behavior and intended Git state**

```bash
git status --short --branch
git diff --check
git log --oneline --decorate -8
```

Expected: no unstaged or untracked files; `main` is ahead of `origin/main` only by the approved design, translation, plan, and implementation commits.

- [ ] **Step 6: Commit a scoped verification correction only when needed**

When Step 1 through Step 5 required a correction, stage only affected files already listed in this plan and run:

```bash
git commit -m "test(ai): close model-free quality gate"
```

When no correction was required, leave the history without an empty commit.
