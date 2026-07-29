# Silen Retrieval Rank Expectations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit version 2 per-case rank expectations while preserving
version 1 evaluation behavior and enforcing a six-case bilingual official
suite through `pnpm site:check`.

**Architecture:** `src/ai/eval.ts` parses a strict discriminated union of suite
versions and constructs a matching versioned report. Version 1 keeps its exact
Top-K behavior and JSON shape; version 2 records the first complete
route-and-heading match, compares it with an effective `maxRank`, and retains
the full diagnostic Top K. The official suite and bilingual documentation then
dogfood the version 2 contract without changing search ranking or workflows.

**Tech Stack:** TypeScript 7.0.2, Zod 4.4.3, MiniSearch 7.2.0, Vitest 4.1.10,
pnpm 10.34.0, Node.js `^20.19.0 || >=22.12.0`, MDX, and Prettier 3.9.5.

## Global Constraints

- New Silen versions must accept suite schema versions 1 and 2.
- Version 1 validation, pass criteria, human output, JSON keys, field order,
  and exit behavior must remain unchanged for the same input.
- Version 2 adds only optional `expected.maxRank`; its effective value is the
  authored integer or the suite `topK` when omitted.
- Version 2 requires `1 <= maxRank <= topK <= 20` and reports invalid rank
  policy as `SUITE_SCHEMA` at `cases.<index>.expected.maxRank` with exit 2.
- Version 2 passes only when the first complete route-and-optional-heading
  match has `matchedRank <= maxRank`.
- Version 2 JSON uses `schemaVersion: 2` and always emits effective `maxRank`,
  `matchedRank: number | null`, and the complete bounded `actual` list.
- Setup-error JSON remains schema version 1; CLI exits remain 0, 1, and 2.
- Do not change MiniSearch indexing, scoring, tokenization, tie-breaking,
  public search results, CLI arguments, provider boundaries, or file safety.
- The official suite uses schema version 2, `topK: 5`, six cases, and explicit
  maximum ranks 1, 2, 1 for the English surfaces and 1, 2, 1 for Chinese.
- Do not add dependencies, change `pnpm-lock.yaml`, bump the package version,
  edit the changelog, publish, deploy, push, or begin another map item.
- Move `AI-004` to `Shipped` only after focused, full, package, and
  provider-credential-free site gates all pass.

---

## File map

- Modify `src/ai/eval.ts`: strict v1/v2 suite parsing, versioned result types,
  rank matching, report construction, and human diagnostics.
- Modify `tests/ai/eval.test.ts`: v1 golden compatibility, v2 rank boundaries,
  validation paths, deterministic evidence, and human output.
- Modify `tests/cli.test.ts`: built CLI version 2 report and exit behavior.
- Modify `website/.silen/ai-evals.json`: official six-case version 2 suite.
- Modify `tests/website.test.ts`: bilingual route coverage and explicit rank
  policy contract.
- Modify `tests/ai/documentation.test.ts`: bilingual version 2 terminology.
- Modify `website/ai/index.mdx` and `website/zh/ai/index.mdx`: concise migration
  and report guidance.
- Modify `website/ai/local-workspace-mcp/index.mdx` and its Chinese mirror:
  diagnostic Top K versus passing rank.
- Modify `website/guide/cli-deployment/index.mdx` and its Chinese mirror: CI
  authoring behavior.
- Modify `website/reference/index.mdx` and its Chinese mirror: compact schema
  reference.
- Modify `docs/project-map.md`: final `AI-004` evidence and no-eligible-ready
  state.
- Reference
  `docs/superpowers/specs/2026-07-29-silen-retrieval-rank-expectations-design.md`:
  approved compatibility and delivery contract.

### Task 1: Implement versioned evaluator contracts with TDD

**Files:**

- Modify: `tests/ai/eval.test.ts`
- Modify: `src/ai/eval.ts`

**Interfaces:**

- Consumes: existing `queryRankedSearchIndex`, route normalization, bounded
  file reads, and version 1 suite/report behavior.
