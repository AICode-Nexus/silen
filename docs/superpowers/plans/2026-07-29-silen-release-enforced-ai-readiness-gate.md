# Silen Release-Enforced AI Readiness Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one provider-free official-site AI readiness gate block Core CI,
GitHub Pages, and npm Publish while preserving comparable JSON evidence and
expanding the official retrieval suite to strict schema version 3 with 24
bilingual cases.

**Architecture:** A repository-only TypeScript runner invokes the existing
built CLI and package scripts with fixed argument arrays, captures only
`ai eval --json`, and atomically saves its exact bytes. The evaluator adds an
explicit v3 branch for acceptable and forbidden target arrays while keeping v1
and v2 byte-compatible. The production search index adopts the already
documented draft/AI-opt-out filter, then the official site, workflows, and
bilingual documentation dogfood the same contract.

**Tech Stack:** TypeScript 7.0.2, Zod 4.4.3, MiniSearch 7.2.0, Execa 9.6.1,
Jiti 2.7.0, Vitest 4.1.10, pnpm 10.34.0, Node.js
`^20.19.0 || >=22.12.0`, MDX, GitHub Actions, and Prettier 3.9.5.

## Global Constraints

- `site:ai-check` must run `site:build`, `ai audit`, `ai eval`, and
  `check:no-maps` exactly once and in that order; `site:check` is only
  `pnpm site:ai-check`.
- The runner accepts no root, command, or output argument; subprocesses use
  fixed argument arrays and `shell: false`.
- The only report path is
  `artifacts/ai-eval/site-ai-eval.json`; `/artifacts/` is ignored.
- Remove the stable report before build. Save exact valid JSON stdout
  atomically only when evaluation exits 0, 1, or 2. Missing, invalid,
  structurally invalid, oversized, signaled, or unexpected-exit output leaves
  no report and makes the runner exit 2.
- Valid report output is at most 16 MiB and is exactly one JSON object with a
  positive integer `schemaVersion` and boolean `ok`.
- Suite v3 requires present `acceptable` and `forbidden` arrays, at least one
  target overall, and explicit `1 <= maxRank <= topK <= 20`. Negative-only
  cases require `maxRank === topK`.
- Route-only targets overlap every same-route heading target. Duplicate or
  overlapping targets within a list, or any acceptable/forbidden overlap, are
  setup errors.
- A v3 case passes when the earliest acceptable match is within `maxRank`, or
  no acceptable target was authored, and no forbidden target occurs anywhere
  in diagnostic Top K.
- For identical inputs, v1 and v2 validation, semantics, human output, JSON
  keys and order, serialized bytes, and exits 0/1/2 must remain unchanged.
- `draft: true` and `ai: false` remain publication-neutral but must be excluded
  from `search-index.json` and all AI-readable artifacts.
- The official suite uses schema 3, `topK: 5`, exactly 24 cases, 12
  English-oriented and 12 Chinese-oriented, explicit rank bounds, six direct
  Rank-1 cases, two cross-language cases without `lang`, multiple-acceptable
  cases, and two negative-only hidden cases.
- CI, Pages, and Publish upload the fixed file with
  `actions/upload-artifact@v7`, `if: ${{ always() }}`,
  `if-no-files-found: ignore`, and `retention-days: 90`. Artifact names are
  `silen-ai-eval-ci`, `silen-ai-eval-pages`, and
  `silen-ai-eval-publish`.
- Do not add dependencies, change `pnpm-lock.yaml`, package exports, package
  version, Agent Contract version, or changelog.
- Do not run a model, provider SDK, embeddings service, remote evaluator,
  `fetch`, MCP write path, Git push, npm publish, GitHub Release, or deployment.
- Move `QUAL-003` to Active before behavior changes and to Shipped only after
  the complete local gate passes without provider credentials.

---

## File map

- Modify `docs/project-map.md`: move `QUAL-003` Ready -> Active -> Shipped,
  link evidence, and leave no executable Ready item.
- Modify `src/ai/eval.ts`: strict suite/report v3 types, parsing, matching,
  diagnostics, and explicit v1/v2 compatibility paths.
- Modify `tests/ai/eval.test.ts`: v2 golden compatibility plus complete v3
  semantics, validation, diagnostics, and serialization.
- Modify `tests/cli.test.ts`: built/source CLI v3 retrieval-failure evidence
  and unchanged 0/1/2 setup behavior.
- Modify `src/node/search.ts` and `tests/theme/search.test.ts`: exclude only
  `draft === true` and `ai === false` pages from production search documents.
- Create `website/eval-fixtures/draft-sentinel/index.mdx` and
  `website/zh/eval-fixtures/ai-disabled-sentinel/index.mdx`: safe synthetic
  HTML-visible, AI-excluded pages.
- Modify `website/.silen/ai-evals.json` and `tests/website.test.ts`: exact
  24-case suite, category/rank contract, exclusion evidence, and passing real
  evaluation.
- Create `tooling/site-ai-check.ts`: fixed stage runner, minimal report
  validation, and atomic persistence.
- Create `tests/ai/site-ai-check-runner.test.ts`: runner order, output,
  failure, and persistence tests.
- Modify `package.json` and `.gitignore`: canonical scripts and generated
  report exclusion.
- Modify `tests/ai/site-quality-gate.test.ts`,
  `tests/ai/ci-gate.test.ts`, and
  `tests/ai/npm-publish-workflow.test.ts`: repository and workflow contracts.
- Modify `.github/workflows/ci.yml`, `pages.yml`, and `publish.yml`: run the
  gate once per relevant job and upload the same report.
- Modify `README.md`, `tests/ai/documentation.test.ts`, and the four mirrored
  English/Chinese evaluator guide pairs: document v3 and artifact behavior.
- Reference
  `docs/superpowers/specs/2026-07-29-silen-release-enforced-ai-readiness-gate-design.md`:
  approved product, compatibility, security, and completion contract.

### Task 1: Mark QUAL-003 active

**Files:**

- Modify: `docs/project-map.md:1-121`

**Interfaces:**

- Consumes: the first Ready item `QUAL-003` and its approved design.
- Produces: exactly one Active item, no Ready item, and unchanged Candidate and
  Watch ordering.

- [ ] **Step 1: Verify the initial map state**

Run:

```sh
node --input-type=module <<'NODE'
import { readFile } from 'node:fs/promises'

const map = await readFile('docs/project-map.md', 'utf8')
const active = map.slice(map.indexOf('## Active'), map.indexOf('## Ready'))
const ready = map.slice(map.indexOf('## Ready'), map.indexOf('## Candidate'))
if (!map.includes('- Default next item: `QUAL-003`')) {
  throw new Error('QUAL-003 is not the selected default')
}
if (!active.includes('No map-selected item is active.')) {
  throw new Error('The map already has an Active item')
}
if (!ready.includes('### QUAL-003 — Release-enforced AI readiness gate')) {
  throw new Error('QUAL-003 is not Ready')
}
console.log('QUAL-003 ready for activation')
NODE
```

Expected:

```text
QUAL-003 ready for activation
```

- [ ] **Step 2: Move the exact QUAL-003 block from Ready to Active**

Set the top field to:

```md
- Default next item: `QUAL-003` (Active)
```

Replace the current Active and Ready bodies with the exact structure below.
Move the existing `QUAL-003` content without rewriting its Outcome, Horizon,
Depends on, Entry gate, or Done when text; append the approved design and plan
to its Evidence list.

```md
## Active

### QUAL-003 — Release-enforced AI readiness gate

- Outcome: One provider-free official-site gate blocks regressions in Core CI,
  GitHub Pages, and npm Publish while retaining comparable retrieval evidence.
- Horizon: `0.4.1`.
- Depends on: `QUAL-002` and `AI-004`.
- Entry gate: `QUAL-002` intentionally scoped the composed gate to Pages, and
  `AI-004` shipped a six-case version 2 suite with per-case `maxRank`; the next
  release explicitly promotes both capabilities into CI and Publish coverage.
- Done when: `site:ai-check` composes `site:build`, `ai audit`, `ai eval`, and
  `check:no-maps` in that order; the existing `site:check` remains a
  non-divergent compatibility alias; CI, Pages, and Publish each invoke the
  canonical gate without rebuilding the site twice in one job; the official
  suite contains at least 20 stable English and Chinese cases covering natural
  questions, long phrasing, synonyms, typos, cross-language retrieval, and
  hidden-content negatives; every case authors `maxRank`, critical queries
  require rank 1, and the schema supports multiple acceptable targets plus
  forbidden targets; and each workflow uploads the same schema-versioned JSON
  evaluation report as a CI artifact, including retrieval-failure evidence
  when a report was produced, so ranking drift can be compared across commits
  and releases. The complete gate must still pass with provider credentials
  absent.
- Evidence:
  [current composed gate](../package.json),
  [current six-case suite](../website/.silen/ai-evals.json),
  [current evaluator](../src/ai/eval.ts),
  [Pages workflow](../.github/workflows/pages.yml),
  [Core CI workflow](../.github/workflows/ci.yml),
  [Publish workflow](../.github/workflows/publish.yml),
  [release-enforced gate design](./superpowers/specs/2026-07-29-silen-release-enforced-ai-readiness-gate-design.md),
  [implementation plan](./superpowers/plans/2026-07-29-silen-release-enforced-ai-readiness-gate.md),
  [site-gate design](./superpowers/specs/2026-07-29-silen-deterministic-site-gate-design.md),
  and
  [rank-expectations design](./superpowers/specs/2026-07-29-silen-retrieval-rank-expectations-design.md).

## Ready

No item is ready for default implementation while `QUAL-003` is Active.
```

- [ ] **Step 3: Verify the one-Active invariant**

Run:

```sh
node --input-type=module <<'NODE'
import { readFile } from 'node:fs/promises'

const map = await readFile('docs/project-map.md', 'utf8')
const active = map.slice(map.indexOf('## Active'), map.indexOf('## Ready'))
const ready = map.slice(map.indexOf('## Ready'), map.indexOf('## Candidate'))
const ids = [...active.matchAll(/^### ([A-Z]+-[0-9]{3}) —/gm)].map(
  (match) => match[1],
)
if (JSON.stringify(ids) !== JSON.stringify(['QUAL-003'])) {
  throw new Error('Unexpected Active items: ' + ids.join(', '))
}
if (/^### /m.test(ready)) throw new Error('Ready is not empty')
console.log('QUAL-003 active state OK')
NODE
```

Expected:

```text
QUAL-003 active state OK
```

- [ ] **Step 4: Format and commit the Active state**

Run:

```sh
pnpm exec prettier --check docs/project-map.md
git diff --check
git add docs/project-map.md
git commit -m "docs: start release-enforced AI readiness gate"
```

Expected: checks pass and the commit contains only `docs/project-map.md`.

### Task 2: Add strict multi-target evaluation schema v3

**Files:**

- Modify: `tests/ai/eval.test.ts:55-320`
- Modify: `src/ai/eval.ts:42-205,400-620`
- Modify: `tests/cli.test.ts:120-235`

**Interfaces:**

- Consumes: `queryRankedSearchIndex`, `normalizeSiteRoute`, the v1/v2 schemas,
  bounded reads, and established CLI exits.
- Produces: `AiEvalTarget`, `AiEvalExpectedV3`,
  `AiEvalForbiddenMatch`, `AiEvalCaseResultV3`, `AiEvalReportV3`, strict v3
  parsing, earliest acceptable match, Top-K forbidden matches, and
  version-specific human diagnostics.

- [ ] **Step 1: Add and run a version 2 byte-compatibility golden before edits**

At the end of the existing version 1 JSON golden, add:

```ts
expect(formatAiEvalReport(report)).toBe('Silen AI eval: 1/1 passed\n')
```

Add this test immediately after the existing v1 golden test:

```ts
it('keeps the version 2 JSON report byte-identical', async () => {
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
    ],
  })

  const report = await runAiEvaluation(site)
  expect(serializeAiEvalReport(report)).toBe(`{
  "schemaVersion": 2,
  "ok": true,
  "suite": ".silen/ai-evals.json",
  "index": ".silen/dist/search-index.json",
  "topK": 2,
  "summary": {
    "total": 1,
    "passed": 1,
    "failed": 0
  },
  "cases": [
    {
      "id": "at-bound",
      "ok": true,
      "query": "shared answer",
      "lang": "en-US",
      "expected": {
        "route": "/second/",
        "maxRank": 2
      },
      "matchedRank": 2,
      "actual": [
        {
          "rank": 1,
          "route": "/first/",
          "title": "Shared answer",
          "score": 15.383395,
          "lang": "en-US"
        },
        {
          "rank": 2,
          "route": "/second/",
          "title": "Secondary",
          "score": 4.158883,
          "lang": "en-US"
        }
      ]
    }
  ]
}
`)
  expect(formatAiEvalReport(report)).toBe('Silen AI eval: 1/1 passed\n')
})
```

Run:

```sh
pnpm exec vitest run tests/ai/eval.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: PASS before any evaluator implementation changes. This freezes the
current v2 JSON bytes and human summary.

- [ ] **Step 2: Add a deterministic three-rank target fixture and failing v3 semantics test**

Add after `writeRankedIndex`:

```ts
async function writeTargetIndex(site: string): Promise<void> {
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
    {
      id: '/forbidden',
      lang: 'en-US',
      title: 'Forbidden',
      route: '/forbidden/',
      headings: ['Blocked'],
      text: 'shared answer',
    },
  ])
  await writeFile(
    path.join(site, '.silen/dist/search-index.json'),
    serializeSearchIndex(index),
  )
}
```

Add after the v2 rank test:

```ts
it('evaluates version 3 acceptable and forbidden targets in rank order', async () => {
  const site = await temporaryRoot()
  await writeTargetIndex(site)
  await writeSuite(site, {
    schemaVersion: 3,
    topK: 3,
    cases: [
      {
        id: 'multiple-acceptable',
        query: 'shared answer',
        lang: 'en-US',
        expected: {
          acceptable: [{ route: '/second/' }, { route: '/first/' }],
          forbidden: [],
          maxRank: 3,
        },
      },
      {
        id: 'at-bound',
        query: 'shared answer',
        lang: 'en-US',
        expected: {
          acceptable: [{ route: '/second/' }],
          forbidden: [],
          maxRank: 3,
        },
      },
      {
        id: 'rank-and-forbidden-failure',
        query: 'shared answer',
        lang: 'en-US',
        expected: {
          acceptable: [{ route: '/second/' }],
          forbidden: [{ route: '/forbidden/' }],
          maxRank: 2,
        },
      },
      {
        id: 'negative-only',
        query: 'no matching vocabulary',
        expected: {
          acceptable: [],
          forbidden: [{ route: '/forbidden/' }],
          maxRank: 3,
        },
      },
      {
        id: 'positive-only-failure',
        query: 'shared answer',
        expected: {
          acceptable: [{ route: '/missing/' }],
          forbidden: [],
          maxRank: 3,
        },
      },
    ],
  })

  const first = await runAiEvaluation(site)
  const second = await runAiEvaluation(site)
  expect(first).toMatchObject({
    schemaVersion: 3,
    ok: false,
    summary: { total: 5, passed: 3, failed: 2 },
    cases: [
      {
        id: 'multiple-acceptable',
        ok: true,
        matchedTarget: { route: '/first/' },
        matchedRank: 1,
        forbiddenMatches: [],
      },
      {
        id: 'at-bound',
        ok: true,
        matchedTarget: { route: '/second/' },
        matchedRank: 3,
        forbiddenMatches: [],
      },
      {
        id: 'rank-and-forbidden-failure',
        ok: false,
        matchedTarget: { route: '/second/' },
        matchedRank: 3,
        forbiddenMatches: [
          { target: { route: '/forbidden/' }, rank: 2 },
        ],
      },
      {
        id: 'negative-only',
        ok: true,
        matchedTarget: null,
        matchedRank: null,
        forbiddenMatches: [],
        actual: [],
      },
      {
        id: 'positive-only-failure',
        ok: false,
        matchedTarget: null,
        matchedRank: null,
        forbiddenMatches: [],
      },
    ],
  })
  expect(serializeAiEvalReport(first)).toBe(serializeAiEvalReport(second))

  const human = formatAiEvalReport(first)
  expect(human).toContain('Matched at rank 3; required rank 2 or better.')
  expect(human).toContain('Forbidden: /forbidden/ at rank 2.')
  expect(human).toContain(
    'No complete match in Top 3; required rank 3 or better.',
  )
})
```

Add two companion tests after it. The first protects rank-first forbidden
ordering, stable v3 keys, and forbidden-only diagnostics even when authored
target order differs from result order:

```ts
it('orders version 3 forbidden evidence by actual rank', async () => {
  const site = await temporaryRoot()
  await writeTargetIndex(site)
  await writeSuite(site, {
    schemaVersion: 3,
    topK: 3,
    cases: [
      {
        id: 'ordered-forbidden',
        query: 'shared answer',
        lang: 'en-US',
        expected: {
          acceptable: [{ route: '/first/' }],
          forbidden: [{ route: '/second/' }, { route: '/forbidden/' }],
          maxRank: 1,
        },
      },
    ],
  })

  const report = await runAiEvaluation(site)
  const result = report.cases[0]
  expect(report).toMatchObject({
    schemaVersion: 3,
    ok: false,
    cases: [
      {
        matchedTarget: { route: '/first/' },
        matchedRank: 1,
        forbiddenMatches: [
          { target: { route: '/forbidden/' }, rank: 2 },
          { target: { route: '/second/' }, rank: 3 },
        ],
      },
    ],
  })
  expect(Object.keys(report)).toEqual([
    'schemaVersion',
    'ok',
    'suite',
    'index',
    'topK',
    'summary',
    'cases',
  ])
  expect(Object.keys(result!)).toEqual([
    'id',
    'ok',
    'query',
    'lang',
    'expected',
    'matchedTarget',
    'matchedRank',
    'forbiddenMatches',
    'actual',
  ])
  expect(Object.keys(result!.expected)).toEqual([
    'acceptable',
    'forbidden',
    'maxRank',
  ])
  expect(serializeAiEvalReport(report)).toBe(
    serializeAiEvalReport(await runAiEvaluation(site)),
  )

  const human = formatAiEvalReport(report)
  expect(human).not.toContain('  Rank:')
  const firstForbidden = human.indexOf('Forbidden: /forbidden/ at rank 2.')
  const secondForbidden = human.indexOf('Forbidden: /second/ at rank 3.')
  expect(firstForbidden).toBeGreaterThanOrEqual(0)
  expect(secondForbidden).toBeGreaterThan(firstForbidden)
})
```

The second protects the existing route and heading normalization for both
acceptable and forbidden targets:

```ts
it('normalizes version 3 acceptable and forbidden targets', async () => {
  const site = await temporaryRoot()
  await writeIndex(site)
  const normalizedTarget = {
    route: '/ai',
    heading: ' public   AI ARTIFACTS ',
  }
  await writeSuite(site, {
    schemaVersion: 3,
    topK: 5,
    cases: [
      {
        id: 'acceptable-normalization',
        query: 'Public AI artifacts',
        expected: {
          acceptable: [normalizedTarget],
          forbidden: [],
          maxRank: 1,
        },
      },
      {
        id: 'forbidden-normalization',
        query: 'Public AI artifacts',
        expected: {
          acceptable: [],
          forbidden: [normalizedTarget],
          maxRank: 5,
        },
      },
    ],
  })

  await expect(runAiEvaluation(site)).resolves.toMatchObject({
    schemaVersion: 3,
    ok: false,
    summary: { total: 2, passed: 1, failed: 1 },
    cases: [
      {
        ok: true,
        matchedTarget: {
          route: '/ai',
          heading: 'public AI ARTIFACTS',
        },
        matchedRank: 1,
      },
      {
        ok: false,
        matchedTarget: null,
        matchedRank: null,
        forbiddenMatches: [
          {
            target: {
              route: '/ai',
              heading: 'public AI ARTIFACTS',
            },
            rank: 1,
          },
        ],
      },
    ],
  })
})
```

Run the single test:

```sh
pnpm exec vitest run tests/ai/eval.test.ts -t "version 3 acceptable" --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL with `schemaVersion` / unsupported strict suite evidence because
v3 is not yet accepted.

- [ ] **Step 3: Add failing v3 validation-path cases**

Add this table next to existing schema validation tests:

```ts
it.each([
  [
    {
      schemaVersion: 3,
      topK: 2,
      cases: [
        {
          id: 'missing-acceptable',
          query: 'query',
          expected: {
            forbidden: [{ route: '/blocked/' }],
            maxRank: 2,
          },
        },
      ],
    },
    'cases.0.expected.acceptable',
  ],
  [
    {
      schemaVersion: 3,
      topK: 2,
      cases: [
        {
          id: 'missing-forbidden',
          query: 'query',
          expected: {
            acceptable: [{ route: '/' }],
            maxRank: 2,
          },
        },
      ],
    },
    'cases.0.expected.forbidden',
  ],
  [
    {
      schemaVersion: 3,
      topK: 2,
      cases: [
        {
          id: 'missing-max-rank',
          query: 'query',
          expected: {
            acceptable: [{ route: '/' }],
            forbidden: [],
          },
        },
      ],
    },
    'cases.0.expected.maxRank',
  ],
  [
    {
      schemaVersion: 3,
      topK: 2,
      cases: [
        {
          id: 'too-many-targets',
          query: 'query',
          expected: {
            acceptable: Array.from({ length: 21 }, (_, index) => ({
              route: `/target-${index}/`,
            })),
            forbidden: [],
            maxRank: 2,
          },
        },
      ],
    },
    'cases.0.expected.acceptable',
  ],
  [
    {
      schemaVersion: 3,
      topK: 2,
      cases: [
        {
          id: 'unknown-field',
          query: 'query',
          expected: {
            acceptable: [{ route: '/' }],
            forbidden: [],
            maxRank: 2,
            typo: true,
          },
        },
      ],
    },
    'cases.0.expected',
  ],
  [
    {
      schemaVersion: 3,
      topK: 2,
      cases: [
        {
          id: 'empty',
          query: 'query',
          expected: { acceptable: [], forbidden: [], maxRank: 2 },
        },
      ],
    },
    'cases.0.expected.acceptable',
  ],
  [
    {
      schemaVersion: 3,
      topK: 2,
      cases: [
        {
          id: 'negative-bound',
          query: 'query',
          expected: {
            acceptable: [],
            forbidden: [{ route: '/blocked/' }],
            maxRank: 1,
          },
        },
      ],
    },
    'cases.0.expected.maxRank',
  ],
  [
    {
      schemaVersion: 3,
      topK: 2,
      cases: [
        {
          id: 'above-top-k',
          query: 'query',
          expected: {
            acceptable: [{ route: '/' }],
            forbidden: [],
            maxRank: 3,
          },
        },
      ],
    },
    'cases.0.expected.maxRank',
  ],
  [
    {
      schemaVersion: 3,
      topK: 2,
      cases: [
        {
          id: 'overlapping-acceptable',
          query: 'query',
          expected: {
            acceptable: [
              { route: '/guide/' },
              { route: '/guide/', heading: 'Install' },
            ],
            forbidden: [],
            maxRank: 2,
          },
        },
      ],
    },
    'cases.0.expected.acceptable.1',
  ],
  [
    {
      schemaVersion: 3,
      topK: 2,
      cases: [
        {
          id: 'overlapping-forbidden',
          query: 'query',
          expected: {
            acceptable: [],
            forbidden: [
              { route: '/guide/', heading: 'Install' },
              { route: '/guide/' },
            ],
            maxRank: 2,
          },
        },
      ],
    },
    'cases.0.expected.forbidden.1',
  ],
  [
    {
      schemaVersion: 3,
      topK: 2,
      cases: [
        {
          id: 'cross-list-overlap',
          query: 'query',
          expected: {
            acceptable: [{ route: '/guide/', heading: 'Install' }],
            forbidden: [{ route: '/guide/' }],
            maxRank: 2,
          },
        },
      ],
    },
    'cases.0.expected.forbidden.0',
  ],
])('rejects invalid version 3 target policy %#', async (suite, field) => {
  const site = await temporaryRoot()
  await writeIndex(site)
  await writeSuite(site, suite)
  await expect(runAiEvaluation(site)).rejects.toMatchObject({
    code: 'SUITE_SCHEMA',
    field,
  })
})
```

Add a separate compatibility rejection test so the new fields do not leak into
older strict suites:

```ts
it.each([1, 2])(
  'keeps version 3 target arrays invalid in version %s',
  async (schemaVersion) => {
    const site = await temporaryRoot()
    await writeIndex(site)
    await writeSuite(site, {
      schemaVersion,
      topK: 1,
      cases: [
        {
          id: 'v3-fields-in-old-suite',
          query: 'query',
          expected: {
            route: '/',
            acceptable: [{ route: '/' }],
            forbidden: [],
            maxRank: 1,
          },
        },
      ],
    })
    await expect(runAiEvaluation(site)).rejects.toMatchObject({
      code: 'SUITE_SCHEMA',
      field: 'cases.0.expected',
    })
  },
)
```

Change the existing unsupported-version case from schema 3 to schema 4:

```diff
-    [{ schemaVersion: 3, cases: [] }, 'schemaVersion'],
+    [{ schemaVersion: 4, cases: [] }, 'schemaVersion'],
```

Run:

```sh
pnpm exec vitest run tests/ai/eval.test.ts -t "version 3 target policy" --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because v3 is still unsupported instead of reporting the
specific expected fields.

- [ ] **Step 4: Add v3 public result types and strict schemas**

In `src/ai/eval.ts`, replace the current expected/result/report type block
with:

```ts
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
  | AiEvalCaseResultV1
  | AiEvalCaseResultV2
  | AiEvalCaseResultV3

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
```

Add the target and v3 schemas after `expectedV2Schema`:

```ts
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

