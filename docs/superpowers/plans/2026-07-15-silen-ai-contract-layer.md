# Silen AI Contract Layer Implementation Plan

> For agentic workers: execute this plan task by task with the
> executing-plans skill. Keep the checked steps in this file aligned with the
> actual implementation state.

**Goal:** Let an AI create a new Silen knowledge base and safely read or
maintain an existing one using a versioned, machine-readable contract that is
published in both the npm package and every default site build.

**Architecture:** Central config, CLI, and MCP registries provide executable
runtime behavior and structured API metadata. A release-time generator combines
those registries, emitted TypeScript declarations, and curated bilingual task
playbooks into dist/agent. A site build specializes that packaged framework
contract with public site facts and writes a base-aware
.well-known/silen contract beside the existing llms and Markdown artifacts.

**Tech Stack:** TypeScript 7.0.2, Zod 4.4.3, CAC 7.0.0,
@modelcontextprotocol/sdk 1.29.0, gray-matter 4.0.3, tsup 8.5.1, jiti 2.7.0,
Vitest 4.1.10, Playwright 1.61.1, pnpm 10.34.0.

**Design:** docs/superpowers/specs/2026-07-15-silen-ai-contract-layer-design.md

## Global constraints

- Begin implementation in an isolated worktree or only after the existing
  plugin, analytics, favicon, navigation, and search changes have been committed.
  Do not stash, discard, or stage those unrelated edits.
- Re-read src/shared/config.ts, src/node/config.ts, src/node/build.ts,
  src/node/cli.ts, package.json, and their tests after the other feature work
  lands. Preserve the plugin lifecycle and analytics behavior.
- Use TDD. Add or change a focused test first, confirm the expected failure,
  implement the smallest coherent slice, then run the named regression set.
- Keep each task in a focused commit. Stage only files named by that task after
  checking git diff and git status.
- Contract generation is deterministic, model-free, and network-free.
- Existing llms.txt, llms-full.txt, ai-index.json, Markdown routes, MCP tools,
  and Ask AI behavior remain compatible.
- The new contract is enabled by default, but contract.enabled false disables
  only .well-known/silen output.
- All generated URLs are joined to config.base with URL helpers, never
  filesystem path helpers.
- Never serialize absolute paths, environment variables, functions, provider
  credentials, local Agent files, config module paths, or plugin instances.
- Never infer public content from AGENTS.md, CLAUDE.md, editor rules, or
  repository metadata.
- MCP remains stdio-only, read-only by default, and free of arbitrary shell,
  commit, push, or deployment operations.
- A client that cannot understand schemaVersion must fall back to read-only
  llms and Markdown access.
- Use the existing dependency set. Do not add an API documentation framework or
  a model dependency.

## Planned file map

~~~text
src/shared/ai-contract.ts                     Public and internal contract types
src/shared/version.ts                         One checked Silen version constant
src/node/config-schema.ts                     Runtime config schema and API metadata
src/node/commands.ts                          CLI descriptors and handlers
src/node/cli.ts                               CAC wiring through the descriptor registry
src/ai/mcp/contracts.ts                       Read/write MCP descriptor registries
src/ai/mcp/read-tools.ts                      Read-tool registration through descriptors
src/ai/mcp/write-tools.ts                     Write-tool registration through descriptors
src/ai/contract/schema.ts                     Manifest/API/task validation
src/ai/contract/serialize.ts                  Deterministic JSON and Markdown output
src/ai/contract/tasks.ts                      Built-in and custom task loading
src/ai/contract/framework.ts                  Framework Agent Contract assembly
src/ai/contract/site.ts                       Site-specific contract assembly
src/ai/contract/package-assets.ts             Installed package asset discovery
src/ai/contract/content/en-US/                Canonical guide and task pack
src/ai/contract/content/zh-CN/                Chinese guide and task pack
tooling/build-agent-contract.ts               Release-time dist/agent generator
dist/agent/                                   Generated package assets, never hand-edited
tests/ai/contract-schema.test.ts               Schema and deterministic serialization
tests/ai/task-contract.test.ts                 Task metadata and reference validation
tests/ai/config-contract.test.ts               Config API coverage
tests/ai/cli-contract.test.ts                  CLI registry and help parity
tests/ai/mcp-contract.test.ts                  Tool schema and permission parity
tests/ai/framework-contract.test.ts            Framework bundle generation
tests/ai/site-contract.test.ts                 Build output, base, locale, and privacy
tests/ai/contract-audit.test.ts                Freshness and fallback behavior
tests/fixtures/ai-contract-site/               Site-contract integration fixture
website/.silen/ai-public.md                    Official public Agent instructions
website/.silen/ai-tasks/                       Official custom task examples
~~~

