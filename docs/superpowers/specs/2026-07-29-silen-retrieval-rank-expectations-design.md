# Silen Retrieval Rank Expectations Design

- Status: Approved
- Date: 2026-07-29
- Repository: `AICode-Nexus/silen`
- Package: `@aicode-nexus/silen`
- Project map item: `AI-004`

## 1. Summary

Silen will strengthen its model-free retrieval gate with case-specific maximum
rank expectations. A suite author can require an expected route and optional
heading to appear within a stricter rank than the suite's diagnostic `topK`,
while failed reports continue to expose the complete bounded result list.

The change uses an explicit suite and report schema version 2. The installed
CLI continues to read existing version 1 suites without changing their
validation, matching semantics, human report, JSON report, or exit behavior.
The official bilingual suite moves to version 2 and covers the three published
AI documentation surfaces in both languages.

No model, provider credential, embeddings service, hosted evaluator, network
request, or alternate search implementation is introduced.

## 2. Product decision

The selected design is a strict dual-version contract:

1. Version 1 remains a supported compatibility path with its existing global
   Top-K semantics and report shape.
2. Version 2 adds an optional `expected.maxRank` to each case.
3. Version 2 reports expose the effective maximum rank and the first complete
   route-and-heading match as `matchedRank`.
4. The production MiniSearch result order remains the only evaluated ranking.
5. The official suite writes every maximum rank explicitly and is enforced by
   the existing `pnpm site:check` Pages gate.

This avoids silently redefining schema version 1 while keeping existing suite
files usable by future Silen releases.

## 3. Goals

The implementation must:

1. Accept both suite schema versions 1 and 2 through one read-only evaluator.
2. Preserve version 1 suite validation and serialized reports byte for byte for
   the same inputs.
3. Let version 2 cases require a complete expectation match within a bounded
   case-specific maximum rank.
4. Distinguish a missing expectation from an expectation found below the
   allowed rank.
5. Keep full Top-K ranked evidence for every version 2 failure.
6. Produce deterministic, versioned human and JSON reports.
7. Reject invalid rank policy with precise field paths and setup exit code 2.
8. Expand the official bilingual suite from four to six representative cases.
9. Keep build, audit, evaluation, local search, and MCP independent of models
   and provider credentials.
10. Pass the canonical `pnpm site:check` command and the complete repository
    quality gate.

## 4. Non-goals

This change will not:

- Modify MiniSearch indexing, scoring, tokenization, language preference, or
  deterministic tie-breaking.
- Add recall, precision, mean reciprocal rank, normalized discounted gain, or
  score thresholds.
- Add multiple acceptable routes, negative expectations, weighted cases, or
  query generation.
- Tune documentation content merely to satisfy a synthetic query.
- Add model-based judging, embeddings, reranking, telemetry, or network calls.
- Change CLI flags or the established exit statuses 0, 1, and 2.
- Rewrite a user's version 1 suite or migrate files automatically.
- Change Pages, CI, or Publish workflow responsibilities.
- Bump the package version, create a release, publish to npm, or deploy without
  separate authorization.

## 5. Suite compatibility contract

### 5.1 Version 1

Version 1 remains exactly the shipped contract:

- `schemaVersion` is `1`.
- `topK` defaults to 5 and remains an integer from 1 through 20.
- A case contains `id`, `query`, optional `lang`, and strict `expected.route`
  plus optional `expected.heading`.
- Unknown fields, including `expected.maxRank`, remain invalid.
- A case passes when its complete expectation appears anywhere within Top K.
- Its successful or retrieval-failure JSON report remains schema version 1
  with no new keys.

### 5.2 Version 2

