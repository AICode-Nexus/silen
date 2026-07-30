# Silen Read-Only Agent Skills Surface Design

- **Status:** Design approved, written specification pending review
- **Date:** 2026-07-30
- **Project map item:** `AI-006`
**Release horizon:** `0.5.0`

## 1. Summary

Silen will generate one portable, read-only Agent Skill named
`silen-docs-readonly` from its existing Agent Contract and bilingual task
packs. The Skill covers two outcomes only: reading a Silen documentation site
and performing a model-free audit. It does not translate write tasks into
weaker instructions and does not introduce a second hand-maintained workflow
system.

The generated Skill ships inside the npm package, can be materialized into an
explicit filesystem destination, and can optionally be exposed as MCP
Resources behind an off-by-default experimental flag. The package build is the
only generation point; filesystem and MCP adapters consume the same validated
packaged bytes.

## 2. Product decision

Use one Skill with progressively loaded references rather than one Skill per
task or locale:

```text
silen-docs-readonly/
├── SKILL.md
└── references/
    ├── audit-site.md
    ├── audit-site-zh-cn.md
    ├── read-site.md
    └── read-site-zh-cn.md
```

This gives clients one precise activation description, keeps startup metadata
small, and loads task or language detail only when needed. It follows the
Agent Skills directory model without adding scripts, assets, executable code,
or portable tool allowlists.

## 3. Goals

1. Generate a standards-compatible `SKILL.md` directory from canonical Silen
   sources.
2. Include only the approved `read-site` and `audit-site` tasks in English and
   Chinese.
3. Keep every output byte deterministic and shared across npm, CLI, and the
   experimental MCP adapter.
4. Make filesystem installation an explicit, collision-safe command.
5. Validate the result with local TypeScript checks and the pinned official
   `skills-ref` reference validator.
6. Preserve the current local-only, stdio, read-only-by-default MCP behavior.
7. Complete the existing release ladder with a verified `0.5.0` release after
   implementation passes all gates.

## 4. Non-goals

- Generate Skills for `create-site`, `migrate-content`, `maintain-site`,
  `deploy-site`, custom site tasks, or any other write workflow.
- Automatically include future tasks merely because they declare
  `mode: read`.
- Rewrite a write task into supposedly read-only prose.
- Add `scripts/`, `assets/`, `allowed-tools`, executable MDX, shell wrappers,
  or generated model content.
- Automatically write `.agents/skills` during init, build, install, or site
  generation.
- Add a Skill registry, downloader, updater, overwrite flag, or client-specific
  installer.
- Publish `.well-known/agent-skills` over HTTP in `0.5.0`.
- Treat Skills over MCP as stable, required, or enabled by default.
- Add remote MCP, OAuth, Tasks, Apps, or another MCP extension.

## 5. Current baseline and upstream stability

Silen already has the required canonical material:

- strict bilingual Agent task packs;
- task identifiers, modes, references, and permission metadata;
- generated Agent Contract schema version 2;
- local MCP over `2025-11-25` and `2026-07-28`;
- seven default read tools and three separately authorized write tools;
- deterministic package and site quality gates.

The Agent Skills specification requires a directory containing `SKILL.md`,
with `name` and `description` frontmatter and optional `references/`. It
recommends progressive disclosure and provides `skills-ref` as the reference
validator.

Skills over MCP is not stable as of 2026-07-30. The official working-group
repository explicitly describes itself as experimental, and SEP-2640 remains
a draft transport binding based on MCP Resources and the
`io.modelcontextprotocol/skills` extension identifier. Silen therefore treats
that surface as a disposable adapter around the filesystem-compatible bytes,
not as a core contract dependency.

## 6. Canonical source and exclusion policy

The generator consumes the existing English and Chinese `TaskPack` values and
the current Silen version. It uses an explicit ordered allowlist:

```ts
const READ_ONLY_SKILL_TASK_IDS = ['audit-site', 'read-site'] as const
```

For every allowlisted ID, generation requires exactly one task in `en-US` and
one in `zh-CN`. Every selected task must:

- retain `contractVersion: 1`;
- declare `mode: read`;
- never require explicit write authorization;
- pass the existing task parser and reference checks.

Missing, duplicate, reclassified, or invalid source tasks fail generation.
Unlisted tasks are ignored even when their mode is `read`. This ensures a new
task cannot become public Skill behavior without an explicit design change.

The four selected reference files are produced by removing the source task's
YAML frontmatter and retaining its normalized Markdown body. Silen does not
summarize, translate, or otherwise reinterpret the steps.

## 7. Exact `SKILL.md` mapping