The exact split may be adjusted to follow the final plugin implementation, but
the ownership boundaries and public outputs in this plan must remain intact.

---

## Task 1: Define the versioned contract model and deterministic serializers

**Files:**

- Create: src/shared/ai-contract.ts
- Create: src/shared/version.ts
- Create: src/ai/contract/schema.ts
- Create: src/ai/contract/serialize.ts
- Modify: src/node/cli.ts
- Modify: src/ai/mcp/server.ts
- Create: tests/ai/contract-schema.test.ts
- Modify: tests/cli.test.ts
- Modify: tests/ai/mcp-stdio.test.ts

**Public interfaces:**

- SilenContractManifest with schemaVersion 1 and kind
  silen-framework or silen-site.
- SilenApiContract with config, cli, mcp, and exports sections.
- SilenTaskMetadata with id, title, contractVersion, mode, and explicit
  authorization requirements.
- SILEN_VERSION consumed by CLI, MCP, and contract generators.
- serializeContractJson(value) with stable key and array ordering and one final
  newline.

- [x] **Step 1: Add failing manifest and API schema tests**

Cover:

- A valid framework manifest.
- A valid site manifest with base-aware resources and locales.
- Rejection of schemaVersion other than 1 by the v1 parser.
- Rejection of write tasks without requiresExplicitAuthorization true.
- Rejection of absolute filesystem paths in public resource fields.
- Byte-identical serialization from semantically identical unordered inputs.

Run:

~~~bash
pnpm test tests/ai/contract-schema.test.ts
~~~

Expected: the new test fails because contract types and serializers do not
exist.

- [x] **Step 2: Implement the smallest v1 schemas and serializer**

Use strict Zod objects for public JSON. Preserve deterministic ordering by
sorting resources by id and language, tasks by id and language, config fields by
path, CLI commands by id, MCP tools by name, and exports by entry point and
symbol.

Do not add site file loading or output writes in this task.

- [x] **Step 3: Centralize the package version**

Move the duplicated CLI and MCP version string into src/shared/version.ts.
Add a test that compares SILEN_VERSION with package.json. This keeps the value
usable synchronously while making release drift fail CI.

Run:

~~~bash
pnpm test tests/ai/contract-schema.test.ts tests/cli.test.ts tests/ai/mcp-stdio.test.ts
pnpm typecheck
~~~

Expected: all selected tests and typecheck pass.

- [x] **Step 4: Commit**

~~~bash
git add src/shared/ai-contract.ts src/shared/version.ts src/ai/contract/schema.ts src/ai/contract/serialize.ts src/node/cli.ts src/ai/mcp/server.ts tests/ai/contract-schema.test.ts tests/cli.test.ts tests/ai/mcp-stdio.test.ts
git commit -m "feat(ai): define the versioned Agent Contract"
~~~

---

## Task 2: Add validated bilingual guides and task playbooks

**Files:**

- Create: src/ai/contract/tasks.ts
- Create: src/ai/contract/content/en-US/guide.md
- Create: src/ai/contract/content/en-US/tasks/read-site.md
- Create: src/ai/contract/content/en-US/tasks/create-site.md
- Create: src/ai/contract/content/en-US/tasks/migrate-content.md
- Create: src/ai/contract/content/en-US/tasks/maintain-site.md
- Create: src/ai/contract/content/en-US/tasks/audit-site.md
- Create: src/ai/contract/content/en-US/tasks/deploy-site.md
- Create: src/ai/contract/content/zh-CN/guide.md
- Create: matching zh-CN task files
- Create: tests/ai/task-contract.test.ts

**Interfaces:**

- parseTaskDocument(source, relativePath) returns validated metadata and
  normalized Markdown.
- loadBuiltInTaskPack(locale) returns one guide and six tasks.
- loadCustomTaskPack(options) remains path-injected and is completed in Task 6.

