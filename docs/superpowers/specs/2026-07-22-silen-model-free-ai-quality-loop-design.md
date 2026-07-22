# Silen Model-Free AI Quality Loop Design

- Status: Pending written-spec review
- Date: 2026-07-22
- Repository: `AICode-Nexus/silen`
- Package: `@aicode-nexus/silen`

## 1. Summary

Silen will add a deterministic documentation-quality loop that works when the
user has no AI model, provider account, API key, hosted endpoint, or network
connection. The loop evaluates whether real user questions retrieve the
expected published page or section, reports actionable failures, and can be
used as a local or CI release gate.

The first release adds `silen ai eval`, corrects base-aware link handling in
`silen ai audit`, and stops treating the optional local workspace cache as a
requirement for read-only search. It evaluates the same built
`search-index.json` used by the production documentation site rather than a
parallel retrieval implementation.

Ask AI remains an optional endpoint adapter. It is not used by this quality
loop and is not presented as an active assistant when no endpoint is
configured.

## 2. Product decision

The selected approach is an offline retrieval quality gate:

1. Authors commit a small, non-executable suite of representative questions.
2. A normal Silen build produces the production search index.
3. `silen ai audit` verifies source and generated-artifact integrity.
4. `silen ai eval` runs every question against the production search index.
5. CI fails when an expected page or section no longer appears in the allowed
   top results.

This is the primary supported AI-readiness path, not a degraded substitute for
Ask AI. A site with no model must retain the complete build, audit, evaluation,
reporting, local search, AI artifacts, and read-only MCP experience.

## 3. Goals

The first release must:

1. Work without a model, embeddings, provider SDK, API key, endpoint, or
   network access.
2. Evaluate the same lexical search behavior shipped to site readers.
3. Let authors describe question-to-page and optional question-to-section
   expectations in committed JSON.
4. Produce deterministic human-readable and machine-readable reports.
5. Return stable exit codes suitable for CI.
6. Show the actual ranked results for every failed case.
7. Fix false broken-link findings for sites deployed below a non-root `base`.
8. Keep MCP preflight read-only and free from workspace config execution.
9. Make `.silen/ai/index.json` an optional explicit cache rather than an audit
   prerequisite.
10. Ship the official bilingual Silen site as a working evaluation example.
11. Preserve the current Ask AI behavior: no configured endpoint means no Ask
    AI control and no Ask AI client bundle.

## 4. Non-goals

The first release will not:

- Generate answers, questions, expected routes, or remediation text with a
  model.
- Add embeddings, a vector database, reranking, or semantic search.
- Host or proxy an Ask AI service.
- Add provider presets, credentials, telemetry, or remote MCP.
- Tune retrieval against an absolute score threshold.
- Automatically rewrite documentation, evaluation cases, or configuration.
- Run Git commit, push, deployment, or other shell workflows.
- Make `silen build` update authored evaluation files or local AI caches.
- Evaluate `ai-index.json` or the raw workspace search as a substitute for the
  production reader search index.

## 5. No-model product contract

The no-model path is a first-class product contract:

```text
silen build <root>
  -> silen ai audit <root>
  -> silen ai eval <root>
  -> deterministic report and exit code
```

All three commands remain usable with no provider-related environment
variables and with network access unavailable. `ai eval` reads only the
evaluation suite and built search index. It does not import the Ask AI client,
call `fetch`, inspect model configuration, or require `themeConfig.ai`.

Ask AI remains a separate optional runtime enhancement. Configuring an
endpoint may add the existing theme control, but it does not change audit or
evaluation behavior. An unavailable endpoint may affect only an active Ask AI
request; it must never affect build, local search, audit, evaluation, generated
AI artifacts, or MCP.

## 6. User workflows

### 6.1 Establish a local quality baseline

The author creates `.silen/ai-evals.json`, builds the site, and runs:

```sh
pnpm silen build docs
pnpm silen ai audit docs
pnpm silen ai eval docs
```

The evaluation passes only when each expected page or section is present in
the configured top results.