The directory and required frontmatter use these exact rules:

| Agent Skills field | Silen mapping |
| --- | --- |
| Parent directory | `silen-docs-readonly` |
| `name` | `silen-docs-readonly` |
| `description` | Fixed reviewed activation text below |
| `license` | `MIT`, matching the npm package |
| `compatibility` | Fixed permission and Agent Contract requirement below |
| `metadata.silen-version` | Current `SILEN_VERSION` as a string |
| `metadata.silen-contract-version` | String `"2"` |
| `metadata.silen-source-tasks` | String `"audit-site,read-site"` |
| `allowed-tools` | Omitted |

The exact description is:

> Use this skill when reading, searching, citing, or performing a model-free
> audit of Silen documentation or knowledge bases, including requests to
> 阅读、检索、引用或审计 Silen 文档. It is read-only and does not grant shell,
> network, filesystem-write, commit, push, or deployment permission.

The exact compatibility text is:

> Requires a Silen Agent Contract v2 package or site. Any MCP, command,
> filesystem, or network access must be separately available and authorized by
> the host or user.

The `SKILL.md` body is a short generated router with these sections:

1. `Use this skill` — scope and canonical Silen contract preference.
2. `Choose the workflow` — links to `references/read-site.md` and
   `references/audit-site.md`.
3. `Language` — directs Chinese-language requests to the matching `-zh-cn`
   reference.
4. `Permission boundary` — reiterates that instructions never grant tool,
   command, network, source-write, commit, push, deployment, or external-system
   authority.
5. `Completion` — requires canonical sources and a concise report of evidence
   and limitations.

All links are one level below `SKILL.md`. No file points outside the Skill
directory.

## 8. Generator and packaged asset boundary

A focused module under `src/ai/contract/` owns the mapping. Its public internal
shape is equivalent to:

```ts
interface ReadOnlyAgentSkillBundle {
  readonly name: 'silen-docs-readonly'
  readonly files: Readonly<Record<string, string>>
}

function renderReadOnlyAgentSkill(options: {
  version: string
  packs: readonly [TaskPack, TaskPack]
}): ReadOnlyAgentSkillBundle
```

The renderer is pure after the task packs are loaded. It returns only paths
relative to the Skill root and content strings sorted by English byte-stable
path order. Markdown uses LF line endings and exactly one trailing newline.
JSON and YAML field order is fixed by the renderer rather than filesystem
enumeration.

`renderFrameworkContract` adds the files beneath:

```text
dist/agent/skills/silen-docs-readonly/
```

The package build remains the only point that converts task sources into Skill
bytes. Runtime adapters load and validate those packaged assets. They do not
reparse source Markdown, which is not part of the published npm package.

## 9. Explicit filesystem materialization

The AI command accepts one new action:

```text
silen ai skills <destination>
```

The existing AI command's second positional value is documented as a path: it
remains the content root for `init`, `index`, `audit`, and `eval`, and becomes a
required Skills parent directory for `skills`.

The command resolves an explicit relative or absolute destination from the
current process context and targets only:

```text
<destination>/silen-docs-readonly/
```

Behavior is deliberately narrow:

1. Require a non-empty destination.
2. Load and validate the packaged Skill bundle.
3. Fail if the target Skill directory already exists, regardless of content.
4. Create a temporary sibling directory.
5. Write the complete sorted file map.
6. Validate the temporary result.
7. Atomically rename it to the target.
8. Remove the temporary directory on every failure.

The command may create the destination parent because the user named it
explicitly. It never removes or overwrites an existing Skill and has no
`--force`, update, or clean mode.

## 10. Experimental Skills over MCP adapter

The existing MCP command gains one option:

```text
silen mcp [root] --experimental-skills-over-mcp
```

When absent, the server's observable MCP protocol behavior remains compatible
with AI-005:

- no Skill Resources;
- no Skills extension capability;
- seven default read tools;
- ten tools only with separate `--allow-write` authorization;
- Agent Contract default `extensions: []`.

When present, `serveMcp` loads the packaged Skill bundle once before starting
stdio and passes the immutable file map to each server factory. The server:

1. declares `io.modelcontextprotocol/skills` with an empty settings object;
2. registers `skill://silen-docs-readonly/SKILL.md`;
3. registers one Resource for each of the four reference files;
4. registers deterministic `skill://index.json` metadata;
5. serves every Resource as read-only in-memory text.

The index follows the current experimental SEP-2640 shape and references the
concrete `SKILL.md` URI. It is generated by the adapter from the validated
bundle metadata; it is not part of the filesystem Skill directory.