Version 2 retains every version 1 field and adds `expected.maxRank`:

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
    }
  ]
}
```

Validation remains strict and adds these rules:

- `maxRank` is optional and, when present, must be an integer from 1 through
  20.
- The effective maximum rank is the authored `maxRank`, or the suite `topK`
  when omitted.
- The effective maximum rank must not exceed `topK`.
- A violation is `SUITE_SCHEMA` at
  `cases.<index>.expected.maxRank` and exits 2.
- Every official version 2 case authors `maxRank` explicitly.
- Unknown versions and unknown fields remain invalid.

### 5.3 Migration behavior

| Suite | New CLI | Report | Older 0.4.0 CLI |
| --- | --- | --- | --- |
| Version 1 | Supported unchanged | Version 1 unchanged | Supported |
| Version 2 | Supported | Version 2 | Rejected as an unsupported strict suite |

An existing project does not need to edit its version 1 suite. A project that
wants per-case rank policy changes only `schemaVersion` to 2 and adds
`maxRank` where it needs a stricter bound. Silen does not write that migration.

## 6. Evaluation semantics

For each case, the evaluator continues to query the generated production
`.silen/dist/search-index.json` and takes the first `topK` results. It then:

1. Normalizes the expected route with the existing route rules.
2. Normalizes the optional expected heading with the existing whitespace and
   case-insensitive rules.
3. Finds the first ranked result where the route and optional heading match on
   the same result.
4. Records that one-based rank as `matchedRank`, or `null` when no complete
   match exists within Top K.
5. Passes a version 2 case only when `matchedRank` is not null and is less than
   or equal to the effective maximum rank.

The evaluator still collects every case before rendering a report. A result
found below `maxRank` remains in `actual`, making the ranking regression
directly visible. Scores remain diagnostics and never affect pass or fail.

## 7. Report contracts

### 7.1 Version 1 report

For a version 1 suite, the evaluator constructs and serializes the current
`AiEvalReport` shape without `maxRank`, `matchedRank`, timestamps, paths,
duration, or any other new key. A golden regression test protects identical
serialized output.

### 7.2 Version 2 report

A version 2 successful or retrieval-failure report uses this shape:

```json
{
  "schemaVersion": 2,
  "ok": false,
  "suite": ".silen/ai-evals.json",
  "index": ".silen/dist/search-index.json",
  "topK": 5,
  "summary": { "total": 1, "passed": 0, "failed": 1 },
  "cases": [
    {
      "id": "en-agent-contract",
      "ok": false,
      "query": "deployed site Agent Contract manifest",
      "lang": "en-US",
      "expected": {
        "route": "/ai/agent-contract/",
        "maxRank": 1
      },
      "matchedRank": 2,
      "actual": [
        {
          "rank": 1,
          "route": "/ai/",
          "title": "AI-ready documentation",
          "heading": "Agent Contract",
          "lang": "en-US",
          "score": 12.345678
        },
        {
          "rank": 2,
          "route": "/ai/agent-contract/",
          "title": "Agent Contract",
          "heading": "Installed package contract",
          "lang": "en-US",
          "score": 10.234567
        }
      ]
    }
  ]
}
```

The `expected.maxRank` value is always the effective bound, even when the
input omitted it. `matchedRank` is always present and is either a one-based
integer or `null`. Key construction, case order, actual-result order, and score
rounding retain the existing deterministic rules.

The anticipated setup-error JSON envelope remains schema version 1 because it
is the command's established error-document contract and may be produced
before a suite version is known.

### 7.3 Human report

Version 1 human output remains unchanged. A failed version 2 case adds one of
these bounded diagnostics before the actual result list:

- `Matched at rank 2; required rank 1 or better.`
- `No complete match in Top 5; required rank 1 or better.`

The existing expected route/heading, ranked results, scores, and remediation
text remain present.

## 8. Official bilingual suite

The official suite moves to schema version 2, keeps `topK: 5`, and contains six
cases in stable authored order:

| ID | Query | Expected | Max rank |
| --- | --- | --- | ---: |
| `en-public-ai-artifacts` | `AI artifacts` | `/ai/` and `Public AI artifacts` | 1 |
| `en-model-free-workspace` | `deterministic model-free workspace` | `/ai/local-workspace-mcp/` | 2 |
| `en-agent-contract` | `deployed site Agent Contract manifest` | `/ai/agent-contract/` | 1 |
| `zh-public-ai-artifacts` | `面向 AI 的公开产物` | `/zh/ai/` and `面向 AI 的公开产物` | 1 |
| `zh-model-free-workspace` | `确定性 无模型 工作区` | `/zh/ai/local-workspace-mcp/` | 2 |
| `zh-agent-contract` | `部署站点 Agent Contract 清单` | `/zh/ai/agent-contract/` | 1 |

These cases cover every dedicated English and Chinese AI documentation route:
the AI overview and public artifacts, the local workspace and model-free
quality loop, and the Agent Contract. Ask AI remains an optional endpoint
integration rather than a required no-model retrieval surface.

## 9. Data flow and boundaries

The existing official-site path remains:

```text
pnpm site:check
  -> site:build
  -> production search-index.json
  -> ai audit
  -> ai eval with the version 2 suite
  -> no-source-map check
