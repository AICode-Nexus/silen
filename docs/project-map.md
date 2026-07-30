# Silen Project Map

- Last reviewed: 2026-07-30
- Baseline:
  [`@aicode-nexus/silen` 0.5.0](../CHANGELOG.md#050---2026-07-30) at
  [`v0.5.0`](https://github.com/AICode-Nexus/silen/releases/tag/v0.5.0).
- Default next item: None; `0.6.x` items remain Watch-only experiments.
- Governance:
  [Silen Project Map Design](./superpowers/specs/2026-07-29-silen-project-map-design.md)

This is the canonical project position and execution-order document for Silen.
Specs explain why, implementation plans explain how, ADRs preserve long-lived
decisions, and the changelog records user-visible history. They do not maintain
separate roadmap state.

## Product compass

Silen turns trusted Markdown and MDX into deterministic static documentation
for people and AI clients. Its core remains model-optional, documentation-first,
and useful without hosted infrastructure.

Durable boundaries:

- HTML, Markdown, discovery files, search data, and AI artifacts derive from
  shared source content and stable build contracts.
- A model, provider account, embeddings service, vector database, or hosted
  gateway is never required for the complete build, audit, evaluation, local
  search, or read-only MCP path.
- Local MCP remains read-only by default. Mutating or remote capabilities need
  explicit product, permission, and security boundaries.
- Core package growth must solve a demonstrated documentation workflow rather
  than mirror every upstream AI platform feature.
- Human maintainers remain accountable for product decisions, releases, and
  external operations.

The map controls default work selection. It does not authorize publishing,
deployment, destructive actions, or changes to external systems.

## How to read the map

The lifecycle is:

```text
Watch -> Candidate -> Ready -> Active -> Shipped
```

| State | Meaning | Default executable |
| --- | --- | --- |
| `Watch` | Dated external signal or experiment with a promotion trigger | No |
| `Candidate` | Product-aligned outcome still missing a decision or entry gate | No |
| `Ready` | Bounded outcome with known dependencies and testable completion | Yes, in listed order |
| `Active` | The single map-selected item currently being delivered | Continue first |
| `Shipped` | Verified on the default branch with linked evidence | No |

Item IDs are permanent and never reused. State is the section containing the
item. `Active` and `Ready` order is priority; version horizons are planning
labels, not date commitments.

## Capability tracks

| Prefix | Track | Product boundary |
| --- | --- | --- |
| `CORE` | Core | Compiler, runtime, routing, configuration, and CLI |
| `THEME` | Default Theme | Reader UX, accessibility, search UI, and visual system |
| `AI` | AI knowledge layer | AI artifacts, Agent Contract, MCP, evaluation, and Ask AI boundaries |
| `PLUGIN` | Plugin ecosystem | Extension contracts, hooks, examples, and interoperability |
| `QUAL` | Quality and release | Tests, deterministic gates, packaging, documentation, and release evidence |

## Release path

- `0.4.x`: shipped the deterministic model-free quality loop, ranked
  expectations, and release-enforced 24-case AI readiness gate.
- `0.5.0`: shipped MCP v2 dual-protocol compatibility and the generated
  read-only Agent Skills surface while preserving local stdio and default
  read-only behavior.
- `0.6.x`: keep `AI-007`, `AI-008`, and `AI-009` experimental until their
  security, host-support, and deployment promotion gates are satisfied.

Only the first eligible `Ready` item is default-executable. Candidate and Watch
items remain planning inputs, not release commitments.

## Active

No map-selected item is active.

## Ready

No item is ready for default implementation.

## Candidate

No item is currently a Candidate.

## Watch

Watch items are observations, not release commitments. They cannot be selected
for default implementation.

### AI-007 — Optional stateless read-only remote MCP

- Outcome: Observe whether a separately enabled, stateless, read-only remote
  adapter would make Silen knowledge safely useful beyond local stdio clients;
  remote writes remain unsupported.
- Horizon: `0.6.x` experiment.
- Depends on: `AI-005` and a demonstrated remote consumer need.
- Entry gate: Promote only after a threat model, authorization boundary,
  deployment owner, tenancy model, OAuth resource-server design, and
  local-first compatibility plan are approved.
- Done when: A promoted experiment is explicitly opt-in and implements OAuth,
  token-audience binding, a strict ban on token passthrough, tool-level
  authorization, and auditable access decisions while leaving local stdio
  unchanged; otherwise evidence retires the idea with a decision note.
- Evidence:
  [MCP 2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28),
  [MCP security best practices](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices),
  and [modern protocol behavior](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions),
  observed 2026-07-29.

### AI-008 — MCP Tasks and Apps readiness

- Outcome: Observe whether long-running audit/evaluation should use negotiated
  MCP Tasks and whether an MCP App should render an AI-readiness dashboard from
  the same structured reports.
- Horizon: `0.6.x` experiment.
- Depends on: `AI-005`, `QUAL-003`, and verified host support.
- Entry gate: Promote only with a bounded long-running workflow, a client
  compatibility matrix, durable task-state and cancellation rules, and an App
  sandbox, content-security, and read-only data-flow design.
- Done when: A promoted experiment negotiates both extensions explicitly;
  Tasks expose durable progress, resume, failure, and cancellation semantics
  for audit/eval, while the App renders the schema-versioned readiness report
  without gaining write authority; otherwise the item is retired with a
  decision note. Neither extension becomes required for the core local path.
- Evidence:
  [MCP Tasks](https://modelcontextprotocol.io/extensions/tasks/overview) and
  [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview),
  observed 2026-07-29.

### AI-009 — Reference Ask AI gateway

- Outcome: Observe repeated deployer demand for a separately deployable,
  provider-neutral reference gateway template that keeps credentials, policy,
  and hosted operations outside the Silen core package.
- Horizon: `0.6.x` experiment.
- Depends on: `AI-001` and evidence from more than one deployment context.
- Entry gate: Promote only after defining ownership, authentication, abuse
  controls, citation guarantees, streaming compatibility, and a support
  boundary separate from the static-site package.
- Done when: Either repeated validated deployments justify a separate
  `Candidate` design whose keys remain server-side and whose absence leaves the
  core model-free, key-free, and offline-capable, or the endpoint-contract-only
  product boundary is reaffirmed in a decision note.
- Evidence:
  [current Ask AI documentation](../website/ai/index.mdx) and
  [AI Alpha plan](./superpowers/plans/2026-07-13-silen-ai-alpha.md), reviewed
  2026-07-29.

## Shipped

### CORE-001 — Core Alpha

- Outcome: A publishable React/MDX documentation engine provides typed config,
  static routing, SSR, hydration, navigation, build, dev, and preview commands.
- Horizon: `0.1.0`.
- Depends on: None.
- Entry gate: The original Silen product design and Core Alpha plan were
  approved.
- Done when: Clean consumers can install the package, build a static site, and
  use its public Node, client, and theme contracts.
- Evidence:
  [Silen design](./superpowers/specs/2026-07-13-silen-design.md),
  [Core Alpha plan](./superpowers/plans/2026-07-13-silen-core-alpha.md), and
  [`0.1.0` changelog](../CHANGELOG.md#010---2026-07-15).

### THEME-001 — Default Theme Alpha

- Outcome: The default theme provides responsive navigation, accessible
  document layouts, local search, appearance controls, and semantic extension
  tokens.
- Horizon: `0.1.0` with verified follow-up through `0.3.1`.
- Depends on: `CORE-001`.
- Entry gate: Core page, route, build, and hydration contracts were stable
  enough for a reusable theme.
- Done when: Theme behavior works across server rendering, hydration, desktop,
  mobile, keyboard, and appearance modes with documented extension seams.
- Evidence:
  [Default Theme plan](./superpowers/plans/2026-07-13-silen-default-theme-alpha.md),
  [`0.1.0` changelog](../CHANGELOG.md#010---2026-07-15), and
  [sidebar QA](./quality/2026-07-20-sidebar-redesign-qa.md).

### AI-001 — AI Alpha

- Outcome: Every build emits deterministic AI-readable artifacts, local MCP
  offers read-only tools by default, and Ask AI remains an optional endpoint
  adapter.
- Horizon: `0.1.0`.
- Depends on: `CORE-001` and `THEME-001`.
- Entry gate: The shared page model could produce HTML and AI outputs without
  a parallel content pipeline.
- Done when: Artifacts are deterministic, MCP path and permission boundaries
  are tested, and the Ask AI client is absent without an endpoint.
- Evidence:
  [AI Alpha plan](./superpowers/plans/2026-07-13-silen-ai-alpha.md),
  [AI documentation](../website/ai/index.mdx), and
  [`0.1.0` changelog](../CHANGELOG.md#010---2026-07-15).

### AI-002 — AI Contract Layer

- Outcome: Package and site builds expose generated, versioned public
  contracts, registries, instructions, and bilingual task playbooks for agents.
- Horizon: `0.1.0`.
- Depends on: `AI-001`.
- Entry gate: Existing config, CLI, MCP, and task behavior could be centralized
  before serialization.
- Done when: Generated contracts match runtime registries, pass audits, package
  correctly, and avoid executing project config from untrusted read-only paths.
- Evidence:
  [AI Contract design](./superpowers/specs/2026-07-15-silen-ai-contract-layer-design.md),
  [AI Contract plan](./superpowers/plans/2026-07-15-silen-ai-contract-layer.md),
  and [`0.1.0` changelog](../CHANGELOG.md#010---2026-07-15).

### PLUGIN-001 — Plugin System

- Outcome: Ordered plugins can extend MDX, page data, head output, client
  behavior, and completed builds through typed public contracts.
- Horizon: `0.1.0`.
- Depends on: `CORE-001` and `THEME-001`.
- Entry gate: Protected core virtual modules and stable build phases could be
  isolated from community extension hooks.
- Done when: Ordering, SSR safety, hydration parity, error attribution,
  packaging, and public examples are tested and documented.
- Evidence:
  [Plugin design](./superpowers/specs/2026-07-15-silen-plugin-system-design.md),
  [Plugin plan](./superpowers/plans/2026-07-15-silen-plugin-system.md), and
  [`0.1.0` changelog](../CHANGELOG.md#010---2026-07-15).

### QUAL-001 — Deterministic package and release baseline

- Outcome: CI, browser, npm publishing, and Pages workflows use pinned runtimes
  and verify formatting, types, builds, tests, package metadata, browser
  behavior, and source-map absence as appropriate.
- Horizon: `0.4.0` baseline.
- Depends on: `CORE-001`, `THEME-001`, `AI-001`, and `PLUGIN-001`.
- Entry gate: Public package and site delivery needed reproducible checks across
  supported Node versions.
- Done when: Current default-branch workflows expose explicit failing gates and
  releases are tied to repository evidence.
- Evidence:
  [CI workflow](../.github/workflows/ci.yml),
  [publish workflow](../.github/workflows/publish.yml),
  [Pages workflow](../.github/workflows/pages.yml), and
  [changelog](../CHANGELOG.md).

### AI-003 — Model-Free AI Quality Loop

- Outcome: Authors can build, audit, and evaluate production retrieval with
  stable reports and exit codes without a model, provider, secret, or network.
- Horizon: `0.4.0`.
- Depends on: `AI-001`, `AI-002`, and `QUAL-001`.
- Entry gate: Production MiniSearch ranking was available for reuse without
  changing the public reader result contract.
- Done when: `silen ai eval` validates bounded suites against the production
  index, audit is base-aware, optional cache state is non-blocking, and the
  official bilingual suite passes deterministically.
- Evidence:
  [quality-loop design](./superpowers/specs/2026-07-22-silen-model-free-ai-quality-loop-design.md),
  [quality-loop plan](./superpowers/plans/2026-07-22-silen-model-free-ai-quality-loop.md),
  [`0.4.0` changelog](../CHANGELOG.md#040---2026-07-22), and
  [`v0.4.0`](https://github.com/AICode-Nexus/silen/releases/tag/v0.4.0).

### QUAL-002 — Unified deterministic site gate

- Outcome: One maintainer command builds the package and official site, audits
  AI artifacts, evaluates production retrieval, and rejects source maps before
  GitHub Pages deployment.
- Horizon: `0.4.x`.
- Depends on: `QUAL-001` and `AI-003`.
- Entry gate: The independent `0.4.0` build, audit, evaluation, and no-map
  commands passed before composition.
- Done when: `pnpm site:check` passes without provider credentials, Pages uses
  it once, CI and Publish avoid duplicate site builds, and the full repository
  gate remains green.
- Evidence:
  [deterministic site gate design](./superpowers/specs/2026-07-29-silen-deterministic-site-gate-design.md),
  [implementation plan](./superpowers/plans/2026-07-29-silen-deterministic-site-gate.md),
  [package script](../package.json),
  [focused contract test](../tests/ai/site-quality-gate.test.ts), and
  [Pages workflow](../.github/workflows/pages.yml).

### AI-004 — Ranked retrieval evaluation expectations

- Outcome: Versioned model-free evaluation can enforce a case-specific maximum
  rank while preserving complete deterministic Top-K evidence.
- Horizon: `0.4.x`.
- Depends on: `AI-003`.
- Entry gate: The shipped four-case version 1 suite and production evaluator
  passed before the compatibility design was approved.
- Done when: New Silen versions preserve v1 reports, accept v2 rank policy,
  the six-case bilingual suite passes its `1/2/1` bounds, and the full
  repository and official-site gates remain green.
- Evidence:
  [rank-expectations design](./superpowers/specs/2026-07-29-silen-retrieval-rank-expectations-design.md),
  [implementation plan](./superpowers/plans/2026-07-29-silen-retrieval-rank-expectations.md),
  [evaluator](../src/ai/eval.ts),
  [focused tests](../tests/ai/eval.test.ts), and
  [official suite](../website/.silen/ai-evals.json).

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

### AI-005 — MCP SDK v2 dual-protocol compatibility

- Outcome: Silen uses the official split TypeScript SDK v2 packages and serves
  both `2025-11-25` and `2026-07-28` over local stdio without changing tool
  names, default permissions, or filesystem boundaries.
- Horizon: `0.5.0`.
- Depends on: `AI-001`, `AI-002`, and `QUAL-003`.
- Entry gate: The approved migration design pinned SDK v2 `2.0.0`, bounded the
  codemod and manual rewrites, and specified dual-era interoperability and
  deterministic contract regeneration.
- Done when: No v1 SDK dependency or unresolved codemod marker remains; built
  stdio fixtures negotiate both protocol eras; all ten tools expose formal
  output schemas and validated native JSON `structuredContent`; Agent Contract
  schema version 2 declares protocol versions, stdio transport, empty
  extensions, and read-only defaults; write tools still require
  `--allow-write`; no shell or remote transport is introduced; and the package
  and official-site gates pass.
- Evidence:
  [approved design](./superpowers/specs/2026-07-30-silen-mcp-v2-dual-protocol-design.md),
  [implementation plan](./superpowers/plans/2026-07-30-silen-mcp-v2-dual-protocol.md),
  [split SDK dependencies](../package.json),
  [dual-era stdio runtime](../src/ai/mcp/stdio.ts),
  [formal output schemas](../src/ai/mcp/output-schemas.ts),
  [Agent Contract declaration](../src/shared/ai-contract.ts),
  [migration guard](../tests/ai/mcp-v2-migration.test.ts),
  [built dual-era interoperability tests](../tests/ai/mcp-e2e.test.ts), and
  [stdio lifecycle tests](../tests/ai/mcp-stdio.test.ts). Verification on
  2026-07-30 passed format, lint, typecheck, build, 72 test files with 714
  tests, `publint`, the 24/24 official AI evaluation, source-map rejection, and
  `pnpm pack --dry-run`. Two clean builds produced identical SHA-256 hashes:
  manifest `c5afa5c100b4b0c93048326376aa36c01992ca59f3074b512e7efc5e665f6820`
  and API `f1da47d115ad55decbb6053323139a5ce8ea0b24f574a5a17b33cf2f0984d0de`.

### AI-006 — Read-only Agent Skills-compatible surface

- Outcome: Canonical bilingual Silen read/audit task packs generate one
  deterministic `silen-docs-readonly` Skill for npm and explicit filesystem
  materialization, with an optional read-only MCP Resources adapter.
- Horizon: `0.5.0`.
- Depends on: `AI-002` and `AI-005`.
- Entry gate: The approved mapping design fixed the allowlist, five-file
  package, validation rules, non-overwrite CLI, and default-off experimental
  MCP boundary.
- Done when: The npm, CLI, and MCP surfaces use identical validated package
  bytes; official `skills-ref` validation passes; write tasks, scripts,
  implicit permission, local paths, models, and remote services remain absent;
  both MCP eras pass; default MCP and Agent Contract extensions remain
  unchanged; and repository, package, site, browser, and release gates are
  green.
- Evidence:
  [approved design](./superpowers/specs/2026-07-30-silen-read-only-agent-skills-design.md),
  [implementation plan](./superpowers/plans/2026-07-30-silen-read-only-agent-skills.md),
  [generator](../src/ai/contract/agent-skills.ts),
  [filesystem materializer](../src/ai/skills.ts),
  [MCP Resources adapter](../src/ai/mcp/skill-resources.ts),
  [generator tests](../tests/ai/agent-skills.test.ts),
  [dual-era interoperability](../tests/ai/mcp-e2e.test.ts),
  [package smoke test](../tests/package-smoke.test.ts),
  [Core CI](../.github/workflows/ci.yml), and
  [npm Publish](../.github/workflows/publish.yml). Verification on 2026-07-30
  passed formatting, lint, typecheck, complete single-worker tests, browser
  tests, package build and smoke, `publint`, the 24/24 official AI evaluation,
  source-map rejection, pinned official Skill validation, package dry-run, and
  byte-identical repeated Skill builds.

## Default execution contract

Execution precedence is:

```text
explicit user scope
  > safe continuation of already-active scoped work
  > first eligible Ready item
```

With no special request:

1. Verify the baseline against current repository evidence.
2. Continue the `Active` item if its next step remains safe and in scope.
3. Otherwise select the first `Ready` item with satisfied dependencies and move
   it to `Active`.
4. Follow the repository's design and implementation-plan workflow before
   changing product behavior.
5. Verify the item's `Done when` criteria.
6. Update its state and evidence in the same change set.

If nothing is `Active` or eligible in `Ready`, report that fact and refine the
highest-value `Candidate`. Do not implement a `Watch` item speculatively.

Explicit bug, security, or user-directed work may interrupt the order. If it
changes durable product state, reconcile the map during the same delivery
cycle.

## Intake and promotion

New user needs and repository evidence may enter `Candidate` directly. Volatile
standards, SDKs, and AI ecosystem signals enter `Watch` with an official source,
observation date, relevance statement, and promotion trigger.

Promote `Watch` to `Candidate` only when the signal supports Silen's mission,
has a concrete outcome, respects deterministic local-first boundaries, and
names the remaining decision.

Promote `Candidate` to `Ready` only when its outcome and non-goals are bounded,
dependencies are known, acceptance evidence is testable, and unstable upstream
surfaces have a compatibility strategy.

Promote `Active` to `Shipped` only when completion evidence is linked, relevant
checks pass, documentation is synchronized, and the delivered state is present
on the default branch. Add separate release evidence when it reaches npm or the
public site.

## Document boundaries

| Artifact | Question it answers |
| --- | --- |
| This project map | Where are we, and what is eligible next? |
| Design spec | Why should a bounded change work this way? |
| Implementation plan | How will an approved design be delivered? |
| ADR | Which long-lived architectural decision was made? |
| Issue | Which report or request needs coordination? |
| Changelog/release | What changed for users? |

## Maintenance checklist

Review this map whenever a durable item changes state or a release changes the
baseline:

- [ ] Baseline version matches `package.json`, the changelog, and release
      evidence.
- [ ] Every item ID is unique and every dependency points to a known item.
- [ ] At most one item is `Active`.
- [ ] Every `Ready` item has bounded entry and completion gates.
- [ ] Every `Shipped` item links to current evidence.
- [ ] Every repository-relative link resolves.
- [ ] Every external `Watch` source has an observation date.
- [ ] No `Candidate` or `Watch` item reads like a committed release.
- [ ] README and `AGENTS.md` still link here without copying roadmap state.

Old unchecked implementation-plan boxes do not reopen shipped work. Reconcile
status from current code, tests, commits, tags, and documentation.