The flag adds no tools, prompts, scripts, path parameters, subscriptions, or
network behavior. Combining it with `--allow-write` does not alter the Skill:
write tools may be present because of the separately authorized flag, while
the Skill continues to reference and describe read-only workflows only.

The adapter is verified over both supported protocol eras. Unknown clients may
ignore the extension while the default MCP path remains unaffected.

## 11. Contract version and documentation behavior

Agent Contract manifest and API documents remain at schema version 2.

- The framework and site manifests continue to describe default MCP behavior,
  so their extension array stays empty.
- The generated CLI API records the new AI action and experimental MCP option.
- The package resource tree includes the Skill assets.
- Documentation labels Skills over MCP experimental, local-only, read-only,
  and off by default.

Silen does not add a manifest field that claims the experimental runtime mode
is active. A future stable extension may justify a separately designed
contract revision.

## 12. Permission and security model

The Skill is procedural knowledge, not authority.

- It grants no shell, command, MCP, network, filesystem-write, Git, deployment,
  or external-system permission.
- `allowed-tools` is omitted because it is experimental and client-specific.
- No executable file is packaged.
- No source task with `mode: write` is included.
- The MCP adapter serves a closed in-memory path set and accepts no resource
  path supplied by a tool caller.
- Filesystem installation writes only the exact new Skill directory named by
  the explicit destination.
- Existing MCP workspace confinement, symlink defenses, safe errors, no-shell
  boundary, and write opt-in remain unchanged.
- Generated content contains no repository root, home directory, environment
  value, secret, or local absolute path.

References may describe audit or build commands, but the `SKILL.md` permission
boundary requires the host or user to authorize and provide those operations
separately. The instructions never turn availability into authorization.

## 13. Validation and failure behavior

Silen uses two validation layers.

### 13.1 Built-in TypeScript validation

The package build, CLI, and MCP loader enforce:

- exact directory and file names;
- valid Agent Skills `name`, description length, and required fields;
- string-valued metadata;
- the two-task allowlist and read-only modes;
- no `allowed-tools`, scripts, assets, executable MDX, or external file links;
- valid one-level relative references;
- normalized line endings, trailing newline, and deterministic ordering;
- no absolute local path or secret-shaped generated value.

This validation is part of normal Node-only package behavior and works
offline.

### 13.2 Pinned official reference validation

CI and npm Publish install the official `agentskills/agentskills` `skills-ref`
subproject from commit:

```text
38a2ff82958afee88dadf4831509e6f7e9d8ef4e
```

They run:

```text
skills-ref validate dist/agent/skills/silen-docs-readonly
skills-ref read-properties dist/agent/skills/silen-docs-readonly
```

The official project currently describes `skills-ref` as a demonstration
reference library. It is therefore a pinned build-time validator only: no
Python package enters Silen's npm dependencies, runtime, local build, or core
offline path.

Generation or loading fails with stable, path-safe errors when a source task
is missing, duplicated, write-oriented, invalid, or references unknown
contract facts; when a packaged file is missing or changed; when a relative
link escapes the Skill; when a destination conflicts; or when validation
fails. No adapter publishes partial output or silently falls back to a
different instruction set.

## 14. Data flows

Package build:

```text
canonical bilingual task Markdown
  -> existing task parser
  -> explicit two-task selection
  -> pure Agent Skill renderer
  -> built-in validation
  -> dist/agent/skills/silen-docs-readonly
```

Filesystem materialization:

```text
explicit destination
  + validated packaged Skill bytes
  -> temporary sibling directory
  -> local validation
  -> atomic rename
```

Experimental MCP:

```text
explicit experimental flag
  + validated packaged Skill bytes
  -> fixed skill:// Resource registry
  -> index and file reads over stdio
```

There is no model, provider, network service, remote registry, or duplicate
task-authoring step in any flow.

## 15. Testing strategy

### 15.1 Generator tests

- Assert the exact five-file bundle and sorted path order.
- Assert exact frontmatter fields and omission of `allowed-tools`.
- Compare all four reference bodies with their canonical parsed task bodies.
- Prove write tasks and an unlisted synthetic read task are excluded.
- Fail on a missing, duplicate, or reclassified source task.
- Build twice and compare file-by-file bytes and directory hashes.

### 15.2 Filesystem command tests

- Require the destination for the `skills` action.
- Install into missing and existing parent directories.
- Support explicit relative and absolute destinations.
- Reject an existing target Skill without modifying it.
- Clean temporary output after injected write or validation failures.
- Compare materialized bytes with `dist/agent/skills`.
- Keep all existing AI action and unknown-action behavior intact.