- Produces: `AiEvalReportV1`, `AiEvalReportV2`, `AiEvalReport`, strict v1/v2
  suite parsing, effective `maxRank`, and deterministic `matchedRank`.

- [ ] **Step 1: Add a deterministic two-rank search fixture**

Add this helper immediately after `writeIndex` in
`tests/ai/eval.test.ts`:

```ts
async function writeRankedIndex(site: string): Promise<void> {
  await mkdir(path.join(site, '.silen/dist'), { recursive: true })
  const index = createSearchIndex([
    {
      id: '/first',
      lang: 'en-US',
      title: 'Shared answer',
      route: '/first/',
      headings: ['Primary'],
      text: 'primary documentation',
    },
    {
      id: '/second',
      lang: 'en-US',
      title: 'Secondary',
      route: '/second/',
      headings: ['Secondary'],
      text: 'shared answer',
    },
  ])
  await writeFile(
    path.join(site, '.silen/dist/search-index.json'),
    serializeSearchIndex(index),
  )
}
```

- [ ] **Step 2: Add the version 1 golden compatibility test**

Add this test before the existing all-misses test:

```ts
it('keeps the version 1 JSON report byte-identical', async () => {
  const site = await temporaryRoot()
  await writeIndex(site)
  await writeSuite(site, {
    schemaVersion: 1,
    topK: 1,
    cases: [
      {
        id: 'public-artifacts',
        query: 'Public AI artifacts',
        lang: 'en-US',
        expected: {
          route: '/ai/',
          heading: 'Public AI artifacts',
        },
      },
    ],
  })

  const report = await runAiEvaluation(site)
  expect(serializeAiEvalReport(report)).toBe(`{
  "schemaVersion": 1,
  "ok": true,
  "suite": ".silen/ai-evals.json",
  "index": ".silen/dist/search-index.json",
  "topK": 1,
  "summary": {
    "total": 1,
    "passed": 1,
    "failed": 0
  },
  "cases": [
    {
      "id": "public-artifacts",
      "ok": true,
      "query": "Public AI artifacts",
      "lang": "en-US",
      "expected": {
        "route": "/ai/",
        "heading": "Public AI artifacts"
      },
      "actual": [
        {
          "rank": 1,
          "route": "/ai/",
          "title": "AI-ready documentation",
          "score": 25.930289,
          "heading": "Public AI artifacts",
          "lang": "en-US"
        }
      ]
    }
  ]
}
`)
})
```

- [ ] **Step 3: Add failing version 2 rank and report tests**

In the existing `rejects invalid suite` table, change the unsupported-version
fixture from `{ schemaVersion: 2, cases: [] }` to
`{ schemaVersion: 3, cases: [] }`, retaining the expected `schemaVersion`
field path. Version 2 is now supported; version 3 continues to prove that
unknown versions remain invalid.

Add these tests after the version 1 golden test:

