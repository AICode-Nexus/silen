# Silen Project Map Design

- Status: Approved
- Date: 2026-07-29
- Approved: 2026-07-29
- Repository: `AICode-Nexus/silen`
- Package: `@aicode-nexus/silen`

## 1. Summary

Silen will add one durable project map that tells maintainers and repository
agents where the product is, which outcomes are ready to execute, which ideas
are still candidates, and what evidence is required before work is considered
shipped.

The selected design uses three small repository surfaces:

1. `docs/project-map.md` is the only authoritative project map.
2. `AGENTS.md` routes repository agents to the map and defines the default
   execution precedence without copying roadmap content.
3. `README.md` links to the map for human discoverability.

The map is a planning and execution index, not a replacement for specs,
implementation plans, ADRs, issues, or release notes. It links to those
artifacts and records concise evidence instead of duplicating their content.

## 2. Product decision

The selected approach is **one map plus a repository execution entry point**.
It provides enough structure for deterministic default execution while
remaining easy to edit and review as ordinary Markdown.

Two alternatives were considered:

- A standalone Markdown map would be simplest, but future agent sessions could
  miss it unless the user explicitly mentioned it.
- A YAML or JSON manifest with generated views would be easier to validate
  mechanically, but it would introduce a schema, generator, and synchronization
  workflow before the project has demonstrated that this complexity is needed.

Version 1 therefore keeps the map human-readable, makes it discoverable through
`AGENTS.md` and `README.md`, and uses a strict documented shape plus a review
checklist. A machine-readable manifest may be reconsidered only after real map
growth or drift makes manual maintenance unreliable.

## 3. Goals

The first version must:

1. Establish one current, evidence-backed view of the Silen product baseline.
2. Preserve the existing Core, Default Theme, AI, Plugin, and Quality/Release
   planning boundaries rather than flattening them into generic improvements.
3. Distinguish executable work from ideas that still require evidence or a
   product decision.
4. Give a future maintainer or repository agent an unambiguous default item to
   select when the user has not supplied a more specific scope.
5. Keep explicit user instructions above all map guidance.
6. Record stable work-item identifiers, dependencies, completion criteria, and
   evidence links.
7. Make roadmap updates part of completing durable project work.
8. Accept new AI ecosystem signals without turning every announcement into a
   committed feature.
9. Remain useful without a hosted service, project-management integration, or
   custom roadmap application.

## 4. Non-goals

Version 1 will not:

- Replace GitHub issues, task-level checklists, specs, implementation plans,
  ADRs, changelogs, or release notes.
- Assign people, estimate effort, track hours, or promise calendar dates.
- Treat old unchecked plan boxes as proof that shipped functionality is absent.
- Automatically implement, commit, publish, deploy, or release work.
- Grant permission for destructive actions or external-state changes.
- Maintain a second public roadmap whose content can drift from the canonical
  map.
- Add a roadmap parser, generator, dashboard, or CI schema in the first
  version.
- Commit experimental ecosystem features merely because an upstream standard
  or product announced them.

## 5. Source-of-truth architecture

### 5.1 Canonical map

`docs/project-map.md` is the sole source of truth for product position,
execution order, and planning state. Other documents may link to it but must
not maintain independent copies of its work-item tables.

The map itself does not override observable repository truth. A shipped claim
must point to evidence such as code, tests, a merged commit, a release tag, or
published documentation. When the map conflicts with current repository
evidence, the evidence wins and the map must be corrected before selecting
more default work.

### 5.2 Agent entry point

The root `AGENTS.md` contains only durable execution rules:

1. Read `docs/project-map.md` before proposing or starting roadmap work.
2. Follow an explicit user request even when it differs from the map.
3. With no special scope, continue the current `Active` item or select the
   first eligible `Ready` item.
4. Never implement `Candidate` or `Watch` items by default.
5. Update the map and attach verification evidence when durable mapped work is
   completed.
6. Do not infer release, deployment, publication, destructive-action, or other
   external authority from a map entry.

`AGENTS.md` must not repeat item status or priority. This prevents it from
becoming a competing roadmap.

### 5.3 Human entry point

`README.md` adds one concise project-map link near the contributing material.
The README does not embed current priorities, because those would require a
second synchronized update surface.

### 5.4 Related artifacts

The document boundaries are:

| Artifact | Question it answers |
| --- | --- |
| Project map | Where are we, and what is eligible to happen next? |
| Design spec | Why should a bounded change work this way? |
| Implementation plan | How will an approved design be delivered? |
| ADR | Which long-lived architectural decision was made? |
| Issue | Which report, request, or task needs coordination? |
| Changelog/release | What changed for users? |