```

No workflow needs a new command. The evaluator remains read-only and keeps the
existing bounded, symlink-safe suite and index reads. It does not load project
configuration, inspect provider state, invoke Ask AI, call `fetch`, or write a
cache or migration.

The implementation should keep version-specific parsing, evaluation, and
report construction explicit enough that a version 1 code path can be tested
without depending on version 2 defaults.

## 10. Error and exit behavior

Exit statuses remain:

- `0`: every case satisfies its version-specific expectation.
- `1`: evaluation ran, but at least one route/heading was missing or below its
  maximum allowed rank.
- `2`: the root, suite, schema, index, or filesystem state prevented a valid
  evaluation.

Version 2 rank-policy setup errors identify the exact
`cases.<index>.expected.maxRank` field. A rank regression is never reported as
a setup failure. No-results cases remain ordinary retrieval failures with an
empty `actual` list and `matchedRank: null`.

## 11. Documentation

Existing English and Chinese AI overview, local-workspace, CLI deployment, and
reference documentation that describes Top K will explain:

- Version 1 compatibility.
- Version 2 `expected.maxRank` and its default to `topK`.
- The distinction between diagnostic Top K and the per-case passing bound.
- Version 2 `matchedRank` JSON evidence.
- The unchanged no-model, no-network, read-only, and exit-code contracts.

The wording must not imply that a model judges relevance or that Silen tunes
content automatically.

## 12. Verification strategy

Focused evaluator tests must cover:

- Version 1 parsing, matching, validation, and byte-identical JSON output.
- Version 2 default and explicit maximum ranks.
- Pass exactly at the bound and failure one rank below the bound.
- A complete match missing from Top K and a route match with the wrong heading.
- Integer, minimum, maximum, and `maxRank <= topK` validation with precise
  field paths.
- Stable `matchedRank`, `null`, result ordering, and serialization.
- Human diagnostics for below-bound and missing matches.
- Existing no-write, no-network, bounded-file, and symlink protections.

CLI tests must preserve 0/1/2 exits and parse both report versions. Website
tests must require three English and three Chinese cases, explicit rank bounds,
all dedicated AI routes, and a passing production evaluation. Documentation
tests must protect the new version and rank terminology.

The delivery gate includes focused tests, the full suite, formatting, lint,
typecheck, package build, `publint`, and provider-credential-free
`pnpm site:check`.

## 13. Delivery boundary

`AI-004` is complete when:

1. New Silen versions read v1 and v2 suites through explicit compatible paths.
2. Version 1 reports remain unchanged for the same inputs.
3. Version 2 rank policy and evidence are deterministic and validated.
4. The six-case official bilingual suite passes its `1/1/2` rank policy.
5. Documentation and tests describe and protect the migration contract.
6. All repository and official-site gates pass without provider credentials.
7. The project map records the verified implementation evidence.

A package version, changelog entry, GitHub Release, npm publication, or public
deployment is a separate authorized release operation.