const caseV3Schema = z
  .object({
    id: normalizedTextSchema(100),
    query: normalizedTextSchema(500),
    lang: normalizedTextSchema(100).optional(),
    expected: expectedV3Schema,
  })
  .strict()

const suiteV3Schema = z
  .object({
    schemaVersion: z.literal(3),
    topK: z.number().int().min(1).max(20).default(5),
    cases: z.array(caseV3Schema).min(1).max(500),
  })
  .strict()
```

Move the current `comparableHeading` helper next to `targetsOverlap` above
`suiteSchema`, then add:

```ts
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
```

Delete the old later `comparableHeading` definition. Extend the discriminated
union and its `superRefine` with this exact v3 branch:

```ts
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
          path: [
            'cases',
            caseIndex,
            'expected',
            'forbidden',
            forbiddenIndex,
          ],
          message: 'Forbidden target overlaps an acceptable target',
        })
      }
    }
  })
```

- [ ] **Step 5: Implement v3 matching and report construction**

Delete `EvaluationExpectedInput`, change `EvaluationCaseInput` to this shared
query-only shape, and make `findMatchedRank` accept `AiEvalTarget`:

```ts
type EvaluationCaseInput = {
  readonly query: string
  readonly lang?: string | undefined
}
```

Keep `findMatchedRank` for v1/v2, changing only its expected-argument type:

```ts
function findMatchedRank(
  actual: readonly AiEvalActualResult[],
  expected: AiEvalTarget,
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
```

Then add:

```ts
function matchesTarget(
  result: AiEvalActualResult,
  target: AiEvalTarget,
): boolean {
  const expectedRoute = normalizeSiteRoute(target.route)
  const expectedHeading = comparableHeading(target.heading)
  return (
    normalizeSiteRoute(result.route) === expectedRoute &&
    (expectedHeading === undefined ||
      comparableHeading(result.heading) === expectedHeading)
  )
}

function materializeTarget(target: AiEvalTarget): AiEvalTarget {
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
```

Make the report branches explicit. Preserve the existing v1 object literal and
existing v2 object literal unchanged; make v2 an
`if (suite.schemaVersion === 2)` branch, then add:

```ts
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
```

- [ ] **Step 6: Add v3-only human diagnostics without changing v1/v2**

Replace `expectedLabel` and `rankFailureLabel`, and add the two helpers below:

```ts
function targetLabel(target: AiEvalTarget): string {
  return target.heading === undefined
    ? target.route
    : `${target.route} — ${target.heading}`
}

function expectedLabel(result: AiEvalCaseResult): string {
  if ('acceptable' in result.expected) {
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

function rankFailureLabel(
  result: AiEvalCaseResult,
  topK: number,
): string | undefined {
  if ('acceptable' in result.expected) {
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
  if (
    !('forbiddenMatches' in result) ||
    result.forbiddenMatches.length === 0
  ) {
    return []
  }
  return result.forbiddenMatches.map(
    ({ target, rank }) => `  Forbidden: ${targetLabel(target)} at rank ${rank}.`,
  )
}

function remediationLabel(result: AiEvalCaseResult): string {
  if ('forbiddenMatches' in result && result.forbiddenMatches.length > 0) {
    return '  Improve an acceptable target, remove forbidden targets from search results, or correct the authored expectation.'
  }
  return '  Improve the relevant title, description, heading, or page text, or correct the authored expectation.'
}
```

In `formatAiEvalReport`, insert
`...forbiddenFailureLabels(result)` after the optional Rank line and replace
the fixed remediation string with `remediationLabel(result)`. Do not reorder
any existing v1/v2 line.

- [ ] **Step 7: Run evaluator tests and fix only v3 implementation defects**

Run:

```sh
pnpm exec vitest run tests/ai/eval.test.ts --maxWorkers=1 --no-file-parallelism
pnpm typecheck
```

Expected: all evaluator tests pass; both v1 and v2 golden strings remain
unchanged; v3 semantics and precise field paths pass.

- [ ] **Step 8: Add built/source CLI v3 retrieval-failure evidence**

In `tests/cli.test.ts`, after the existing `ranked` assertions and before the
missing-suite setup case, add:

```ts
await writeFile(
  path.join(site, '.silen/ai-evals.json'),
  JSON.stringify({
    schemaVersion: 3,
    topK: 1,
    cases: [
      {
        id: 'forbidden-built-page',
        query: 'Built by the packed CLI',
        expected: {
          acceptable: [],
          forbidden: [{ route: '/' }],
          maxRank: 1,
        },
      },
    ],
  }),
)
const forbidden = await execa(
  cliRunner,
  [cli, 'ai', 'eval', site, '--json'],
  { reject: false, all: true },
)
expect(forbidden.exitCode, forbidden.all).toBe(1)
expect(JSON.parse(forbidden.stdout)).toMatchObject({
  schemaVersion: 3,
  ok: false,
  cases: [
    {
      id: 'forbidden-built-page',
      matchedTarget: null,
      matchedRank: null,
      forbiddenMatches: [{ target: { route: '/' }, rank: 1 }],
    },
  ],
})
```

Run:

```sh
pnpm exec vitest run tests/cli.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: PASS with v3 retrieval failure exit 1 and existing setup failure exit
2.

- [ ] **Step 9: Commit evaluator v3**

Run:

```sh
pnpm exec prettier --check src/ai/eval.ts tests/ai/eval.test.ts tests/cli.test.ts
pnpm lint
git diff --check
git add src/ai/eval.ts tests/ai/eval.test.ts tests/cli.test.ts
git commit -m "feat(ai): add multi-target evaluation schema"
```

Expected: all checks pass and the commit contains only evaluator and CLI
contract changes.

### Task 3: Align production search with AI-exclusion frontmatter

**Files:**

- Modify: `tests/theme/search.test.ts:295-320`
- Modify: `src/node/search.ts:457-484`

**Interfaces:**

- Consumes: compiled page `frontmatter`, existing locale resolution, and
  `createPageSearchDocuments`.
- Produces: production search documents for every ordinary page while
  excluding only `draft === true` and `ai === false`.

- [ ] **Step 1: Add the failing exact-boolean exclusion test**

Add this test after the locale-root search-document test:

```ts
it('excludes only draft and AI-opted-out pages from search documents', () => {
  const page = (
    route: string,
    frontmatter: Record<string, boolean>,
  ) => ({
    file: `/docs${route}index.mdx`,
    route,
    source: `# ${route}\n\nSearchable content.`,
    title: route,
    description: '',
    frontmatter,
    headings: [],
    links: [],
    data: {},
  })

  const documents = createPageSearchDocuments([
    page('/public/', {}),
    page('/draft/', { draft: true }),
    page('/draft-false/', { draft: false }),
    page('/ai-disabled/', { ai: false }),
    page('/ai-enabled/', { ai: true }),
  ])

  expect(documents.map(({ route }) => route)).toEqual([
    '/public/',
    '/draft-false/',
    '/ai-enabled/',
  ])
})
```

Run:

```sh
pnpm exec vitest run tests/theme/search.test.ts -t "AI-opted-out" --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because `/draft/` and `/ai-disabled/` are still returned.

- [ ] **Step 2: Apply the documented exact-value filter**

Change the beginning of `createPageSearchDocuments` from a direct `map` to:

```ts
return pages
  .filter(
    (page) =>
      page.frontmatter.draft !== true && page.frontmatter.ai !== false,
  )
  .map((page) => {
    const content = extractSearchContent(page.source)
    const lang = resolveCurrentLocale(
      options.locales,
      page.route,
      '/',
      options.lang,
    ).lang
    return {
      id: page.route,
      lang,
      title: page.title,
      route: page.route,
      ...(page.description ? { description: page.description } : {}),
      headings: content.headings
        .filter((heading) => heading.depth >= 2)
        .map((heading) => heading.title),
      text: content.text,
    }
  })
```

Do not change HTML rendering, routes, sitemap construction, search scoring, or
locale resolution.

- [ ] **Step 3: Run search and existing AI-exclusion regressions**

Run:

```sh
pnpm exec vitest run \
  tests/theme/search.test.ts \
  tests/ai/artifacts.test.ts \
  tests/ai/chunks.test.ts \
  --maxWorkers=1 \
  --no-file-parallelism
pnpm typecheck
```

Expected: all tests pass; `draft: false` and `ai: true` remain searchable.

- [ ] **Step 4: Commit the search-boundary correction**

Run:

```sh
pnpm exec prettier --check src/node/search.ts tests/theme/search.test.ts
git diff --check
git add src/node/search.ts tests/theme/search.test.ts
git commit -m "fix(search): exclude AI-hidden pages"
```

Expected: one focused search-boundary commit.

### Task 4: Dogfood the 24-case bilingual official suite

**Files:**

- Create: `website/eval-fixtures/draft-sentinel/index.mdx`
- Create: `website/zh/eval-fixtures/ai-disabled-sentinel/index.mdx`
- Modify: `website/.silen/ai-evals.json`
- Modify: `tests/website.test.ts:1-4,280-340`

**Interfaces:**

- Consumes: evaluator schema v3 and search exclusion from Tasks 2 and 3.
- Produces: two safe AI-exclusion fixtures, the exact 24-case suite, structural
  category/rank proof, built-output exclusion proof, and a passing production
  evaluation report.

- [ ] **Step 1: Add the two safe synthetic fixture pages**

Create `website/eval-fixtures/draft-sentinel/index.mdx`:

```mdx
---
title: Draft evaluation sentinel
description: Synthetic public build fixture excluded from AI-readable output
draft: true
---

# Draft evaluation sentinel

Quartz harbor lantern is synthetic quality-gate vocabulary. It is public test
content, not private information.
```

Create `website/zh/eval-fixtures/ai-disabled-sentinel/index.mdx`:

```mdx
---
title: AI 排除评测哨兵
description: 用于验证 AI 输出边界的公开合成构建夹具
ai: false
---

# AI 排除评测哨兵

星槎 雾港 灯塔 是质量门禁使用的合成词汇，不包含任何私密信息。
```

- [ ] **Step 2: Replace the official suite with the exact schema v3 matrix**

Replace `website/.silen/ai-evals.json` with:

```json
{
  "schemaVersion": 3,
  "topK": 5,
  "cases": [
    {
      "id": "direct-en-public-ai-artifacts",
      "query": "AI artifacts",
      "lang": "en-US",
      "expected": {
        "acceptable": [
          {
            "route": "/ai/",
            "heading": "Public AI artifacts"
          }
        ],
        "forbidden": [],
        "maxRank": 1
      }
    },
    {
      "id": "direct-en-local-workspace",
      "query": "Local workspace and MCP",
      "lang": "en-US",
      "expected": {
        "acceptable": [
          {
            "route": "/ai/local-workspace-mcp/"
          }
        ],
        "forbidden": [],
        "maxRank": 1
      }
    },
    {
      "id": "direct-en-agent-contract",
      "query": "deployed site Agent Contract manifest",
      "lang": "en-US",
      "expected": {
        "acceptable": [
          {
            "route": "/ai/agent-contract/"
          }
        ],
        "forbidden": [],
        "maxRank": 1
      }
    },
    {
      "id": "direct-zh-public-ai-artifacts",
      "query": "面向 AI 的公开产物",
      "lang": "zh-CN",
      "expected": {
        "acceptable": [
          {
            "route": "/zh/ai/",
            "heading": "面向 AI 的公开产物"
          }
        ],
        "forbidden": [],
        "maxRank": 1
      }
    },
    {
      "id": "direct-zh-local-workspace",
      "query": "本地工作区与 MCP",
      "lang": "zh-CN",
      "expected": {
        "acceptable": [
          {
            "route": "/zh/ai/local-workspace-mcp/"
          }
        ],
        "forbidden": [],
        "maxRank": 1
      }
    },
    {
      "id": "direct-zh-agent-contract",
      "query": "部署站点 Agent Contract 清单",
      "lang": "zh-CN",
      "expected": {
        "acceptable": [
          {
            "route": "/zh/ai/agent-contract/"
          }
        ],
        "forbidden": [],
        "maxRank": 1
      }
    },
    {
      "id": "natural-en-model-free-evaluation",
      "query": "How can I evaluate documentation retrieval without an AI model?",
      "lang": "en-US",
      "expected": {
        "acceptable": [
          {
            "route": "/ai/local-workspace-mcp/"
          }
        ],
        "forbidden": [],
        "maxRank": 2
      }
    },
    {
      "id": "natural-en-deployed-manifest",
      "query": "Where should an agent find the deployed site manifest?",
      "lang": "en-US",
      "expected": {
        "acceptable": [
          {
            "route": "/ai/agent-contract/"
          }
        ],
        "forbidden": [],
        "maxRank": 2
      }
    },
    {
      "id": "natural-zh-model-free-evaluation",
      "query": "如何 在没有 模型 的情况下 评测 文档 检索",
      "lang": "zh-CN",
      "expected": {
        "acceptable": [
          {
            "route": "/zh/ai/"
          }
        ],
        "forbidden": [],
        "maxRank": 2
      }
    },
    {
      "id": "natural-zh-deployed-manifest",
      "query": "部署站点 的 Agent Contract 清单 在哪里",
      "lang": "zh-CN",
      "expected": {
        "acceptable": [
          {
            "route": "/zh/ai/agent-contract/"
          }
        ],
        "forbidden": [],
        "maxRank": 2
      }
    },
    {
      "id": "long-en-read-only-workspace",
      "query": "I need a deterministic local documentation workspace that stays read only unless I explicitly allow writing",
      "lang": "en-US",
      "expected": {
        "acceptable": [
          {
            "route": "/ai/local-workspace-mcp/"
          },
          {
            "route": "/ai/"
          }
        ],
        "forbidden": [],
        "maxRank": 2
      }
    },
    {
      "id": "long-en-release-check",
      "query": "How do I build audit and evaluate the site before publishing static documentation?",
      "lang": "en-US",
      "expected": {
        "acceptable": [
          {
            "route": "/ai/local-workspace-mcp/"
          },
          {
            "route": "/guide/cli-deployment/"
          }
        ],
        "forbidden": [],
        "maxRank": 2
      }
    },
    {
      "id": "long-zh-read-only-workspace",
      "query": "我需要 默认只读 只有 显式授权 才允许 写入 的 本地 MCP 文档 工作区",
      "lang": "zh-CN",
      "expected": {
        "acceptable": [
          {
            "route": "/zh/ai/local-workspace-mcp/"
          },
          {
            "route": "/zh/ai/"
          }
        ],
        "forbidden": [],
        "maxRank": 2
      }
    },
    {
      "id": "long-zh-release-check",
      "query": "发布 静态文档 之前 如何 完成 构建 审计 评测 并 检查 生成结果",
      "lang": "zh-CN",
      "expected": {
        "acceptable": [
          {
            "route": "/zh/ai/local-workspace-mcp/"
          },
          {
            "route": "/zh/reference/"
          }
        ],
        "forbidden": [],
        "maxRank": 2
      }
    },
    {
      "id": "synonym-en-machine-readable-output",
      "query": "machine readable documentation outputs for agents",
      "lang": "en-US",
      "expected": {
        "acceptable": [
          {
            "route": "/ai/"
          }
        ],
        "forbidden": [],
        "maxRank": 3
      }
    },
    {
      "id": "synonym-en-capability-entry",
      "query": "versioned capability discovery entry point",
      "lang": "en-US",
      "expected": {
        "acceptable": [
          {
            "route": "/ai/agent-contract/"
          }
        ],
        "forbidden": [],
        "maxRank": 3
      }
    },
    {
      "id": "synonym-zh-machine-readable-output",
      "query": "智能体 读取 的 机器可读 文档 产物",
      "lang": "zh-CN",
      "expected": {
        "acceptable": [
          {
            "route": "/zh/ai/"
          }
        ],
        "forbidden": [],
        "maxRank": 3
      }
    },
    {
      "id": "synonym-zh-capability-entry",
      "query": "带版本 的 能力 发现 入口",
      "lang": "zh-CN",
      "expected": {
        "acceptable": [
          {
            "route": "/zh/ai/"
          }
        ],
        "forbidden": [],
        "maxRank": 3
      }
    },
    {
      "id": "typo-en-agent-contract",
      "query": "deplyed Agent Contrct manfiest",
      "lang": "en-US",
      "expected": {
        "acceptable": [
          {
            "route": "/ai/agent-contract/"
          }
        ],
        "forbidden": [],
        "maxRank": 3
      }
    },
    {
      "id": "typo-zh-agent-contract",
      "query": "部署站点 Agent Contarct 清单",
      "lang": "zh-CN",
      "expected": {
        "acceptable": [
          {
            "route": "/zh/ai/agent-contract/"
          }
        ],
        "forbidden": [],
        "maxRank": 3
      }
    },
    {
      "id": "cross-lang-en-to-zh",
      "query": "How to use 本地 MCP 工作区 默认只读",
      "expected": {
        "acceptable": [
          {
            "route": "/zh/ai/local-workspace-mcp/"
          },
          {
            "route": "/zh/ai/"
          }
        ],
        "forbidden": [],
        "maxRank": 5
      }
    },
    {
      "id": "cross-lang-zh-to-en",
      "query": "如何 read the deployed Agent Contract manifest",
      "expected": {
        "acceptable": [
          {
            "route": "/ai/agent-contract/"
          }
        ],
        "forbidden": [],
        "maxRank": 5
      }
    },
    {
      "id": "hidden-en-draft-sentinel",
      "query": "quartz harbor lantern",
      "lang": "en-US",
      "expected": {
        "acceptable": [],
        "forbidden": [
          {
            "route": "/eval-fixtures/draft-sentinel/"
          }
        ],
        "maxRank": 5
      }
    },
    {
      "id": "hidden-zh-ai-disabled-sentinel",
      "query": "星槎 雾港 灯塔",
      "lang": "zh-CN",
      "expected": {
        "acceptable": [],
        "forbidden": [
          {
            "route": "/zh/eval-fixtures/ai-disabled-sentinel/"
          }
        ],
        "maxRank": 5
      }
    }
  ]
}
```

- [ ] **Step 3: Replace the official-suite test with structural and exclusion proof**

Change the `node:fs/promises` import in `tests/website.test.ts` to:

```ts
import { access, readFile, rm } from 'node:fs/promises'
```

Replace the existing `dogfoods the deterministic bilingual AI evaluation
suite` test with:

```ts
it('dogfoods the 24-case bilingual AI evaluation suite', async () => {
  type Target = { route: string; heading?: string }
  type OfficialCase = {
    id: string
    lang?: string
    expected: {
      acceptable: Target[]
      forbidden: Target[]
      maxRank: number
    }
  }
  const suite = JSON.parse(
    await readFile(path.resolve('website/.silen/ai-evals.json'), 'utf8'),
  ) as {
    schemaVersion: number
    topK: number
    cases: OfficialCase[]
  }

  expect(suite.schemaVersion).toBe(3)
  expect(suite.topK).toBe(5)
  expect(suite.cases).toHaveLength(24)
  expect(suite.cases.filter(({ lang }) => lang === 'en-US')).toHaveLength(11)
  expect(suite.cases.filter(({ lang }) => lang === 'zh-CN')).toHaveLength(11)
  expect(suite.cases.filter(({ lang }) => lang === undefined)).toHaveLength(2)
  for (const [prefix, count] of [
    ['direct-', 6],
    ['natural-', 4],
    ['long-', 4],
    ['synonym-', 4],
    ['typo-', 2],
    ['cross-lang-', 2],
    ['hidden-', 2],
  ] as const) {
    expect(
      suite.cases.filter(({ id }) => id.startsWith(prefix)),
      prefix,
    ).toHaveLength(count)
  }
  expect(
    suite.cases
      .filter(({ id }) => id.startsWith('direct-'))
      .every(({ expected }) => expected.maxRank === 1),
  ).toBe(true)
  expect(
    suite.cases.every(
      ({ expected }) =>
        Array.isArray(expected.acceptable) &&
        Array.isArray(expected.forbidden) &&
        Number.isInteger(expected.maxRank),
    ),
  ).toBe(true)
  expect(
    suite.cases.filter(({ expected }) => expected.acceptable.length > 1).length,
  ).toBeGreaterThanOrEqual(2)
  expect(
    suite.cases
      .filter(({ id }) => id.startsWith('cross-lang-'))
      .map(({ id, lang }) => ({ id, lang })),
  ).toEqual([
    { id: 'cross-lang-en-to-zh', lang: undefined },
    { id: 'cross-lang-zh-to-en', lang: undefined },
  ])
  const hidden = suite.cases.filter(({ id }) => id.startsWith('hidden-'))
  expect(
    hidden.every(
      ({ expected }) =>
        expected.acceptable.length === 0 &&
        expected.forbidden.length === 1 &&
        expected.maxRank === suite.topK,
    ),
  ).toBe(true)

  const [
    searchSource,
    aiIndexSource,
    llmsSummary,
    llmsFull,
    draftHtml,
    disabledHtml,
  ] = await Promise.all([
    readFile(path.join(result.outDir, 'search-index.json'), 'utf8'),
    readFile(path.join(result.outDir, 'ai-index.json'), 'utf8'),
    readFile(path.join(result.outDir, 'llms.txt'), 'utf8'),
    readFile(path.join(result.outDir, 'llms-full.txt'), 'utf8'),
    readFile(
      path.join(result.outDir, 'eval-fixtures/draft-sentinel/index.html'),
      'utf8',
    ),
    readFile(
      path.join(
        result.outDir,
        'zh/eval-fixtures/ai-disabled-sentinel/index.html',
      ),
      'utf8',
    ),
  ])
  const search = JSON.parse(searchSource) as {
    index: { storedFields: Record<string, { route?: string }> }
  }
  const aiIndex = JSON.parse(aiIndexSource) as {
    pages: Array<{ route: string }>
  }
  const excludedRoutes = [
    '/eval-fixtures/draft-sentinel/',
    '/zh/eval-fixtures/ai-disabled-sentinel/',
  ]
  const searchRoutes = Object.values(search.index.storedFields).map(
    ({ route }) => route,
  )
  const aiRoutes = aiIndex.pages.map(({ route }) => route)

  expect(draftHtml).toContain('Quartz harbor lantern')
  expect(disabledHtml).toContain('星槎 雾港 灯塔')
  for (const route of excludedRoutes) {
    expect(searchRoutes).not.toContain(route)
    expect(aiRoutes).not.toContain(route)
  }
  for (const sentinel of ['Quartz harbor lantern', '星槎 雾港 灯塔']) {
    expect(aiIndexSource).not.toContain(sentinel)
    expect(llmsSummary).not.toContain(sentinel)
    expect(llmsFull).not.toContain(sentinel)
  }
  await expect(
    access(
      path.join(result.outDir, 'eval-fixtures/draft-sentinel/index.md'),
    ),
  ).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(
    access(
      path.join(
        result.outDir,
        'zh/eval-fixtures/ai-disabled-sentinel/index.md',
      ),
    ),
  ).rejects.toMatchObject({ code: 'ENOENT' })

  await expect(
    runAiEvaluation(path.resolve('website')),
  ).resolves.toMatchObject({
    schemaVersion: 3,
    ok: true,
    summary: { total: 24, passed: 24, failed: 0 },
  })
})
```

- [ ] **Step 4: Run the focused real-site build and evaluation**

Run:

```sh
pnpm exec vitest run \
  tests/theme/search.test.ts \
  tests/website.test.ts \
  --maxWorkers=1 \
  --no-file-parallelism
pnpm site:build
node dist/node/cli.js ai eval website --json
```

Expected: tests pass and the CLI prints schema 3 with
`"total": 24`, `"passed": 24`, and `"failed": 0`.

- [ ] **Step 5: Commit the official suite**

Run:

```sh
pnpm exec prettier --check \
  website/.silen/ai-evals.json \
  website/eval-fixtures/draft-sentinel/index.mdx \
  website/zh/eval-fixtures/ai-disabled-sentinel/index.mdx \
  tests/website.test.ts
git diff --check
git add \
  website/.silen/ai-evals.json \
  website/eval-fixtures/draft-sentinel/index.mdx \
  website/zh/eval-fixtures/ai-disabled-sentinel/index.mdx \
  tests/website.test.ts
git commit -m "test(ai): expand official retrieval suite"
```

Expected: one commit contains the two safe fixtures, suite, and official-site
proof only. Generated `website/.silen/dist` remains ignored.

### Task 5: Add the repository-only report-persisting gate runner

**Files:**

- Create: `tooling/site-ai-check.ts`
- Create: `tests/ai/site-ai-check-runner.test.ts`
- Modify: `package.json:59-70`
- Modify: `.gitignore`
- Modify: `tests/ai/site-quality-gate.test.ts`
- Modify: `tests/ai/ci-gate.test.ts:13-35`

**Interfaces:**

- Consumes: built CLI exits/output, existing `site:build` and `check:no-maps`
  scripts, Execa, and the schema 3 official suite.
- Produces: `SITE_AI_REPORT_PATH`, `SITE_AI_STAGES`,
  `SiteAiCheckDependencies`, `writeSiteAiReport`, and
  `runSiteAiCheck(dependencies?): Promise<number>`.

- [ ] **Step 1: Write the failing runner contract tests**

Create `tests/ai/site-ai-check-runner.test.ts`:

```ts
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  runSiteAiCheck,
  writeSiteAiReport,
  type SiteAiCheckDependencies,
  type SiteAiCheckStageResult,
} from '../../tooling/site-ai-check'

const roots: string[] = []
const report = '{"schemaVersion":3,"ok":true}\n'

function result(
  exitCode: number | undefined,
  stdout = '',
  overrides: Partial<SiteAiCheckStageResult> = {},
): SiteAiCheckStageResult {
  return {
    exitCode,
    stdout,
    isMaxBuffer: false,
    shortMessage: '',
    ...overrides,
  }
}

function harness(results: SiteAiCheckStageResult[]) {
  const stages: string[] = []
  const events: string[] = []
  const saved: string[] = []
  const stdout: string[] = []
  const stderr: string[] = []
  const queue = [...results]
  const dependencies: SiteAiCheckDependencies = {
    clearReport: vi.fn(async () => {
      events.push('clear')
    }),
    execute: vi.fn(async (stage) => {
      stages.push(stage.id)
      events.push(stage.id)
      const next = queue.shift()
      if (next === undefined) throw new Error('Missing staged result')
      return next
    }),
    saveReport: vi.fn(async (source) => {
      saved.push(source)
    }),
    writeStdout: vi.fn((source) => {
      stdout.push(source)
    }),
    writeStderr: vi.fn((source) => {
      stderr.push(source)
    }),
  }
  return { dependencies, events, saved, stages, stderr, stdout }
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('official site AI check runner', () => {
  it('clears stale evidence and runs the four fixed stages in order', async () => {
    const fixture = harness([
      result(0),
      result(0),
      result(0, report),
      result(0),
    ])

    await expect(runSiteAiCheck(fixture.dependencies)).resolves.toBe(0)
    expect(fixture.events).toEqual([
      'clear',
      'build',
      'audit',
      'eval',
      'no-maps',
    ])
    expect(fixture.saved).toEqual([report])
    expect(fixture.stdout).toEqual([report])
    expect(fixture.stderr).toEqual([])
  })

  it.each([1, 2])(
    'saves valid evaluation JSON and preserves exit %s',
    async (exitCode) => {
      const fixture = harness([
        result(0),
        result(0),
        result(exitCode, '{"schemaVersion":3,"ok":false}\n'),
      ])

      await expect(runSiteAiCheck(fixture.dependencies)).resolves.toBe(exitCode)
      expect(fixture.stages).toEqual(['build', 'audit', 'eval'])
      expect(fixture.saved).toEqual([
        '{"schemaVersion":3,"ok":false}\n',
      ])
      expect(fixture.stdout).toEqual([
        '{"schemaVersion":3,"ok":false}\n',
      ])
    },
  )

  it.each([
    ['build', [result(7)], ['build']],
    ['audit', [result(0), result(6)], ['build', 'audit']],
  ] as const)(
    'stops after a %s failure without saving a report',
    async (_name, results, expectedStages) => {
      const fixture = harness([...results])
      await expect(runSiteAiCheck(fixture.dependencies)).resolves.toBe(
        results.at(-1)?.exitCode,
      )
      expect(fixture.stages).toEqual(expectedStages)
      expect(fixture.saved).toEqual([])
    },
  )

  it.each([
    ['empty', result(0, '')],
    ['array', result(0, '[]\n')],
    ['missing fields', result(0, '{}\n')],
    ['unexpected exit', result(3, report)],
    ['oversized', result(undefined, '', { isMaxBuffer: true })],
    [
      'signal',
      result(undefined, '', {
        signal: 'SIGTERM',
        shortMessage: 'Command was terminated',
      }),
    ],
  ] as const)(
    'returns setup exit 2 and saves nothing for %s evaluation output',
    async (_name, evaluation) => {
      const fixture = harness([result(0), result(0), evaluation])
      await expect(runSiteAiCheck(fixture.dependencies)).resolves.toBe(2)
      expect(fixture.saved).toEqual([])
      expect(fixture.stderr.join('')).toContain('Silen site AI check')
    },
  )

  it('keeps the report when the final source-map guard fails', async () => {
    const fixture = harness([
      result(0),
      result(0),
      result(0, report),
      result(9),
    ])

    await expect(runSiteAiCheck(fixture.dependencies)).resolves.toBe(9)
    expect(fixture.saved).toEqual([report])
  })

  it('turns dependency failures into focused setup failures', async () => {
    const clearFixture = harness([])
    const clearDependencies: SiteAiCheckDependencies = {
      ...clearFixture.dependencies,
      clearReport: vi.fn(async () => {
        throw new Error('clear failed')
      }),
    }
    await expect(runSiteAiCheck(clearDependencies)).resolves.toBe(2)
    expect(clearFixture.stages).toEqual([])

    const executeFixture = harness([])
    const executeDependencies: SiteAiCheckDependencies = {
      ...executeFixture.dependencies,
      execute: vi.fn(async () => {
        throw new Error('spawn failed')
      }),
    }
    await expect(runSiteAiCheck(executeDependencies)).resolves.toBe(2)

    const saveFixture = harness([
      result(0),
      result(0),
      result(0, report),
    ])
    const saveDependencies: SiteAiCheckDependencies = {
      ...saveFixture.dependencies,
      saveReport: vi.fn(async () => {
        throw new Error('write failed')
      }),
    }
    await expect(runSiteAiCheck(saveDependencies)).resolves.toBe(2)
    expect(saveFixture.stages).toEqual(['build', 'audit', 'eval'])
    for (const fixture of [clearFixture, executeFixture, saveFixture]) {
      expect(fixture.stderr.join('')).toContain('Silen site AI check')
    }
  })

  it('writes a report atomically and removes its temporary sibling', async () => {
    await mkdir(path.resolve('.silen/.temp/tests'), { recursive: true })
    const root = await mkdtemp(
      path.resolve('.silen/.temp/tests/site-ai-report-'),
    )
    roots.push(root)
    const destination = path.join(root, 'artifacts/ai-eval/report.json')

    await writeSiteAiReport(destination, report)

    expect(await readFile(destination, 'utf8')).toBe(report)
    expect(await readdir(path.dirname(destination))).toEqual(['report.json'])
  })
})
```

Run:

```sh
pnpm exec vitest run tests/ai/site-ai-check-runner.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because `tooling/site-ai-check.ts` does not exist.

- [ ] **Step 2: Implement the fixed runner and atomic report writer**

Create `tooling/site-ai-check.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

export const SITE_AI_REPORT_PATH = path.resolve(
  'artifacts/ai-eval/site-ai-eval.json',
)
export const SITE_AI_REPORT_MAXIMUM_BYTES = 16 * 1024 * 1024

export interface SiteAiCheckStage {
  readonly id: 'build' | 'audit' | 'eval' | 'no-maps'
  readonly command: string
  readonly args: readonly string[]
  readonly captureStdout: boolean
}

export interface SiteAiCheckStageResult {
  readonly exitCode: number | undefined
  readonly stdout: string
  readonly isMaxBuffer: boolean
  readonly shortMessage: string
  readonly signal?: string
}

export interface SiteAiCheckDependencies {
  readonly clearReport: () => Promise<void>
  readonly execute: (
    stage: SiteAiCheckStage,
  ) => Promise<SiteAiCheckStageResult>
  readonly saveReport: (source: string) => Promise<void>
  readonly writeStdout: (source: string) => void
  readonly writeStderr: (source: string) => void
}

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

export const SITE_AI_STAGES: readonly SiteAiCheckStage[] = [
  {
    id: 'build',
    command: pnpmCommand,
    args: ['site:build'],
    captureStdout: false,
  },
  {
    id: 'audit',
    command: process.execPath,
    args: ['dist/node/cli.js', 'ai', 'audit', 'website'],
    captureStdout: false,
  },
  {
    id: 'eval',
    command: process.execPath,
    args: ['dist/node/cli.js', 'ai', 'eval', 'website', '--json'],
    captureStdout: true,
  },
  {
    id: 'no-maps',
    command: pnpmCommand,
    args: ['check:no-maps', 'dist', 'website/.silen/dist'],
    captureStdout: false,
  },
]

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function assertReportDocument(source: string): void {
  if (Buffer.byteLength(source, 'utf8') > SITE_AI_REPORT_MAXIMUM_BYTES) {
    throw new TypeError('AI evaluation JSON exceeds 16 MiB')
  }
  const value: unknown = JSON.parse(source)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('AI evaluation output must be one JSON object')
  }
  const document = value as Record<string, unknown>
  if (
    typeof document.schemaVersion !== 'number' ||
    !Number.isInteger(document.schemaVersion) ||
    document.schemaVersion <= 0 ||
    typeof document.ok !== 'boolean'
  ) {
    throw new TypeError(
      'AI evaluation JSON requires positive schemaVersion and boolean ok',
    )
  }
}