```ts
it('applies explicit and default version 2 rank bounds', async () => {
  const site = await temporaryRoot()
  await writeRankedIndex(site)
  await writeSuite(site, {
    schemaVersion: 2,
    topK: 2,
    cases: [
      {
        id: 'at-bound',
        query: 'shared answer',
        lang: 'en-US',
        expected: { route: '/second/', maxRank: 2 },
      },
      {
        id: 'below-bound',
        query: 'shared answer',
        lang: 'en-US',
        expected: { route: '/second/', maxRank: 1 },
      },
      {
        id: 'default-bound',
        query: 'shared answer',
        lang: 'en-US',
        expected: { route: '/second/' },
      },
      {
        id: 'missing',
        query: 'shared answer',
        lang: 'en-US',
        expected: { route: '/missing/', maxRank: 1 },
      },
    ],
  })

  const first = await runAiEvaluation(site)
  const second = await runAiEvaluation(site)
  expect(first).toMatchObject({
    schemaVersion: 2,
    ok: false,
    topK: 2,
    summary: { total: 4, passed: 2, failed: 2 },
    cases: [
      {
        id: 'at-bound',
        ok: true,
        expected: { route: '/second/', maxRank: 2 },
        matchedRank: 2,
      },
      {
        id: 'below-bound',
        ok: false,
        expected: { route: '/second/', maxRank: 1 },
        matchedRank: 2,
      },
      {
        id: 'default-bound',
        ok: true,
        expected: { route: '/second/', maxRank: 2 },
        matchedRank: 2,
      },
      {
        id: 'missing',
        ok: false,
        expected: { route: '/missing/', maxRank: 1 },
        matchedRank: null,
      },
    ],
  })
  expect(first.cases.every(({ actual }) => actual.length === 2)).toBe(true)
  expect(serializeAiEvalReport(first)).toBe(serializeAiEvalReport(second))

  const human = formatAiEvalReport(first)
  expect(human).toContain('Matched at rank 2; required rank 1 or better.')
  expect(human).toContain(
    'No complete match in Top 2; required rank 1 or better.',
  )
})

it.each([
  [0, 2],
  [21, 20],
  [1.5, 2],
  [3, 2],
])(
  'rejects version 2 maxRank %s with topK %s',
  async (maxRank, topK) => {
    const site = await temporaryRoot()
    await writeRankedIndex(site)
    await writeSuite(site, {
      schemaVersion: 2,
      topK,
      cases: [
        {
          id: 'invalid-rank',
          query: 'shared answer',
          expected: { route: '/second/', maxRank },
        },
      ],
    })
    await expect(runAiEvaluation(site)).rejects.toMatchObject({
      code: 'SUITE_SCHEMA',
      field: 'cases.0.expected.maxRank',
    })
  },
)

it('keeps maxRank invalid in a strict version 1 suite', async () => {
  const site = await temporaryRoot()
  await writeRankedIndex(site)
  await writeSuite(site, {
    schemaVersion: 1,
    topK: 2,
    cases: [
      {
        id: 'v1-extra-field',
        query: 'shared answer',
        expected: { route: '/second/', maxRank: 1 },
      },
    ],
  })
  await expect(runAiEvaluation(site)).rejects.toMatchObject({
    code: 'SUITE_SCHEMA',
    field: 'cases.0.expected',
  })
})
```

- [ ] **Step 4: Run the focused evaluator test and verify red**

Run:

```sh
pnpm test tests/ai/eval.test.ts
```

Expected: the version 1 tests pass, while version 2 cases fail with
`SUITE_SCHEMA` because only schema version 1 is accepted.

- [ ] **Step 5: Replace the result types with explicit versioned types**

In `src/ai/eval.ts`, retain `AiEvalActualResult` and replace the current
`AiEvalCaseResult` and `AiEvalReport` declarations with:

```ts
export interface AiEvalExpectedV1 {
  readonly route: string
  readonly heading?: string
}

export interface AiEvalExpectedV2 extends AiEvalExpectedV1 {
  readonly maxRank: number
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

export type AiEvalCaseResult = AiEvalCaseResultV1 | AiEvalCaseResultV2

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

export type AiEvalReport = AiEvalReportV1 | AiEvalReportV2
```

- [ ] **Step 6: Replace the single suite schema with a strict discriminated union**

Replace `expectedSchema`, `caseSchema`, and `suiteSchema` with:

```ts
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

const suiteSchema = z
  .discriminatedUnion('schemaVersion', [suiteV1Schema, suiteV2Schema])
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

      if (
        suite.schemaVersion === 2 &&
        item.expected.maxRank !== undefined &&
        item.expected.maxRank > suite.topK
      ) {
        context.addIssue({
          code: 'custom',
          path: ['cases', index, 'expected', 'maxRank'],
          message: 'maxRank must be less than or equal to topK',
        })
      }
    }
  })
```

Keep `type AiEvalSuite = z.output<typeof suiteSchema>` unchanged.

- [ ] **Step 7: Split querying, matching, and versioned case construction**

Replace `evaluateCase` with these helpers:

```ts
type EvaluationCaseInput = {
  readonly query: string
  readonly lang?: string
  readonly expected: AiEvalExpectedV1
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
  expected: AiEvalExpectedV1,
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
```

- [ ] **Step 8: Construct reports without changing version 1 key order**

Replace the case construction and return block inside `runAiEvaluation` with:

```ts
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
```

- [ ] **Step 9: Add version 2 human rank diagnostics**

Add this helper after `actualLabel`:

```ts
function rankFailureLabel(
  result: AiEvalCaseResult,
  topK: number,
): string | undefined {
  if (!('matchedRank' in result)) return undefined
  return result.matchedRank === null
    ? `No complete match in Top ${topK}; required rank ${result.expected.maxRank} or better.`
    : `Matched at rank ${result.matchedRank}; required rank ${result.expected.maxRank} or better.`
}
```

Inside the failed-case loop in `formatAiEvalReport`, compute
`const rankFailure = rankFailureLabel(result, report.topK)` and replace the
current `lines.push` call with:

```ts
lines.push(
  '',
  `FAIL ${result.id}`,
  `  Query: ${result.query}`,
  `  Expected: ${expectedLabel(result)}`,
  ...(rankFailure === undefined ? [] : [`  Rank: ${rankFailure}`]),
  '  Actual:',
)
```

- [ ] **Step 10: Run focused checks and commit the evaluator**

Run:

```sh
pnpm test tests/ai/eval.test.ts tests/ai/site-quality-gate.test.ts
pnpm exec prettier --check src/ai/eval.ts tests/ai/eval.test.ts
pnpm lint
pnpm typecheck
git diff --check
git add src/ai/eval.ts tests/ai/eval.test.ts
git commit -m "feat(ai): add retrieval rank expectations"
```

Expected: all focused tests, formatting, lint, types, and diff checks pass; the
commit contains only evaluator implementation and focused unit coverage.

### Task 2: Dogfood the six-case version 2 official suite

**Files:**

- Modify: `tests/cli.test.ts`
- Modify: `tests/website.test.ts`
- Modify: `website/.silen/ai-evals.json`

**Interfaces:**

- Consumes: version 2 evaluator/report support from Task 1 and the built
  production search index.
- Produces: stable CLI version 2 evidence and an official bilingual suite with
  explicit route coverage and ranks.

- [ ] **Step 1: Add CLI coverage for a version 2 retrieval failure**

In the existing `uses stable AI eval failure and setup exit codes` test, after
the current version 1 human failure assertions, add:

```ts
await writeFile(
  path.join(site, '.silen/ai-evals.json'),
  JSON.stringify({
    schemaVersion: 2,
    topK: 1,
    cases: [
      {
        id: 'ranked-miss',
        query: 'Built by the packed CLI',
        expected: { route: '/missing/', maxRank: 1 },
      },
    ],
  }),
)
const ranked = await execa(
  cliRunner,
  [cli, 'ai', 'eval', site, '--json'],
  { reject: false, all: true },
)
expect(ranked.exitCode, ranked.all).toBe(1)
expect(JSON.parse(ranked.stdout)).toMatchObject({
  schemaVersion: 2,
  ok: false,
  cases: [
    {
      id: 'ranked-miss',
      expected: { route: '/missing/', maxRank: 1 },
      matchedRank: null,
    },
  ],
})
```

- [ ] **Step 2: Strengthen the official-suite website contract test**

Replace the current `dogfoods the deterministic bilingual AI evaluation
suite` body in `tests/website.test.ts` with:

```ts
const suite = JSON.parse(
  await readFile(path.resolve('website/.silen/ai-evals.json'), 'utf8'),
) as {
  schemaVersion: number
  topK: number
  cases: Array<{
    id: string
    lang?: string
    expected: { route: string; maxRank?: number }
  }>
}
expect(suite.schemaVersion).toBe(2)
expect(suite.topK).toBe(5)
expect(suite.cases.filter(({ lang }) => lang === 'en-US')).toHaveLength(3)
expect(suite.cases.filter(({ lang }) => lang === 'zh-CN')).toHaveLength(3)
expect(suite.cases.every(({ expected }) => expected.maxRank !== undefined)).toBe(
  true,
)
expect(
  suite.cases.map(({ id, expected }) => ({
    id,
    route: expected.route,
    maxRank: expected.maxRank,
  })),
).toEqual([
  { id: 'en-public-ai-artifacts', route: '/ai/', maxRank: 1 },
  {
    id: 'en-model-free-workspace',
    route: '/ai/local-workspace-mcp/',
    maxRank: 2,
  },
  {
    id: 'en-agent-contract',
    route: '/ai/agent-contract/',
    maxRank: 1,
  },
  { id: 'zh-public-ai-artifacts', route: '/zh/ai/', maxRank: 1 },
  {
    id: 'zh-model-free-workspace',
    route: '/zh/ai/local-workspace-mcp/',
    maxRank: 2,
  },
  {
    id: 'zh-agent-contract',
    route: '/zh/ai/agent-contract/',
    maxRank: 1,
  },
])
await expect(runAiEvaluation(path.resolve('website'))).resolves.toMatchObject({
  schemaVersion: 2,
  ok: true,
  summary: { total: 6, passed: 6, failed: 0 },
})
```

- [ ] **Step 3: Run the CLI and website tests and verify red**

Run:

```sh
pnpm test tests/cli.test.ts tests/website.test.ts
```

Expected: CLI version 2 coverage passes after Task 1, while the website test
fails because the committed suite is still schema version 1 with four cases.

- [ ] **Step 4: Replace the official suite with the exact six-case contract**

Replace `website/.silen/ai-evals.json` with:

```json
{
  "schemaVersion": 2,
  "topK": 5,
  "cases": [
    {
      "id": "en-public-ai-artifacts",
      "query": "AI artifacts",
      "lang": "en-US",
      "expected": {
        "route": "/ai/",
        "heading": "Public AI artifacts",
        "maxRank": 1
      }
    },
    {
      "id": "en-model-free-workspace",
      "query": "deterministic model-free workspace",
      "lang": "en-US",
      "expected": {
        "route": "/ai/local-workspace-mcp/",
        "maxRank": 2
      }
    },
    {
      "id": "en-agent-contract",
      "query": "deployed site Agent Contract manifest",
      "lang": "en-US",
      "expected": {
        "route": "/ai/agent-contract/",
        "maxRank": 1
      }
    },
    {
      "id": "zh-public-ai-artifacts",
      "query": "面向 AI 的公开产物",
      "lang": "zh-CN",
      "expected": {
        "route": "/zh/ai/",
        "heading": "面向 AI 的公开产物",
        "maxRank": 1
      }
    },
    {
      "id": "zh-model-free-workspace",
      "query": "确定性 无模型 工作区",
      "lang": "zh-CN",
      "expected": {
        "route": "/zh/ai/local-workspace-mcp/",
        "maxRank": 2
      }
    },
    {
      "id": "zh-agent-contract",
      "query": "部署站点 Agent Contract 清单",
      "lang": "zh-CN",
      "expected": {
        "route": "/zh/ai/agent-contract/",
        "maxRank": 1
      }
    }
  ]
}
```

- [ ] **Step 5: Run focused CLI, website, and real gate checks**

Run:

```sh
pnpm test tests/ai/eval.test.ts tests/cli.test.ts tests/website.test.ts
env \
  -u OPENAI_API_KEY \
  -u ANTHROPIC_API_KEY \
  -u GOOGLE_API_KEY \
  -u AZURE_OPENAI_API_KEY \
  pnpm site:check
```

Expected: focused tests pass; the real gate builds 32 routes, audit reports
`"ok": true`, evaluation reports schema version 2 with six passed and zero
failed cases, and the source-map assertion passes.

- [ ] **Step 6: Format, check, and commit the official suite**

Run:

```sh
pnpm exec prettier --check \
  tests/cli.test.ts \
  tests/website.test.ts \
  website/.silen/ai-evals.json
pnpm lint
pnpm typecheck
git diff --check
git add tests/cli.test.ts tests/website.test.ts website/.silen/ai-evals.json
git commit -m "test(ai): enforce ranked official evaluation"
```

Expected: one commit contains CLI integration coverage, the official suite,
and its bilingual website contract.

### Task 3: Document the version 2 migration and evidence

**Files:**

