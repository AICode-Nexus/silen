# Silen AI Contract Layer Design

- Status: Pending written-spec review
- Date: 2026-07-15
- Repository: AICode-Nexus/silen
- Package: @aicode-nexus/silen

## 1. Summary

Silen will evolve from an AI-readable documentation generator into an
AI-operable knowledge infrastructure. An AI client must be able to use Silen in
two complete workflows:

1. Create a new documentation site or knowledge base from an installed Silen
   package.
2. Discover, read, search, update, audit, and build an existing Silen
   knowledge base.

The feature is an AI contract layer, not a second copy of the human
documentation. Stable facts such as configuration, CLI commands, public
TypeScript APIs, and MCP tools come from executable registries or emitted type
declarations. Short task playbooks remain curated Markdown. Silen generates
the public machine entry points from both sources.

The Silen official site is the first consumer of the contract layer. The same
capability is enabled for every Silen site.

## 2. Product decision

The selected approach is a shared AI contract layer with three surfaces:

1. Silen Agent Contract: teaches an AI how to build with the Silen framework.
2. Site AI Contract: describes one deployed Silen site and its available
   content and capabilities.
3. Local Maintenance Workspace: exposes the site through a permission-gated
   MCP server.

This design deliberately avoids a manually duplicated AI documentation site.
The generated contract and human documentation may present the same facts
differently, but they share the same sources of truth.

## 3. Goals

The first release must:

1. Give AI clients a deterministic discovery entry point for Silen.
2. Publish a version-matched configuration, CLI, public API, and MCP contract.
3. Provide concise task playbooks for creating, migrating, reading,
   maintaining, auditing, building, and deploying a knowledge base.
4. Ship the framework contract inside the npm package and on the official site.
5. Generate a site-specific contract for every Silen production build.
6. Keep all public contract generation model-free and network-free.
7. Keep MCP read-only by default and register write tools only after explicit
   authorization.
8. Make every write workflow end with audit, build, and Git diff verification.
9. Support English and Chinese discovery on the official bilingual site.
10. Fail safely when a contract is missing, stale, invalid, or newer than the
    AI client understands.

## 4. Non-goals

The first release will not:

- Host an AI model, RAG service, or vector database.
- Generate task instructions with a model.
- Automatically translate custom task playbooks.
- Read or publish AGENTS.md, CLAUDE.md, local prompts, environment variables,
  or editor-specific configuration.
- Give MCP arbitrary shell execution.
- Commit, push, or deploy changes through Silen MCP.
- Replace the human documentation site.
- Create separate API copies for Codex, Claude Code, Cursor, or other clients.
- Guarantee that an AI follows instructions; the contract supplies bounded,
  testable operations and safe fallbacks.

## 5. Users and primary workflows

### 5.1 AI creates a knowledge base

Precondition: the project has @aicode-nexus/silen installed, or the AI can
access the official Silen contract.

The AI:

1. Reads the framework manifest.
2. Selects the create-site task.
3. Reads the exact configuration and CLI contract for the installed version.
4. Creates the minimum config and content files.
5. Runs a production build in the trusted local project environment.
6. Runs the AI audit.
7. Reviews the Git diff and reports the result.

The workflow must not require the AI to scrape the human guide.

### 5.2 AI reads an existing knowledge base

The AI:

1. Reads the deployed site manifest.
2. Discovers llms.txt, clean Markdown routes, locales, and the structured index.
3. Uses the smallest resource that answers the question.
4. Preserves canonical source URLs in citations.

This workflow remains available without MCP.

### 5.3 AI maintains an existing knowledge base

The AI:

1. Starts from the local site manifest and workspace guide.
2. Uses read-only MCP tools to inspect, search, and validate the content.
3. Requests or verifies explicit write authorization.
4. Uses bounded write tools only after they have been registered.
5. Runs audit and build through the trusted local agent environment.
6. Shows the Git diff and stops before commit or deployment unless the user
   separately authorizes those actions.

## 6. Architecture

### 6.1 Silen Agent Contract

The framework contract is built during the Silen package release and placed
inside the published dist directory. It contains:

- Framework manifest.
- Structured configuration, CLI, public TypeScript, and MCP API contract.
- General Agent guide.
- Built-in task playbooks.
- Language variants supplied by Silen.

The installed package and official documentation site expose the same
versioned contract. The package copy is authoritative for local work because
it matches the installed Silen version.

### 6.2 Site AI Contract

Every production site build merges the packaged framework contract with public
site facts:

- Silen version.
- Site title, description, base, default language, and configured locales.
- Enabled AI artifacts.
- Canonical public resource URLs.
- Local MCP availability and permission rules.
- Optional explicitly public instructions and custom tasks.

The site build never serializes the resolved filesystem root, config filename,
functions, environment-derived secrets, or other runtime-only data.

### 6.3 Local Maintenance Workspace

The existing local workspace and MCP server remain the execution layer.
The public contract explains the tools and permission model, while MCP enforces
those boundaries at runtime.

The server stays:

- stdio-only in this release.
- read-only by default.
- path-bounded to the documentation root.
- free of arbitrary command execution.
- explicit about operations that can mutate content.

## 7. Public output contract

The following tree is shown for a site with base /. For a non-root base, every
public URL is joined to the configured base. The files are written relative to
the build output directory.

~~~text
/
├── llms.txt
├── llms-full.txt
├── ai-index.json
├── index.md
├── guide/
│   └── index.md
└── .well-known/
    └── silen/
        ├── manifest.json
        ├── guide.md
        ├── api.json
        ├── tasks/
        │   ├── read-site.md
        │   ├── create-site.md
        │   ├── migrate-content.md
        │   ├── maintain-site.md
        │   ├── audit-site.md
        │   └── deploy-site.md
        └── locales/
            └── zh-CN/
                ├── guide.md
                └── tasks/
                    └── ...
~~~

The .well-known/silen directory is reserved generated output. A source or
public-file collision with this directory is a build error with the conflicting
relative path.

llms.txt remains the broad, convention-based entry point and links to the
Silen manifest. The manifest is the authoritative Silen-specific discovery
entry point.

## 8. Manifest schema

The manifest uses a small versioned JSON shape. An illustrative site manifest
is:

~~~json
{
  "schemaVersion": 1,
  "kind": "silen-site",
  "generator": {
    "name": "Silen",
    "version": "0.1.0-alpha.3"
  },
  "site": {
    "title": "Product handbook",
    "description": "Internal product reference",
    "base": "/handbook/",
    "lang": "en-US",
    "locales": [
      { "lang": "en-US", "root": "/" },
      { "lang": "zh-CN", "root": "/zh/" }
    ]
  },
  "capabilities": {
    "llmsTxt": true,
    "llmsFullTxt": true,
    "markdownRoutes": true,
    "index": true,
    "mcp": {
      "transport": "stdio",
      "localOnly": true,
      "readOnlyByDefault": true,
      "writeRequiresFlag": "--allow-write"
    }
  },
  "resources": [
    {
      "id": "llms",
      "format": "text/markdown",
      "url": "/handbook/llms.txt"
    },
    {
      "id": "api",
      "format": "application/json",
      "url": "/handbook/.well-known/silen/api.json"
    }
  ],
  "tasks": [
    {
      "id": "read-site",
      "mode": "read",
      "url": "/handbook/.well-known/silen/tasks/read-site.md"
    },
    {
      "id": "maintain-site",
      "mode": "write",
      "requiresExplicitAuthorization": true,
      "url": "/handbook/.well-known/silen/tasks/maintain-site.md"
    }
  ]
}
~~~

Rules:

- schemaVersion governs the manifest, API contract, and built-in task metadata.
- generator.version is always the package version that produced the output.
- All URLs are public, canonical, base-aware URLs.
- The resources array is capability-driven; disabled artifacts are omitted.
- Write-oriented tasks always declare that explicit authorization is required.
- Ordering is deterministic so unchanged inputs produce byte-stable output.

## 9. API contract

api.json is a structured index rather than a prose API reference. It includes:

1. Configuration
   - Field path.
   - JSON-compatible type description.
   - Required or optional status.
   - Default value.
   - Constraints.
   - Short description.
   - Version introduced.
2. CLI
   - Command and positional arguments.
   - Options and defaults.
   - Side-effect classification.
   - Expected output and exit behavior.