The map references these artifacts by relative link. It summarizes only the
minimum needed to choose and close work.

## 6. Map information model

### 6.1 Header and product compass

The map starts with:

- Last-reviewed date.
- Baseline package version and corresponding release or commit evidence.
- A short product mission.
- Durable product boundaries and explicit non-goals.
- The default-execution rule in one sentence.

The header is factual metadata, not a release forecast. A version horizon such
as `0.4.x` or `0.5.x` may be shown as a planning label, but it is not a date or
commitment.

### 6.2 Capability tracks

Every item belongs to one stable track:

| Prefix | Track | Boundary |
| --- | --- | --- |
| `CORE` | Core | Compiler, runtime, routing, configuration, and CLI |
| `THEME` | Default Theme | Reader UX, accessibility, search UI, and visual system |
| `AI` | AI knowledge layer | AI artifacts, Agent Contract, MCP, evaluation, and Ask AI boundaries |
| `PLUGIN` | Plugin ecosystem | Extension contracts, hooks, examples, and interoperability |
| `QUAL` | Quality and release | Tests, deterministic gates, packaging, documentation, and release evidence |

Existing named phases such as Core Alpha and Default Theme Alpha remain visible
inside their respective tracks. Stable identifiers use the form `TRACK-NNN`,
are never reused, and do not change when an item moves between states.

### 6.3 Lifecycle states

The canonical lifecycle is:

```text
Watch -> Candidate -> Ready -> Active -> Shipped
```

- **Watch** records an external signal or experiment worth monitoring. It is
  neither a promise nor default-executable work.
- **Candidate** describes a product-aligned outcome that still lacks at least
  one promotion condition, design decision, dependency, or acceptance gate.
- **Ready** has a bounded outcome, satisfied entry conditions, known
  dependencies, and testable completion evidence. Table order is priority.
- **Active** is the single default roadmap item currently being delivered.
  There may be at most one map-selected `Active` item at a time.
- **Shipped** has met its completion criteria and is present on the default
  branch with linked evidence. Its evidence states separately whether it has
  also appeared in a package or site release.

An explicit user request may introduce work outside this sequence. If that work
changes durable product direction, the map is updated during the same delivery
cycle rather than silently treating the exception as a new default.

### 6.4 Work-item fields

Each mapped item contains:

| Field | Requirement |
| --- | --- |
| ID | Stable `TRACK-NNN` identifier |
| Outcome | One observable product result, not an activity label |
| Horizon | Optional release family or `Unscheduled` |
| Depends on | Item IDs or concrete external conditions |
| Entry gate | Evidence required before promotion to `Ready` |
| Done when | Testable exit criteria |
| Evidence | Links to specs, plans, tests, commits, releases, or sources |

State is represented by the section containing the item. Priority is the order
within `Active` and `Ready`; a separate numeric priority field is deliberately
omitted.

Long rationale stays in a linked spec or ADR. If an item cannot be described
concisely, it must be decomposed before becoming `Ready`.

## 7. Default execution contract

The execution precedence is:

```text
explicit user scope
  > safe continuation of already-active scoped work
  > first eligible Ready map item
```

When no special request is present, a maintainer or repository agent:

1. Reads the current map and validates its baseline against repository evidence.
2. Continues the `Active` item when its next step remains safe and in scope.
3. Otherwise selects the first `Ready` item whose dependencies are satisfied.
4. Uses the repository's design and implementation-planning workflow in
   proportion to the change before modifying product behavior.
5. Verifies the result against the item's `Done when` criteria.
6. Updates the map state and evidence in the same change set.

The map authorizes prioritization, not unlimited action. Publishing packages,
deploying sites, changing external systems, deleting data, or performing other
material external actions still requires authority from the current user scope
or an already-approved delivery workflow.

If the map has no eligible `Active` or `Ready` item, the default action is to
report that state and refine a `Candidate`; it is not to implement a `Watch`
item speculatively.

## 8. Intake and promotion rules

### 8.1 Intake

New input can come from user requests, repository evidence, issue reports,
standards, SDK releases, security findings, or broader AI ecosystem research.

Volatile external information enters `Watch` with a direct source, observation
date, relevance statement, and promotion trigger. This preserves useful market
awareness without confusing recency with product priority.

Defects or security issues follow their explicit user or severity-driven scope;
they do not wait behind roadmap order. A durable fix still updates the relevant
map baseline or evidence when it changes the product state.

### 8.2 Promotion to Candidate

A `Watch` item becomes `Candidate` only when it:

- Supports Silen's documentation-first product mission.
- Has a concrete user or maintainer outcome.
- Respects the existing model-optional, deterministic, local-first boundaries.
- Can be isolated from unrelated platform expansion.
- Names the unresolved evidence or decision still blocking readiness.

### 8.3 Promotion to Ready

A `Candidate` becomes `Ready` only when:

- Its outcome and non-goals are bounded.
- Dependencies and compatibility constraints are known.
- Acceptance evidence is testable.
- Required design decisions are approved or explicitly delegated to the work.
- It does not rely on an unstable upstream surface without a compatibility
  strategy.

### 8.4 Promotion to Shipped

An `Active` item becomes `Shipped` only when its completion evidence is linked,
the relevant checks pass, documentation is synchronized, and the delivered
state is present on the default branch. Release evidence is added when a public
package or site release occurs.

## 9. Initial map population

The first map will use current repository and release evidence to seed the
following positions.

### 9.1 Shipped baseline

- Core Alpha: publishable React/MDX documentation engine and CLI.
- Default Theme Alpha: responsive, accessible documentation theme and local
  search experience.
- AI Alpha: deterministic AI artifacts, optional local MCP workspace, and the
  provider-neutral Ask AI extension boundary.
- AI Contract Layer: generated public contract, task packs, registries, and
  audits.
- Plugin System: stable ordered extension kernel and public examples.
- Model-Free AI Quality Loop: deterministic `ai audit` and `ai eval` workflow,
  represented by the `0.4.0` baseline.

Old plan checkboxes are historical execution scaffolding, not current status
evidence. Shipped classification is reconciled against code, tests, commits,
release tags, and current documentation.

### 9.2 Ready direction

The first ordered readiness work will cover:

1. One official deterministic gate that composes site build, AI audit, AI
   evaluation, and source-map absence checks with clear failure evidence.
2. Broader official evaluation coverage and stricter per-case rank expectations
   so a page appearing anywhere in a broad top-K set is not always sufficient.

The implementation plan may combine or separate these only if the map keeps
each outcome and completion gate unambiguous.

### 9.3 Candidate direction

- MCP TypeScript SDK and protocol compatibility migration, gated by explicit
  compatibility tests and preservation of the local read-only default.
- A generated, read-only Agent Skills-compatible surface derived from existing
  Silen contracts rather than a second manually maintained task system.

### 9.4 Watch direction

- Optional stateless read-only remote MCP transport.
- Readiness for emerging MCP task and app interaction surfaces.
- A reference Ask AI gateway that remains separate from the core package and
  keeps provider credentials server-side.

These initial positions are planning seeds, not release promises. Their exact
IDs, evidence links, and entry gates are finalized while writing the canonical
map.

## 10. Drift and error handling

The map includes a maintenance checklist requiring reviewers to verify:

- The baseline version matches `package.json` and linked release evidence.
- Every item ID is unique and every dependency references a known item.
- No more than one item is `Active`.
- Every `Ready` item has complete entry and exit gates.
- Every `Shipped` item links to current evidence.
- Every local link resolves.
- External `Watch` sources include an observation date.
- No `Candidate` or `Watch` item is phrased as a committed release.

If baseline evidence and map state disagree, default roadmap execution pauses
only long enough to reconcile the map. The reconciliation must not rewrite
repository history or mark an item shipped merely because an old plan says it
was intended.

If the map grows beyond a size that reviewers can reliably validate, repeated
drift is the trigger to design a structured manifest or validator. Version 1
does not pre-commit to that implementation.

## 11. Verification

The implementation is complete when:

1. `docs/project-map.md`, `AGENTS.md`, and the README link exist and point to one
   canonical map.
2. The initial baseline and future items are backed by current repository or
   dated external evidence.
3. The lifecycle, promotion rules, and default execution precedence are stated
   without ambiguity.
4. There is no duplicated priority table outside the canonical map.
5. A link and consistency review confirms the maintenance checklist.
6. Repository formatting checks pass for all changed Markdown files.
7. A clean-session reader can answer both "what is Silen's current baseline?"
   and "what should happen next with no special request?" using the map and
   `AGENTS.md` alone.

## 12. Rollout boundary

The first implementation changes documentation and repository guidance only.
It does not change package runtime behavior or public exports.

After the written design is approved, a focused implementation plan will:

1. Reconcile existing evidence into stable map items.
2. Create the canonical map.
3. Add the minimal `AGENTS.md` routing contract.
4. Link the map from the README.
5. Run the consistency, link, and formatting checks.

Future feature delivery may then use the map as its default planning entry
point, subject to the authority and precedence rules in this design.
