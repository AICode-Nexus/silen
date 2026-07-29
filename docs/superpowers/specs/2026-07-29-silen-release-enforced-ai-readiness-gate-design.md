# Silen Release-Enforced AI Readiness Gate Design

- Status: Approved
- Date: 2026-07-29
- Approved: 2026-07-29
- Repository: `AICode-Nexus/silen`
- Package: `@aicode-nexus/silen`
- Project map item: `QUAL-003`
- Horizon: `0.4.1`

## 1. Summary

Silen will promote its existing provider-free website checks into one
release-enforced AI readiness gate. The canonical repository command,
`pnpm site:ai-check`, will build the official site, audit its AI artifacts,
evaluate production retrieval, and reject source maps in that order. Core CI,
GitHub Pages, and npm Publish will all run the same gate.

The official evaluation suite will move to strict schema version 3 and grow
from 6 to 24 stable English and Chinese cases. Version 3 supports multiple
acceptable targets, forbidden targets, and a required `maxRank` on every case.
The suite covers direct and natural questions, long phrasing, synonyms, typos,
cross-language retrieval, and AI-excluded-content negatives.

Every workflow will retain the exact schema-versioned JSON produced by
`silen ai eval` as a downloadable workflow artifact. Retrieval failures and
setup failures will therefore leave comparable evidence instead of only log
text. The report contains no timestamp or workflow metadata; GitHub associates
the unchanged report bytes with the commit and run.

This is repository quality infrastructure. It adds no model, provider key,
network evaluator, public CLI flag, package export, runtime dependency, remote
transport, publishing action, or release by itself.

## 2. Approved product decisions

The approved approach is a repository-only TypeScript gate runner:

```text
pnpm site:ai-check
  -> clear the fixed generated report path
  -> pnpm site:build
  -> node dist/node/cli.js ai audit website
  -> node dist/node/cli.js ai eval website --json
       -> validate and atomically save exact stdout
  -> pnpm check:no-maps dist website/.silen/dist
```

The runner invokes existing package scripts and the built CLI with
`shell: false`. It does not import an alternate evaluator or duplicate build,
audit, evaluation, or source-map logic. Its only additional responsibility is
stage orchestration and stable report persistence.

`site:check` remains a compatibility alias for `site:ai-check`. There is one
canonical implementation and no second command chain to drift.

Two alternatives were considered and rejected:

- Adding public `silen ai eval --output` would make report persistence reusable
  outside this repository, but it would expand the installed CLI's file-write,
  path-safety, documentation, and compatibility contract without a demonstrated
  consumer requirement.
- Piping JSON through workflow-specific `tee` commands would avoid a runner,
  but it would duplicate local and workflow logic and make exit preservation
  dependent on shell and pipe configuration.

## 3. Relationship to QUAL-002 and AI-004

`QUAL-003` depends on the already-shipped `QUAL-002` composed Pages gate and
`AI-004` ranked version 2 evaluator.

The earlier QUAL-002 design intentionally excluded Core CI and npm Publish and
rejected a TypeScript runner because a fail-fast Pages-only shell chain did not
need orchestration. QUAL-003 explicitly supersedes those two scoped decisions:

- AI readiness now becomes release-blocking in CI, Pages, and Publish.
- A small runner is now justified because failed JSON must be preserved,
  stale evidence must be removed before any stage runs, and all three workflows
  must share identical behavior.

QUAL-002 remains accurate evidence for what shipped at that point. QUAL-003
does not retroactively rewrite its design.

AI-004's v1/v2 compatibility and rank semantics remain supported. Version 3
extends the evaluator without changing previously valid suites or reports.

## 4. Goals

The implementation must:

1. Provide `pnpm site:ai-check` as the one canonical official-site quality
   gate.
2. Preserve `pnpm site:check` as a non-divergent alias.
3. Execute site build, AI audit, AI evaluation, and source-map inspection once
   and in that order within each gate invocation.
4. Keep the built CLI as the behavior under test rather than importing a
   separate source implementation into the runner.