export async function writeSiteAiReport(
  destination: string,
  source: string,
): Promise<void> {
  const directory = path.dirname(destination)
  const temporary = path.join(
    directory,
    `.${path.basename(destination)}.${randomUUID()}.tmp`,
  )
  await mkdir(directory, { recursive: true })
  try {
    await writeFile(temporary, source, 'utf8')
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
}

async function executeStage(
  stage: SiteAiCheckStage,
): Promise<SiteAiCheckStageResult> {
  const completed = await execa(stage.command, [...stage.args], {
    encoding: 'utf8',
    maxBuffer: SITE_AI_REPORT_MAXIMUM_BYTES,
    reject: false,
    shell: false,
    stdin: 'inherit',
    stdout: stage.captureStdout ? 'pipe' : 'inherit',
    stderr: 'inherit',
    stripFinalNewline: false,
  })
  return {
    exitCode: completed.exitCode,
    stdout: typeof completed.stdout === 'string' ? completed.stdout : '',
    isMaxBuffer: completed.isMaxBuffer === true,
    shortMessage: completed.shortMessage ?? '',
    ...(completed.signal === undefined ? {} : { signal: completed.signal }),
  }
}

const defaultDependencies: SiteAiCheckDependencies = {
  clearReport: async () => rm(SITE_AI_REPORT_PATH, { force: true }),
  execute: executeStage,
  saveReport: async (source) =>
    writeSiteAiReport(SITE_AI_REPORT_PATH, source),
  writeStdout: (source) => process.stdout.write(source),
  writeStderr: (source) => process.stderr.write(source),
}

function runnerFailure(
  dependencies: SiteAiCheckDependencies,
  message: string,
): 2 {
  dependencies.writeStderr(`Silen site AI check: ${message}\n`)
  return 2
}

export async function runSiteAiCheck(
  dependencies: SiteAiCheckDependencies = defaultDependencies,
): Promise<number> {
  try {
    await dependencies.clearReport()
  } catch (error) {
    return runnerFailure(
      dependencies,
      `unable to clear the previous report: ${errorDetail(error)}`,
    )
  }

  for (const stage of SITE_AI_STAGES) {
    let completed: SiteAiCheckStageResult
    try {
      completed = await dependencies.execute(stage)
    } catch (error) {
      return runnerFailure(
        dependencies,
        `${stage.id} could not start: ${errorDetail(error)}`,
      )
    }

    if (!stage.captureStdout) {
      if (completed.exitCode === 0) continue
      if (completed.exitCode !== undefined) return completed.exitCode
      return runnerFailure(
        dependencies,
        `${stage.id} did not return an exit code: ${
          completed.shortMessage || completed.signal || 'unknown failure'
        }`,
      )
    }

    if (completed.stdout) dependencies.writeStdout(completed.stdout)
    if (completed.isMaxBuffer) {
      return runnerFailure(
        dependencies,
        'evaluation output exceeded the 16 MiB report limit',
      )
    }
    if (
      completed.exitCode !== 0 &&
      completed.exitCode !== 1 &&
      completed.exitCode !== 2
    ) {
      return runnerFailure(
        dependencies,
        `evaluation returned an unexpected result: ${
          completed.shortMessage ||
          completed.signal ||
          String(completed.exitCode)
        }`,
      )
    }

    try {
      assertReportDocument(completed.stdout)
      await dependencies.saveReport(completed.stdout)
    } catch (error) {
      return runnerFailure(
        dependencies,
        `evaluation report was not persisted: ${errorDetail(error)}`,
      )
    }
    if (completed.exitCode !== 0) return completed.exitCode
  }

  return 0
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await runSiteAiCheck()
}
```

- [ ] **Step 3: Run the runner tests and typecheck**

Run:

```sh
pnpm exec vitest run tests/ai/site-ai-check-runner.test.ts --maxWorkers=1 --no-file-parallelism
pnpm typecheck
```

Expected: PASS. If Execa's inferred stdout type needs narrowing, preserve the
shown runtime `typeof` check; do not loosen TypeScript or switch on a shell.

- [ ] **Step 4: Add canonical scripts and ignore generated evidence**

Add this root-only line to `.gitignore`:

```gitignore
/artifacts/
```

Replace the relevant `package.json` scripts with:

```json
{
  "site:build": "pnpm build && node dist/node/cli.js build website",
  "site:ai-check": "jiti tooling/site-ai-check.ts",
  "site:check": "pnpm site:ai-check",
  "site:dev": "pnpm build && node dist/node/cli.js dev website",
  "pretest": "pnpm build",
  "test": "pnpm test:run",
  "test:run": "vitest run --maxWorkers=1 --no-file-parallelism"
}
```

Do not change dependency or lockfile entries.

- [ ] **Step 5: Update local gate and test-script contracts**

Replace `tests/ai/site-quality-gate.test.ts` with:

```ts
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SITE_AI_REPORT_PATH,
  SITE_AI_STAGES,
} from '../../tooling/site-ai-check'