### 6.2 Use the same checks in CI

CI runs the same three commands without model secrets. A retrieval regression
returns a nonzero status and prints enough ranked evidence to reproduce it
locally. No special hosted evaluation service is required.

### 6.3 Diagnose a failed question

For each failure, the report shows:

- Case identifier and query.
- Expected route and optional heading.
- Effective language and top-K setting.
- Actual ranked routes, headings, languages, and diagnostic scores.
- A bounded remediation hint: improve the relevant title, description,
  heading, or page text, or correct the authored expectation.

The tool does not choose or apply a fix.

## 7. Architecture

### 7.1 Source-of-truth boundaries

The quality loop has three distinct sources:

1. Authored content and `.silen/ai-evals.json` are reviewed source files.
2. `.silen/dist/search-index.json` is generated production retrieval state.
3. `.silen/ai/index.json` is an optional rebuildable local workspace cache.

Only the production search index is an evaluation target. This prevents a
passing evaluation from hiding a regression in the search experience readers
actually use. The local workspace cache remains available through
`silen ai index`, but its state does not define whether in-memory MCP search or
the production site works.

### 7.2 Evaluation suite

The default suite path is `.silen/ai-evals.json` inside the content root. It is
plain JSON so loading it cannot execute project code.

Schema version 1 is:

```json
{
  "schemaVersion": 1,
  "topK": 5,
  "cases": [
    {
      "id": "model-free-ai",
      "query": "Can Silen work without an AI model?",
      "lang": "en-US",
      "expected": {
        "route": "/ai/",
        "heading": "Public AI artifacts"
      }
    },
    {
      "id": "zh-read-only-mcp",
      "query": "MCP 默认有写入权限吗？",
      "lang": "zh-CN",
      "expected": {
        "route": "/zh/ai/local-workspace-mcp/"
      }
    }
  ]
}
```

Validation rules are deliberately small and strict:

- `schemaVersion` must be `1`.
- `topK` is optional, defaults to `5`, and must be an integer from 1 to 20.
- `cases` must contain between 1 and 500 entries.
- Every `id` is non-empty, at most 100 characters, and unique.
- Every `query` contains 1 to 500 characters after whitespace normalization.
- `lang` is optional and uses the existing search language preference.
- `expected.route` is a base-free site route beginning with `/`.
- `expected.heading` is optional and non-empty when present.
- Unknown fields are rejected so misspelled expectations cannot silently pass.
- The suite file is limited to 1 MiB.

Routes are authored without the deployment base. Both expected and actual
routes are normalized for index-route equivalence, including trailing slash
and `index` forms. A heading expectation uses normalized whitespace and exact
case-insensitive text equality. The matching heading and route must occur on
the same ranked result.

### 7.3 Evaluation runner

`silen ai eval [root]` performs these steps:

1. Resolve the content root without executing `.silen/config.ts`.
2. Read and validate `.silen/ai-evals.json`.
3. Read and validate `.silen/dist/search-index.json` as an existing supported
   search index version.
4. Run every query through the shared Node-side production search pipeline.
5. Apply the optional existing language preference and take the first `topK`
   results.
6. Match the expected route and, when present, heading.
7. Collect every result before rendering one stable report.

The existing public search-result shape remains compatible. A shared internal
ranked-query helper retains the MiniSearch score for evaluator diagnostics;
the site-facing query function continues to return its current result shape.
Scores are rounded consistently for display and are never a pass criterion.

Result order remains the order produced by the deterministic search tie-breaks.
Case order remains the authored suite order. The runner does not stop after the
first failed case.

### 7.4 Base-aware audit

Audit receives a normalized `base` context rather than guessing that every
root-relative link begins at `/`.

For direct `silen ai audit`, base resolution uses this order:

1. A valid built Site Agent Contract manifest, when present.
2. The trusted project config, using the same execution boundary as a direct
   `silen build` invocation.
3. `/` only when neither source supplies a base, accompanied by a non-blocking
   base-unknown notice.