5. Save valid evaluation JSON on success, retrieval failure, and evaluation
   setup failure.
6. Prevent a previous run's report from being mistaken for current evidence.
7. Run the gate in Core CI, Pages, and Publish without building the site twice
   in any one job.
8. Upload the same report file from each workflow even when evaluation exits
   nonzero after producing it.
9. Add strict schema version 3 with multiple acceptable targets, forbidden
   targets, and an explicit rank bound per case.
10. Preserve v1 and v2 input, result, serialization, diagnostics, and exit
    behavior for identical inputs.
11. Expand the official suite to 24 deterministic, bilingual cases that
    exercise every requested query category and the new target forms.
12. Keep the complete gate model-free, provider-free, and independent of a
    hosted service.

## 5. Non-goals

This delivery will not:

- Add a public CLI command or `--output` option.
- Change MiniSearch indexing, scoring, tokenization, language preference, or
  tie-breaking.
- Add model judging, embeddings, reranking, query generation, telemetry, or a
  network request.
- Add weighted cases, aggregate relevance metrics, score thresholds, or a
  committed ranking baseline file.
- Turn `draft: true` or `ai: false` into access control.
- Store private material in the official website or evaluation fixtures.
- Initialize or mutate the local MCP workspace, enable MCP writes, or add a
  remote MCP transport.
- Aggregate later stages after an earlier stage has failed.
- Change package exports, dependencies, lockfile, package version, generated
  Agent Contract version, or changelog.
- Push, publish npm, create a GitHub Release, deploy Pages, or perform any
  external release operation without separate authorization.

## 6. Gate runner architecture

### 6.1 Repository commands

`package.json` will expose:

```json
{
  "site:ai-check": "jiti tooling/site-ai-check.ts",
  "site:check": "pnpm site:ai-check",
  "pretest": "pnpm build",
  "test": "pnpm test:run",
  "test:run": "vitest run --maxWorkers=1 --no-file-parallelism"
}
```

Therefore ordinary `pnpm test` retains its build-first contract, while Publish
can run `test:run` after `site:ai-check` has already built the package.

### 6.2 Fixed stages

`tooling/site-ai-check.ts` owns an immutable stage list:

1. `pnpm site:build`
2. `node dist/node/cli.js ai audit website`
3. `node dist/node/cli.js ai eval website --json`
4. `pnpm check:no-maps dist website/.silen/dist`

The runner uses `process.execPath` for the built CLI and resolves the pnpm
binary as `pnpm.cmd` on Windows and `pnpm` elsewhere. Every subprocess uses an
argument array and `shell: false`. The runner accepts no user-controlled root,
command, or report-path argument.

Build, audit, and source-map output are inherited directly. Evaluation stderr
is forwarded, while stdout is captured so the same bytes can be printed and
saved. The runner never re-evaluates or reserializes a successful JSON report.

### 6.3 Report lifecycle

The only persisted report path is:

```text
artifacts/ai-eval/site-ai-eval.json
```

`/artifacts/` is repository-root generated state and will be added to
`.gitignore`. A non-hidden directory is intentional because GitHub's official
artifact action excludes hidden files by default. The upload step names this
one file explicitly and does not enable hidden-file upload.

Before the build starts, the runner removes only the fixed report file. This
guarantees that a build or audit failure cannot expose evidence from an older
invocation. When evaluation emits exactly one valid JSON document, the runner
writes the original stdout bytes to a temporary sibling file and renames it to
the stable destination. A partial write must never appear as the final report.

The report must not add a timestamp, duration, absolute path, environment
value, commit SHA, workflow name, or provider state. Its determinism remains
owned by `serializeAiEvalReport` or `serializeAiEvalSetupError`; workflow and
commit identity remain GitHub artifact metadata.

### 6.4 Process and output bounds

The runner bounds captured evaluation output to 16 MiB, comfortably above the
official 24-case report while preventing unbounded memory accumulation. A
valid report must be exactly one JSON object with a positive integer
`schemaVersion` and boolean `ok`; the runner does not duplicate the evaluator's
full version-specific schema. Missing, empty, oversized, structurally invalid,
or non-JSON stdout is an orchestration/setup failure: the fixed report remains
absent, the runner prints a focused diagnostic, and exits 2.