describe('official deterministic site quality gate', () => {
  it('defines one canonical local runner and one compatibility alias', async () => {
    const [packageSource, runnerSource] = await Promise.all([
      readFile('package.json', 'utf8'),
      readFile('tooling/site-ai-check.ts', 'utf8'),
    ])
    const packageJson = JSON.parse(packageSource) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts['site:ai-check']).toBe(
      'jiti tooling/site-ai-check.ts',
    )
    expect(packageJson.scripts['site:check']).toBe('pnpm site:ai-check')
    expect(packageJson.scripts.pretest).toBe('pnpm build')
    expect(packageJson.scripts.test).toBe('pnpm test:run')
    expect(packageJson.scripts['test:run']).toBe(
      'vitest run --maxWorkers=1 --no-file-parallelism',
    )
    expect(SITE_AI_STAGES.map(({ id }) => id)).toEqual([
      'build',
      'audit',
      'eval',
      'no-maps',
    ])
    expect(SITE_AI_STAGES.map(({ args }) => args)).toEqual([
      ['site:build'],
      ['dist/node/cli.js', 'ai', 'audit', 'website'],
      ['dist/node/cli.js', 'ai', 'eval', 'website', '--json'],
      ['check:no-maps', 'dist', 'website/.silen/dist'],
    ])
    expect(SITE_AI_REPORT_PATH).toBe(
      path.resolve('artifacts/ai-eval/site-ai-eval.json'),
    )
    expect(runnerSource).toContain('shell: false')
    for (const forbidden of [
      'ai init',
      'ai index',
      ' mcp ',
      '--allow-write',
      'curl ',
      'http://',
      'https://',
    ]) {
      expect(runnerSource, forbidden).not.toContain(forbidden)
    }
  })

  it('keeps the existing Pages alias until workflow promotion', async () => {
    const [pages, ci, publish] = await Promise.all([
      readFile('.github/workflows/pages.yml', 'utf8'),
      readFile('.github/workflows/ci.yml', 'utf8'),
      readFile('.github/workflows/publish.yml', 'utf8'),
    ])
    expect(pages).toContain('run: pnpm site:check')
    expect(ci).not.toContain('pnpm site:ai-check')
    expect(publish).not.toContain('pnpm site:ai-check')
  })
})
```

In `tests/ai/ci-gate.test.ts`, expand the package script type and assertions:

```ts
const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
  scripts: { test: string; 'test:run': string }
}
```

Replace the old exact `scripts.test` assertion with:

```ts
expect(packageJson.scripts.test).toBe('pnpm test:run')
expect(packageJson.scripts['test:run']).toBe(
  'vitest run --maxWorkers=1 --no-file-parallelism',
)
```

- [ ] **Step 6: Run focused repository contracts and the real gate**

Run:

```sh
pnpm exec vitest run \
  tests/ai/site-ai-check-runner.test.ts \
  tests/ai/site-quality-gate.test.ts \
  tests/ai/ci-gate.test.ts \
  --maxWorkers=1 \
  --no-file-parallelism