- Modify: `tests/ai/documentation.test.ts`
- Modify: `website/ai/index.mdx`
- Modify: `website/zh/ai/index.mdx`
- Modify: `website/ai/local-workspace-mcp/index.mdx`
- Modify: `website/zh/ai/local-workspace-mcp/index.mdx`
- Modify: `website/guide/cli-deployment/index.mdx`
- Modify: `website/zh/guide/cli-deployment/index.mdx`
- Modify: `website/reference/index.mdx`
- Modify: `website/zh/reference/index.mdx`

**Interfaces:**

- Consumes: the shipped v1/v2 suite and report names from Tasks 1 and 2.
- Produces: bilingual author guidance that distinguishes diagnostic Top K from
  case-specific passing rank without implying a model-based judge.

- [ ] **Step 1: Add a failing bilingual documentation contract**

Add this test to `tests/ai/documentation.test.ts`:

```ts
it('documents versioned rank expectations in every evaluator guide', async () => {
  const documents = await Promise.all(
    [
      'website/ai/index.mdx',
      'website/zh/ai/index.mdx',
      'website/ai/local-workspace-mcp/index.mdx',
      'website/zh/ai/local-workspace-mcp/index.mdx',
      'website/guide/cli-deployment/index.mdx',
      'website/zh/guide/cli-deployment/index.mdx',
      'website/reference/index.mdx',
      'website/zh/reference/index.mdx',
    ].map((file) => readFile(file, 'utf8')),
  )

  for (const document of documents) {
    expect(document).toContain('.silen/ai-evals.json')
    expect(document).toContain('schemaVersion')
    expect(document).toContain('maxRank')
    expect(document).toContain('topK')
    expect(document).toContain('matchedRank')
  }
})
```

- [ ] **Step 2: Run the documentation test and verify red**

Run:

```sh
pnpm test tests/ai/documentation.test.ts
```

Expected: FAIL because existing pages do not yet describe `schemaVersion`,
`maxRank`, `topK`, and `matchedRank` together.

- [ ] **Step 3: Add the concise English guidance**

In `website/ai/index.mdx`, immediately after the paragraph ending with
`Add --json for stable CI output.`, add:

```md
Existing `"schemaVersion": 1` suites keep their original whole-`topK`
behavior. Version 2 can set `expected.maxRank` per case; it defaults to `topK`
when omitted. Version 2 JSON reports expose the effective `maxRank` and
`matchedRank`, while the complete Top K remains diagnostic evidence.
```

Replace the evaluator paragraph in
`website/ai/local-workspace-mcp/index.mdx` with:

```md
`ai eval` reads `.silen/ai-evals.json` and the production
`.silen/dist/search-index.json`. A `"schemaVersion": 1` suite passes when the
expected route and optional heading appears anywhere within `topK`. Version 2
can add `expected.maxRank` for a stricter per-case bound; it defaults to
`topK`. Its JSON report includes effective `maxRank`, `matchedRank`, and the
complete diagnostic Top K. Exit codes `0`, `1`, and `2` mean pass, retrieval
failure, and setup failure; use `--json` in CI.
```

In `website/guide/cli-deployment/index.mdx`, after the sentence ending with
`It needs no model, API key, endpoint, embeddings service, or network.`, add:

```md
Suite `"schemaVersion": 1` retains whole-`topK` matching. Version 2 supports
case-specific `expected.maxRank`, defaulting to `topK`, and reports
`matchedRank` while preserving the full diagnostic result list.
```

In `website/reference/index.mdx`, insert this section before Troubleshooting:

```md
## AI evaluation suites

`.silen/ai-evals.json` is strict JSON. Suite `"schemaVersion": 1` matches each
expectation anywhere within `topK`. Version 2 adds optional
`expected.maxRank`; it defaults to `topK` and must not exceed it. Version 2
JSON reports include effective `maxRank`, `matchedRank`, and the complete
diagnostic Top K. Evaluation remains read-only and model-free.
```

- [ ] **Step 4: Add the equivalent Chinese guidance**

In `website/zh/ai/index.mdx`, after the paragraph ending with
`CI 使用 --json 获取稳定输出。`, add:

```md
已有 `"schemaVersion": 1` 套件保持原有的完整 `topK` 判定。版本 2 可为每个
案例设置 `expected.maxRank`，省略时默认等于 `topK`。版本 2 JSON 报告输出
生效的 `maxRank` 与 `matchedRank`，同时保留完整 Top K 作为诊断证据。
```

Replace the evaluator paragraph in
`website/zh/ai/local-workspace-mcp/index.mdx` with:

```md
`ai eval` 读取 `.silen/ai-evals.json` 与生产构建的
`.silen/dist/search-index.json`。`"schemaVersion": 1` 套件在 `topK` 内命中
预期路由和可选标题即可通过；版本 2 可增加 `expected.maxRank` 作为更严格的
逐案例边界，省略时默认等于 `topK`。其 JSON 报告包含生效的 `maxRank`、
`matchedRank` 与完整诊断 Top K。退出码 `0`、`1`、`2` 分别表示通过、检索
失败、初始化或配置失败；CI 使用 `--json`。
```

In `website/zh/guide/cli-deployment/index.mdx`, after the sentence ending with
`它不需要模型、API key、端点、向量服务或网络。`, add:

```md
套件 `"schemaVersion": 1` 保持完整 `topK` 匹配；版本 2 支持逐案例
`expected.maxRank`，省略时默认等于 `topK`，并在保留完整诊断结果的同时
报告 `matchedRank`。
```

In `website/zh/reference/index.mdx`, insert this section before 排错:

```md
## AI 评测套件

`.silen/ai-evals.json` 是严格 JSON。套件 `"schemaVersion": 1` 在 `topK`
内匹配每个预期；版本 2 增加可选 `expected.maxRank`，省略时默认等于
`topK`，且不能大于它。版本 2 JSON 报告包含生效的 `maxRank`、
`matchedRank` 与完整诊断 Top K。评测仍然只读且不依赖模型。
```

- [ ] **Step 5: Run documentation, website, and build checks**

Run:

```sh
pnpm test tests/ai/documentation.test.ts tests/website.test.ts
pnpm site:build
pnpm exec prettier --check \
  tests/ai/documentation.test.ts \
  website/ai/index.mdx \
  website/zh/ai/index.mdx \
  website/ai/local-workspace-mcp/index.mdx \
  website/zh/ai/local-workspace-mcp/index.mdx \
  website/guide/cli-deployment/index.mdx \
  website/zh/guide/cli-deployment/index.mdx \
  website/reference/index.mdx \
  website/zh/reference/index.mdx
pnpm lint
pnpm typecheck
git diff --check
```

Expected: documentation and website contracts pass, all 32 routes build, and
static checks report no failure.

- [ ] **Step 6: Commit the bilingual documentation**

Run:

```sh
git add \
  tests/ai/documentation.test.ts \
  website/ai/index.mdx \
  website/zh/ai/index.mdx \
  website/ai/local-workspace-mcp/index.mdx \
  website/zh/ai/local-workspace-mcp/index.mdx \
  website/guide/cli-deployment/index.mdx \
  website/zh/guide/cli-deployment/index.mdx \
  website/reference/index.mdx \
  website/zh/reference/index.mdx
git commit -m "docs(ai): explain ranked evaluation suites"
```

Expected: one documentation commit contains only bilingual evaluator guidance
and its contract test.

### Task 4: Verify and ship AI-004 on the project map

**Files:**

- Modify: `docs/project-map.md`
- Verify: every file changed in Tasks 1 through 3

**Interfaces:**

- Consumes: versioned evaluator, official suite, CLI proof, bilingual docs,
  and complete gate evidence.
- Produces: `AI-004` in `Shipped`, no Active or Ready item, and an explicit
  instruction to refine `AI-005` before promotion.

- [ ] **Step 1: Run the complete repository and official-site gates**

Run:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
env \
  -u OPENAI_API_KEY \
  -u ANTHROPIC_API_KEY \
  -u GOOGLE_API_KEY \
  -u AZURE_OPENAI_API_KEY \
  pnpm site:check