3. MCP
   - Tool name, title, and description.
   - Input JSON Schema.
   - Read, destructive, idempotent, and open-world annotations.
   - Whether explicit write authorization is required.
4. Public TypeScript exports
   - Package entry point.
   - Exported symbol name and kind.
   - Emitted declaration signature.
   - Declaration-file reference.

Every generated site receives the core framework API for its exact installed
version. The official site adds richer authored explanations and examples, but
does not use a different API source.

## 10. Task playbook contract

Task playbooks are intentionally short Markdown documents. Each built-in task
contains:

- Task identifier and supported contract version.
- Intended outcome.
- Preconditions.
- Required read or write permission.
- Ordered steps.
- Exact commands or API references.
- Files expected to change.
- Verification commands.
- Stop conditions and safe fallback.
- Expected final report.

Task prose must reference contract identifiers instead of duplicating entire
configuration tables or MCP schemas. CI verifies that every referenced command,
configuration path, tool, and task identifier exists.

Built-in and custom tasks use validated frontmatter:

~~~yaml
---
id: maintain-site
title: Maintain an existing Silen knowledge base
contractVersion: 1
mode: write
requiresExplicitAuthorization: true
---
~~~

The identifier is unique within a task pack. Read tasks cannot request write
authorization. Write tasks must declare the authorization requirement and
include audit, build, and diff verification before completion.

Built-in tasks:

- read-site: discover and answer from a deployed site.
- create-site: create a minimal site from an installed package.
- migrate-content: import an existing Markdown or MDX content tree without
  inventing unsupported ingestion behavior.
- maintain-site: search and update an existing workspace.
- audit-site: run deterministic content and artifact checks.
- deploy-site: prepare and verify deployable static output without assuming a
  particular hosting provider.

Client-specific examples may show where Codex, Claude Code, or Cursor should
point, but must not duplicate task contents or API fields.

## 11. Configuration

The existing ai configuration gains an optional contract section:

~~~ts
export default defineConfig({
  ai: {
    llmsTxt: true,
    llmsFullTxt: true,
    markdownRoutes: true,
    index: true,
    contract: {
      enabled: true,
      instructions: '.silen/ai-public.md',
      tasksDir: '.silen/ai-tasks',
    },
  },
})
~~~

Behavior:

- contract.enabled defaults to true.
- instructions is optional and must point to an explicitly public Markdown
  file inside the documentation root.
- tasksDir is optional and must remain inside the documentation root.
- Custom task files use the same validation rules as built-in tasks.
- Silen does not infer public instructions from AGENTS.md, CLAUDE.md, editor
  rules, or repository metadata.
- Setting contract.enabled to false omits .well-known/silen output but does not
  silently disable the existing AI artifacts.

The resolved internal configuration separates artifact switches from contract
settings so existing boolean behavior stays backward compatible.

## 12. Sources of truth

### 12.1 Configuration schema

A runtime schema becomes the source for configuration validation and the
configuration section of api.json. Public TypeScript types are derived from or
checked against that schema. Defaults live in one place.

### 12.2 CLI registry

CLI command descriptors contain command syntax, arguments, options, safety
classification, and handler binding. The same descriptors register commands
with cac, render help, and generate the CLI contract.

### 12.3 MCP tool registry

MCP tool descriptors contain metadata, Zod input schemas, permission
annotations, and handlers. JSON Schema is generated from the same Zod objects
used for runtime validation.

Write descriptors are held separately and are not registered unless
--allow-write is present.

### 12.4 TypeScript declarations

The package release process reads the emitted declaration files and produces a
compact public-export index. Consumer site builds use the packaged index rather
than parsing TypeScript again.

### 12.5 Curated Markdown

General guides and task playbooks remain ordinary reviewed Markdown. They may
explain intent and workflow, but they do not redefine API shapes.

## 13. Package distribution

The published package contains:

~~~text
dist/
├── index.js
├── index.d.ts
├── ...
└── agent/
    ├── manifest.json
    ├── api.json
    ├── guide.md
    ├── tasks/
    └── locales/
~~~