- [x] **Step 1: Add failing task-frontmatter tests**

Test valid read and write tasks plus these failures:

- Missing or duplicate id.
- contractVersion other than 1.
- Unsupported mode.
- Read task requesting write authorization.
- Write task omitting authorization.
- Missing verification section on a write task.
- A task document above the per-file size bound.
- A task reference to an unknown contract identifier.

At this stage, inject a small known-reference set into the parser. Full registry
validation is added after Tasks 3 through 5.

Run:

~~~bash
pnpm test tests/ai/task-contract.test.ts
~~~

Expected: failure because the task parser and content do not exist.

- [x] **Step 2: Implement frontmatter parsing and size limits**

Use gray-matter, which is already a dependency. Normalize line endings, require
one trailing newline, reject executable MDX, and allow plain Markdown only.

Use stable relative paths in errors. Never include the absolute source root.

- [x] **Step 3: Author the canonical English task pack**

Each task must include:

- Outcome and preconditions.
- Read or write permission.
- Ordered execution steps.
- Exact contract identifiers.
- Verification commands.
- Stop conditions.
- Expected final report.

create-site must work with an installed package and an otherwise empty content
directory. deploy-site must stop at verified static output and avoid assuming a
specific host.

- [x] **Step 4: Author the Chinese task pack**

Keep task ids and contract references identical to the English pack. Translate
explanatory text and expected reports, not commands or identifiers.

- [x] **Step 5: Verify both packs**

~~~bash
pnpm test tests/ai/task-contract.test.ts
pnpm format:check
~~~

Expected: both language packs contain the same six ids, all references resolve
against the injected contract set, and formatting passes.

- [x] **Step 6: Commit**

~~~bash
git add src/ai/contract/tasks.ts src/ai/contract/content tests/ai/task-contract.test.ts
git commit -m "feat(ai): add bilingual Agent task playbooks"
~~~

---

## Task 3: Make the runtime config schema drive the config API contract

**Files:**

- Create: src/node/config-schema.ts
- Create: src/ai/contract/config-api.ts
- Modify: src/shared/config.ts
- Modify: src/node/config.ts
- Modify: src/index.ts
- Modify: tests/config.test.ts
- Create: tests/ai/config-contract.test.ts
- Modify: tests/plugin.test.ts
- Modify: tests/analytics.test.tsx if required by the settled analytics work

**Interfaces:**

- AiContractConfig with enabled, instructions, and tasksDir.
- UserAiConfig extends the existing artifact switches with contract.
- ResolvedAiConfig has concrete artifact switches and resolved contract state.
- userConfigSchema is used by resolveConfig and API generation.
- configApiEntries are generated from the schema metadata.

- [x] **Step 1: Reconcile the current config implementation**

Before editing, inspect the final plugin and analytics changes and run:

~~~bash
git status --short
pnpm test tests/config.test.ts tests/plugin.test.ts tests/analytics.test.tsx
~~~

Expected: the active branch is isolated from unrelated edits and the current
config regression set passes.

- [x] **Step 2: Add failing contract-config tests**

Cover:

- contract.enabled defaults to true.
- contract.enabled false does not change the four existing artifact switches.
- instructions and tasksDir accept only non-empty relative paths.
- Absolute paths, traversal, NUL, and URL-like values are rejected.
- The generated config API includes every public config path exactly once.
- Defaults in api.json match resolveConfig behavior.
- plugins are described as runtime-only and are never serialized as instances.

Run:

~~~bash
pnpm test tests/ai/config-contract.test.ts tests/config.test.ts
~~~

Expected: failure because contract config and API metadata are absent.

- [x] **Step 3: Extract and annotate the runtime schema**

Move the settled Zod schema out of src/node/config.ts without changing existing
validation semantics. Add descriptions, defaults, and introduced-version
metadata through a colocated metadata map when Zod metadata is insufficient.

Do not duplicate a second config validator for AI.

Plugin entries are executable imported values rather than JSON. Keep their
runtime pre-validation outside the JSON-compatible Zod object, but describe the
public plugins field through explicit checked metadata so it still appears in
the config API. The drift test compares that metadata with UserConfig instead
of pretending plugin factories are JSON Schema.

- [x] **Step 4: Add public and resolved config types**