For valid JSON, the runner accepts and preserves only the CLI's established
exit statuses 0, 1, and 2. Any other exit status or process signal is an
orchestration failure: the fixed report remains absent and the runner exits 2
with a focused diagnostic. The runner does not convert a retrieval failure
into success merely because its JSON was saved.

## 7. Gate failure semantics

The gate remains fail-fast:

| Failing stage | Report state | Gate result |
| --- | --- | --- |
| Site/package build | Absent after stale-report cleanup | Preserve build failure |
| AI audit | Absent | Preserve audit failure |
| AI eval retrieval regression | Save stable evaluation report | Exit 1 |
| AI eval setup/configuration error | Save stable setup-error JSON | Exit 2 |
| AI eval missing or invalid JSON | Absent | Exit 2 with runner diagnostic |
| Source-map guard | Preserve successful evaluation report | Preserve guard failure |
| All stages pass | Save successful evaluation report | Exit 0 |

No later stage runs after a failure. In particular, the source-map guard does
not run after evaluation failure, and evaluation does not run after audit
failure. Build output remains available for diagnosis.

## 8. Evaluation suite schema version 3

### 8.1 Target shape

A version 3 target retains the existing route-and-optional-heading match:

```json
{
  "route": "/ai/",
  "heading": "Public AI artifacts"
}
```

Routes use the existing base-free route validation and normalization. Headings
use the existing whitespace and case-insensitive comparison. Omitting
`heading` means any result for the normalized route.

### 8.2 Case shape

Every v3 case has both target arrays and an explicit `maxRank`:

```json
{
  "id": "natural-en-ai-entry",
  "query": "Where should an agent begin when reading a deployed site?",
  "lang": "en-US",
  "expected": {
    "acceptable": [
      { "route": "/ai/", "heading": "Agent Contract" },
      { "route": "/ai/agent-contract/" }
    ],
    "forbidden": [],
    "maxRank": 2
  }
}
```

Strict validation requires:

- `acceptable` and `forbidden` are present arrays with at most 20 targets each.
- At least one array is non-empty.
- `maxRank` is an integer from 1 through `topK`.
- A negative-only case with an empty `acceptable` array has
  `maxRank === topK`, avoiding a misleading unused positive bound.
- Duplicate or semantically overlapping targets within one array are invalid.
- No result may satisfy both an acceptable and forbidden target. Targets with
  the same normalized route overlap when their headings are equal or either
  target omits the heading.
- Unknown fields and unsupported schema versions remain invalid.

Validation failures remain `SUITE_SCHEMA`, identify the first precise
`cases.<index>.expected...` field, and produce CLI exit 2.

### 8.3 Evaluation semantics

For each case, the evaluator queries the production index once and retains the
first `topK` results.

1. It finds the earliest result matching any acceptable target.
2. A positive condition passes only when that rank is numerically less than or
   equal to the authored `maxRank` bound.
3. It finds every Top-K result matching any forbidden target.
4. The negative condition passes only when no forbidden match exists.
5. The case passes only when both applicable conditions pass.

For negative-only cases, the positive condition is vacuously satisfied,
`matchedTarget` and `matchedRank` are null, and all Top-K results are checked
for forbidden targets. The official hidden-content queries use unique
sentinel vocabulary so an accidentally indexed forbidden page would rank at
the top rather than evade a bounded check.

### 8.4 Version 3 report

A successful or retrieval-failure v3 case uses this stable shape:

```json
{
  "id": "natural-en-ai-entry",
  "ok": false,
  "query": "Where should an agent begin when reading a deployed site?",
  "lang": "en-US",
  "expected": {
    "acceptable": [
      { "route": "/ai/", "heading": "Agent Contract" },
      { "route": "/ai/agent-contract/" }
    ],
    "forbidden": [],
    "maxRank": 2
  },
  "matchedTarget": null,
  "matchedRank": null,
  "forbiddenMatches": [],
  "actual": []
}
```