The package export map exposes ./agent/* from ./dist/agent/*. This gives AI
clients exact stable paths such as:

- @aicode-nexus/silen/agent/manifest.json
- @aicode-nexus/silen/agent/api.json
- @aicode-nexus/silen/agent/tasks/create-site.md

The tarball smoke test must prove that a fresh project can locate and read the
contract without access to the Silen source repository.

The package contract is produced during release and checked before publish.
A consumer site build copies and specializes it with public site facts.

## 14. Build data flow

~~~text
Load and validate public site config
  -> scan routes and produce the shared page model
  -> load the packaged framework Agent Contract
  -> collect site title, base, lang, locales, and enabled capabilities
  -> load explicitly configured public instructions and custom tasks
  -> validate custom task metadata and references
  -> generate site manifest, guide, API, and tasks
  -> generate llms files, clean Markdown routes, and AI index
  -> validate URLs, reserved-path collisions, and public-data boundaries
  -> write deterministic output
~~~

The pipeline calls no model and performs no network requests.

The framework release flow runs earlier:

~~~text
Compile package and declarations
  -> read config, CLI, and MCP registries
  -> index public declaration exports
  -> validate built-in guides and tasks
  -> write dist/agent
  -> run package contract and tarball tests
~~~

## 15. Local permission and verification flow

Read-only MCP includes the current guide, list, search, read, backlinks,
citations, and safe build-preflight tools. The contract describes the exact
set exported by the installed version.

Write, link, and append tools remain absent unless the server starts with
--allow-write. Enabling write access does not grant commit, push, deployment,
or general command execution.

After a mutation, the task playbook requires:

1. Re-read the changed content.
2. Run silen ai audit in the trusted local agent environment.
3. Run silen build in the trusted local agent environment.
4. Inspect Git diff.
5. Report changed files, verification results, and remaining warnings.

MCP itself does not run the full Silen build because trusted MDX and project
configuration are executable project code. The local agent harness runs it
under the user's existing project permissions.

## 16. Internationalization

manifest.json and api.json use stable identifiers and language-neutral field
shapes. Human-readable descriptions have a canonical English value in the
first schema version.

The built-in guide and task pack ship in English and Chinese. The default
language files live at the top of .well-known/silen; additional variants live
under locales/{lang}. Manifest resource and task entries carry language
metadata when variants exist.

The official Silen site must expose both en-US and zh-CN variants. A site with
another language falls back to the canonical task pack unless the site owner
explicitly provides localized public instructions and tasks.

Custom task translation is the site owner's responsibility.

## 17. Security and privacy

Public-data serialization uses an allowlist. It excludes:

- Absolute filesystem paths.
- Config module paths.
- Environment variables and process state.
- Functions and executable config values.
- Provider credentials and headers.
- Local-only Agent instructions.
- Draft pages and pages marked ai: false.

Configured public instruction and task paths:

- Must resolve inside the documentation root.
- Must reject traversal and escaping symlinks.
- Must be Markdown.
- Must satisfy bounded per-file and total sizes.
- Are public by explicit user choice.

MCP keeps the existing atomic write, path containment, symlink, UTF-8, and size
protections. The site contract must not weaken them.

## 18. Errors and safe fallback

### 18.1 Unsupported schema

An AI client that does not understand schemaVersion must:

1. Stop all write operations.
2. Fall back to llms.txt and clean Markdown for reading.
3. Report the unsupported version.

### 18.2 Missing contract

The absence of .well-known/silen does not make a site unreadable. AI clients
fall back to llms.txt, llms-full.txt, and Markdown routes.

### 18.3 Stale artifacts

Silen ai audit reports contract and index freshness independently. Stale
Markdown remains readable, but an AI must not perform bulk index-driven
maintenance until the artifacts are regenerated.

### 18.4 Invalid custom content

Invalid instructions or tasks fail the build with:

- A stable error code.
- The workspace-relative source path.
- The invalid field or reference.
- A safe remediation message.

### 18.5 Registry drift

If a registered config field, CLI command, MCP tool, or public export is absent
from the generated API contract, CI fails. If a task references a removed
contract identifier, CI fails.

### 18.6 Reserved-path collision

If user content would overwrite .well-known/silen output, the build fails
before writing a partial contract.

## 19. Testing strategy

### 19.1 Unit tests

- Manifest and API schema validation.
- Deterministic ordering and byte-stable output.
- Base-aware URL generation.
- Default and localized resource selection.
- Capability-driven resource omission.
- Reserved-path collision handling.
- Absolute path, traversal, symlink, and secret-field rejection.
- Draft and ai: false filtering.

### 19.2 Contract tests

- Every config schema field appears in api.json.
- Every CLI descriptor appears with arguments, options, and safety metadata.
- Every registered MCP tool appears with its input schema and annotations.
- Write tools are marked as requiring explicit authorization.
- Every public package export appears in the declaration index.
- Every task contract reference resolves.

### 19.3 Package tests

- Build the package and Agent Contract.
- Pack a real npm tarball.
- Install it into a fresh temporary project.
- Read the package manifest, API, guide, and create-site task.
- Build a minimal site using only packaged contract facts.

### 19.4 Site integration tests

- Build a root-base site and a subpath-base site.
- Verify manifest, guide, API, tasks, llms files, index, and Markdown URLs.
- Verify English and Chinese official-site resources.
- Verify custom public instructions and tasks.
- Verify disabled contract output does not disable existing artifacts.

### 19.5 MCP tests

- Read-only server exposes no mutating tools.
- --allow-write adds only the documented write tools.
- Traversal and escaping symlinks are rejected.
- Successful writes remain atomic and workspace-relative.
- The guide and tool contract match the installed package version.

### 19.6 End-to-end Agent scenarios

The test harness covers two outcome-based scenarios:

1. Empty project: an agent follows the packaged create-site task, creates the
   minimum site, and passes audit and build.
2. Existing project: an agent discovers content, requests write access,
   modifies one page, passes audit and build, and produces a reviewable Git
   diff.

These tests use deterministic scripted clients rather than an external model,
so CI remains reproducible.

## 20. Compatibility

- Existing llms.txt, llms-full.txt, ai-index.json, and Markdown route behavior
  stays intact.
- Existing ai boolean switches keep their meaning.
- Existing MCP tool names and permission behavior stay intact unless a later
  versioned contract explicitly changes them.
- Ask AI remains an independent endpoint-only runtime feature.
- contract.enabled can disable only the new contract layer.
- New generated output is additive except that .well-known/silen becomes a
  reserved path.

## 21. Delivery sequence

Implementation should proceed in these boundaries:

1. Define contract types, manifest schema, and deterministic serializers.
2. Refactor config, CLI, and MCP metadata into shared executable registries.
3. Generate and package the framework Agent Contract.
4. Add site-specific contract generation and configuration.
5. Author and validate built-in English and Chinese guides and tasks.
6. Integrate contract freshness and reference checks into silen ai audit.
7. Dogfood the output on the official bilingual site.
8. Complete tarball, integration, MCP, and Agent scenario verification.

Each boundary must preserve a green typecheck, test, and build before the next
one begins.

## 22. Acceptance criteria

The implementation is complete when all of the following are true:

1. An installed @aicode-nexus/silen package contains a readable, versioned
   Agent Contract.
2. Every default production build emits a base-aware Silen site manifest,
   guide, API contract, and built-in tasks.
3. llms.txt links to the Silen manifest.
4. The official site publishes English and Chinese Agent resources.
5. API facts are generated from executable registries and emitted declaration
   output rather than copied into task prose.
6. A deterministic client can create and build a minimal site without reading
   the human guide.
7. A deterministic client can read an existing deployed site without MCP.
8. A local client can inspect and search through MCP without write permission.
9. MCP write tools appear only with explicit authorization and cannot escape
   the documentation root.
10. A maintenance workflow passes audit and build and ends with a Git diff.
11. Missing or unsupported contracts degrade to read-only Markdown access.
12. Public artifacts contain no absolute paths, credentials, or implicit local
    Agent instructions.
13. Existing AI artifacts and Ask AI behavior remain compatible.

## 23. Product statement

After this work, Silen can be described as:

> Silen is an AI-native documentation and knowledge framework: people read the
> site, while AI can discover, build, search, and safely maintain the same
> trusted content source.