The MCP `build` preflight and MCP audit path never execute project config. They
may read the existing built manifest; otherwise they use `/` and report that
the base could not be verified.

For a configured base such as `/silen/`, an authored target such as
`/silen/guide/` is compared with compiler route `/guide`. The exact normalized
base is removed at most once. Similar prefixes such as `/silen-other/` are not
removed. Relative links, fragment-only links, external URLs, and
protocol-relative URLs retain their existing handling.

### 7.5 Audit finding severity

`issues` remains the blocking collection that controls `ok`. Audit adds a
non-blocking `notices` collection for state that helps an operator but does not
prove a broken site.

A missing or stale `.silen/ai/index.json` becomes an `index-cache` notice. The
notice explains that `silen ai index` can refresh the optional snapshot while
in-memory MCP search remains available. Missing production artifacts,
contract failures, broken links, and invalid citations remain blocking issues.

This is an intentional compatibility change for CI that previously treated an
unused cache as a release failure. `silen ai index` remains explicit; neither
audit nor build writes the cache.

### 7.6 Reports

Default output is a concise human report. `--json` emits one versioned JSON
document and no prose on standard output.

The JSON result contains:

```json
{
  "schemaVersion": 1,
  "ok": false,
  "suite": ".silen/ai-evals.json",
  "index": ".silen/dist/search-index.json",
  "topK": 5,
  "summary": { "total": 2, "passed": 1, "failed": 1 },
  "cases": [
    {
      "id": "model-free-ai",
      "ok": false,
      "query": "Can Silen work without an AI model?",
      "lang": "en-US",
      "expected": { "route": "/ai/" },
      "actual": [
        {
          "rank": 1,
          "route": "/integrations/",
          "title": "Integrations",
          "heading": "Ask AI",
          "lang": "en-US",
          "score": 12.345678
        }
      ]
    }
  ]
}
```

Reports contain no timestamp, duration, absolute filesystem path, provider
state, environment value, or random identifier. Fixed key construction, case
ordering, ranked-result ordering, and score rounding make the same inputs
produce byte-for-byte identical JSON.

## 8. Error and exit behavior

The CLI uses these exit statuses:

- `0`: the suite is valid and every case passes.
- `1`: the suite ran successfully and one or more cases failed.
- `2`: evaluation could not run because input, schema, index, or filesystem
  state was invalid.

Expected setup failures include:

- Missing suite: identify `.silen/ai-evals.json` and show a minimal creation
  example.
- Missing search index: identify `.silen/dist/search-index.json` and instruct
  the user to run `silen build <root>`.
- Invalid JSON: report the file and parse failure without exposing unrelated
  environment or filesystem data.
- Invalid schema: report the case ID when available and the precise JSON field
  path.
- Unsupported index version: report the discovered version and instruct the
  user to rebuild with the installed Silen version.
- No search results: record an empty `actual` list and fail that case rather
  than treating it as a runner error.

In JSON mode, anticipated setup failures also produce one structured error
document before exiting `2`. Unexpected internal errors continue through the
normal CLI error boundary and return nonzero.

Audit continues to return `1` only for blocking issues. Notices do not alter
the exit status.

## 9. Safety and side effects

`ai eval` is read-only. It must not:

- Create `.silen`, output, cache, log, or temporary files.
- Load executable site config or MDX modules.
- Read files outside the content root through traversal or symlinks.
- Access provider credentials or environment-specific model settings.
- Make network requests.
- Modify source content, the suite, or the Git worktree.

The suite and built index use the same bounded, symlink-safe workspace file
handling principles as existing AI workspace reads. Direct CLI audit may load
trusted project config only to resolve site facts such as `base`; MCP preflight
retains its stricter no-config-execution boundary.

## 10. Verification strategy

### 10.1 Unit coverage

Add focused tests for:

- Valid route-only and route-plus-heading cases.
- Default and explicit `topK`.
- English and Chinese language preference.
- Route, trailing slash, and heading normalization.
- Empty results and a correct result below the allowed rank.
- Stable ordering and score rounding.
- Missing, oversized, malformed, unsupported, empty, duplicate-ID, unknown
  field, invalid route, and invalid limit inputs.
