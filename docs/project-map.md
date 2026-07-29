# Silen Project Map

- Last reviewed: 2026-07-29
- Baseline:
  [`@aicode-nexus/silen` 0.4.0](../CHANGELOG.md#040---2026-07-22) at
  [`v0.4.0`](https://github.com/AICode-Nexus/silen/releases/tag/v0.4.0)
  ([commit `01b95b4`](https://github.com/AICode-Nexus/silen/commit/01b95b4))
- Default next item: `QUAL-002`
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

## Active

### QUAL-002 — Unify the official deterministic site gate

- Outcome: One documented repository command builds the package and official
  site, runs `silen ai audit` and `silen ai eval` against `website`, and checks
  package and site output for source maps.
- Horizon: `0.4.x`
- Depends on: `QUAL-001` and `AI-003`.
- Entry gate: The `0.4.0` build, audit, evaluation, and no-map commands already
  pass independently; the current Pages workflow invokes build and no-map
  checks but not audit or evaluation.
- Done when: The aggregate command has stable failure behavior, is documented,
  is exercised by the official-site deployment or CI path, and passes from a
  clean checkout without model credentials or network-dependent evaluation.
- Evidence:
  [deterministic site gate design](./superpowers/specs/2026-07-29-silen-deterministic-site-gate-design.md),
  [package scripts](../package.json),
  [Pages workflow](../.github/workflows/pages.yml), and
  [`0.4.0` quality-loop design](./superpowers/specs/2026-07-22-silen-model-free-ai-quality-loop-design.md).

## Ready

Items are ordered. Start the first item whose dependencies remain satisfied.

### AI-004 — Strengthen official retrieval evaluation precision

- Outcome: The bilingual official suite covers the main AI-facing workflows
  and can require an expected page or heading to appear within a case-specific
  maximum rank.
- Horizon: `0.4.x`
- Depends on: `AI-003`.
- Entry gate: The committed four-case suite and deterministic evaluator are
  shipped, and the bounded change begins with an approved compatibility design
  for the suite schema and stable JSON output.
- Done when: Per-case rank expectations are validated and reported
  deterministically, the existing schema remains safely migratable, the
  official bilingual suite covers its documented product surfaces, and
  regressions fail with actionable ranked evidence.
- Evidence:
  [official evaluation suite](../website/.silen/ai-evals.json),
  [`0.4.0` changelog](../CHANGELOG.md#040---2026-07-22), and
  [quality-loop plan](./superpowers/plans/2026-07-22-silen-model-free-ai-quality-loop.md).

## Candidate

Candidate order is informative. An item must satisfy its entry gate before it
moves to `Ready`.

### AI-005 — Migrate MCP compatibility to the 2026 protocol and SDK v2

- Outcome: Silen uses the stable split TypeScript SDK v2 packages while
  preserving local stdio interoperability, the read-only default, bounded
  inputs, and explicit write opt-in.
- Horizon: `0.5.x`
- Depends on: `AI-001` and `AI-002`.
- Entry gate: Produce and approve a migration design covering dependency
  changes, legacy and modern protocol behavior, stdio fixtures, tool
  annotations, shutdown, and package compatibility.
- Done when: The supported protocol eras and downgrade behavior are explicit,
  compatibility tests cover built stdio clients and permission gates, public
  contracts regenerate deterministically, and no remote transport is silently
  enabled.
- Evidence:
  [current v1 dependency](../package.json),
  [MCP 2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28),
  [TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/), and
  [protocol-version guidance](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions)
  observed 2026-07-29.

### AI-006 — Generate a read-only Agent Skills-compatible surface

- Outcome: Existing Silen task packs and public contracts can emit a standard
  `SKILL.md`-based read-only guidance surface without creating a second
  hand-maintained instruction system.
- Horizon: `0.5.x`
- Depends on: `AI-002`.
- Entry gate: Approve a field-by-field mapping from the existing Agent Contract
  and bilingual task sources to the Agent Skills format, including naming,
  packaging, validation, and exclusion rules.
- Done when: Output is generated from canonical Silen sources, passes the
  official format validator, contains no implicit write permission, remains
  deterministic, and ships with interoperability fixtures.
- Evidence:
  [AI Contract design](./superpowers/specs/2026-07-15-silen-ai-contract-layer-design.md),
  [AI Contract plan](./superpowers/plans/2026-07-15-silen-ai-contract-layer.md),
  and [Agent Skills specification](https://agentskills.io/specification)
  observed 2026-07-29.

## Watch

Watch items are observations, not release commitments. They cannot be selected
for default implementation.

### AI-007 — Optional stateless read-only remote MCP

- Outcome: Observe whether a separately enabled remote transport would make
  Silen knowledge safely useful beyond local stdio clients.
- Horizon: Unscheduled.
- Depends on: `AI-005` and a demonstrated remote consumer need.
- Entry gate: Promote only after a threat model, authorization boundary,
  deployment owner, tenancy model, and local-first compatibility plan are
  approved.
- Done when: Either the promotion trigger is met and this moves to `Candidate`,
  or evidence shows the capability does not belong in Silen and the item is
  retired with a decision note.
- Evidence:
  [MCP 2026-07-28 specification](https://modelcontextprotocol.io/specification/2026-07-28)
  and
  [modern protocol behavior](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions),
  observed 2026-07-29.

### AI-008 — MCP Tasks and Apps readiness

- Outcome: Observe whether Silen gains a real long-running or interactive MCP
  workflow that benefits from negotiated Tasks or Apps extensions.
- Horizon: Unscheduled.
- Depends on: `AI-005` and a concrete product workflow that synchronous
  read-only tools cannot serve well.
- Entry gate: Promote only with verified host support, a bounded use case, and
  an isolation design that does not enlarge the core MCP surface by default.
- Done when: Either a qualifying workflow and compatibility matrix justify
  promotion to `Candidate`, or continued absence of a product need retires the
  item with a decision note.
- Evidence:
  [MCP Tasks](https://modelcontextprotocol.io/extensions/tasks/overview) and
  [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview),
  observed 2026-07-29.

### AI-009 — Reference Ask AI gateway

- Outcome: Observe repeated deployer demand for a separately deployable,
  provider-neutral gateway reference that keeps credentials and policy outside
  the Silen core package.
- Horizon: Unscheduled.
- Depends on: `AI-001` and evidence from more than one deployment context.
- Entry gate: Promote only after defining ownership, authentication, abuse
  controls, citation guarantees, streaming compatibility, and a support
  boundary separate from the static-site package.
- Done when: Either repeated validated deployments justify a separate
  `Candidate` design, or the endpoint-contract-only product boundary is
  reaffirmed in a decision note.
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