Keep defineConfig inference stable. Update exported config types without
exporting internal absolute paths or plugin runner state.

- [x] **Step 5: Generate the config API section**

Convert Zod schemas to JSON-compatible type and constraint descriptions. Ensure
the output contains safe literal defaults only.

Run:

~~~bash
pnpm test tests/ai/config-contract.test.ts tests/config.test.ts tests/plugin.test.ts tests/analytics.test.tsx
pnpm typecheck
~~~

Expected: config resolution and existing features remain green; generated API
coverage matches public config.

- [x] **Step 6: Commit**

~~~bash
git add src/node/config-schema.ts src/ai/contract/config-api.ts src/shared/config.ts src/node/config.ts src/index.ts tests/config.test.ts tests/ai/config-contract.test.ts tests/plugin.test.ts tests/analytics.test.tsx
git commit -m "feat(ai): derive config docs from runtime schema"
~~~

---

## Task 4: Refactor CLI registration into an executable contract registry

**Files:**

- Create: src/node/commands.ts
- Create: src/ai/contract/cli-api.ts
- Modify: src/node/cli.ts
- Modify: tests/cli.test.ts
- Create: tests/ai/cli-contract.test.ts

**Interfaces:**

- SilenCommandDescriptor contains id, syntax, description, arguments, options,
  sideEffect, result, and execute.
- registerCommands(cli, dependencies) registers CAC from the descriptors.
- createCliApiContract(descriptors) omits handlers and serializes only public
  metadata.

- [x] **Step 1: Add failing parity tests**

For dev, build, preview, ai, and mcp assert:

- Help text and generated contract use the same syntax and options.
- Every command id is unique.
- Option defaults match runtime behavior.
- Side-effect metadata distinguishes read, write, serve, and build.
- The mcp --allow-write option explicitly declares permission expansion.
- Unknown ai actions retain the current safe error.

Run:

~~~bash
pnpm test tests/ai/cli-contract.test.ts tests/cli.test.ts
~~~

Expected: failure because CLI metadata is embedded inside cli.ts.

- [x] **Step 2: Extract descriptors without changing behavior**

Move handlers behind dependency injection so tests can exercise descriptors
without starting long-lived servers. CAC registration must iterate the same
descriptors exported to the API contract.

- [x] **Step 3: Generate the CLI API section**

Strip handler functions and serialize:

- Command id and syntax.
- Positional arguments.
- Options, required status, and defaults.
- Side-effect classification.
- Exit and output description.

Run:

~~~bash
pnpm test tests/ai/cli-contract.test.ts tests/cli.test.ts tests/server.test.ts
pnpm typecheck
~~~

Expected: CLI behavior and help remain unchanged and contract parity passes.

- [x] **Step 4: Commit**

~~~bash
git add src/node/commands.ts src/ai/contract/cli-api.ts src/node/cli.ts tests/cli.test.ts tests/ai/cli-contract.test.ts
git commit -m "refactor(cli): share command metadata with AI"
~~~

---

## Task 5: Refactor MCP tools into read and write contract registries

**Files:**

- Create: src/ai/mcp/contracts.ts
- Create: src/ai/contract/mcp-api.ts
- Modify: src/ai/mcp/read-tools.ts
- Modify: src/ai/mcp/write-tools.ts
- Modify: src/ai/mcp/server.ts
- Modify: tests/ai/mcp-read.test.ts
- Modify: tests/ai/mcp-write.test.ts
- Modify: tests/ai/mcp-e2e.test.ts
- Create: tests/ai/mcp-contract.test.ts

**Interfaces:**

- readToolDescriptors and writeToolDescriptors contain name, title,
  description, Zod schema, annotations, and bounded execute handler.
- createMcpApiContract reads the same descriptors used for registration.

- [x] **Step 1: Add failing registry parity tests**

Assert:

- The documented read set exactly matches the default server.
- The documented write set is absent by default.
- --allow-write adds exactly write, link, and append.
- Input JSON Schemas match the Zod validators.
- All write tools require explicit authorization metadata.
- Annotation values match runtime registration.
- No tool advertises arbitrary shell or open-world access.

Run:

~~~bash
pnpm test tests/ai/mcp-contract.test.ts tests/ai/mcp-read.test.ts tests/ai/mcp-write.test.ts
~~~