env \
  -u OPENAI_API_KEY \
  -u ANTHROPIC_API_KEY \
  -u GOOGLE_API_KEY \
  -u AZURE_OPENAI_API_KEY \
  pnpm site:ai-check
node --input-type=module <<'NODE'
import { readFile } from 'node:fs/promises'
const report = JSON.parse(
  await readFile('artifacts/ai-eval/site-ai-eval.json', 'utf8'),
)
if (report.schemaVersion !== 3 || !report.ok || report.summary.total !== 24) {
  throw new Error('Unexpected saved report')
}
console.log('saved site AI report OK')
NODE
```

Expected: focused tests pass, the provider-free gate exits 0, and the final
line is `saved site AI report OK`. `artifacts/` does not appear in Git status.

- [ ] **Step 7: Commit the local runner**

Run:

```sh
pnpm exec prettier --check \
  tooling/site-ai-check.ts \
  tests/ai/site-ai-check-runner.test.ts \
  tests/ai/site-quality-gate.test.ts \
  tests/ai/ci-gate.test.ts \
  package.json \
  .gitignore
git diff --check
git add \
  tooling/site-ai-check.ts \
  tests/ai/site-ai-check-runner.test.ts \
  tests/ai/site-quality-gate.test.ts \
  tests/ai/ci-gate.test.ts \
  package.json \
  .gitignore
git commit -m "feat(quality): persist site AI evaluation reports"
```

Expected: no dependency or lockfile change; one runner-focused commit.

### Task 6: Enforce the gate in CI, Pages, and npm release

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/pages.yml`
- Modify: `.github/workflows/publish.yml`
- Modify: `tests/ai/site-quality-gate.test.ts`
- Modify: `tests/ai/ci-gate.test.ts`
- Modify: `tests/ai/npm-publish-workflow.test.ts`

- [ ] **Step 1: Replace the transitional workflow test with the final contract**

In `tests/ai/site-quality-gate.test.ts`, keep the first runner/script test from
Task 5 and replace the transitional second test with:

```ts
  it('enforces the canonical gate and uploads its report in every workflow', async () => {
    const [pages, ci, publish] = await Promise.all([
      readFile('.github/workflows/pages.yml', 'utf8'),
      readFile('.github/workflows/ci.yml', 'utf8'),
      readFile('.github/workflows/publish.yml', 'utf8'),
    ])

    for (const [name, artifactName, workflow] of [
      ['Pages', 'silen-ai-eval-pages', pages],
      ['CI', 'silen-ai-eval-ci', ci],
      ['publish', 'silen-ai-eval-publish', publish],
    ] as const) {
      expect(occurrenceCount(workflow, 'pnpm site:ai-check'), name).toBe(1)
      expect(workflow, name).toContain('if: ${{ always() }}')
      expect(workflow, name).toContain('uses: actions/upload-artifact@v7')
      expect(workflow, name).toContain(
        'path: artifacts/ai-eval/site-ai-eval.json',
      )
      expect(workflow, name).toContain(`name: ${artifactName}`)
      expect(workflow, name).toContain('if-no-files-found: ignore')
      expect(workflow, name).toContain('retention-days: 90')
      expect(workflow.indexOf('pnpm site:ai-check'), name).toBeLessThan(
        workflow.indexOf('uses: actions/upload-artifact@v7'),
      )
    }

    expect(pages).not.toContain('run: pnpm site:check')
    expect(pages).not.toContain('run: pnpm site:build')
    expect(pages).toContain("- 'tooling/**'")
    expect(pages.indexOf('pnpm site:ai-check')).toBeLessThan(
      pages.indexOf(
        'test -f website/.silen/dist/.well-known/silen/manifest.json',
      ),
    )
    expect(ci).not.toContain('run: pnpm site:check')
    expect(publish).not.toContain('run: pnpm site:check')
  })
```

Run:

```sh
pnpm exec vitest run tests/ai/site-quality-gate.test.ts \
  --maxWorkers=1 \
  --no-file-parallelism
```

Expected: FAIL because none of the workflows yet uses the canonical command or
uploads the report.

- [ ] **Step 2: Add a dedicated AI-readiness job to core CI**

In `.github/workflows/ci.yml`, insert this job after `runtime-release` and
before `browser`:

```yaml
  ai-readiness:
    name: Official AI readiness gate (Node 22.12.0)
    needs: quality
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - name: Check out repository
        uses: actions/checkout@v6

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 22.12.0

      - name: Install pinned pnpm
        run: npm install --global pnpm@10.34.0

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run official AI readiness gate
        run: pnpm site:ai-check

      - name: Upload AI evaluation report
        if: ${{ always() }}
        uses: actions/upload-artifact@v7
        with:
          name: silen-ai-eval-ci
          path: artifacts/ai-eval/site-ai-eval.json
          if-no-files-found: ignore
          retention-days: 90
```

This is intentionally a separate Node 22.12.0 job: the existing runtime matrix
continues to prove package compatibility on both supported Node lines, while the
official website evaluation runs exactly once per push or pull request.

- [ ] **Step 3: Strengthen the CI workflow regression test**

In `tests/ai/ci-gate.test.ts`, read the new job:

```ts
const aiReadiness = job(workflow, 'ai-readiness')
```

After the runtime assertions, add:

```ts
    expect(aiReadiness).toContain('needs: quality')
    expect(aiReadiness).toContain('node-version: 22.12.0')
    expect(aiReadiness).toContain('run: pnpm site:ai-check')
    expect(aiReadiness).not.toContain('pnpm site:build')
    expect(aiReadiness).toContain('if: ${{ always() }}')
    expect(aiReadiness).toContain('uses: actions/upload-artifact@v7')
    expect(aiReadiness).toContain('name: silen-ai-eval-ci')
    expect(aiReadiness).toContain(
      'path: artifacts/ai-eval/site-ai-eval.json',
    )
    expect(aiReadiness).toContain('if-no-files-found: ignore')
    expect(aiReadiness).toContain('retention-days: 90')
    expect(aiReadiness.indexOf('pnpm site:ai-check')).toBeLessThan(
      aiReadiness.indexOf('actions/upload-artifact@v7'),
    )
```

Update the pinned-pnpm occurrence expectation from `3` to `4`, and add:

```ts
expect(workflow.match(/pnpm site:ai-check/g)).toHaveLength(1)
```

Keep the existing assertions that the runtime matrix, browser job, one static
gate, one package-test invocation, and one Playwright invocation are unchanged.

- [ ] **Step 4: Promote Pages from the alias to the canonical gate**

In `.github/workflows/pages.yml`, add the runner source to the push path filter:

```yaml
      - 'tooling/**'
```

Replace the website gate step with:

```yaml
      - name: Run official AI readiness gate
        run: pnpm site:ai-check

      - name: Upload AI evaluation report
        if: ${{ always() }}
        uses: actions/upload-artifact@v7
        with:
          name: silen-ai-eval-pages
          path: artifacts/ai-eval/site-ai-eval.json
          if-no-files-found: ignore
          retention-days: 90
```

Leave the manifest assertion, Pages configuration, website artifact upload, and
deployment steps after the report upload.

- [ ] **Step 5: Make the release workflow consume the canonical gate**

In `.github/workflows/publish.yml`, keep the static checks and replace the
standalone build step with:

```yaml
      - name: Run official AI readiness gate
        run: pnpm site:ai-check

      - name: Upload AI evaluation report
        if: ${{ always() }}
        uses: actions/upload-artifact@v7
        with:
          name: silen-ai-eval-publish
          path: artifacts/ai-eval/site-ai-eval.json
          if-no-files-found: ignore
          retention-days: 90
```

Change the release-test command to avoid rebuilding the package:

```yaml
      - name: Run release tests
        run: pnpm test:run
```

Delete the standalone `Assert package has no source maps` step. The canonical
gate already performs package and website map checks as its last stage. Preserve
this final order:

1. static checks;
2. `site:ai-check`;
3. report upload with `always()`;
4. `test:run`;
5. `publint`;
6. `npm publish`.

- [ ] **Step 6: Update the npm-release workflow test**

In `tests/ai/npm-publish-workflow.test.ts`, replace the old build/test/no-map
assertions with:

```ts
    expect(workflow).toContain('run: pnpm site:ai-check')
    expect(workflow).toContain('if: ${{ always() }}')
    expect(workflow).toContain('uses: actions/upload-artifact@v7')
    expect(workflow).toContain('name: silen-ai-eval-publish')
    expect(workflow).toContain(
      'path: artifacts/ai-eval/site-ai-eval.json',
    )
    expect(workflow).toContain('if-no-files-found: ignore')
    expect(workflow).toContain('retention-days: 90')
    expect(workflow).toContain('run: pnpm test:run')
    expect(workflow).not.toContain('run: pnpm build')
    expect(workflow).not.toContain('run: pnpm test\n')
    expect(workflow).not.toContain('pnpm check:no-maps')
```

Replace the old ordering block with:

```ts
    const gate = workflow.indexOf('run: pnpm site:ai-check')
    const report = workflow.indexOf('uses: actions/upload-artifact@v7')
    const releaseTests = workflow.indexOf('run: pnpm test:run')
    const publint = workflow.indexOf('pnpm exec publint')
    const publish = workflow.indexOf('npm publish --access public --tag latest')

    expect(report).toBeGreaterThan(gate)
    expect(releaseTests).toBeGreaterThan(report)
    expect(publint).toBeGreaterThan(releaseTests)
    expect(publish).toBeGreaterThan(publint)
```