pnpm exec publint
git diff --check
```

Expected:

- Formatting, lint, types, the full Vitest suite, package metadata, and the
  no-source-map assertion pass.
- The real evaluator returns report schema version 2 with six passed and zero
  failed cases.
- No provider credential is needed.

- [ ] **Step 2: Move AI-004 to Shipped and record the next refinement action**

Update `docs/project-map.md` so the top field is:

```md
- Default next item: None; refine `AI-005` before promotion.
```

Replace the Active and Ready bodies with:

```md
## Active

No map-selected item is active. No Ready item is eligible; refine `AI-005`
before promotion.

## Ready

No item is ready for default implementation.
```

Remove the `AI-004` block from Active and append this block after `QUAL-002` in
Shipped:

```md
### AI-004 — Ranked retrieval evaluation expectations

- Outcome: Versioned model-free evaluation can enforce a case-specific maximum
  rank while preserving complete deterministic Top-K evidence.
- Horizon: `0.4.x`.
- Depends on: `AI-003`.
- Entry gate: The shipped four-case version 1 suite and production evaluator
  passed before the compatibility design was approved.
- Done when: New Silen versions preserve v1 reports, accept v2 rank policy,
  the six-case bilingual suite passes its `1/1/2` bounds, and the full
  repository and official-site gates remain green.
- Evidence:
  [rank-expectations design](./superpowers/specs/2026-07-29-silen-retrieval-rank-expectations-design.md),
  [implementation plan](./superpowers/plans/2026-07-29-silen-retrieval-rank-expectations.md),
  [evaluator](../src/ai/eval.ts),
  [focused tests](../tests/ai/eval.test.ts), and
  [official suite](../website/.silen/ai-evals.json).
```

- [ ] **Step 3: Verify final project-map structure and evidence links**

Run:

```sh
node --input-type=module <<'NODE'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const file = 'docs/project-map.md'
const map = await readFile(file, 'utf8')
const active = map.slice(map.indexOf('## Active'), map.indexOf('## Ready'))
const ready = map.slice(map.indexOf('## Ready'), map.indexOf('## Candidate'))
const shipped = map.slice(
  map.indexOf('## Shipped'),
  map.indexOf('## Default execution contract'),
)
const ids = [
  ...map.matchAll(/^### ((?:CORE|THEME|AI|PLUGIN|QUAL)-[0-9]{3}) —/gm),
].map((match) => match[1])

if (ids.length !== 14 || ids.length !== new Set(ids).size) {
  throw new Error('Expected 14 unique project item IDs')
}
if (!map.includes('- Default next item: None; refine `AI-005` before promotion.')) {
  throw new Error('The next refinement action is missing')
}
if (!active.includes('No map-selected item is active.')) {
  throw new Error('Active state is ambiguous')
}
if (!ready.includes('No item is ready') || ready.includes('### ')) {
  throw new Error('Ready state is inconsistent')
}
if (!shipped.includes('### AI-004')) {
  throw new Error('AI-004 is not shipped')
}

for (const match of map.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
  const target = match[1]
  if (/^(?:https?:|mailto:|#)/.test(target)) continue
  const relative = decodeURIComponent(target.split('#', 1)[0])
  if (relative && !existsSync(resolve(dirname(file), relative))) {
    throw new Error('Broken project-map link: ' + target)
  }
}
console.log('AI-004 shipped; AI-005 requires refinement')
NODE
```

Expected: `AI-004 shipped; AI-005 requires refinement`.

- [ ] **Step 4: Format and commit the shipped map**

Run:

```sh
pnpm exec prettier --check docs/project-map.md
git diff --check
git add docs/project-map.md
git commit -m "docs: ship ranked retrieval evaluation"
```

Expected: one commit contains only the final map state.

- [ ] **Step 5: Verify the completed implementation branch**

Run:

```sh
git status --short --branch
git log -4 --oneline --decorate
```

Expected: the branch is clean and the four implementation commits are the
versioned evaluator, official ranked suite, bilingual documentation, and
shipped map transition.

Do not push, publish, deploy, bump the package version, or start `AI-005` as
part of this implementation plan.