Expected: failure because schemas and metadata are embedded in registration
functions.

- [x] **Step 2: Extract read and write descriptors**

Preserve safeFailure behavior, structuredContent, path limits, and all existing
tool names. Registration loops over the descriptor collections. Keep write
descriptors in a separate export so default server construction cannot register
them accidentally.

- [x] **Step 3: Generate the MCP API section**

Use Zod 4 JSON Schema conversion. Serialize tool annotations and the explicit
authorization requirement, never handler functions or Workspace objects.

Run:

~~~bash
pnpm test tests/ai/mcp-contract.test.ts tests/ai/mcp-read.test.ts tests/ai/mcp-write.test.ts tests/ai/mcp-e2e.test.ts
pnpm typecheck
~~~

Expected: all current MCP behavior stays green and contract parity passes.

- [x] **Step 4: Commit**

~~~bash
git add src/ai/mcp/contracts.ts src/ai/contract/mcp-api.ts src/ai/mcp/read-tools.ts src/ai/mcp/write-tools.ts src/ai/mcp/server.ts tests/ai/mcp-contract.test.ts tests/ai/mcp-read.test.ts tests/ai/mcp-write.test.ts tests/ai/mcp-e2e.test.ts
git commit -m "refactor(ai): share MCP tool contracts"
~~~

---

## Task 6: Build and publish the framework Agent Contract

**Files:**

- Create: src/ai/contract/framework.ts
- Create: src/ai/contract/declarations.ts
- Create: tooling/build-agent-contract.ts
- Modify: package.json
- Modify: tsup.config.ts if the settled build requires an explicit hook
- Modify: tests/package.test.ts
- Modify: tests/package-smoke.test.ts
- Create: tests/ai/framework-contract.test.ts
- Modify: tests/ai/public-api.test.ts

**Outputs:**