Retain the trusted-publishing assertions: `id-token: write`, npm 11.12.1,
registry URL, no `NODE_AUTH_TOKEN`, and no `NPM_TOKEN`.

- [ ] **Step 7: Run focused workflow tests**

Run:

```sh
pnpm exec vitest run \
  tests/ai/site-quality-gate.test.ts \
  tests/ai/ci-gate.test.ts \
  tests/ai/npm-publish-workflow.test.ts \
  --maxWorkers=1 \
  --no-file-parallelism
```

Expected: all workflow contract tests pass.

- [ ] **Step 8: Commit the workflow promotion**

Run:

```sh
pnpm exec prettier --check \
  .github/workflows/ci.yml \
  .github/workflows/pages.yml \
  .github/workflows/publish.yml \
  tests/ai/site-quality-gate.test.ts \
  tests/ai/ci-gate.test.ts \
  tests/ai/npm-publish-workflow.test.ts
git diff --check
git add \
  .github/workflows/ci.yml \
  .github/workflows/pages.yml \
  .github/workflows/publish.yml \
  tests/ai/site-quality-gate.test.ts \
  tests/ai/ci-gate.test.ts \
  tests/ai/npm-publish-workflow.test.ts
git commit -m "ci: enforce official AI readiness gate"
```

Expected: the canonical gate is release-enforced in all three workflows, with
one uniquely named 90-day report artifact per workflow.

### Task 7: Document schema v3 and the release-enforced gate

**Files:**

- Modify: `README.md`
- Modify: `website/ai/index.mdx`
- Modify: `website/zh/ai/index.mdx`
- Modify: `website/ai/local-workspace-mcp/index.mdx`
- Modify: `website/zh/ai/local-workspace-mcp/index.mdx`
- Modify: `website/guide/cli-deployment/index.mdx`
- Modify: `website/zh/guide/cli-deployment/index.mdx`
- Modify: `website/reference/index.mdx`
- Modify: `website/zh/reference/index.mdx`
- Modify: `tests/ai/documentation.test.ts`

- [ ] **Step 1: Tighten the documentation contract first**

In the first test in `tests/ai/documentation.test.ts`, require all eight
evaluator guides to name the v3 target sets as well as the existing rank fields:

```ts
    for (const document of documents) {
      for (const value of [
        '.silen/ai-evals.json',
        'schemaVersion',
        'acceptable',
        'forbidden',
        'maxRank',
        'topK',
        'matchedRank',
      ]) {
        expect(document).toContain(value)
      }
    }
```

Add a new test for the repository gate:

```ts
  it('documents the canonical release gate and stable report', async () => {
    const documents = await Promise.all(
      [
        'README.md',
        'website/ai/index.mdx',
        'website/zh/ai/index.mdx',
        'website/guide/cli-deployment/index.mdx',
        'website/zh/guide/cli-deployment/index.mdx',
      ].map((file) => readFile(file, 'utf8')),
    )

    for (const document of documents) {
      expect(document).toContain('site:ai-check')
      expect(document).toContain('artifacts/ai-eval/site-ai-eval.json')
    }
  })
```

Run:

```sh
pnpm exec vitest run tests/ai/documentation.test.ts \
  --maxWorkers=1 \
  --no-file-parallelism
```

Expected: FAIL until every English/Chinese guide is synchronized.

- [ ] **Step 2: Update the README maintainer workflow**

In `README.md`, replace the two current official-site sentences under
`## Contributing` with this exact text:

```md
For official-site changes, run `pnpm site:ai-check`. It runs `site:build`,
`ai audit`, `ai eval`, and `check:no-maps` in order, then saves the evaluator's
exact JSON as `artifacts/ai-eval/site-ai-eval.json`. The ignored local report
is uploaded by Core CI, GitHub Pages, and npm release for ranking-drift review.
`pnpm site:check` remains a compatibility alias for the same gate.

The gate is deterministic, model-free, credential-free, and read-only with
respect to source content.
```

Do not add a changelog entry or version bump; QUAL-003 changes repository policy,
not the published package version.

- [ ] **Step 3: Update the bilingual AI overview**

In `website/ai/index.mdx`, replace the complete `## Model-free quality gate`
section, stopping before `## Ask AI`, with:

````md
## Model-free quality gate

Use the production search index itself as a deterministic retrieval contract:

```sh
pnpm silen build docs
pnpm silen ai audit docs
pnpm silen ai eval docs
```

`ai eval` reads the committed `.silen/ai-evals.json` suite and built
`.silen/dist/search-index.json`; it never calls a model or the network. Exit
codes `0`, `1`, and `2` mean pass, retrieval failure, and setup failure.

Version 1 keeps whole-`topK` matching. Version 2 adds optional
`expected.maxRank` and reports its effective value plus `matchedRank`. Strict
`"schemaVersion": 3` requires both target arrays and an explicit rank bound:

```json
{
  "schemaVersion": 3,
  "topK": 5,
  "cases": [
    {
      "id": "install-quick-start",
      "query": "How do I install and start a site?",
      "expected": {
        "acceptable": [
          { "route": "/guide/", "heading": "Quick start" },
          { "route": "/guide/cli-deployment/" }
        ],
        "forbidden": [{ "route": "/draft-notes/" }],
        "maxRank": 1
      }
    }
  ]
}
```

`acceptable` and `forbidden` are both present arrays with zero to 20 targets;
at least one must be non-empty. At least one acceptable target must appear at
or before `maxRank`, and every forbidden target must stay out of the diagnostic Top K. A
negative-only case uses `acceptable: []` and `maxRank: topK`. Unknown fields,
overlapping targets, an empty combined target set, and invalid bounds are setup
errors. Version 3 keeps authored case order and exposes `matchedRank` plus
`forbiddenMatches`; v1 and v2 JSON and human output remain compatible.

For this repository, `pnpm site:ai-check` runs build, audit, evaluation, and
source-map checks once. It saves the exact JSON report to
`artifacts/ai-eval/site-ai-eval.json` for CI, Pages, and release comparison.

The rebuildable `.silen/ai/index.json` workspace snapshot is optional. A
missing or stale snapshot appears as an audit notice while MCP search continues
to run from its in-memory index.
````

In `website/zh/ai/index.mdx`, replace the complete `## 无模型质量门禁` section,
stopping before `## Ask AI`, with:

````md
## 无模型质量门禁

直接把生产搜索索引作为确定性的检索契约：

```sh
pnpm silen build docs
pnpm silen ai audit docs
pnpm silen ai eval docs
```

`ai eval` 只读取已提交的 `.silen/ai-evals.json` 与构建生成的
`.silen/dist/search-index.json`，不会调用模型或网络。退出码 `0`、`1`、`2`
分别表示通过、检索失败、初始化或配置失败。

版本 1 保持完整 `topK` 匹配；版本 2 增加可选的 `expected.maxRank`，并报告
生效值与 `matchedRank`。严格的 `"schemaVersion": 3` 要求两个目标数组与显式
排名边界：

```json
{
  "schemaVersion": 3,
  "topK": 5,
  "cases": [
    {
      "id": "install-quick-start",
      "query": "如何安装并启动站点？",
      "expected": {
        "acceptable": [
          { "route": "/zh/guide/", "heading": "快速开始" },
          { "route": "/zh/guide/cli-deployment/" }
        ],
        "forbidden": [{ "route": "/zh/draft-notes/" }],
        "maxRank": 1
      }
    }
  ]
}
```

`acceptable` 与 `forbidden` 都必须出现，每个数组可包含零到 20 个目标，但两者
不能同时为空。至少一个可接受目标必须在 `maxRank` 以内出现，所有禁止目标都不能
进入诊断 Top K。纯负例使用 `acceptable: []` 与 `maxRank: topK`。未知字段、
重叠目标、空目标集合和非法边界都会成为初始化错误。版本 3 保持案例编写顺序，
并输出 `matchedRank` 与 `forbiddenMatches`；v1/v2 的 JSON 与人类可读输出保持
兼容。

本仓库使用 `pnpm site:ai-check` 一次完成构建、审计、评测和 source map 检查，
并把评测器的原始 JSON 保存到
`artifacts/ai-eval/site-ai-eval.json`，供 CI、Pages 与发布流程比较。

可重建的 `.silen/ai/index.json` 只是可选工作区快照。缺失或过期只会成为 audit
提示，MCP 搜索仍使用内存索引。
````

- [ ] **Step 4: Update the bilingual local workspace and MCP guide**

In `website/ai/local-workspace-mcp/index.mdx`, replace the prose after the
command block in `## Build, audit, and evaluate`, stopping before
`## Connect an MCP client`, with:

```md
`ai eval` reads `.silen/ai-evals.json` and the production
`.silen/dist/search-index.json`; it neither starts MCP nor calls a model or the
network. Version 1 uses one route and optional heading within `topK`. Version 2
adds optional `expected.maxRank`. Strict `"schemaVersion": 3` requires present
`acceptable` and `forbidden` arrays, at least one target between them, and an
explicit `maxRank` from 1 through `topK`. Negative-only cases use
`acceptable: []` and `maxRank: topK`.

Version 3 reports `matchedRank: null` when no acceptable target appears and
lists prohibited hits in `forbiddenMatches`. Exit `0` means every case passed,
exit `1` means a retrieval expectation failed, and exit `2` means the suite or
input is invalid. The full diagnostic Top K remains in stable case order.

For the Silen repository, `pnpm site:ai-check` composes the complete read-only
gate and saves exact evaluation JSON at
`artifacts/ai-eval/site-ai-eval.json`. The optional `.silen/ai/index.json`
snapshot remains non-blocking and does not replace the production search index.
```

In `website/zh/ai/local-workspace-mcp/index.mdx`, replace the corresponding
prose after the command block in `## 构建、审计与评测`, stopping before
`## 连接 MCP 客户端`, with:

```md
`ai eval` 读取 `.silen/ai-evals.json` 与生产构建的
`.silen/dist/search-index.json`；它不会启动 MCP，也不会调用模型或网络。版本 1
在 `topK` 内使用单一路由与可选标题；版本 2 增加可选的
`expected.maxRank`。严格的 `"schemaVersion": 3` 要求同时提供
`acceptable` 与 `forbidden` 数组、两者至少包含一个目标，并显式设置 1 到
`topK` 之间的 `maxRank`。纯负例使用 `acceptable: []` 与
`maxRank: topK`。

版本 3 在没有可接受目标时报告 `matchedRank: null`，并把禁止命中列入
`forbiddenMatches`。退出码 `0` 表示全部通过，`1` 表示检索预期失败，`2`
表示套件或输入无效；完整诊断 Top K 保持稳定的案例顺序。

Silen 仓库使用 `pnpm site:ai-check` 组合完整只读门禁，并把评测原始 JSON
保存到 `artifacts/ai-eval/site-ai-eval.json`。可选的
`.silen/ai/index.json` 快照仍是非阻断能力，不会替代生产搜索索引。
```

Do not imply the evaluator calls a model, opens a network connection, starts MCP,
or grants write access.

- [ ] **Step 5: Update the bilingual deployment guide**

In `website/guide/cli-deployment/index.mdx`, replace the complete
`## Release check` section, stopping before the final Reference link, with:

````md
## Release check

Repository maintainers run one canonical command:

```sh
pnpm site:ai-check
```

It executes `site:build` -> `ai audit` -> `ai eval` -> `check:no-maps` once and
in order. `pnpm site:check` is a compatibility alias. Core CI, GitHub Pages,
and npm release all use the canonical command; an audit or evaluation failure
blocks deployment or publication.

The official `.silen/ai-evals.json` uses `"schemaVersion": 3`, explicit
`maxRank`, and present `acceptable` and `forbidden` target arrays. Reports keep
the diagnostic `topK`, stable `matchedRank`, and forbidden evidence. Each
workflow uploads `artifacts/ai-eval/site-ai-eval.json` with an always condition
when the evaluator produced valid JSON, including retrieval failures or a
later source-map failure.

Then preview a nested route directly, open a missing route, and inspect
`llms.txt` plus `.well-known/silen/manifest.json`. A successful build proves
files were generated; those direct checks prove the host serves them at the
expected base.

Ask AI remains endpoint-only. If no endpoint is configured, its control and
bundle are absent.
````

In `website/zh/guide/cli-deployment/index.mdx`, replace the complete
`## 上线前检查` section, stopping before the final Reference link, with:

````md
## 上线前检查

仓库维护者只运行一个规范命令：

```sh
pnpm site:ai-check
```

它依次且只执行一次 `site:build` -> `ai audit` -> `ai eval` ->
`check:no-maps`；`pnpm site:check` 只是兼容别名。Core CI、GitHub Pages 与
npm 发布都使用规范命令，audit 或评测失败会阻断部署和发布。