`matchedTarget` is the authored acceptable target associated with the
earliest match, or null. If one actual result matches multiple acceptable
targets, the first authored target wins. `matchedRank` is its one-based rank,
or null.

`forbiddenMatches` is always present and sorted by actual rank, then authored
target order. Each item contains the matched authored `target` and `rank`; the
full result is already present once in `actual`.

The report-level shape remains `schemaVersion`, `ok`, `suite`, `index`,
`topK`, `summary`, and ordered `cases`. The setup-error envelope remains its
established schema version 1 because it may be produced before the suite
version is known.

Human output distinguishes:

- no acceptable match in Top K;
- an acceptable match below `maxRank`;
- one or more forbidden matches, including target and rank; and
- a case failing both positive and negative conditions.

### 8.5 Compatibility

Version 1 and version 2 remain strict, explicit evaluator branches. For the
same suite and index bytes, they retain their current parsed values, pass/fail
semantics, report object keys and order, serialized JSON bytes, human output,
and exit statuses.

Version 3 is opt-in through `schemaVersion: 3`. Older Silen versions reject it
as unsupported instead of silently applying partial semantics. Silen never
rewrites a user's suite.

## 9. Official 24-case suite

The official `website/.silen/ai-evals.json` moves to schema version 3 and keeps
`topK: 5`. It contains 24 cases in stable authored order:

| Category | English | Chinese | Rank policy |
| --- | ---: | ---: | --- |
| Critical direct queries | 3 | 3 | All require Rank 1 |
| Natural questions | 2 | 2 | `maxRank <= 2` |
| Long phrasing | 2 | 2 | `maxRank <= 2` |
| Synonyms/paraphrases | 2 | 2 | `maxRank <= 3` |
| Typo/noise tolerance | 1 | 1 | `maxRank <= 3` |
| Cross-language retrieval | 1 direction | 1 direction | `maxRank <= 5` |
| AI-excluded negatives | 1 | 1 | `maxRank = topK` |
| **Total** | **12** | **12** | Every bound explicit |

Case IDs begin with stable category prefixes such as `direct-`, `natural-`,
`long-`, `synonym-`, `typo-`, `cross-lang-`, and `hidden-`. Repository tests
use those prefixes to protect category counts without adding test-only tags to
the public suite schema.

At least two natural or long-form cases contain multiple legitimate acceptable
targets. The two cross-language cases intentionally omit `lang`: one English
query targets a Chinese page, and one Chinese query targets an English page.
The two hidden cases are negative-only and exercise both exclusion mechanisms.

Queries must reflect plausible reader language. Implementation may adjust a
query or honest rank bound after observing deterministic production results,
but must not add awkward page text solely to force a synthetic result upward.
Critical direct queries remain Rank 1.

## 10. AI-excluded negative fixtures

The official site will include two unlinked, synthetic fixture pages:

- one English page with `draft: true`;
- one Chinese page with `ai: false`.

Each fixture contains a unique, non-secret sentinel phrase and a stable route.
The pages may appear in generated HTML because Silen defines these flags as AI
artifact exclusions, not publication or authorization controls. Tests must
prove the routes are absent from the production search index and AI-readable
artifacts. Their evaluation cases query the sentinel phrase and forbid the
corresponding route.

The fixtures contain no personal data, credential-like string, internal
endpoint, local absolute path, or text that could be mistaken for confidential
content. Documentation will continue to warn that private content belongs
outside the site root.

## 11. Workflow integration and artifacts

All workflow jobs use the same generated file:

```text
artifacts/ai-eval/site-ai-eval.json
```

Immediately after the gate, each workflow runs an artifact upload step with
`if: ${{ always() }}`. It uses `actions/upload-artifact@v7`, an explicit file
path, `retention-days: 90`, and `if-no-files-found: ignore`. Ignoring a missing
file avoids a misleading second failure when build or audit stopped before
evaluation. A successful gate cannot omit the report.