- dist/agent/manifest.json
- dist/agent/api.json
- dist/agent/guide.md
- dist/agent/tasks/*.md
- dist/agent/locales/zh-CN/guide.md
- dist/agent/locales/zh-CN/tasks/*.md

- [x] **Step 1: Add failing framework assembly tests**

Assert:

- Manifest kind is silen-framework and version equals package.json.
- API contains all config, CLI, MCP, and public export entries.
- Task references resolve against the assembled API.
- English and Chinese packs contain the same built-in ids.
- Serialization is byte-identical across two runs.
- Generated values contain no repository root, fixture paths, or selected
  secret environment markers.

Run:

~~~bash
pnpm test tests/ai/framework-contract.test.ts
~~~

Expected: failure because no framework assembler exists.

- [x] **Step 2: Index emitted declaration files**

Use the TypeScript compiler API from the existing dev dependency in the
release-time tooling only. Record entry point, exported symbol, symbol kind,
declaration signature, and declaration-file reference.

Do not ship the compiler or parse consumer TypeScript during site builds.

- [x] **Step 3: Assemble the framework contract**

Merge config, CLI, MCP, declaration, guide, and task sources. Validate the final
objects through the v1 schemas before writing.

- [x] **Step 4: Wire the release build**

After tsup and declaration generation succeed, run the TypeScript tooling
through the existing jiti dependency and write dist/agent. The generator must
clear only dist/agent, not the rest of dist.

Use the explicit build pipeline:

~~~json
{
  "scripts": {
    "build": "tsup && jiti tooling/build-agent-contract.ts"
  }
}
~~~

The package-smoke source fixture copies tooling so it can execute this source
build. The packed archive must still exclude tooling because the public files
allowlist remains dist, README.md, and LICENSE.

Add package exports:

~~~json
{
  "./agent/*": "./dist/agent/*"
}
~~~

- [x] **Step 5: Extend package and tarball tests**

The real tarball must contain:

- package/dist/agent/manifest.json
- package/dist/agent/api.json
- both language guides and all task files

A clean consumer must resolve and read:

- @aicode-nexus/silen/agent/manifest.json
- @aicode-nexus/silen/agent/api.json
- @aicode-nexus/silen/agent/tasks/create-site.md

Run:

~~~bash
pnpm build
pnpm test tests/ai/framework-contract.test.ts tests/package.test.ts tests/package-smoke.test.ts tests/ai/public-api.test.ts
pnpm exec publint
~~~

Expected: build, contract checks, real tarball smoke, and publint pass.

- [x] **Step 6: Commit**

~~~bash
git add src/ai/contract/framework.ts src/ai/contract/declarations.ts tooling/build-agent-contract.ts package.json tsup.config.ts tests/package.test.ts tests/package-smoke.test.ts tests/ai/framework-contract.test.ts tests/ai/public-api.test.ts
git commit -m "feat(ai): publish the framework Agent Contract"
~~~

Do not stage generated dist files if the repository continues to ignore dist.

---

## Task 7: Generate the base-aware Site AI Contract

**Files:**

- Create: src/ai/contract/package-assets.ts
- Create: src/ai/contract/site.ts
- Create: src/ai/contract/public-files.ts
- Modify: src/ai/artifacts.ts
- Modify: src/ai/index.ts
- Modify: src/node/build.ts
- Modify: src/node/links.ts or the settled reserved-output planner
- Modify: tests/ai/artifacts.test.ts
- Create: tests/ai/site-contract.test.ts
- Create: tests/fixtures/ai-contract-site/.silen/config.ts
- Create: tests/fixtures/ai-contract-site/.silen/ai-public.md
- Create: tests/fixtures/ai-contract-site/.silen/ai-tasks/
- Create: fixture content and public collision cases

**Interfaces:**

- locatePackagedAgentContract(startUrl?) resolves the current package root and
  dist/agent without leaking that path.
- loadPublicContractContent(root, config) reads only explicitly configured
  Markdown inside the content root.
- generateSiteContract(options) writes .well-known/silen into the staged output.

- [x] **Step 1: Add failing site-output tests**

Cover:

- Default build emits manifest, guide, API, six tasks, and zh-CN variants when
  the locale is configured.
- Root and /handbook/ bases produce correct public URLs.
- generator.version matches the installed package.
- resources omit disabled llms or index artifacts.
- contract.enabled false omits only .well-known/silen.
- llms.txt links to the base-aware manifest.
- Configured public instructions are merged into guide.md.
- Custom tasks are validated and emitted.
- AGENTS.md and CLAUDE.md are ignored.
- Environment values, config paths, plugin objects, and absolute roots do not
  appear.
- A public or route collision with .well-known/silen fails before output
  installation.

Run:

~~~bash
pnpm build
pnpm test tests/ai/site-contract.test.ts tests/ai/artifacts.test.ts
~~~

Expected: failure because the site contract is not emitted.

- [x] **Step 2: Resolve packaged assets safely**

Starting from import.meta.url, walk upward to the package.json whose name is
@aicode-nexus/silen, then resolve dist/agent. Allow tests to inject an asset
directory. Error messages expose only a stable package-contract error, not the
absolute lookup path.

Integration tests either inject a freshly generated temporary framework
contract or run pnpm build first. They must never silently pass against a stale
dist/agent from an earlier checkout.

- [x] **Step 3: Load explicit public custom content**

Resolve real paths inside config.root. Reject:

- Traversal.
- Escaping symlinks.
- Non-Markdown files.
- NUL and URL-like paths.
- Per-file or total size overflow.
- Duplicate task ids within the same locale.

Do not execute MDX or import task files.

- [x] **Step 4: Assemble and write the site contract**

Specialize the framework manifest with title, description, base, lang, locales,
capabilities, canonical resources, and local MCP permission metadata. Copy the
version-matched API and built-in tasks, then merge valid custom instructions and
tasks.

Use a temporary contract directory and atomic rename within the staged build.

- [x] **Step 5: Integrate discovery and reserved-path checks**

Add a concise Agent Contract section to llms.txt that links to the manifest.
Reserve .well-known/silen without blocking other .well-known public files.
Keep the existing preview exception for .well-known paths.

Run:

~~~bash
pnpm test tests/ai/site-contract.test.ts tests/ai/artifacts.test.ts tests/build.test.ts tests/links.test.ts tests/server.test.ts
pnpm typecheck
~~~

Expected: site contract, existing artifacts, build installation, link handling,
and preview safety all pass.

- [x] **Step 6: Commit**

~~~bash
git add src/ai/contract/package-assets.ts src/ai/contract/site.ts src/ai/contract/public-files.ts src/ai/artifacts.ts src/ai/index.ts src/node/build.ts src/node/links.ts tests/ai/artifacts.test.ts tests/ai/site-contract.test.ts tests/fixtures/ai-contract-site
git commit -m "feat(ai): emit a Site AI Contract"
~~~

Adjust the staged file list to the final reserved-path owner without staging
unrelated plugin changes.

---

## Task 8: Extend audit, MCP guidance, and safe fallback

**Files:**

- Modify: src/ai/audit.ts
- Modify: src/ai/workspace.ts
- Modify: src/ai/mcp/server.ts
- Modify: src/ai/mcp/read-tools.ts only if the registry requires it
- Modify: tests/ai/workspace.test.ts
- Modify: tests/ai/mcp-read.test.ts
- Create: tests/ai/contract-audit.test.ts

**Behavior:**

- silen ai audit checks contract presence only when llms.txt advertises it.
- Audit checks manifest/API schema, generator version, resource existence,
  task references, locale references, and index freshness independently.
- Workspace guide explains discovery, default read-only behavior, explicit
  write enablement, and audit/build/diff verification.
- MCP does not run the full executable MDX build.

- [ ] **Step 1: Add failing audit and fallback tests**

Cover:

- Fresh contract passes.
- Missing advertised manifest is a contract issue.
- contract.enabled false with no advertised manifest is not an issue.
- Unsupported schema produces a stable read-only fallback issue.
- Missing resource and stale version identify relative public paths.
- Invalid or removed task reference fails.
- No error contains the workspace absolute root.

Run:

~~~bash
pnpm test tests/ai/contract-audit.test.ts tests/ai/workspace.test.ts tests/ai/mcp-read.test.ts
~~~

Expected: failure because audit knows only the original three artifacts and
index freshness.

- [ ] **Step 2: Add contract audit issue types**

Extend issue codes without changing existing broken-link, citation, artifact,
and index behavior. Keep audit deterministic and model-free.

Do not load or execute project config to discover artifacts. If a non-default
outDir cannot be established through bounded local build metadata, return a
specific audit limitation instead of guessing or scanning outside the
documentation root.

- [ ] **Step 3: Align workspace and MCP guidance**

Generate the guide from stable contract facts rather than duplicating tool
lists. The response must still be safe when no build output exists.

- [ ] **Step 4: Run the audit and MCP regression set**

Run:

~~~bash
pnpm test tests/ai/contract-audit.test.ts tests/ai/workspace.test.ts tests/ai/mcp-read.test.ts
pnpm typecheck
~~~

Expected: audit, guide, and types pass.

- [ ] **Step 5: Commit**

~~~bash
git add src/ai/audit.ts src/ai/workspace.ts src/ai/mcp/server.ts src/ai/mcp/read-tools.ts tests/ai/contract-audit.test.ts tests/ai/workspace.test.ts tests/ai/mcp-read.test.ts
git commit -m "feat(ai): audit Agent Contract integrity"
~~~

---

## Task 9: Dogfood the contract on the official bilingual site

**Files:**

- Modify: website/.silen/config.ts
- Create: website/.silen/ai-public.md
- Create: website/.silen/ai-tasks/ as needed for official examples
- Modify: website/ai/index.mdx
- Modify: website/zh/ai/index.mdx
- Modify: website/guide/index.mdx
- Modify: website/zh/guide/index.mdx
- Modify: README.md
- Modify: tests/website.test.ts
- Modify: tests/e2e/ai.spec.ts
- Modify: tests/ai/documentation.test.ts
- Create: tests/ai/agent-scenarios.test.ts

- [ ] **Step 1: Add failing official-site assertions**

After site build, verify:

- /silen/.well-known/silen/manifest.json exists.
- Manifest links resolve under /silen/.
- Default guide and tasks are English.
- zh-CN guide and tasks exist and retain the same ids.
- API includes the current analytics and plugin config after those features
  settle.
- No official public contract contains the checkout path.

- [ ] **Step 2: Add explicit official instructions**

Explain that the official package contract is authoritative for an installed
version, and that the website contract is authoritative for the deployed
official site. Keep tutorials task-oriented and avoid copying API tables.

- [ ] **Step 3: Update human-facing AI documentation**

The human pages explain how a user points an AI client at:

- The installed package contract.
- The deployed site manifest.
- The local MCP command.

Add thin examples for Codex, Claude Code, and Cursor that all reference the same
contract. Do not maintain client-specific API copies.

- [ ] **Step 4: Update documentation contract tests**

README and the official site must mention:

- Package Agent paths.
- Site manifest discovery.
- Default read-only MCP and --allow-write.
- Explicit public instructions.
- Unsupported-schema fallback.

- [ ] **Step 5: Add deterministic Agent scenarios**

Scenario A:

- Create a temporary project.
- Install or reference the packed package.
- Read only the packaged create-site task and API.
- Create minimal config and content.
- Run build and audit.

Scenario B:

- Start with the fixture site.
- Discover through the manifest.
- Confirm read-only MCP has no writes.
- Enable writes, update one Markdown page, run audit/build, and inspect the diff
  fixture result.

These are scripted deterministic clients, not model calls.

Run:

~~~bash
pnpm build
pnpm site:build
pnpm test tests/website.test.ts tests/ai/agent-scenarios.test.ts tests/ai/documentation.test.ts
pnpm exec playwright test tests/e2e/ai.spec.ts
~~~

Expected: official contract and both Agent scenarios pass.

- [ ] **Step 6: Commit**

~~~bash
git add website/.silen/config.ts website/.silen/ai-public.md website/.silen/ai-tasks website/ai/index.mdx website/zh/ai/index.mdx website/guide/index.mdx website/zh/guide/index.mdx README.md tests/website.test.ts tests/e2e/ai.spec.ts tests/ai/documentation.test.ts tests/ai/agent-scenarios.test.ts
git commit -m "docs(ai): publish the official Agent Contract"
~~~

---

## Task 10: Run the complete release and security gate

**Files:**

- Modify only files required by failures attributable to this feature.
- Update the plan checkboxes and final verification record.

- [ ] **Step 1: Run static quality checks**

~~~bash
pnpm format:check
pnpm lint
pnpm typecheck
~~~

Expected: all commands exit 0.

- [ ] **Step 2: Run the complete unit and integration suite**

~~~bash
pnpm test --maxWorkers=1 --no-file-parallelism
~~~

Expected: all tests pass. Investigate a one-off CLI timeout by rerunning the
specific test before changing production code.

- [ ] **Step 3: Run build, package, and publication checks**

~~~bash
pnpm build
pnpm site:build
pnpm exec publint
pnpm pack --dry-run
~~~

Expected:

- dist/agent is complete.
- Site output contains the base-aware site contract.
- Package exports resolve.
- The tarball contains no source, tests, caches, local Agent files, or secrets.

- [ ] **Step 4: Run browser verification**

~~~bash
pnpm exec playwright test tests/e2e
~~~

Expected: all browser tests pass, including existing AI actions, navigation,
search, and the official contract routes.

- [ ] **Step 5: Perform explicit output inspection**

Check:

- Repeated builds produce byte-identical contract files.
- No generated file contains the absolute repository path.
- No environment marker or provider secret is present.
- contract.enabled false leaves existing artifacts intact.
- Read-only MCP exposes no mutating tools.
- Unsupported schema test remains read-only.
- Git diff contains only intended source, tests, docs, and plan checkbox changes.

- [ ] **Step 6: Record the final checkpoint and commit fixes**

If the gate required scoped fixes, commit them with:

~~~bash
git commit -m "test(ai): close Agent Contract release gate"
~~~

Do not create an empty commit when no fix was required.

## Final definition of done

- [ ] The installed npm package contains a readable versioned framework
  contract and exact public Agent paths.
- [ ] Every default site build emits a base-aware manifest, guide, API, and
  bilingual built-in task resources.
- [ ] llms.txt points AI clients to the manifest.
- [ ] Config, CLI, and MCP facts come from the same registries used at runtime.
- [ ] Public TypeScript exports are indexed from emitted declarations.
- [ ] Custom public instructions and tasks are opt-in and path-bounded.
- [ ] AGENTS.md, CLAUDE.md, secrets, and absolute paths never leak.
- [ ] MCP remains read-only by default and write tools require --allow-write.
- [ ] A deterministic client completes both create and maintain scenarios.
- [ ] Audit, build, Git diff, package smoke, publint, and browser gates pass.