正式 `.silen/ai-evals.json` 使用 `"schemaVersion": 3`、显式
`maxRank`，以及必需的 `acceptable` 和 `forbidden` 目标数组。报告保留诊断
`topK`、稳定的 `matchedRank` 与禁止命中证据。只要评测器产出了有效 JSON，
每条工作流都会用 always 条件上传
`artifacts/ai-eval/site-ai-eval.json`，包括检索失败或后续 source map
检查失败的情况。

随后直接预览一个嵌套路由和一个不存在的路由，并检查 `llms.txt` 与
`.well-known/silen/manifest.json`。构建成功只证明文件已生成；直接访问才能
证明托管平台按预期 base 提供了它们。

Ask AI 仍然只通过端点接入；未配置端点时，不会出现控件或对应 bundle。
````

- [ ] **Step 6: Update the bilingual reference**

In `website/reference/index.mdx`, replace the complete
`## AI evaluation suites` section with:

```md
## AI evaluation suites

`.silen/ai-evals.json` is strict JSON. Version 1 matches one route and optional
heading within `topK`; version 2 adds optional `expected.maxRank`. Version 3
uses this strict shape:

| Field                 | Requirement                                                          |
| --------------------- | -------------------------------------------------------------------- |
| `schemaVersion`       | Exact integer `3`                                                    |
| `topK`                | Integer `1..20`                                                      |
| `cases`               | One to 500 ordered cases                                             |
| `expected.acceptable` | Required array of zero to 20 unique targets                          |
| `expected.forbidden`  | Required array of zero to 20 unique targets                          |
| `expected.maxRank`    | Required integer `1..topK`; exact `topK` for negative-only cases     |
| Target                | Strict `{ route, heading? }`; route starts with `/`                  |

At least one target array must be non-empty. Normalized duplicates, overlap
within an array, overlap between `acceptable` and `forbidden`, and unknown
fields are invalid. Version 3 reports preserve ordered `cases`, `matchedRank`,
`forbiddenMatches`, and full diagnostic Top K; v1/v2 behavior remains
compatible. Evaluation is read-only and model-free.

Repository maintainers run `pnpm site:ai-check`; its exact stable report is
`artifacts/ai-eval/site-ai-eval.json`.
```

In `website/zh/reference/index.mdx`, replace the complete `## AI 评测套件`
section with:

```md
## AI 评测套件

`.silen/ai-evals.json` 是严格 JSON。版本 1 在 `topK` 内匹配单一路由与可选
标题；版本 2 增加可选的 `expected.maxRank`。版本 3 使用以下严格结构：

| 字段                  | 要求                                                   |
| --------------------- | ------------------------------------------------------ |
| `schemaVersion`       | 精确整数 `3`                                           |
| `topK`                | 整数 `1..20`                                           |
| `cases`               | 1 到 500 个有序案例                                    |
| `expected.acceptable` | 必需数组，包含 0 到 20 个不重复目标                    |
| `expected.forbidden`  | 必需数组，包含 0 到 20 个不重复目标                    |
| `expected.maxRank`    | 必需整数 `1..topK`；纯负例必须精确等于 `topK`          |
| 目标                  | 严格 `{ route, heading? }`；route 以 `/` 开头          |

两个目标数组至少有一个非空。规范化后的重复、数组内部重叠、`acceptable` 与
`forbidden` 之间的重叠，以及未知字段都无效。版本 3 报告保留有序 `cases`、
`matchedRank`、`forbiddenMatches` 与完整诊断 Top K；v1/v2 行为保持兼容。
评测仍然只读且不依赖模型。

仓库维护者运行 `pnpm site:ai-check`；其精确稳定报告位于
`artifacts/ai-eval/site-ai-eval.json`。
```

- [ ] **Step 7: Run documentation and website checks**

Run:

```sh
pnpm exec vitest run \
  tests/ai/documentation.test.ts \
  tests/website.test.ts \
  --maxWorkers=1 \
  --no-file-parallelism
pnpm site:build
```

Expected: documentation contracts pass and the bilingual site builds without
broken links or MDX errors.

- [ ] **Step 8: Commit synchronized documentation**

Run:

```sh
pnpm exec prettier --check \
  README.md \
  website/ai/index.mdx \
  website/zh/ai/index.mdx \
  website/ai/local-workspace-mcp/index.mdx \
  website/zh/ai/local-workspace-mcp/index.mdx \
  website/guide/cli-deployment/index.mdx \
  website/zh/guide/cli-deployment/index.mdx \
  website/reference/index.mdx \
  website/zh/reference/index.mdx \
  tests/ai/documentation.test.ts
git diff --check
git add \
  README.md \
  website/ai/index.mdx \
  website/zh/ai/index.mdx \
  website/ai/local-workspace-mcp/index.mdx \
  website/zh/ai/local-workspace-mcp/index.mdx \
  website/guide/cli-deployment/index.mdx \
  website/zh/guide/cli-deployment/index.mdx \
  website/reference/index.mdx \
  website/zh/reference/index.mdx \
  tests/ai/documentation.test.ts
git commit -m "docs(ai): document release-enforced evaluation"
```

Expected: English and Chinese surfaces describe one consistent strict schema and
one repository gate.

### Task 8: Run final verification and ship QUAL-003 on the project map

**Files:**

- Modify: `docs/project-map.md`

- [ ] **Step 1: Run the focused QUAL-003 regression set**

Run:

```sh
pnpm exec vitest run \
  tests/ai/eval.test.ts \
  tests/theme/search.test.ts \
  tests/website.test.ts \
  tests/ai/site-ai-check-runner.test.ts \
  tests/ai/site-quality-gate.test.ts \
  tests/ai/ci-gate.test.ts \
  tests/ai/npm-publish-workflow.test.ts \
  tests/ai/documentation.test.ts \
  --maxWorkers=1 \
  --no-file-parallelism
```

Expected: evaluator, index exclusion, official suite, runner, workflows, and
documentation all pass together.

- [ ] **Step 2: Run every repository quality gate**

Run each command independently so a failure is attributable to one gate:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test:run
pnpm exec publint
pnpm check:no-maps dist
```

Expected: every command exits 0 on the declared local Node runtime. Do not hide
or combine failures.

- [ ] **Step 3: Prove the canonical gate is provider-free and deterministic**

Run:

```sh
env \
  -u OPENAI_API_KEY \
  -u ANTHROPIC_API_KEY \
  -u GOOGLE_API_KEY \
  -u AZURE_OPENAI_API_KEY \
  pnpm site:ai-check
SILEN_CHECKSUM_FILE="$(mktemp /tmp/silen-ai-eval-before.XXXXXX)"
trap 'rm -f "$SILEN_CHECKSUM_FILE"' EXIT
shasum -a 256 artifacts/ai-eval/site-ai-eval.json > "$SILEN_CHECKSUM_FILE"
env \
  -u OPENAI_API_KEY \
  -u ANTHROPIC_API_KEY \
  -u GOOGLE_API_KEY \
  -u AZURE_OPENAI_API_KEY \
  pnpm site:ai-check
shasum -a 256 -c "$SILEN_CHECKSUM_FILE"
```

Expected: both gates exit 0 and the checksum reports
`artifacts/ai-eval/site-ai-eval.json: OK`. The ignored report remains available
for local inspection but never enters the commit.

- [ ] **Step 4: Review the final report semantics**

Run:

```sh
node --input-type=module <<'NODE'
import { readFile } from 'node:fs/promises'

const report = JSON.parse(
  await readFile('artifacts/ai-eval/site-ai-eval.json', 'utf8'),
)
const requiredCategories = new Map([
  ['direct-', 6],
  ['natural-', 4],
  ['long-', 4],
  ['synonym-', 4],
  ['typo-', 2],
  ['cross-lang-', 2],
  ['hidden-', 2],
])

if (report.schemaVersion !== 3 || !report.ok || report.summary.total !== 24) {
  throw new Error('The final AI evaluation report is not the official v3 pass')
}
if (report.cases.some((result) => !result.ok)) {
  throw new Error('At least one official query failed')
}
for (const [category, count] of requiredCategories) {
  const actual = report.cases.filter((result) =>
    result.id.startsWith(category),
  ).length
  if (actual !== count) {
    throw new Error(`${category}: expected ${count}, received ${actual}`)
  }
}
console.log('official 24-case report semantics OK')
NODE
```

Expected: `official 24-case report semantics OK`.

- [ ] **Step 5: Move QUAL-003 from Active to Shipped**

In `docs/project-map.md`:

1. Remove the `QUAL-003` block from `## Active`.
2. Leave `## Active` with an explicit `No active item` statement and direct the
   next planning pass to refine AI-005 before promotion.
3. Keep `## Ready` empty; AI-005 remains a draft future item rather than being
   silently promoted.
4. Append `QUAL-003 — release-enforced AI readiness gate` to `## Shipped`, after
   AI-004.
5. Link the shipped item to:
   - the approved design spec;
   - this implementation plan;
   - `tooling/site-ai-check.ts`;
   - `src/ai/eval.ts`;
   - `website/.silen/ai-evals.json`;
   - all three workflow files;
   - the focused contract tests.
6. Record the actual outcome: strict v3 multi-target evaluation, 24 bilingual
   official cases, hidden-page search exclusion, Rank-1 critical checks, stable
   JSON artifact, and the gate enforced in CI/Pages/npm release.
7. Set the default next item to:
   `- Default next item: None; refine AI-005 before promotion.`

Use these exact Active and Ready bodies:

```md
## Active

No map-selected item is active. Refine `AI-005` before considering promotion.

## Ready

No item is ready for default implementation. `AI-005` remains a Candidate
until its MCP v2 migration design satisfies the promotion gate.
```

Append this exact shipped block immediately after AI-004:

```md
### QUAL-003 — Release-enforced AI readiness gate

- Outcome: One provider-free official-site gate blocks regressions in Core CI,
  GitHub Pages, and npm Publish while retaining comparable retrieval evidence.
- Horizon: `0.4.1`.
- Depends on: `QUAL-002` and `AI-004`.
- Entry gate: The composed Pages gate and ranked version 2 evaluator were
  already shipped; the approved QUAL-003 design bounded their promotion into
  release enforcement, richer expectations, and retained reports.
- Done when: Strict schema version 3 supports multiple acceptable and forbidden
  targets with explicit rank bounds while preserving v1/v2 bytes; the official
  24-case English/Chinese suite passes, including six Rank-1 critical queries
  and two AI-excluded negatives; production search honors `draft: true` and
  `ai: false`; `site:ai-check` saves deterministic JSON and gates CI, Pages,
  and npm Publish; and the complete provider-free repository verification is
  green.
- Evidence:
  [approved design](./superpowers/specs/2026-07-29-silen-release-enforced-ai-readiness-gate-design.md),
  [implementation plan](./superpowers/plans/2026-07-29-silen-release-enforced-ai-readiness-gate.md),
  [gate runner](../tooling/site-ai-check.ts),
  [evaluator](../src/ai/eval.ts),
  [official suite](../website/.silen/ai-evals.json),
  [Core CI](../.github/workflows/ci.yml),
  [Pages](../.github/workflows/pages.yml),
  [Publish](../.github/workflows/publish.yml),
  [evaluator tests](../tests/ai/eval.test.ts),
  [runner tests](../tests/ai/site-ai-check-runner.test.ts),
  [official-site tests](../tests/website.test.ts), and
  [workflow tests](../tests/ai/site-quality-gate.test.ts).
```

Do not mark AI-005 Active or Ready without a separately approved design.

- [ ] **Step 6: Verify the map and repository diff**

Run:

```sh
node --input-type=module <<'NODE'
import { readFile } from 'node:fs/promises'

const map = await readFile('docs/project-map.md', 'utf8')
const active = map.split('## Active')[1].split('## Ready')[0]
const ready = map.split('## Ready')[1].split('## Candidate')[0]
const shipped = map.split('## Shipped')[1]

if (active.includes('### QUAL-003')) throw new Error('QUAL-003 is still Active')
if (/^### /m.test(active)) throw new Error('Another item became Active')
if (/^### /m.test(ready)) throw new Error('Ready must remain empty')
if (!shipped.includes('### QUAL-003')) throw new Error('QUAL-003 is not Shipped')
if (!map.includes('None; refine AI-005 before promotion.')) {
  throw new Error('Default next item is incorrect')
}
console.log('project map state OK')
NODE
git diff --check
git status --short
```

Expected: map state passes; only `docs/project-map.md` is pending, while the
generated `artifacts/` directory remains ignored.

- [ ] **Step 7: Commit the shipped map state**

Run:

```sh
git add docs/project-map.md
git commit -m "docs: ship release-enforced AI readiness gate"
```

- [ ] **Step 8: Perform the final handoff check**

Run:

```sh
git status --short --branch
git log --oneline --decorate -12
```

Expected: the worktree is clean and `main` is ahead of `origin/main` by the new
local commits. Stop here: this plan does not authorize push, GitHub release, npm
publication, or Pages deployment.