### 15.3 MCP tests

- In default mode, assert no Skills capability or resources and preserve the
  current seven/ten tool counts.
- In experimental mode, list and read the index, `SKILL.md`, and four
  references over `2025-11-25` and `2026-07-28`.
- Assert resource metadata, MIME types, URIs, descriptions, and bytes.
- Assert no local root or secret appears in resources or errors.
- Assert lifecycle, shutdown, write opt-in, and path-boundary tests remain
  green.

### 15.4 Package and interoperability tests

- Confirm `pnpm pack --dry-run` contains the complete Skill directory.
- Install the tarball in a clean consumer and read the exported asset paths.
- Run pinned `skills-ref validate` and `read-properties` in CI and Publish.
- Confirm CLI, npm, and MCP copies are byte-identical.
- Keep the official model-free retrieval suite at 24/24.

### 15.5 Full gates

Run formatting, lint, typecheck, build, the complete single-worker test suite,
browser tests, `publint`, `site:ai-check`, source-map rejection, official Skill
validation, package dry-run, deterministic hashes, and a clean consumer.

## 16. CI, Pages, and Publish integration

Core CI adds official Skill validation to one Node 22.12.0 path instead of
duplicating Python setup across the Node matrix. npm Publish runs the same
pinned validation after building and before publishing.

Pages continues to run `site:ai-check` and publishes documentation changes. It
does not run Python or publish the Skill as an HTTP discovery surface because
the Skill is not a Pages artifact in `0.5.0`.

The existing quality gates remain blocking. An official validator failure,
missing package asset, changed deterministic hash, or MCP interoperability
failure prevents release.

## 17. Documentation

Synchronize:

- README package assets and explicit installation command;
- English and Chinese AI index pages;
- English and Chinese local MCP pages;
- English and Chinese Agent Contract pages;
- CLI and reference pages;
- package smoke and documentation contract tests.

Documentation must distinguish:

- filesystem Skill generation: supported and deterministic;
- Skills over MCP: experimental, stdio-only, opt-in, and host-dependent;
- Skill instructions: read-only knowledge, not permission;
- public site HTTP Skill discovery: not included.

## 18. Project map and `0.5.0` release ladder

The implementation keeps package version `0.4.0` until the feature and all
local gates pass. The release closeout then:

1. updates `package.json`, `src/shared/version.ts`, Agent Contract output, and
   CHANGELOG to `0.5.0`;
2. records AI-006 completion evidence and the new baseline in the project map;
3. merges the verified implementation to `main`;
4. pushes `main`, then waits for Core CI and Pages;
5. creates GitHub Release `v0.5.0`, which triggers npm Trusted Publishing;
6. verifies npm `latest`, a fresh install, `silen ai skills`, the packaged
   Skill, dual-protocol MCP, the public Agent Contract, and live documentation.

Release actions remain subject to the user's explicit authorization and the
existing workflow gates. The Skill design itself grants no external authority.

## 19. Acceptance criteria

AI-006 is complete when:

1. `silen-docs-readonly` is generated exclusively from the approved canonical
   read and audit task sources.
2. The npm package contains the exact five-file Skill directory.
3. `silen ai skills <destination>` installs it atomically without overwrite.
4. The output passes built-in validation and the pinned official
   `skills-ref` validator.
5. CLI, package, and MCP bytes are identical and deterministic across clean
   builds.
6. Default MCP behavior and Agent Contract extensions remain unchanged.
7. The experimental flag exposes only the fixed read-only Skill Resources and
   index over both supported protocol eras.
8. No write task, script, implicit permission, local path, secret, model,
   provider, or remote service enters the output or core path.
9. Full repository, package, site, browser, and release gates pass.
10. English and Chinese documentation, CHANGELOG, project map, GitHub Release,
    npm package, clean-consumer proof, and live Pages evidence agree on
    `0.5.0`.

## 20. Reviewed upstream references

- [Agent Skills specification](https://agentskills.io/specification), reviewed
  2026-07-30.
- [Agent Skills client implementation guide](https://agentskills.io/client-implementation/adding-skills-support),
  reviewed 2026-07-30.
- [`skills-ref` reference library](https://github.com/agentskills/agentskills/tree/38a2ff82958afee88dadf4831509e6f7e9d8ef4e/skills-ref),
  pinned 2026-07-30.
- [Skills over MCP experimental repository](https://github.com/modelcontextprotocol/experimental-ext-skills),
  reviewed at `f9df63baff2abf4e6212a953579cac5db7a8e322` on 2026-07-30.
- [SEP-2640 draft](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640),
  reviewed 2026-07-30.