- Production index versions currently accepted by site search.
- No writes and no network or Ask AI dependency during evaluation.

### 10.2 Audit regression coverage

Add tests proving that:

- `/silen/guide/` resolves to `/guide` under base `/silen/`.
- Root-base sites retain existing behavior.
- `/silen-other/guide/` is not stripped under `/silen/`.
- Relative, external, fragment, encoded, and malformed targets remain safe.
- A stale local cache creates a notice while `ok` remains true when all
  blocking checks pass.
- MCP preflight does not execute a hostile `.silen/config.ts` while resolving
  audit context.

### 10.3 CLI and integration coverage

Add CLI tests proving that:

- `ai eval` appears in the command contract and help text.
- Passing, retrieval-failure, and setup-failure statuses are `0`, `1`, and `2`.
- Human output contains a useful failure summary and actual top results.
- `--json` output parses as one stable document.
- The command succeeds without provider environment variables.
- Running the command leaves source and generated files unchanged.

The official site commits bilingual cases and must pass:

```sh
corepack pnpm site:build
node dist/node/cli.js ai audit website
node dist/node/cli.js ai eval website
```

The repository also passes typecheck, focused tests, the complete test suite,
lint, formatting, and package build checks already required for release.

## 11. Documentation changes

The English and Chinese AI workspace, CLI, and reference pages will add:

- The `ai eval` command and suite location.
- A minimal bilingual suite example.
- The explicit statement that no model, API key, endpoint, or network is
  required.
- The distinction between the production search index and optional local
  workspace cache.
- The three exit statuses and CI usage.
- The existing boundary that Ask AI is absent when no endpoint is configured.

The wording must not imply that Silen bundles a conversational assistant.

## 12. Compatibility and migration

Existing sites do not need an evaluation suite unless they invoke
`silen ai eval`. Existing builds, local search, AI artifacts, MCP commands, and
Ask AI endpoint integrations remain compatible.

The audit JSON result gains non-blocking notices. Consumers should continue to
use `ok` and `issues` for release gating. A stale `.silen/ai/index.json` no
longer makes `ok` false; users who need the snapshot can continue running
`silen ai index` explicitly.

The evaluation schema and JSON report each carry their own version so future
changes can fail explicitly instead of silently changing semantics.

## 13. Alternatives considered

### 13.1 Ship a real hosted Ask AI service

Rejected for this phase because it requires model and infrastructure choices,
credentials, cost controls, privacy policy, abuse handling, and network
availability. It would not satisfy users who have no AI model.

### 13.2 Require a local model or embeddings runtime

Rejected because installation size, hardware variability, model licensing,
and nondeterministic output would weaken the zero-setup CI gate.

### 13.3 Evaluate `ai-index.json`

Rejected because it is an AI discovery artifact rather than the retrieval
implementation used by the production search interface.

### 13.4 Evaluate the raw in-memory MCP workspace search

Rejected as the primary gate because it has a separate document model and
ranking path. It remains useful for bounded local agent reads, but passing it
would not prove reader search quality.

### 13.5 Gate on MiniSearch scores

Rejected because absolute scores vary as the corpus changes. Rank-based route
and optional heading expectations express the user-visible requirement more
durably; scores remain diagnostics only.

## 14. Delivery boundary

The implementation phase is complete only when:

1. Base-aware audit removes the official site's current deployment-prefix
   false positives without hiding lookalike broken routes.
2. Optional workspace-cache state no longer blocks audit.
3. `silen ai eval` implements the strict versioned suite and report contracts.
4. The official bilingual site supplies passing model-free evaluation cases.
5. All no-model, determinism, safety, CLI, audit, and regression tests pass.
6. Documentation describes the no-model path as the default complete
   capability and Ask AI as optional.

Model integrations, generated answers, semantic retrieval, and automated
content repair require separate designs and approval.