GitHub's official action treats artifacts as immutable within a workflow run
and excludes hidden files by default. Each workflow therefore uses a distinct
artifact name and the non-hidden fixed path:

- Core CI: `silen-ai-eval-ci`
- Pages: `silen-ai-eval-pages`
- Publish: `silen-ai-eval-publish`

Reference:
[GitHub `actions/upload-artifact`](https://github.com/actions/upload-artifact).

### 11.1 Core CI

`.github/workflows/ci.yml` adds one `ai-readiness` job after static quality,
pinned to Node 22.12.0. It installs the existing pinned pnpm and dependencies,
runs `pnpm site:ai-check` once, and uploads the report. The existing Node
runtime matrix and browser job keep their package/runtime responsibilities and
do not run a second site build.

### 11.2 GitHub Pages

Pages replaces `pnpm site:check` with canonical `pnpm site:ai-check`, uploads
the evaluation report, then retains the public Agent Contract assertion and
Pages artifact upload. A failed gate still uploads a produced evaluation
report but prevents manifest assertion, Pages packaging, and deployment.

### 11.3 npm Publish

Publish runs static checks, then `pnpm site:ai-check`, then uploads the report.
Because the gate already builds the package and checks package and site source
maps, the workflow removes its separate package-build and no-map steps. It runs
`pnpm test:run` rather than `pnpm test`, avoiding the `pretest` package rebuild,
then runs `publint` and npm publish.

A gate failure leaves the job failed after artifact upload; default-success
conditions skip tests, metadata validation, and publication. This design does
not trigger Publish, change Trusted Publishing credentials, or authorize a
release.

## 12. Security and authority boundaries

The gate runner:

- accepts no arbitrary command, workspace root, or output path;
- uses fixed argument arrays and `shell: false`;
- invokes only trusted repository scripts and the built Silen CLI;
- writes only the ignored fixed report through an atomic replacement;
- never follows a report path supplied by content or configuration;
- does not call `ai init`, `ai index`, MCP, Git, npm publish, curl, fetch, or a
  provider SDK; and
- remains fully usable when common provider credential variables are absent.

The report contains only committed evaluation queries and bounded public-site
search evidence: routes, titles, headings, language labels, and scores. The
upload step selects only that file, not the containing directory or unrelated
build state.

## 13. Test strategy

### 13.1 Evaluator tests

Focused tests must cover:

- byte-identical v1 and v2 JSON plus unchanged human output;
- strict v3 parsing and rejection from v1/v2 schemas;
- multiple acceptable targets with the earliest match winning;
- pass exactly at `maxRank` and failure one rank below;
- forbidden matches at multiple ranks and stable ordering;
- positive-only, mixed, and negative-only cases;
- required arrays, non-empty combined target set, explicit rank, negative-only
  `maxRank === topK`, duplicates, overlaps, and precise field paths;
- route and optional-heading normalization for every target kind;
- stable v3 object keys, nulls, arrays, result order, and serialization; and
- human diagnostics for positive, forbidden, and combined failures.

Existing bounded-file, symlink, no-network, no-write, setup-error, and CLI
0/1/2 tests remain green.

### 13.2 Gate runner tests

The runner exposes repository-internal dependency seams for subprocess
execution and report persistence so tests can prove behavior without spawning
arbitrary commands. Tests must cover:

- exact stage order and `shell: false` invocation;
- stale-report removal before the build;
- stop-on-first-failure behavior;
- exact stdout forwarding and atomic report bytes on exits 0, 1, and 2;
- no report for build/audit failure, invalid JSON, oversized output, or an
  interrupted evaluation;
- no source-map stage after evaluation failure; and
- report retention when the final source-map stage fails.

A real provider-credential-free `pnpm site:ai-check` run remains the integration
proof against the built CLI.

### 13.3 Official site and workflow tests

Repository contract tests must assert:

- exactly 24 suite cases, 12 English-oriented and 12 Chinese-oriented;
- exact category counts, explicit `maxRank`, and Rank 1 for all direct cases;
- at least two multiple-acceptable cases and both hidden negative cases;
- the two synthetic routes build as HTML but remain absent from the search
  index and AI-readable artifacts;
- `site:check` delegates only to `site:ai-check`;
- every workflow calls canonical `site:ai-check` once and never directly builds
  the site a second time in that job;
- every artifact upload follows the gate, uses `always()`, points to the fixed
  file, and has the approved name and retention behavior;
- Pages retains its public Agent Contract assertion after the gate; and
- Publish uses the already-built test path before `publint` and publish.

### 13.4 Delivery verification

Before `QUAL-003` is marked shipped, run:

1. Focused evaluator, runner, suite, workflow, and documentation tests.
2. The full serial Vitest suite.
3. `pnpm format:check`, `pnpm lint`, and `pnpm typecheck`.
4. `pnpm build`, `pnpm exec publint`, and source-map checks.
5. `pnpm site:ai-check` with provider credentials absent.
6. A second evaluation serialization and byte comparison against the first
   report from unchanged inputs.
7. Git status and generated-artifact checks.

## 14. Documentation and project-map lifecycle

README maintainer guidance and the English and Chinese AI evaluation
documentation will explain:

- `site:ai-check` as the canonical repository gate and `site:check` as its
  compatibility alias;
- schema v3 acceptable and forbidden targets;
- required rank bounds and negative-only behavior;
- stable CI report artifacts and the distinction between JSON bytes and
  workflow metadata;
- v1/v2 compatibility; and
- the unchanged model-free, no-network evaluator boundary.

During implementation, move `QUAL-003` from Ready to Active before behavior
changes. Mark it Shipped only after all local evidence passes. With no other
Ready item currently available, the final map will state that there is no
default executable item; `AI-005` remains the first Candidate until its MCP v2
migration design satisfies the promotion gate.

## 15. File boundaries

Expected implementation changes are limited to:

- `package.json`: canonical gate, compatibility alias, and built-test script.
- `.gitignore`: generated report directory.
- `tooling/site-ai-check.ts`: fixed runner and report persistence.
- `src/ai/eval.ts`: strict v3 schema, evaluation, report, and diagnostics.
- `website/.silen/ai-evals.json`: official 24-case suite.
- Two synthetic official-site fixture pages.
- `.github/workflows/ci.yml`, `pages.yml`, and `publish.yml`: gate and artifact
  integration without duplicate site builds.
- Focused evaluator, runner, official-site, workflow, CLI, and documentation
  tests.
- README plus relevant English and Chinese evaluation documentation.
- `docs/project-map.md`: Active/Shipped lifecycle and evidence.
- The corresponding implementation plan.

No dependency, lockfile, package export, package version, Agent Contract
version, changelog, MCP implementation, Ask AI integration, or unrelated site
content should change.

## 16. Completion criteria

`QUAL-003` is complete only when:

1. `site:ai-check` runs the approved four stages once and in order through the
   repository-only runner.
2. `site:check` is a direct compatibility alias.
3. Valid evaluation JSON is saved atomically on exits 0, 1, and 2, and stale
   or partial evidence cannot be uploaded.
4. CI, Pages, and Publish each block on the canonical gate and retain a
   produced report artifact without a second site build in that job.
5. Schema v3 implements explicit multiple acceptable targets, forbidden
   targets, and rank semantics while v1/v2 remain unchanged.
6. The stable 24-case suite covers every approved bilingual category, all
   critical queries require Rank 1, and production evaluation passes.
7. Synthetic draft and `ai: false` pages prove the AI-exclusion boundary
   without containing confidential material.
8. Focused tests, full tests, formatting, lint, typecheck, package checks, and
   provider-free `site:ai-check` all pass.
9. Documentation describes the new repository and suite contracts accurately.
10. The project map records verified evidence, marks `QUAL-003` Shipped, and
    identifies no executable Ready item.
11. Git contains no unintended generated report, build output, or unrelated
    change.

A version bump, changelog entry, commit push, npm publication, GitHub Release,
or Pages deployment remains a separate authorized release operation.
