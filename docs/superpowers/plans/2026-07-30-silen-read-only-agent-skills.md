# Silen Read-Only Agent Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one deterministic `silen-docs-readonly` Agent Skill in the npm package, materialize it only through an explicit collision-safe CLI command, optionally expose the same bytes as read-only MCP Resources, and close the authorized `0.5.0` release.

**Architecture:** A pure renderer selects exactly `audit-site` and `read-site` from the canonical bilingual task packs, emits one validated five-file bundle, and adds it to `dist/agent`. Runtime filesystem and MCP adapters load those packaged bytes rather than reparsing source Markdown; the filesystem command is explicit and non-overwriting, while Skills over MCP remains a fixed, local, stdio-only adapter behind an off-by-default flag.

**Tech Stack:** TypeScript 7, Node.js `^20.19.0 || >=22.12.0`, pnpm 10.34.0, Gray Matter 4, MCP split SDK 2.0.0, Vitest 4, GitHub Actions, Python 3.13 only for the pinned `skills-ref` CI validator.

## Global Constraints

- Generate exactly one Skill directory named `silen-docs-readonly`.
- Include only `audit-site` and `read-site`, each in `en-US` and `zh-CN`, through the exact ordered allowlist `['audit-site', 'read-site']`.
- Keep `contractVersion: 1` on selected source tasks and Agent Contract manifest/API `schemaVersion: 2`.
- Emit exactly `SKILL.md`, `references/audit-site.md`, `references/audit-site-zh-cn.md`, `references/read-site.md`, and `references/read-site-zh-cn.md`.
- Omit `allowed-tools`, `scripts/`, `assets/`, executable MDX, shell wrappers, generated model content, and every write task.
- Use LF line endings, exactly one trailing newline, fixed YAML/JSON field order, and English byte-stable path order.
- Package under `dist/agent/skills/silen-docs-readonly/`; npm, CLI, and MCP must consume byte-identical files from that package output.
- `silen ai skills <destination>` may create the explicit parent but must never overwrite an existing `silen-docs-readonly` directory and must expose no `--force`, update, or clean mode.
- `--experimental-skills-over-mcp` is local stdio only, read-only, off by default, and adds no tools, prompts, scripts, path parameters, subscriptions, network access, or write authority.
- Preserve both `2025-11-25` and `2026-07-28`, seven default read tools, three separately authorized write tools, `--allow-write`, no shell, path confinement, and default Agent Contract `extensions: []`.
- Pin official validation to `agentskills/agentskills` commit `38a2ff82958afee88dadf4831509e6f7e9d8ef4e`; do not add Python or `skills-ref` to npm dependencies or the normal offline Node build.
- Treat `modelcontextprotocol/experimental-ext-skills` commit `f9df63baff2abf4e6212a953579cac5db7a8e322` and draft SEP-2640 only as the fixed Resource/index compatibility fixture; add no runtime dependency on that repository.
- Keep package version `0.4.0` until the complete feature passes local gates; then update package, generated contract, changelog, project map, tag, npm, and live Pages together to `0.5.0`.
- Do not add Remote MCP, OAuth, Tasks, Apps, Ask AI providers, an HTTP Skill discovery endpoint, a registry, downloader, updater, or client-specific installer.
- Every implementation task follows red-green-refactor and ends with a focused commit; external publish/deploy steps run only after all repository gates pass.

## Planned File Structure

- Create `src/ai/contract/agent-skills.ts`: exact allowlist, constants, pure renderer, and built-in bundle validation.
- Modify `src/ai/contract/framework.ts`: add the validated Skill file map beneath `skills/silen-docs-readonly/` during the existing package-contract render.
- Modify `src/ai/contract/package-assets.ts`: locate and validate the exact packaged Skill files with stable errors.
- Create `src/ai/skills.ts`: explicit atomic filesystem materialization only.
- Modify `src/node/commands.ts`: add the `ai skills` action and the experimental MCP flag to the existing shared CLI registry.
- Create `src/ai/mcp/skill-resources.ts`: deterministic `skill://index.json` plus fixed MCP Resource registration.
- Modify `src/ai/mcp/server.ts` and `src/ai/mcp/stdio.ts`: opt-in resource capability/registration and one-time packaged-bundle loading.
- Create `tests/ai/agent-skills.test.ts`: generator, exclusion, normalization, validation, and hash determinism.
- Create `tests/ai/agent-skills-files.test.ts`: packaged loader and collision-safe atomic materialization.
- Create `tests/ai/mcp-skills.test.ts`: default-off and opt-in in-memory MCP resource behavior.
- Create `tests/ai/agent-skills-release.test.ts`: package and workflow invariants for official validation.
- Modify existing CLI, framework, MCP stdio/e2e, package-smoke, documentation, and workflow tests at their current paths.
- Modify README and the existing English/Chinese AI, MCP, Agent Contract, CLI, and reference pages; do not create another documentation section or route.
- Modify `package.json`, `src/shared/version.ts`, `CHANGELOG.md`, and `docs/project-map.md` only during the final release closeout.

---

### Task 1: Promote AI-006 and generate the validated package bundle

**Files:**
- Create: `src/ai/contract/agent-skills.ts`
- Create: `tests/ai/agent-skills.test.ts`
- Modify: `src/ai/contract/framework.ts`
- Modify: `tests/ai/framework-contract.test.ts`
- Modify: `docs/project-map.md`

**Interfaces:**
- Consumes: `TaskPack`, canonical parsed task Markdown, `FrameworkContractBundle`, and the current generator version.
- Produces: `READ_ONLY_AGENT_SKILL_NAME`, `READ_ONLY_AGENT_SKILL_FILES`, `ReadOnlyAgentSkillBundle`, `renderReadOnlyAgentSkill(options)`, and `validateReadOnlyAgentSkillBundle(bundle, version)`.

- [ ] **Step 1: Move the approved Candidate into Active before behavior changes**

Change the project-map header to:

```markdown
- Default next item: `AI-006` (Active).
```

Replace the current Active, Ready, and AI-006 Candidate bodies with this exact state, retaining the existing `## Watch` and later sections unchanged:

```markdown
## Active

### AI-006 — Generate a read-only Agent Skills-compatible surface

- Outcome: Existing Silen task packs and public contracts can emit a standard
  `SKILL.md`-based read-only guidance surface deterministically without
  creating a second hand-maintained instruction system.
- Horizon: `0.5.0`.
- Depends on: `AI-002` and `AI-005`.
- Entry gate: The field-by-field mapping, packaging, validation, exclusion
  rules, explicit filesystem command, and experimental Skills-over-MCP boundary
  are approved.
- Done when: Output is generated from canonical Silen sources, passes the
  official format validator, contains no implicit shell, network, or write
  permission, remains byte-deterministic, and ships with interoperability
  fixtures; Skills over MCP remains behind an explicit experimental flag that
  is off by default and is not required for filesystem-based Skills discovery.
- Evidence:
  [approved design](./superpowers/specs/2026-07-30-silen-read-only-agent-skills-design.md)
  and
  [implementation plan](./superpowers/plans/2026-07-30-silen-read-only-agent-skills.md).

## Ready

No item is ready for default implementation while `AI-006` is Active.

## Candidate

No item is currently a Candidate.
```

Run:

```bash
pnpm exec prettier --check docs/project-map.md
```

Expected: PASS, with exactly one Active item and no Ready or Candidate item.

- [ ] **Step 2: Write the failing generator and framework-package tests**

Create `tests/ai/agent-skills.test.ts`:

```ts
import { createHash } from 'node:crypto'
import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'
import {
  READ_ONLY_AGENT_SKILL_FILES,
  READ_ONLY_AGENT_SKILL_NAME,
  renderReadOnlyAgentSkill,
} from '../../src/ai/contract/agent-skills'
import {
  loadBuiltInTaskPack,
  type ParsedTaskDocument,
  type TaskPack,
} from '../../src/ai/contract/tasks'

function normalizedBody(markdown: string): string {
  return matter(markdown).content.replace(/\r\n?/g, '\n').trim() + '\n'
}

function bundleHash(files: Readonly<Record<string, string>>): string {
  const hash = createHash('sha256')
  for (const [relativePath, content] of Object.entries(files)) {
    hash.update(relativePath)
    hash.update('\0')
    hash.update(content)
    hash.update('\0')
  }
  return hash.digest('hex')
}

async function packs(): Promise<readonly [TaskPack, TaskPack]> {
  return Promise.all([
    loadBuiltInTaskPack('en-US'),
    loadBuiltInTaskPack('zh-CN'),
  ])
}

function syntheticTask(
  id: string,
  mode: 'read' | 'write',
): ParsedTaskDocument {
  return {
    path: `en-US/tasks/${id}.md`,
    metadata:
      mode === 'write'
        ? {
            id,
            title: id,
            contractVersion: 1,
            mode,
            requiresExplicitAuthorization: true,
            references: [],
          }
        : {
            id,
            title: id,
            contractVersion: 1,
            mode,
            requiresExplicitAuthorization: false,
            references: [],
          },
    markdown: `---\nid: ${id}\ntitle: ${id}\ncontractVersion: 1\nmode: ${mode}\n${
      mode === 'write' ? 'requiresExplicitAuthorization: true\n' : ''
    }references: []\n---\n\n# ${id}\n`,
  }
}

describe('read-only Agent Skill renderer', () => {
  it('emits the exact five-file standards-compatible bundle', async () => {
    const sourcePacks = await packs()
    const bundle = renderReadOnlyAgentSkill({
      version: '0.5.0',
      packs: sourcePacks,
    })

    expect(bundle.name).toBe(READ_ONLY_AGENT_SKILL_NAME)
    expect(Object.isFrozen(bundle)).toBe(true)
    expect(Object.isFrozen(bundle.files)).toBe(true)
    expect(Object.keys(bundle.files)).toEqual(READ_ONLY_AGENT_SKILL_FILES)
    const parsed = matter(bundle.files['SKILL.md']!)
    expect(parsed.data).toEqual({
      name: 'silen-docs-readonly',
      description:
        'Use this skill when reading, searching, citing, or performing a model-free audit of Silen documentation or knowledge bases, including requests to 阅读、检索、引用或审计 Silen 文档. It is read-only and does not grant shell, network, filesystem-write, commit, push, or deployment permission.',
      license: 'MIT',
      compatibility:
        'Requires a Silen Agent Contract v2 package or site. Any MCP, command, filesystem, or network access must be separately available and authorized by the host or user.',
      metadata: {
        'silen-version': '0.5.0',
        'silen-contract-version': '2',
        'silen-source-tasks': 'audit-site,read-site',
      },
    })
    expect(parsed.data).not.toHaveProperty('allowed-tools')
    expect(parsed.content).toContain('references/read-site.md')
    expect(parsed.content).toContain('references/audit-site-zh-cn.md')
  })

  it('copies only canonical parsed task bodies in both locales', async () => {
    const sourcePacks = await packs()
    const bundle = renderReadOnlyAgentSkill({
      version: '0.5.0',
      packs: sourcePacks,
    })
    const [english, chinese] = sourcePacks

    expect(bundle.files['references/audit-site.md']).toBe(
      normalizedBody(
        english.tasks.find(({ metadata }) => metadata.id === 'audit-site')!
          .markdown,
      ),
    )
    expect(bundle.files['references/read-site.md']).toBe(
      normalizedBody(
        english.tasks.find(({ metadata }) => metadata.id === 'read-site')!
          .markdown,
      ),
    )
    expect(bundle.files['references/audit-site-zh-cn.md']).toBe(
      normalizedBody(
        chinese.tasks.find(({ metadata }) => metadata.id === 'audit-site')!
          .markdown,
      ),
    )
    expect(bundle.files['references/read-site-zh-cn.md']).toBe(
      normalizedBody(
        chinese.tasks.find(({ metadata }) => metadata.id === 'read-site')!
          .markdown,
      ),
    )
  })

  it('excludes write tasks and unlisted future read tasks', async () => {
    const [english, chinese] = await packs()
    const bundle = renderReadOnlyAgentSkill({
      version: '0.5.0',
      packs: [
        { ...english, tasks: [...english.tasks, syntheticTask('future-read', 'read')] },
        {
          ...chinese,
          tasks: [
            ...chinese.tasks,
            {
              ...syntheticTask('future-read', 'read'),
              path: 'zh-CN/tasks/future-read.md',
            },
          ],
        },
      ],
    })
    const output = Object.values(bundle.files).join('\n')

    expect(output).not.toContain('future-read')
    for (const id of [
      'create-site',
      'deploy-site',
      'maintain-site',
      'migrate-content',
    ]) {
      expect(output).not.toContain(`id: ${id}`)
    }
  })

  it('rejects a missing, duplicate, or write-reclassified selected task', async () => {
    const [english, chinese] = await packs()
    const withoutRead = {
      ...english,
      tasks: english.tasks.filter(({ metadata }) => metadata.id !== 'read-site'),
    }
    expect(() =>
      renderReadOnlyAgentSkill({
        version: '0.5.0',
        packs: [withoutRead, chinese],
      }),
    ).toThrow(/read-site/)

    const read = english.tasks.find(({ metadata }) => metadata.id === 'read-site')!
    expect(() =>
      renderReadOnlyAgentSkill({
        version: '0.5.0',
        packs: [{ ...english, tasks: [...english.tasks, read] }, chinese],
      }),
    ).toThrow(/read-site/)

    const reclassified = syntheticTask('read-site', 'write')
    expect(() =>
      renderReadOnlyAgentSkill({
        version: '0.5.0',
        packs: [
          {
            ...english,
            tasks: english.tasks.map((task) =>
              task.metadata.id === 'read-site' ? reclassified : task,
            ),
          },
          chinese,
        ],
      }),
    ).toThrow(/read-only/)
  })

  it('is byte-stable and contains no process path or environment secret', async () => {
    process.env.SILEN_AGENT_SKILL_TEST_SECRET = 'must-not-appear-in-skill'
    const sourcePacks = await packs()
    const first = renderReadOnlyAgentSkill({
      version: '0.5.0',
      packs: sourcePacks,
    })
    const second = renderReadOnlyAgentSkill({
      version: '0.5.0',
      packs: sourcePacks,
    })
    const output = Object.values(first.files).join('\n')

    expect(first).toEqual(second)
    expect(bundleHash(first.files)).toBe(bundleHash(second.files))
    expect(output).not.toContain(process.cwd())
    expect(output).not.toContain('must-not-appear-in-skill')
    for (const content of Object.values(first.files)) {
      expect(content).not.toMatch(/\r/)
      expect(content).toMatch(/[^\n]\n$/)
      expect(content).not.toMatch(/\n{2}$/)
    }
  })
})
```

Extend `tests/ai/framework-contract.test.ts` inside the deterministic rendering test:

```ts
expect(Object.keys(first)).toEqual(
  expect.arrayContaining([
    'skills/silen-docs-readonly/SKILL.md',
    'skills/silen-docs-readonly/references/audit-site.md',
    'skills/silen-docs-readonly/references/audit-site-zh-cn.md',
    'skills/silen-docs-readonly/references/read-site.md',
    'skills/silen-docs-readonly/references/read-site-zh-cn.md',
  ]),
)
expect(first['skills/silen-docs-readonly/SKILL.md']).toContain(
  'name: silen-docs-readonly',
)
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/ai/agent-skills.test.ts tests/ai/framework-contract.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because `src/ai/contract/agent-skills.ts` and the packaged Skill paths do not exist.

- [ ] **Step 4: Implement the pure renderer and validator**

Create `src/ai/contract/agent-skills.ts` with these constants and exports:

```ts
import matter from 'gray-matter'
import type { ParsedTaskDocument, TaskPack } from './tasks.js'

export const READ_ONLY_AGENT_SKILL_NAME = 'silen-docs-readonly' as const
export const READ_ONLY_AGENT_SKILL_TASK_IDS = [
  'audit-site',
  'read-site',
] as const
export const READ_ONLY_AGENT_SKILL_FILES = [
  'SKILL.md',
  'references/audit-site.md',
  'references/audit-site-zh-cn.md',
  'references/read-site.md',
  'references/read-site-zh-cn.md',
] as const

export const READ_ONLY_AGENT_SKILL_DESCRIPTION =
  'Use this skill when reading, searching, citing, or performing a model-free audit of Silen documentation or knowledge bases, including requests to 阅读、检索、引用或审计 Silen 文档. It is read-only and does not grant shell, network, filesystem-write, commit, push, or deployment permission.'

export const READ_ONLY_AGENT_SKILL_COMPATIBILITY =
  'Requires a Silen Agent Contract v2 package or site. Any MCP, command, filesystem, or network access must be separately available and authorized by the host or user.'

export interface ReadOnlyAgentSkillBundle {
  readonly name: typeof READ_ONLY_AGENT_SKILL_NAME
  readonly files: Readonly<Record<string, string>>
}

export interface RenderReadOnlyAgentSkillOptions {
  readonly version: string
  readonly packs: readonly [TaskPack, TaskPack]
}

export class AgentSkillContractError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(`SILEN_AGENT_SKILL_${code}: ${message}`)
    this.name = 'AgentSkillContractError'
    this.code = code
  }
}

function fail(code: string, message: string): never {
  throw new AgentSkillContractError(code, message)
}

function normalizedBody(markdown: string): string {
  const body = matter(markdown).content.replace(/\r\n?/g, '\n').trim()
  if (body.length === 0) fail('EMPTY_REFERENCE', 'Selected task body is empty')
  return body + '\n'
}

function selectedPack(
  packs: readonly TaskPack[],
  locale: 'en-US' | 'zh-CN',
): TaskPack {
  const matches = packs.filter((pack) => pack.locale === locale)
  if (matches.length !== 1) {
    return fail('LOCALE_COUNT', `Expected exactly one ${locale} task pack`)
  }
  return matches[0]!
}

function selectedTask(pack: TaskPack, id: string): ParsedTaskDocument {
  const matches = pack.tasks.filter((task) => task.metadata.id === id)
  if (matches.length !== 1) {
    return fail(
      'TASK_COUNT',
      `Expected exactly one ${pack.locale} ${id} task`,
    )
  }
  const task = matches[0]!
  if (
    task.metadata.contractVersion !== 1 ||
    task.metadata.mode !== 'read' ||
    task.metadata.requiresExplicitAuthorization === true
  ) {
    return fail('TASK_MODE', `${pack.locale} ${id} must remain read-only`)
  }
  return task
}

function skillMarkdown(version: string): string {
  return `---
name: silen-docs-readonly
description: >-
  Use this skill when reading, searching, citing, or performing a model-free
  audit of Silen documentation or knowledge bases, including requests to
  阅读、检索、引用或审计 Silen 文档. It is read-only and does not grant shell,
  network, filesystem-write, commit, push, or deployment permission.
license: MIT
compatibility: >-
  Requires a Silen Agent Contract v2 package or site. Any MCP, command,
  filesystem, or network access must be separately available and authorized by
  the host or user.
metadata:
  silen-version: ${JSON.stringify(version)}
  silen-contract-version: "2"
  silen-source-tasks: "audit-site,read-site"
---

# Silen read-only documentation workflows

## Use this skill

Prefer the installed or deployed Silen Agent Contract as the canonical source.
Use this Skill only for reading, searching, citing, and model-free auditing.

## Choose the workflow

- Read or cite documentation with [the English reading workflow](references/read-site.md).
- Audit a knowledge base with [the English audit workflow](references/audit-site.md).

## Language

For Chinese requests, use [the Chinese reading workflow](references/read-site-zh-cn.md)
or [the Chinese audit workflow](references/audit-site-zh-cn.md).

## Permission boundary

These instructions grant no tool, shell, command, network, filesystem-write,
source-edit, commit, push, deployment, or external-system authority. The host or
user must provide and authorize every operation separately.

## Completion

Use canonical public sources, report evidence and limitations concisely, and
stop before any source change unless the user separately authorizes it.
`
}

function expectedMetadata(version: string): Record<string, unknown> {
  return {
    name: READ_ONLY_AGENT_SKILL_NAME,
    description: READ_ONLY_AGENT_SKILL_DESCRIPTION,
    license: 'MIT',
    compatibility: READ_ONLY_AGENT_SKILL_COMPATIBILITY,
    metadata: {
      'silen-version': version,
      'silen-contract-version': '2',
      'silen-source-tasks': 'audit-site,read-site',
    },
  }
}

export function validateReadOnlyAgentSkillBundle(
  bundle: ReadOnlyAgentSkillBundle,
  version: string,
): void {
  if (bundle.name !== READ_ONLY_AGENT_SKILL_NAME) {
    fail('NAME', 'Skill directory and name must be silen-docs-readonly')
  }
  if (!/^[0-9A-Za-z][0-9A-Za-z.+-]{0,99}$/.test(version)) {
    fail('VERSION', 'Silen version is invalid')
  }
  const paths = Object.keys(bundle.files)
  if (JSON.stringify(paths) !== JSON.stringify(READ_ONLY_AGENT_SKILL_FILES)) {
    fail('FILES', 'Skill file set or ordering is invalid')
  }

  for (const [relativePath, content] of Object.entries(bundle.files)) {
    if (relativePath.startsWith('/') || relativePath.includes('..')) {
      fail('PATH', 'Skill files must remain inside the Skill directory')
    }
    if (content.includes('\r') || !content.endsWith('\n') || content.endsWith('\n\n')) {
      fail('NORMALIZATION', `${relativePath} is not byte-normalized`)
    }
  }

  const parsed = matter(bundle.files['SKILL.md']!)
  if (JSON.stringify(parsed.data) !== JSON.stringify(expectedMetadata(version))) {
    fail('FRONTMATTER', 'SKILL.md frontmatter does not match the reviewed contract')
  }
  if (
    READ_ONLY_AGENT_SKILL_DESCRIPTION.length > 1024 ||
    READ_ONLY_AGENT_SKILL_COMPATIBILITY.length > 500
  ) {
    fail('FIELD_LIMIT', 'Agent Skills field length limit exceeded')
  }

  const links = Array.from(parsed.content.matchAll(/\]\(([^)]+)\)/g), (match) => match[1])
  const expectedLinks = [
    'references/read-site.md',
    'references/audit-site.md',
    'references/read-site-zh-cn.md',
    'references/audit-site-zh-cn.md',
  ]
  if (JSON.stringify(links) !== JSON.stringify(expectedLinks)) {
    fail('REFERENCES', 'SKILL.md references must be the reviewed one-level paths')
  }

  const output = Object.values(bundle.files).join('\n')
  if (/(?:file:\/\/|[A-Za-z]:\\|\/Users\/|\/home\/)/.test(output)) {
    fail('LOCAL_PATH', 'Generated Skill contains a local absolute path')
  }
  if (/^(?:import|export)\s/m.test(output) || /<\/?[A-Z][A-Za-z0-9.]*/.test(output)) {
    fail('EXECUTABLE_CONTENT', 'Generated Skill must remain plain Markdown')
  }
}

export function renderReadOnlyAgentSkill(
  options: RenderReadOnlyAgentSkillOptions,
): ReadOnlyAgentSkillBundle {
  const english = selectedPack(options.packs, 'en-US')
  const chinese = selectedPack(options.packs, 'zh-CN')
  const files: Record<string, string> = {
    'SKILL.md': skillMarkdown(options.version),
    'references/audit-site.md': normalizedBody(selectedTask(english, 'audit-site').markdown),
    'references/audit-site-zh-cn.md': normalizedBody(selectedTask(chinese, 'audit-site').markdown),
    'references/read-site.md': normalizedBody(selectedTask(english, 'read-site').markdown),
    'references/read-site-zh-cn.md': normalizedBody(selectedTask(chinese, 'read-site').markdown),
  }
  const bundle: ReadOnlyAgentSkillBundle = Object.freeze({
    name: READ_ONLY_AGENT_SKILL_NAME,
    files: Object.freeze(files),
  })
  validateReadOnlyAgentSkillBundle(bundle, options.version)
  return bundle
}
```

Keep Prettier's wrapping when applying this code. Do not loosen the file set,
frontmatter equality, task count, locale count, or read-only checks to make a
test pass.

- [ ] **Step 5: Add the Skill to the existing framework render**

Import the renderer in `src/ai/contract/framework.ts`:

```ts
import { renderReadOnlyAgentSkill } from './agent-skills.js'
```

Immediately before the final sorted `Object.fromEntries` in
`renderFrameworkContract`, add:

```ts
const skill = renderReadOnlyAgentSkill({
  version: bundle.manifest.generator.version,
  packs: bundle.packs,
})
for (const [relativePath, content] of Object.entries(skill.files)) {
  files[`skills/${skill.name}/${relativePath}`] = content
}
```

Do not change `tooling/build-agent-contract.ts`: its existing full
`dist/agent` replacement must remain the only package generation point.

- [ ] **Step 6: Run generator, framework, type, and build checks**

Run:

```bash
pnpm exec vitest run tests/ai/agent-skills.test.ts tests/ai/framework-contract.test.ts --maxWorkers=1 --no-file-parallelism
pnpm typecheck
pnpm build
find dist/agent/skills/silen-docs-readonly -type f | LC_ALL=C sort
```

Expected: tests, typecheck, and build PASS; `find` prints exactly the five
approved paths and no `scripts` or `assets` directory.

- [ ] **Step 7: Commit the active map state and deterministic generator**

```bash
git add docs/project-map.md src/ai/contract/agent-skills.ts src/ai/contract/framework.ts tests/ai/agent-skills.test.ts tests/ai/framework-contract.test.ts
git commit -m "feat(ai): generate read-only Agent Skill"
```

Expected: one focused commit with AI-006 Active and the package build producing
the exact validated five-file bundle.

---

### Task 2: Load packaged bytes and materialize them atomically

**Files:**
- Modify: `src/ai/contract/package-assets.ts`
- Create: `src/ai/skills.ts`
- Create: `tests/ai/agent-skills-files.test.ts`

**Interfaces:**
- Consumes: the exact bundle and validator from Task 1 plus the existing package-root locator.
- Produces: `loadPackagedReadOnlyAgentSkill(startUrl?)` and `materializeReadOnlyAgentSkill(destination, options?)` returning the created directory and sorted file list.

- [ ] **Step 1: Write failing loader and filesystem tests**

Create `tests/ai/agent-skills-files.test.ts`:

```ts
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  READ_ONLY_AGENT_SKILL_FILES,
  READ_ONLY_AGENT_SKILL_NAME,
} from '../../src/ai/contract/agent-skills'
import { loadPackagedReadOnlyAgentSkill } from '../../src/ai/contract/package-assets'
import { materializeReadOnlyAgentSkill } from '../../src/ai/skills'

const temporaryDirectories: string[] = []

async function temporaryDirectory(label: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), label))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('packaged read-only Agent Skill files', () => {
  it('loads the exact validated bytes generated under dist/agent', async () => {
    const bundle = await loadPackagedReadOnlyAgentSkill()

    expect(bundle.name).toBe(READ_ONLY_AGENT_SKILL_NAME)
    expect(Object.isFrozen(bundle)).toBe(true)
    expect(Object.isFrozen(bundle.files)).toBe(true)
    expect(Object.keys(bundle.files)).toEqual(READ_ONLY_AGENT_SKILL_FILES)
    for (const relativePath of READ_ONLY_AGENT_SKILL_FILES) {
      expect(bundle.files[relativePath]).toBe(
        await readFile(
          path.resolve(
            'dist/agent/skills',
            READ_ONLY_AGENT_SKILL_NAME,
            relativePath,
          ),
          'utf8',
        ),
      )
    }
  })

  it.each(['absolute', 'relative'] as const)(
    'materializes into a new %s destination without changing bytes',
    async (kind) => {
      const root = await temporaryDirectory('silen-agent-skill-files-')
      const absoluteParent = path.join(root, 'installed-skills')
      const destination =
        kind === 'absolute'
          ? absoluteParent
          : path.relative(process.cwd(), absoluteParent)
      const packaged = await loadPackagedReadOnlyAgentSkill()
      const result = await materializeReadOnlyAgentSkill(destination)

      expect(result.directory).toBe(
        path.join(absoluteParent, READ_ONLY_AGENT_SKILL_NAME),
      )
      expect(result.files).toEqual(READ_ONLY_AGENT_SKILL_FILES)
      for (const relativePath of READ_ONLY_AGENT_SKILL_FILES) {
        expect(await readFile(path.join(result.directory, relativePath), 'utf8')).toBe(
          packaged.files[relativePath],
        )
      }
    },
  )

  it('rejects an existing target without modifying its content', async () => {
    const root = await temporaryDirectory('silen-agent-skill-conflict-')
    const target = path.join(root, READ_ONLY_AGENT_SKILL_NAME)
    await mkdir(target, { recursive: true })
    await writeFile(path.join(target, 'keep.txt'), 'do not change\n')

    await expect(materializeReadOnlyAgentSkill(root)).rejects.toThrow(
      'SILEN_AGENT_SKILL_TARGET_EXISTS',
    )
    expect(await readFile(path.join(target, 'keep.txt'), 'utf8')).toBe(
      'do not change\n',
    )
    expect(await readdir(target)).toEqual(['keep.txt'])
  })

  it('removes the temporary sibling after an injected write failure', async () => {
    const root = await temporaryDirectory('silen-agent-skill-cleanup-')
    const failingWrite = async (
      file: string,
      data: string,
      encoding: 'utf8',
    ): Promise<void> => {
      await writeFile(file, data, encoding)
      if (String(file).endsWith('references/read-site.md')) {
        throw new Error('injected write failure')
      }
    }

    await expect(
      materializeReadOnlyAgentSkill(root, { writeFile: failingWrite }),
    ).rejects.toThrow('SILEN_AGENT_SKILL_INSTALL_FAILED')
    expect(await readdir(root)).toEqual([])
  })

  it('requires a non-empty explicit destination', async () => {
    await expect(materializeReadOnlyAgentSkill('')).rejects.toThrow(
      'SILEN_AGENT_SKILL_DESTINATION_REQUIRED',
    )
    await expect(materializeReadOnlyAgentSkill('   ')).rejects.toThrow(
      'SILEN_AGENT_SKILL_DESTINATION_REQUIRED',
    )
  })
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm build
pnpm exec vitest run tests/ai/agent-skills-files.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: the build succeeds from Task 1, then the test FAILS because the
packaged loader and materializer exports do not exist.

- [ ] **Step 3: Extend the package asset loader with an exact closed file set**

In `src/ai/contract/package-assets.ts`, add `readdir` to the filesystem import,
import the current version and Skill contract, then add this loader after
`locatePackagedAgentContract`:

```ts
import { access, readFile, readdir } from 'node:fs/promises'
import { SILEN_VERSION } from '../../shared/version.js'
import {
  READ_ONLY_AGENT_SKILL_FILES,
  READ_ONLY_AGENT_SKILL_NAME,
  validateReadOnlyAgentSkillBundle,
  type ReadOnlyAgentSkillBundle,
} from './agent-skills.js'

function exactEntryNames(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
}

export async function loadPackagedReadOnlyAgentSkill(
  startUrl: string | URL = import.meta.url,
): Promise<ReadOnlyAgentSkillBundle> {
  try {
    const assets = await locatePackagedAgentContract(startUrl)
    const root = path.join(
      assets,
      'skills',
      READ_ONLY_AGENT_SKILL_NAME,
    )
    const [rootEntries, referenceEntries] = await Promise.all([
      readdir(root, { withFileTypes: true }),
      readdir(path.join(root, 'references'), { withFileTypes: true }),
    ])
    if (
      !exactEntryNames(
        rootEntries.map((entry) => entry.name),
        ['SKILL.md', 'references'],
      ) ||
      !rootEntries.some((entry) => entry.name === 'SKILL.md' && entry.isFile()) ||
      !rootEntries.some(
        (entry) => entry.name === 'references' && entry.isDirectory(),
      ) ||
      !exactEntryNames(
        referenceEntries.map((entry) => entry.name),
        [
          'audit-site.md',
          'audit-site-zh-cn.md',
          'read-site.md',
          'read-site-zh-cn.md',
        ],
      ) ||
      referenceEntries.some((entry) => !entry.isFile())
    ) {
      throw stableAssetError()
    }

    const files = Object.fromEntries(
      await Promise.all(
        READ_ONLY_AGENT_SKILL_FILES.map(async (relativePath) => [
          relativePath,
          await readFile(path.join(root, relativePath), 'utf8'),
        ] as const),
      ),
    )
    const bundle: ReadOnlyAgentSkillBundle = Object.freeze({
      name: READ_ONLY_AGENT_SKILL_NAME,
      files: Object.freeze(files),
    })
    validateReadOnlyAgentSkillBundle(bundle, SILEN_VERSION)
    return bundle
  } catch {
    throw stableAssetError()
  }
}
```

Keep the existing `stableAssetError()` message unchanged so missing or corrupt
package assets remain path-safe. Prettier may wrap the boolean expression, but
must not change its exact-file or real-file/real-directory checks.

- [ ] **Step 4: Implement collision-safe atomic materialization**

Create `src/ai/skills.ts`:

```ts
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile as writeFileFromFs,
} from 'node:fs/promises'
import path from 'node:path'
import {
  READ_ONLY_AGENT_SKILL_FILES,
  READ_ONLY_AGENT_SKILL_NAME,
  validateReadOnlyAgentSkillBundle,
  type ReadOnlyAgentSkillBundle,
} from './contract/agent-skills.js'
import { loadPackagedReadOnlyAgentSkill } from './contract/package-assets.js'
import { SILEN_VERSION } from '../shared/version.js'

export interface MaterializedReadOnlyAgentSkill {
  readonly directory: string
  readonly files: typeof READ_ONLY_AGENT_SKILL_FILES
}

export interface MaterializeReadOnlyAgentSkillOptions {
  readonly loadBundle?: () => Promise<ReadOnlyAgentSkillBundle>
  readonly writeFile?: AgentSkillWriteFile
}

export type AgentSkillWriteFile = (
  file: string,
  data: string,
  encoding: 'utf8',
) => Promise<void>

export class AgentSkillInstallError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(`SILEN_AGENT_SKILL_${code}: ${message}`)
    this.name = 'AgentSkillInstallError'
    this.code = code
  }
}

async function targetExists(target: string): Promise<boolean> {
  try {
    await lstat(target)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function assertWrittenBytes(
  root: string,
  bundle: ReadOnlyAgentSkillBundle,
): Promise<void> {
  const files = Object.fromEntries(
    await Promise.all(
      READ_ONLY_AGENT_SKILL_FILES.map(async (relativePath) => [
        relativePath,
        await readFile(path.join(root, relativePath), 'utf8'),
      ] as const),
    ),
  )
  const written: ReadOnlyAgentSkillBundle = {
    name: READ_ONLY_AGENT_SKILL_NAME,
    files,
  }
  validateReadOnlyAgentSkillBundle(written, SILEN_VERSION)
  if (JSON.stringify(written.files) !== JSON.stringify(bundle.files)) {
    throw new AgentSkillInstallError(
      'BYTE_MISMATCH',
      'Written Skill bytes differ from the packaged bundle',
    )
  }
}

export async function materializeReadOnlyAgentSkill(
  destination: string,
  options: MaterializeReadOnlyAgentSkillOptions = {},
): Promise<MaterializedReadOnlyAgentSkill> {
  if (typeof destination !== 'string' || destination.trim() === '') {
    throw new AgentSkillInstallError(
      'DESTINATION_REQUIRED',
      'An explicit destination path is required',
    )
  }

  const loadBundle = options.loadBundle ?? loadPackagedReadOnlyAgentSkill
  const writeFile: AgentSkillWriteFile =
    options.writeFile ??
    ((file, data, encoding) => writeFileFromFs(file, data, encoding))
  const bundle = await loadBundle()
  validateReadOnlyAgentSkillBundle(bundle, SILEN_VERSION)

  const parent = path.resolve(destination)
  const target = path.join(parent, READ_ONLY_AGENT_SKILL_NAME)
  let temporary: string | undefined
  try {
    await mkdir(parent, { recursive: true })
    if (await targetExists(target)) {
      throw new AgentSkillInstallError(
        'TARGET_EXISTS',
        'The target Skill directory already exists',
      )
    }
    temporary = await mkdtemp(
      path.join(parent, `.${READ_ONLY_AGENT_SKILL_NAME}-`),
    )
    for (const relativePath of READ_ONLY_AGENT_SKILL_FILES) {
      const output = path.join(temporary, relativePath)
      await mkdir(path.dirname(output), { recursive: true })
      await writeFile(output, bundle.files[relativePath]!, 'utf8')
    }
    await assertWrittenBytes(temporary, bundle)
    await rename(temporary, target)
    return { directory: target, files: READ_ONLY_AGENT_SKILL_FILES }
  } catch (error) {
    if (error instanceof AgentSkillInstallError) throw error
    throw new AgentSkillInstallError(
      'INSTALL_FAILED',
      'The packaged Skill could not be materialized safely',
    )
  } finally {
    if (temporary !== undefined) {
      await rm(temporary, { recursive: true, force: true })
    }
  }
}
```

The only injectable operation is `writeFile`, used to prove cleanup. Do not
add overwrite, removal, update, force, shell, client-directory discovery, or
automatic installation behavior.

- [ ] **Step 5: Run the filesystem and package-loader checks**

Run:

```bash
pnpm exec vitest run tests/ai/agent-skills-files.test.ts --maxWorkers=1 --no-file-parallelism
pnpm typecheck
pnpm build
```

Expected: PASS. Existing targets remain untouched, failed writes leave the
explicit parent empty, and materialized bytes equal `dist/agent` byte for byte.

- [ ] **Step 6: Commit packaged loading and explicit materialization**

```bash
git add src/ai/contract/package-assets.ts src/ai/skills.ts tests/ai/agent-skills-files.test.ts
git commit -m "feat(ai): materialize packaged Agent Skill safely"
```

---

### Task 3: Expose explicit filesystem materialization through the CLI contract

**Files:**
- Modify: `src/node/commands.ts`
- Modify: `tests/ai/cli-contract.test.ts`
- Modify: `tests/cli.test.ts`
- Modify: `tests/ai/framework-contract.test.ts`

**Interfaces:**
- Consumes: `materializeReadOnlyAgentSkill(destination)` from Task 2 and the existing shared command descriptor registry.
- Produces: the public action `silen ai skills <destination>` while retaining the single `ai <action> [path]` command descriptor and all existing action behavior.

- [ ] **Step 1: Write failing CLI registry and execution assertions**

In `tests/ai/cli-contract.test.ts`, replace the current AI descriptor assertion
with:

```ts
expect(commandDescriptors.find(({ id }) => id === 'ai')).toMatchObject({
  syntax: 'ai <action> [path]',
  description:
    'Initialize, index, audit, evaluate, or materialize the local AI surface',
  arguments: [
    {
      name: 'action',
      required: true,
      description: 'One of init, index, audit, eval, or skills.',
    },
    {
      name: 'path',
      required: false,
    },
  ],
  options: [
    {
      name: '--json',
      required: false,
      default: false,
    },
  ],
})
```

Update the unknown-action expectation in the same file to:

```ts
expect(result.all).toContain(
  'Unknown AI command "unknown"; expected init, index, audit, eval, or skills',
)
```

In `tests/cli.test.ts`, change the primary help assertion to
`ai <action> [path]`, add `stat` to the filesystem imports, and add this test:

```ts
it('materializes the packaged read-only Agent Skill only at an explicit destination', async () => {
  const destination = path.join(root, 'agent-skills')
  const installed = await execa(
    cliRunner,
    [cli, 'ai', 'skills', destination],
    { reject: false, all: true },
  )
  const skill = path.join(destination, 'silen-docs-readonly')

  expect(installed.exitCode, installed.all).toBe(0)
  expect(installed.stdout).toContain(`Created ${skill}`)
  expect(await readFile(path.join(skill, 'SKILL.md'), 'utf8')).toContain(
    'name: silen-docs-readonly',
  )
  expect(await readFile(path.join(skill, 'references/read-site.md'), 'utf8')).toContain(
    '# Read a deployed Silen site',
  )
  await expect(stat(path.join(destination, '.silen'))).rejects.toMatchObject({
    code: 'ENOENT',
  })

  const repeated = await execa(
    cliRunner,
    [cli, 'ai', 'skills', destination],
    { reject: false, all: true },
  )
  expect(repeated.exitCode).not.toBe(0)
  expect(repeated.all).toContain('SILEN_AGENT_SKILL_TARGET_EXISTS')

  const missing = await execa(cliRunner, [cli, 'ai', 'skills'], {
    reject: false,
    all: true,
  })
  expect(missing.exitCode).not.toBe(0)
  expect(missing.all).toContain('Silen ai skills requires a destination path')
}, 30_000)
```

In `tests/ai/framework-contract.test.ts`, add this API assertion after locating
the `ai` command:

```ts
expect(bundle.api.cli.commands.find(({ id }) => id === 'ai')).toMatchObject({
  syntax: 'ai <action> [path]',
  arguments: [
    { name: 'action', required: true },
    { name: 'path', required: false },
  ],
})
```

- [ ] **Step 2: Run the focused CLI tests and verify they fail**

Run:

```bash
pnpm build
pnpm exec vitest run tests/ai/cli-contract.test.ts tests/cli.test.ts tests/ai/framework-contract.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because `skills` is rejected, help still says `[root]`, and the
generated CLI API does not describe the new action.

- [ ] **Step 3: Wire the action through the shared command registry**

In `src/node/commands.ts`, import the Task 2 materializer:

```ts
import { materializeReadOnlyAgentSkill } from '../ai/skills.js'
```

Add the dependency to `CommandDependencies`:

```ts
materializeReadOnlyAgentSkill: typeof materializeReadOnlyAgentSkill
```

Add it to `defaultDependencies`:

```ts
materializeReadOnlyAgentSkill,
```

Keep `rootArgument` unchanged for `dev`, `build`, `preview`, and `mcp`. Add this
separate AI positional descriptor immediately after it:

```ts
const aiPathArgument = {
  name: 'path',
  required: false,
  description:
    'Documentation content root, or the required parent destination for skills.',
} as const
```

Change only the `ai` descriptor's metadata to:

```ts
{
  id: 'ai',
  syntax: 'ai <action> [path]',
  description:
    'Initialize, index, audit, evaluate, or materialize the local AI surface',
  sideEffect: 'write',
  arguments: [
    {
      name: 'action',
      required: true,
      description: 'One of init, index, audit, eval, or skills.',
    },
    aiPathArgument,
  ],
```

At the beginning of the AI `execute` handler, replace the action validation and
insert the explicit Skill branch before `commandRoot(root)`:

```ts
if (
  action !== 'init' &&
  action !== 'index' &&
  action !== 'audit' &&
  action !== 'eval' &&
  action !== 'skills'
) {
  throw new Error(
    'Unknown AI command ' +
      JSON.stringify(action) +
      '; expected init, index, audit, eval, or skills',
  )
}
if (action === 'skills') {
  if (typeof root !== 'string' || root.trim() === '') {
    throw new TypeError('Silen ai skills requires a destination path')
  }
  const result = await dependencies.materializeReadOnlyAgentSkill(root)
  dependencies.output('Created ' + result.directory)
  return
}
const resolvedRoot = commandRoot(root)
```

Keep evaluation parsing, exit codes, workspace creation, audit behavior, and
the `--json` option unchanged. The `skills` branch must return before
`createWorkspace` so installation does not initialize or scan a content root.

- [ ] **Step 4: Run CLI, contract, build, and existing action regressions**

Run:

```bash
pnpm exec vitest run tests/ai/cli-contract.test.ts tests/cli.test.ts tests/ai/framework-contract.test.ts tests/ai/workspace.test.ts tests/ai/eval.test.ts --maxWorkers=1 --no-file-parallelism
pnpm typecheck
pnpm build
node dist/node/cli.js --help
```

Expected: PASS; help contains `ai <action> [path]`; existing `init`, `index`,
`audit`, and `eval` tests retain their output and exit codes.

- [ ] **Step 5: Commit the explicit CLI surface**

```bash
git add src/node/commands.ts tests/ai/cli-contract.test.ts tests/cli.test.ts tests/ai/framework-contract.test.ts
git commit -m "feat(cli): add explicit Agent Skill materialization"
```

---

### Task 4: Add the off-by-default Skills over MCP resource adapter

**Files:**
- Create: `src/ai/mcp/skill-resources.ts`
- Create: `tests/ai/mcp-skills.test.ts`
- Modify: `src/ai/mcp/server.ts`
- Modify: `src/ai/mcp/stdio.ts`
- Modify: `src/node/commands.ts`
- Modify: `tests/ai/mcp-e2e.test.ts`
- Modify: `tests/ai/mcp-stdio.test.ts`
- Modify: `tests/ai/cli-contract.test.ts`
- Modify: `tests/ai/framework-contract.test.ts`

**Interfaces:**
- Consumes: the validated packaged bundle, MCP `McpServer`, existing `serveStdio`, and both verified protocol eras.
- Produces: `AGENT_SKILLS_MCP_EXTENSION`, `serializeReadOnlyAgentSkillIndex(bundle)`, `registerReadOnlyAgentSkillResources(server, bundle)`, optional `CreateMcpServerOptions.readOnlyAgentSkill`, and optional `CreateMcpOptions.experimentalSkillsOverMcp`.

- [ ] **Step 1: Write the failing default-off and opt-in in-memory tests**

Create `tests/ai/mcp-skills.test.ts`:

```ts
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadPackagedReadOnlyAgentSkill } from '../../src/ai/contract/package-assets'
import {
  AGENT_SKILLS_MCP_EXTENSION,
  READ_ONLY_AGENT_SKILL_INDEX_URI,
} from '../../src/ai/mcp/skill-resources'
import { createMcpServer } from '../../src/ai/mcp/server'
import { createWorkspace } from '../../src/ai/workspace'

let root: string
const clients: Client[] = []

beforeEach(async () => {
  root = await mkdtemp(path.resolve('tests/fixtures/.agent-skills-mcp-'))
  await cp(path.resolve('tests/fixtures/ai-workspace'), root, {
    recursive: true,
  })
})

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
  await rm(root, { recursive: true, force: true })
})

async function startClient(
  experimental: boolean,
  allowWrite = false,
): Promise<Client> {
  const workspace = await createWorkspace(root)
  const bundle = experimental
    ? await loadPackagedReadOnlyAgentSkill()
    : undefined
  const server = createMcpServer({
    workspace,
    allowWrite,
    readOnlyAgentSkill: bundle,
  })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'silen-skills-test', version: '1.0.0' })
  clients.push(client)
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return client
}

function resourceText(
  result: Awaited<ReturnType<Client['readResource']>>,
): string {
  const content = result.contents[0]
  if (content === undefined || !('text' in content)) {
    throw new TypeError('Expected a text MCP Resource')
  }
  return content.text
}

describe('experimental read-only Agent Skills MCP resources', () => {
  it('keeps the default server free of Skill capability and Resources', async () => {
    const client = await startClient(false)
    const capabilities = client.getServerCapabilities()

    expect(capabilities?.extensions?.[AGENT_SKILLS_MCP_EXTENSION]).toBeUndefined()
    expect(capabilities?.resources).toBeUndefined()
    expect((await client.listTools()).tools).toHaveLength(7)
  })

  it('serves one deterministic index and the five packaged files when opted in', async () => {
    process.env.SILEN_MCP_SKILL_TEST_SECRET = 'must-not-appear-over-mcp'
    const packaged = await loadPackagedReadOnlyAgentSkill()
    const client = await startClient(true)
    const capabilities = client.getServerCapabilities()

    expect(capabilities?.extensions?.[AGENT_SKILLS_MCP_EXTENSION]).toEqual({})
    expect(capabilities?.resources).toEqual({})
    const listed = await client.listResources()
    expect(listed.resources.map(({ uri }) => uri)).toEqual([
      READ_ONLY_AGENT_SKILL_INDEX_URI,
      'skill://silen-docs-readonly/SKILL.md',
      'skill://silen-docs-readonly/references/audit-site.md',
      'skill://silen-docs-readonly/references/audit-site-zh-cn.md',
      'skill://silen-docs-readonly/references/read-site.md',
      'skill://silen-docs-readonly/references/read-site-zh-cn.md',
    ])
    expect(listed.resources[0]).toMatchObject({
      name: 'silen-agent-skills-index',
      mimeType: 'application/json',
      description: 'Enumerates the explicitly enabled read-only Silen Skill.',
    })
    for (const resource of listed.resources.slice(1)) {
      expect(resource.mimeType).toBe('text/markdown')
      expect(resource.description).toBeTypeOf('string')
      expect(resource.description).not.toBe('')
    }
    expect(
      listed.resources.find(({ uri }) => uri.endsWith('/SKILL.md')),
    ).toMatchObject({
      name: 'silen-docs-readonly',
      mimeType: 'text/markdown',
      description:
        'Use this skill when reading, searching, citing, or performing a model-free audit of Silen documentation or knowledge bases, including requests to 阅读、检索、引用或审计 Silen 文档. It is read-only and does not grant shell, network, filesystem-write, commit, push, or deployment permission.',
    })

    const index = await client.readResource({
      uri: READ_ONLY_AGENT_SKILL_INDEX_URI,
    })
    expect(JSON.parse(resourceText(index))).toEqual({
      $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
      skills: [
        {
          name: 'silen-docs-readonly',
          type: 'skill-md',
          description:
            'Use this skill when reading, searching, citing, or performing a model-free audit of Silen documentation or knowledge bases, including requests to 阅读、检索、引用或审计 Silen 文档. It is read-only and does not grant shell, network, filesystem-write, commit, push, or deployment permission.',
          url: 'skill://silen-docs-readonly/SKILL.md',
        },
      ],
    })

    for (const [relativePath, expected] of Object.entries(packaged.files)) {
      const result = await client.readResource({
        uri: `skill://silen-docs-readonly/${relativePath}`,
      })
      expect(result.contents).toEqual([
        {
          uri: `skill://silen-docs-readonly/${relativePath}`,
          mimeType: 'text/markdown',
          text: expected,
        },
      ])
    }

    const allContent = JSON.stringify([
      listed,
      index,
      ...Object.values(packaged.files),
    ])
    expect(allContent).not.toContain(root)
    expect(allContent).not.toContain('must-not-appear-over-mcp')
    expect((await client.listTools()).tools).toHaveLength(7)
  })

  it('keeps the Skill read-only when write tools are separately authorized', async () => {
    const client = await startClient(true, true)
    expect((await client.listTools()).tools).toHaveLength(10)
    expect((await client.listResources()).resources).toHaveLength(6)
    const skill = await client.readResource({
      uri: 'skill://silen-docs-readonly/SKILL.md',
    })
    const text = resourceText(skill)

    expect(text).toContain('read-only')
    expect(text).not.toContain('create-site')
    expect(text).not.toContain('maintain-site')
    expect(text).not.toContain('deploy-site')
  })
})
```

- [ ] **Step 2: Add failing dual-era and CLI option assertions**

In `tests/ai/cli-contract.test.ts`, replace the exact MCP option array with:

```ts
options: [
  {
    name: '--allow-write',
    default: false,
    required: false,
  },
  {
    name: '--experimental-skills-over-mcp',
    default: false,
    required: false,
  },
],
```

In the first `tests/ai/mcp-e2e.test.ts` read-only test, add:

```ts
expect(
  session.client.getServerCapabilities()?.extensions?.[
    'io.modelcontextprotocol/skills'
  ],
).toBeUndefined()
expect(session.client.getServerCapabilities()?.resources).toBeUndefined()
```

Add the options type, then replace only the existing function signature:

```ts
interface BuiltClientOptions {
  readonly allowWrite?: boolean
  readonly experimentalSkills?: boolean
}

async function startBuiltClient(
  root: string,
  era: VerifiedEra,
  options: BuiltClientOptions = {},
) {
```

Inside its existing `StdioClientTransport` options, replace the `args` value
with this complete array; leave the existing stderr capture, protocol
assertions, connection, and `assertClean` return body after the transport
unchanged:

```ts
args: [
  path.resolve('dist/node/cli.js'),
  'mcp',
  root,
  ...(options.allowWrite ? ['--allow-write'] : []),
  ...(options.experimentalSkills
    ? ['--experimental-skills-over-mcp']
    : []),
],
```

Update the existing write call from `startBuiltClient(root, era, true)` to:

```ts
startBuiltClient(root, era, { allowWrite: true })
```

Add this dual-era case to `tests/ai/mcp-e2e.test.ts`:

```ts
it.each(verifiedEras)(
  'serves only the packaged read-only Skill Resources over the %s protocol era when opted in',
  async (era) => {
    const root = await temporaryWorkspace()
    const session = await startBuiltClient(root, era, {
      experimentalSkills: true,
    })

    expect(
      session.client.getServerCapabilities()?.extensions?.[
        'io.modelcontextprotocol/skills'
      ],
    ).toEqual({})
    const listed = await session.client.listResources()
    expect(listed.resources).toHaveLength(6)
    expect(listed.resources.map(({ uri }) => uri)).toContain(
      'skill://silen-docs-readonly/SKILL.md',
    )
    const skill = await session.client.readResource({
      uri: 'skill://silen-docs-readonly/SKILL.md',
    })
    const skillContent = skill.contents[0]
    if (skillContent === undefined || !('text' in skillContent)) {
      throw new TypeError('Expected a text Skill Resource')
    }
    expect(skillContent.text).toBe(
      await readFile(
        path.resolve('dist/agent/skills/silen-docs-readonly/SKILL.md'),
        'utf8',
      ),
    )
    expect(JSON.stringify([listed, skill])).not.toContain(root)
    expect((await session.client.listTools()).tools).toHaveLength(7)

    await session.assertClean()
  },
  60_000,
)
```

- [ ] **Step 3: Run the focused MCP tests and verify they fail**

Run:

```bash
pnpm build
pnpm exec vitest run tests/ai/mcp-skills.test.ts tests/ai/mcp-e2e.test.ts tests/ai/cli-contract.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because the experimental constants, Resources, extension
capability, and CLI flag do not exist.

- [ ] **Step 4: Implement the deterministic fixed Resource registry**

Create `src/ai/mcp/skill-resources.ts`:

```ts
import type { McpServer } from '@modelcontextprotocol/server'
import {
  READ_ONLY_AGENT_SKILL_DESCRIPTION,
  READ_ONLY_AGENT_SKILL_FILES,
  validateReadOnlyAgentSkillBundle,
  type ReadOnlyAgentSkillBundle,
} from '../contract/agent-skills.js'
import { SILEN_VERSION } from '../../shared/version.js'

export const AGENT_SKILLS_MCP_EXTENSION =
  'io.modelcontextprotocol/skills' as const
export const READ_ONLY_AGENT_SKILL_INDEX_URI = 'skill://index.json' as const

function skillUri(bundle: ReadOnlyAgentSkillBundle, relativePath: string): string {
  return `skill://${bundle.name}/${relativePath}`
}

export function serializeReadOnlyAgentSkillIndex(
  bundle: ReadOnlyAgentSkillBundle,
): string {
  validateReadOnlyAgentSkillBundle(bundle, SILEN_VERSION)
  return `${JSON.stringify(
    {
      $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
      skills: [
        {
          name: bundle.name,
          type: 'skill-md',
          description: READ_ONLY_AGENT_SKILL_DESCRIPTION,
          url: skillUri(bundle, 'SKILL.md'),
        },
      ],
    },
    null,
    2,
  )}\n`
}

export function registerReadOnlyAgentSkillResources(
  server: McpServer,
  bundle: ReadOnlyAgentSkillBundle,
): void {
  Object.freeze(bundle.files)
  Object.freeze(bundle)
  validateReadOnlyAgentSkillBundle(bundle, SILEN_VERSION)
  const index = serializeReadOnlyAgentSkillIndex(bundle)
  server.registerResource(
    'silen-agent-skills-index',
    READ_ONLY_AGENT_SKILL_INDEX_URI,
    {
      title: 'Silen Agent Skills index',
      description: 'Enumerates the explicitly enabled read-only Silen Skill.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: index },
      ],
    }),
  )

  for (const relativePath of READ_ONLY_AGENT_SKILL_FILES) {
    const uri = skillUri(bundle, relativePath)
    const root = relativePath === 'SKILL.md'
    server.registerResource(
      root ? bundle.name : `${bundle.name}-${relativePath.replaceAll('/', '-')}`,
      uri,
      {
        title: root
          ? 'Silen read-only documentation workflows'
          : `Silen Skill reference: ${relativePath}`,
        description: root
          ? READ_ONLY_AGENT_SKILL_DESCRIPTION
          : `Canonical packaged ${bundle.name} file ${relativePath}.`,
        mimeType: 'text/markdown',
      },
      async (resourceUri) => ({
        contents: [
          {
            uri: resourceUri.href,
            mimeType: 'text/markdown',
            text: bundle.files[relativePath]!,
          },
        ],
      }),
    )
  }
}
```

Do not accept a resource path from the client, register templates, or read from
disk in callbacks. All callbacks close over the already validated immutable
file map.

- [ ] **Step 5: Gate Resource registration in the server and stdio entry**

In `src/ai/mcp/server.ts`, import the bundle type and adapter, then extend the
options:

```ts
import type { ReadOnlyAgentSkillBundle } from '../contract/agent-skills.js'
import {
  AGENT_SKILLS_MCP_EXTENSION,
  registerReadOnlyAgentSkillResources,
} from './skill-resources.js'

export interface CreateMcpServerOptions {
  workspace: Workspace
  allowWrite?: boolean
  readOnlyAgentSkill?: ReadOnlyAgentSkillBundle
}
```

Replace the `McpServer` constructor options with:

```ts
{
  ...(options.readOnlyAgentSkill === undefined
    ? {}
    : {
        capabilities: {
          extensions: { [AGENT_SKILLS_MCP_EXTENSION]: {} },
        },
      }),
  instructions:
    'Discover contract facts from llms.txt and .well-known/silen/manifest.json. Use list or search before read. Paths are relative to the documentation root. The build tool is a safe preflight and does not execute workspace MDX. Write tools are absent unless the server was started with explicit --allow-write permission. After authorized changes, audit, build, and inspect the Git diff before any separately authorized commit or deployment.' +
    (options.readOnlyAgentSkill === undefined
      ? ''
      : ' The optional read-only Skill is available at skill://silen-docs-readonly/SKILL.md.'),
}
```

After `registerReadTools`, register resources only when the bundle exists:

```ts
if (options.readOnlyAgentSkill !== undefined) {
  registerReadOnlyAgentSkillResources(server, options.readOnlyAgentSkill)
}
```

In `src/ai/mcp/stdio.ts`, import `loadPackagedReadOnlyAgentSkill` and make the
flag optional:

```ts
import { loadPackagedReadOnlyAgentSkill } from '../contract/package-assets.js'

export interface CreateMcpOptions {
  workspace: Workspace
  allowWrite: boolean
  experimentalSkillsOverMcp?: boolean
}
```

Insert this exact load at the start of the existing `serveMcp` body, before the
`stopped` promise is constructed:

```ts
const readOnlyAgentSkill = options.experimentalSkillsOverMcp
  ? await loadPackagedReadOnlyAgentSkill()
  : undefined
```

Replace only the existing `serveStdio` call with:

```ts
const handle = serveStdio(
  () =>
    createMcpServer({
      workspace: options.workspace,
      allowWrite: options.allowWrite,
      readOnlyAgentSkill,
    }),
  {
    legacy: 'serve',
    onerror: rejectStopped,
  },
)
```

This load must occur once per process, not once per SDK server factory call.

- [ ] **Step 6: Add the explicit CLI flag without changing write authorization**

Append this option after `--allow-write` in the `mcp` command descriptor in
`src/node/commands.ts`:

```ts
{
  name: '--experimental-skills-over-mcp',
  description: 'Expose the packaged read-only Agent Skill as MCP Resources',
  required: false,
  default: false,
},
```

Pass it independently to `serveMcp`:

```ts
await dependencies.serveMcp({
  workspace,
  allowWrite: provided.allowWrite === true,
  experimentalSkillsOverMcp:
    provided.experimentalSkillsOverMcp === true,
})
```

Combining both flags may expose ten tools and six Skill Resources, but it must
not add write instructions or write task files to the Skill bundle.

- [ ] **Step 7: Prove one-time loading and lifecycle preservation**

In `tests/ai/mcp-stdio.test.ts`, add a hoisted `loadSkill` mock and a fixed
`skillBundle`, mock `../../src/ai/contract/package-assets.js`, and reset the
mock in `beforeEach`:

```ts
const mocks = vi.hoisted(() => ({
  close: vi.fn(() => Promise.resolve()),
  factory: undefined as (() => unknown) | undefined,
  options: undefined as
    | { legacy?: 'serve' | 'reject'; onerror?: (error: Error) => void }
    | undefined,
  loadSkill: vi.fn(),
  skillBundle: {
    name: 'silen-docs-readonly',
    files: { 'SKILL.md': 'fixture\n' },
  },
  serverOptions: [] as unknown[],
}))

vi.mock('../../src/ai/contract/package-assets.js', () => ({
  loadPackagedReadOnlyAgentSkill: mocks.loadSkill,
}))

vi.mock('../../src/ai/mcp/server.js', () => ({
  createMcpServer: vi.fn((options: unknown) => {
    mocks.serverOptions.push(options)
    return {}
  }),
}))
```

Add these resets to the existing `beforeEach` after the close/options resets:

```ts
mocks.loadSkill.mockReset()
mocks.loadSkill.mockResolvedValue(mocks.skillBundle)
mocks.serverOptions.length = 0
```

Add this lifecycle test, retaining all current tests:

```ts
it('loads the experimental packaged Skill once before creating stdio servers', async () => {
  mocks.loadSkill.mockResolvedValue(mocks.skillBundle)
  const serving = serveMcp({
    workspace: {} as never,
    allowWrite: false,
    experimentalSkillsOverMcp: true,
  })

  await vi.waitFor(() => expect(mocks.factory).toBeTypeOf('function'))
  expect(mocks.loadSkill).toHaveBeenCalledOnce()
  mocks.factory?.()
  mocks.factory?.()
  expect(mocks.loadSkill).toHaveBeenCalledOnce()
  expect(mocks.serverOptions).toEqual([
    expect.objectContaining({ readOnlyAgentSkill: mocks.skillBundle }),
    expect.objectContaining({ readOnlyAgentSkill: mocks.skillBundle }),
  ])

  process.emit('SIGTERM', 'SIGTERM')
  await serving
  expect(mocks.close).toHaveBeenCalledOnce()
})
```

For an existing default lifecycle test, add:

```ts
expect(mocks.loadSkill).not.toHaveBeenCalled()
```

- [ ] **Step 8: Run all MCP eras, permissions, lifecycle, and contract checks**

Run:

```bash
pnpm build
pnpm exec vitest run tests/ai/mcp-skills.test.ts tests/ai/mcp-read.test.ts tests/ai/mcp-write.test.ts tests/ai/mcp-stdio.test.ts tests/ai/mcp-e2e.test.ts tests/ai/cli-contract.test.ts tests/ai/framework-contract.test.ts --maxWorkers=1 --no-file-parallelism
pnpm typecheck
```

Expected: PASS over legacy and modern eras. Default mode still has seven tools,
no Resources, no Skills extension, and Agent Contract `extensions: []`; the
experimental flag exposes six fixed Resources and never changes tool counts.

- [ ] **Step 9: Commit the experimental MCP adapter**

```bash
git add src/ai/mcp/skill-resources.ts src/ai/mcp/server.ts src/ai/mcp/stdio.ts src/node/commands.ts tests/ai/mcp-skills.test.ts tests/ai/mcp-e2e.test.ts tests/ai/mcp-stdio.test.ts tests/ai/cli-contract.test.ts tests/ai/framework-contract.test.ts
git commit -m "feat(mcp): expose read-only Agent Skill resources"
```

---

### Task 5: Gate package interoperability with the pinned official validator

**Files:**
- Create: `tests/ai/agent-skills-release.test.ts`
- Modify: `tests/package-smoke.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/publish.yml`

**Interfaces:**
- Consumes: `dist/agent/skills/silen-docs-readonly`, the existing `./agent/*` export, Core CI Node 22.12.0 AI-readiness job, and npm Publish job.
- Produces: clean-consumer package/CLI proof plus blocking `skills-ref validate` and `read-properties` checks pinned to the reviewed upstream commit.

- [ ] **Step 1: Write failing package and workflow invariants**

Create `tests/ai/agent-skills-release.test.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const SKILLS_REF_COMMIT = '38a2ff82958afee88dadf4831509e6f7e9d8ef4e'
const SKILLS_REF_INSTALL =
  `git+https://github.com/agentskills/agentskills.git@${SKILLS_REF_COMMIT}#subdirectory=skills-ref`
const SKILL_PATH = 'dist/agent/skills/silen-docs-readonly'

function occurrenceCount(source: string, token: string): number {
  return source.split(token).length - 1
}

describe('Agent Skills package and release gate', () => {
  it('ships nested Agent assets through the existing package export only', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8')) as {
      exports: Record<string, unknown>
      files: string[]
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(manifest.exports['./agent/*']).toBe('./dist/agent/*')
    expect(manifest.files).toContain('dist')
    expect(Object.keys(manifest.exports).filter((key) => key.includes('skill'))).toEqual([])
    expect(manifest.dependencies).not.toHaveProperty('skills-ref')
    expect(manifest.devDependencies).not.toHaveProperty('skills-ref')
  })

  it('pins official validation once in Core CI and once before npm publish', async () => {
    const [ci, publish, pages] = await Promise.all([
      readFile('.github/workflows/ci.yml', 'utf8'),
      readFile('.github/workflows/publish.yml', 'utf8'),
      readFile('.github/workflows/pages.yml', 'utf8'),
    ])

    for (const [name, workflow] of [
      ['Core CI', ci],
      ['npm Publish', publish],
    ] as const) {
      expect(workflow, name).toContain('uses: actions/setup-python@v6')
      expect(workflow, name).toContain("python-version: '3.13'")
      expect(workflow, name).toContain(SKILLS_REF_INSTALL)
      expect(workflow, name).toContain(`skills-ref validate ${SKILL_PATH}`)
      expect(workflow, name).toContain(
        `skills-ref read-properties ${SKILL_PATH}`,
      )
      expect(occurrenceCount(workflow, SKILLS_REF_COMMIT), name).toBe(1)
      expect(workflow.indexOf('pnpm site:ai-check'), name).toBeLessThan(
        workflow.indexOf(`skills-ref validate ${SKILL_PATH}`),
      )
    }

    expect(pages).not.toContain('setup-python')
    expect(pages).not.toContain('skills-ref')
    expect(ci).not.toContain('pip install skills-ref')
    expect(publish).not.toContain('pip install skills-ref')
  })
})
```

In the archive file assertions in `tests/package-smoke.test.ts`, add:

```ts
for (const relativePath of [
  'SKILL.md',
  'references/audit-site.md',
  'references/audit-site-zh-cn.md',
  'references/read-site.md',
  'references/read-site-zh-cn.md',
]) {
  expect(files).toContain(
    `package/dist/agent/skills/silen-docs-readonly/${relativePath}`,
  )
}
```

Add this specifier to the existing clean-consumer Agent Contract read:

```ts
'@aicode-nexus/silen/agent/skills/silen-docs-readonly/SKILL.md',
```

Destructure the fourth returned string as `readOnlySkill` and assert:

```ts
expect(readOnlySkill).toContain('name: silen-docs-readonly')
expect(readOnlySkill).not.toContain('allowed-tools')
```

After the packed executable help/version assertions, add:

```ts
const installedSkills = await execa(
  executable,
  ['ai', 'skills', 'installed-skills'],
  { cwd: consumer, reject: false, all: true },
)
expect(installedSkills.exitCode, installedSkills.all).toBe(0)
for (const relativePath of [
  'SKILL.md',
  'references/audit-site.md',
  'references/audit-site-zh-cn.md',
  'references/read-site.md',
  'references/read-site-zh-cn.md',
]) {
  expect(
    await readFile(
      path.join(
        consumer,
        'installed-skills',
        'silen-docs-readonly',
        relativePath,
      ),
      'utf8',
    ),
  ).toBe(
    await readFile(
      path.join(
        consumer,
        'node_modules/@aicode-nexus/silen/dist/agent/skills/silen-docs-readonly',
        relativePath,
      ),
      'utf8',
    ),
  )
}
```

- [ ] **Step 2: Run the package/workflow tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/ai/agent-skills-release.test.ts tests/package-smoke.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: package smoke reaches the new packaged asset assertions, while the
workflow test FAILS because Python and official validation are not yet present.

- [ ] **Step 3: Add official validation to the single Core CI Node 22.12 path**

In `.github/workflows/ci.yml`, add this step to `ai-readiness` after Node setup:

```yaml
      - name: Set up Python for the pinned Agent Skills reference validator
        uses: actions/setup-python@v6
        with:
          python-version: '3.13'
```

After `Run official AI readiness gate` and before its report upload, add:

```yaml
      - name: Install the pinned Agent Skills reference validator
        run: >-
          python -m pip install
          "git+https://github.com/agentskills/agentskills.git@38a2ff82958afee88dadf4831509e6f7e9d8ef4e#subdirectory=skills-ref"

      - name: Validate the packaged read-only Agent Skill
        run: |
          skills-ref validate dist/agent/skills/silen-docs-readonly
          skills-ref read-properties dist/agent/skills/silen-docs-readonly
```

Do not add Python to the Node matrix, static checks, browser job, or Pages.

- [ ] **Step 4: Block npm Publish on the same pinned validator**

In `.github/workflows/publish.yml`, add after Node setup:

```yaml
      - name: Set up Python for the pinned Agent Skills reference validator
        uses: actions/setup-python@v6
        with:
          python-version: '3.13'
```

After `Run official AI readiness gate` and before its report upload, add the
same two exact steps from Core CI:

```yaml
      - name: Install the pinned Agent Skills reference validator
        run: >-
          python -m pip install
          "git+https://github.com/agentskills/agentskills.git@38a2ff82958afee88dadf4831509e6f7e9d8ef4e#subdirectory=skills-ref"

      - name: Validate the packaged read-only Agent Skill
        run: |
          skills-ref validate dist/agent/skills/silen-docs-readonly
          skills-ref read-properties dist/agent/skills/silen-docs-readonly
```

Keep validation after `site:ai-check`, because that command creates the exact
package output being published, and before tests, `publint`, and `npm publish`.

- [ ] **Step 5: Run local package and official reference validation**

Run:

```bash
pnpm build
pnpm exec vitest run tests/ai/agent-skills-release.test.ts tests/package-smoke.test.ts tests/ai/npm-publish-workflow.test.ts tests/ai/site-quality-gate.test.ts --maxWorkers=1 --no-file-parallelism
mkdir -p .silen/.temp
python3 -m venv .silen/.temp/skills-ref-38a2ff82
.silen/.temp/skills-ref-38a2ff82/bin/python -m pip install "git+https://github.com/agentskills/agentskills.git@38a2ff82958afee88dadf4831509e6f7e9d8ef4e#subdirectory=skills-ref"
.silen/.temp/skills-ref-38a2ff82/bin/skills-ref validate dist/agent/skills/silen-docs-readonly
.silen/.temp/skills-ref-38a2ff82/bin/skills-ref read-properties dist/agent/skills/silen-docs-readonly
pnpm pack --dry-run
```

Expected: all tests and both official commands PASS; dry-run lists all five
Skill files; no Python package appears in `package.json` or `pnpm-lock.yaml`.

- [ ] **Step 6: Commit package and release-gate interoperability**

```bash
git add .github/workflows/ci.yml .github/workflows/publish.yml tests/ai/agent-skills-release.test.ts tests/package-smoke.test.ts
git commit -m "ci: validate packaged Agent Skill officially"
```

---

### Task 6: Document the supported filesystem Skill and experimental MCP boundary

**Files:**
- Modify: `README.md`
- Modify: `website/ai/index.mdx`
- Modify: `website/zh/ai/index.mdx`
- Modify: `website/ai/local-workspace-mcp/index.mdx`
- Modify: `website/zh/ai/local-workspace-mcp/index.mdx`
- Modify: `website/ai/agent-contract/index.mdx`
- Modify: `website/zh/ai/agent-contract/index.mdx`
- Modify: `website/guide/cli-deployment/index.mdx`
- Modify: `website/zh/guide/cli-deployment/index.mdx`
- Modify: `website/reference/index.mdx`
- Modify: `website/zh/reference/index.mdx`
- Modify: `tests/ai/documentation.test.ts`

**Interfaces:**
- Consumes: the shipped CLI syntax, package path, default Agent Contract behavior, and MCP experiment flag.
- Produces: one consistent English/Chinese explanation without a new route, nav item, registry, or HTTP discovery claim.

- [ ] **Step 1: Write the failing bilingual documentation contract**

Add this test to `tests/ai/documentation.test.ts`:

```ts
it('documents the deterministic read-only Agent Skill and experimental MCP switch', async () => {
  const [
    readme,
    englishAi,
    chineseAi,
    englishMcp,
    chineseMcp,
    englishContract,
    chineseContract,
    englishCli,
    chineseCli,
    englishReference,
    chineseReference,
  ] = await Promise.all(
    [
      'README.md',
      'website/ai/index.mdx',
      'website/zh/ai/index.mdx',
      'website/ai/local-workspace-mcp/index.mdx',
      'website/zh/ai/local-workspace-mcp/index.mdx',
      'website/ai/agent-contract/index.mdx',
      'website/zh/ai/agent-contract/index.mdx',
      'website/guide/cli-deployment/index.mdx',
      'website/zh/guide/cli-deployment/index.mdx',
      'website/reference/index.mdx',
      'website/zh/reference/index.mdx',
    ].map((file) => readFile(file, 'utf8')),
  )

  const corpus = [
    readme,
    englishAi,
    chineseAi,
    englishMcp,
    chineseMcp,
    englishContract,
    chineseContract,
    englishCli,
    chineseCli,
    englishReference,
    chineseReference,
  ].join('\n')
  for (const value of [
    'silen-docs-readonly',
    'silen ai skills',
    '--experimental-skills-over-mcp',
    'dist/agent/skills/silen-docs-readonly',
    'skill://silen-docs-readonly/SKILL.md',
    'io.modelcontextprotocol/skills',
  ]) {
    expect(corpus).toContain(value)
  }

  expect(englishAi).toMatch(/read-only Agent Skill/i)
  expect(chineseAi).toContain('只读 Agent Skill')
  expect(englishMcp).toMatch(/experimental.*off by default/is)
  expect(chineseMcp).toMatch(/实验.*默认关闭/is)
  expect(englishContract).toContain('extensions: []')
  expect(chineseContract).toContain('extensions: []')
  expect(englishContract).toMatch(/does not grant.*permission/is)
  expect(chineseContract).toMatch(/不授予.*权限/is)
  expect(readme).not.toContain('.well-known/agent-skills')
})
```

- [ ] **Step 2: Run the documentation test and verify it fails**

Run:

```bash
pnpm exec vitest run tests/ai/documentation.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL on the new package path, CLI action, experimental flag, and
permission-boundary assertions.

- [ ] **Step 3: Add the concise package/CLI explanation to README**

Insert this exact section after `## Local MCP compatibility` and before
`## Minimal configuration` in `README.md`:

````markdown
## Read-only Agent Skill

Every package includes one deterministic `silen-docs-readonly` Skill at
`dist/agent/skills/silen-docs-readonly`. Materialize the exact packaged files
only into an explicit parent directory:

```sh
pnpm silen ai skills ./agent-skills
```

This creates `./agent-skills/silen-docs-readonly` and fails without changing it
if that directory already exists. The Skill contains the canonical English and
Chinese read/audit workflows, no scripts or write tasks, and does not grant
shell, network, filesystem-write, commit, push, or deployment permission.

`pnpm silen mcp docs --experimental-skills-over-mcp` exposes the same files at
`skill://silen-docs-readonly/SKILL.md` over local stdio Resources. This adapter
is experimental and off by default; the normal MCP server and generated Agent
Contract keep `extensions: []`.
````

The nested `sh` fence is part of the Markdown section. Preserve the README's
existing install, MCP v2, model-free, and package-export text.

- [ ] **Step 4: Add the supported Skill surface to both AI overview pages**

Add this block after the Agent Contract section in `website/ai/index.mdx`:

````markdown
## Read-only Agent Skill

The npm package deterministically generates one `silen-docs-readonly` Agent
Skill from the canonical English and Chinese `read-site` and `audit-site` task
packs. Its package root is `dist/agent/skills/silen-docs-readonly`; it contains
`SKILL.md` plus four progressively loaded references and no scripts, assets,
write tasks, model calls, credentials, or implied permissions.

```sh
pnpm silen ai skills ./agent-skills
```

The command creates only `./agent-skills/silen-docs-readonly` and refuses to
overwrite an existing directory. The filesystem form is the supported portable
surface and remains usable offline.
````

Add the equivalent block after Agent Contract in `website/zh/ai/index.mdx`:

````markdown
## 只读 Agent Skill

npm 包会从规范的中英文 `read-site` 与 `audit-site` 任务包确定性生成唯一的
`silen-docs-readonly` Agent Skill。包内路径是
`dist/agent/skills/silen-docs-readonly`，其中只有 `SKILL.md` 和四个按需读取的
参考文件，不包含脚本、资产、写任务、模型调用、凭据或隐含权限。

```sh
pnpm silen ai skills ./agent-skills
```

该命令只创建 `./agent-skills/silen-docs-readonly`；如果目录已经存在就直接失败，
不会覆盖。文件系统形式是受支持的可移植能力，并且可离线使用。
````

- [ ] **Step 5: Document the experimental MCP adapter in both MCP guides**

Add this block before the existing write-permission section in
`website/ai/local-workspace-mcp/index.mdx`:

````markdown
## Experimental Skills over MCP

Filesystem installation does not require MCP. Hosts that explicitly support
the draft Resources binding can opt into the same packaged bytes:

```sh
pnpm silen mcp docs --experimental-skills-over-mcp
```

The experiment declares `io.modelcontextprotocol/skills`, serves
`skill://index.json`, and maps the five files beneath
`skill://silen-docs-readonly/`. It is local stdio only, read-only, and off by
default. It adds no tools, scripts, subscriptions, network transport, or write
authority; `--allow-write` remains a separate explicit tool-registration flag.
````

Add the equivalent block in
`website/zh/ai/local-workspace-mcp/index.mdx`:

````markdown
## 实验性 Skills over MCP

文件系统安装不依赖 MCP。明确支持 Resources 草案绑定的 Host 可以选择暴露同一份
包内字节：

```sh
pnpm silen mcp docs --experimental-skills-over-mcp
```

该实验声明 `io.modelcontextprotocol/skills`，提供 `skill://index.json`，并把五个
文件映射到 `skill://silen-docs-readonly/` 下。它只使用本地 stdio、保持只读且默认
关闭，不增加工具、脚本、订阅、网络传输或写权限；`--allow-write` 仍是独立的显式
工具注册开关。
````

- [ ] **Step 6: Clarify Agent Contract and CLI/reference boundaries bilingually**

Append this paragraph to the schema-version section in
`website/ai/agent-contract/index.mdx`:

```markdown
The package also contains the generated filesystem Skill at
`dist/agent/skills/silen-docs-readonly`, and the CLI API records `silen ai
skills` plus `--experimental-skills-over-mcp`. The default manifest still says
`extensions: []` because an optional runtime flag is not a site capability.
Skill text is procedural knowledge: it does not grant a host permission to run
commands, use the network, write files, commit, push, or deploy.
```

Append the equivalent paragraph to
`website/zh/ai/agent-contract/index.mdx`:

```markdown
包内还包含生成的文件系统 Skill：
`dist/agent/skills/silen-docs-readonly`；CLI API 会记录 `silen ai skills` 和
`--experimental-skills-over-mcp`。默认 manifest 仍声明 `extensions: []`，因为可选
运行参数不等于站点能力。Skill 文本只是流程知识，不授予 Host 运行命令、访问
网络、写文件、提交、推送或部署的权限。
```

In both CLI deployment pages, add the filesystem command to the AI command
block:

```sh
pnpm silen ai skills ./agent-skills
```

Immediately after that block, add these exact single-sentence explanations:

```markdown
`ai skills` requires the parent destination, creates only
`silen-docs-readonly`, and never overwrites it; optional MCP Resource exposure
uses `pnpm silen mcp docs --experimental-skills-over-mcp` and remains
experimental and off by default.
```

```markdown
`ai skills` 必须指定父目录，只创建 `silen-docs-readonly` 且绝不覆盖；可选的 MCP
Resource 暴露使用 `pnpm silen mcp docs --experimental-skills-over-mcp`，仍是实验能力
并默认关闭。
```

Replace the AI and MCP command rows in `website/reference/index.mdx` with:

```markdown
| `silen ai <init\|index\|audit\|eval> [path]` | Manage and evaluate the local AI workspace |
| `silen ai skills <destination>` | Materialize the packaged `silen-docs-readonly` Skill without overwrite |
| `silen mcp [root]` | Serve read-only MCP; optional `--allow-write` and experimental `--experimental-skills-over-mcp` |
```

Replace the equivalent rows in `website/zh/reference/index.mdx` with:

```markdown
| `silen ai <init\|index\|audit\|eval> [path]` | 管理并评测本地 AI 工作区 |
| `silen ai skills <destination>` | 无覆盖地写出包内 `silen-docs-readonly` Skill |
| `silen mcp [root]` | 启动只读 MCP；可选 `--allow-write` 与实验性 `--experimental-skills-over-mcp` |
```

After the English table, add:

```markdown
The package stores the portable Skill at
`dist/agent/skills/silen-docs-readonly`. The URI
`skill://silen-docs-readonly/SKILL.md` exists only when
`--experimental-skills-over-mcp` is present; the default Agent Contract remains
`extensions: []`.
```

After the Chinese table, add:

```markdown
包内可移植 Skill 位于 `dist/agent/skills/silen-docs-readonly`。只有显式使用
`--experimental-skills-over-mcp` 时才会提供
`skill://silen-docs-readonly/SKILL.md`；默认 Agent Contract 仍是
`extensions: []`。
```

- [ ] **Step 7: Run documentation, site, and link/build gates**

Run:

```bash
pnpm exec prettier --write README.md website/ai website/zh/ai website/guide/cli-deployment/index.mdx website/zh/guide/cli-deployment/index.mdx website/reference/index.mdx website/zh/reference/index.mdx tests/ai/documentation.test.ts
pnpm exec vitest run tests/ai/documentation.test.ts tests/documentation.test.ts tests/website.test.ts --maxWorkers=1 --no-file-parallelism
pnpm site:ai-check
```

Expected: all documentation tests PASS, the official retrieval suite remains
24/24, and no broken link, source map, model, key, or network dependency enters
the site gate.

- [ ] **Step 8: Commit synchronized English and Chinese documentation**

```bash
git add README.md website/ai website/zh/ai website/guide/cli-deployment/index.mdx website/zh/guide/cli-deployment/index.mdx website/reference/index.mdx website/zh/reference/index.mdx tests/ai/documentation.test.ts
git commit -m "docs: explain read-only Agent Skills surface"
```

---

### Task 7: Pass all local gates and prepare the 0.5.0 release commit

**Files:**
- Modify: `package.json`
- Modify: `src/shared/version.ts`
- Modify: `CHANGELOG.md`
- Modify: `docs/project-map.md`
- Modify: `tests/ai/contract-schema.test.ts`
- Modify: `tests/documentation.test.ts`

**Interfaces:**
- Consumes: the complete feature, package, MCP, workflow, documentation, and official-validator proof from Tasks 1-6.
- Produces: a clean `0.5.0` release commit with AI-006 in Shipped, no Active/Ready/Candidate item, and every generated version byte aligned.

- [ ] **Step 1: Prove the complete feature while the package is still 0.4.0**

Run the full local gate before changing any release version:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test:run
pnpm exec playwright test tests/e2e
pnpm exec publint
pnpm site:ai-check
pnpm check:no-maps dist website/.silen/dist
.silen/.temp/skills-ref-38a2ff82/bin/skills-ref validate dist/agent/skills/silen-docs-readonly
.silen/.temp/skills-ref-38a2ff82/bin/skills-ref read-properties dist/agent/skills/silen-docs-readonly
pnpm pack --dry-run
```

Expected: every command PASS, the official site reports 24/24 evaluation
cases, the package lists all five Skill files, and `git status --short` shows
only the intended implementation/documentation changes already committed.

- [ ] **Step 2: Write failing 0.5.0 version and changelog assertions**

In `tests/ai/contract-schema.test.ts`, change the version assertion to:

```ts
expect(SILEN_VERSION).toBe('0.5.0')
```

In the dated-checkpoint test in `tests/documentation.test.ts`, add:

```ts
expect(changelog).toContain('## [0.5.0] - 2026-07-30')
expect(changelog).toContain('silen-docs-readonly')
expect(changelog).toContain('--experimental-skills-over-mcp')
expect(changelog).toContain('2026-07-28')
expect(changelog).toContain('24-case')
```

Run:

```bash
pnpm exec vitest run tests/ai/contract-schema.test.ts tests/documentation.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because runtime and changelog still report `0.4.0`.

- [ ] **Step 3: Bump the package and runtime version together**

Change exactly these values:

```json
// package.json
"version": "0.5.0"
```

```ts
// src/shared/version.ts
export const SILEN_VERSION = '0.5.0' as const
```

Do not change dependency versions or run a broad package update. The pnpm
lockfile has no root package-version field and should remain unchanged.

- [ ] **Step 4: Add the complete 0.5.0 changelog entry**

Insert this exact entry after `## [Unreleased]` in `CHANGELOG.md`:

```markdown
## [0.5.0] - 2026-07-30

### Added

- Added one deterministic `silen-docs-readonly` Agent Skill generated from the
  canonical English and Chinese read/audit task packs, shipped as five package
  files and materialized explicitly with `silen ai skills <destination>` without
  overwrite.
- Added optional local Skills over MCP Resources behind
  `--experimental-skills-over-mcp`, including `skill://index.json` and
  `skill://silen-docs-readonly/SKILL.md`; the experiment is read-only and off by
  default.
- Expanded the official model-free retrieval gate to a 24-case bilingual suite
  with Rank-1 critical queries, multiple acceptable targets, forbidden targets,
  hidden-content negatives, and retained JSON reports in CI, Pages, and npm
  Publish.

### Changed

- Migrated local MCP to the split SDK v2 packages while verifying both
  `2025-11-25` and `2026-07-28`, preserving seven default read tools and three
  separately authorized write tools.
- Published formal MCP output schemas and validated native
  `structuredContent`, and advanced Agent Contract manifests and API documents
  to `schemaVersion: 2` with explicit stdio protocol facts.
- Made the canonical `site:ai-check` build, audit, evaluation, and source-map
  sequence release-blocking in Core CI, GitHub Pages, and npm Publish.

### Security

- Kept Agent Skills free of scripts, write tasks, `allowed-tools`, models,
  credentials, local paths, and implicit shell, network, filesystem-write, Git,
  or deployment permission. Remote MCP remains disabled.
```

Replace the changelog comparison links at the bottom with these leading lines,
retaining all older links below:

```markdown
[unreleased]: https://github.com/AICode-Nexus/silen/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/AICode-Nexus/silen/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/AICode-Nexus/silen/compare/v0.3.1...v0.4.0
```

- [ ] **Step 5: Move AI-006 to Shipped and align the map baseline**

Change the map header to:

```markdown
- Last reviewed: 2026-07-30
- Baseline:
  [`@aicode-nexus/silen` 0.5.0](../CHANGELOG.md#050---2026-07-30) at
  [`v0.5.0`](https://github.com/AICode-Nexus/silen/releases/tag/v0.5.0).
- Default next item: None; `0.6.x` items remain Watch-only experiments.
```

Replace the current Active/Ready/Candidate state with:

```markdown
## Active

No map-selected item is active.

## Ready

No item is ready for default implementation.

## Candidate

No item is currently a Candidate.
```

Replace the future-looking `## Planned release path` section with:

```markdown
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
```

Append this exact block after AI-005 in `## Shipped`:

```markdown
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
```

- [ ] **Step 6: Regenerate and prove byte-identical clean Skill builds**

Run:

```bash
pnpm build
find dist/agent/skills/silen-docs-readonly -type f | LC_ALL=C sort | while IFS= read -r skill_file; do shasum -a 256 "$skill_file"; done > /tmp/silen-agent-skill-first.sha256
pnpm build
find dist/agent/skills/silen-docs-readonly -type f | LC_ALL=C sort | while IFS= read -r skill_file; do shasum -a 256 "$skill_file"; done > /tmp/silen-agent-skill-second.sha256
diff -u /tmp/silen-agent-skill-first.sha256 /tmp/silen-agent-skill-second.sha256
```

Expected: both builds succeed and `diff` prints nothing. Generated manifest,
API, declarations, CLI version, and Skill metadata all contain `0.5.0`.

- [ ] **Step 7: Run the final 0.5.0 release gate from a clean generated state**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test:run
pnpm exec playwright test tests/e2e
pnpm exec publint
pnpm site:ai-check
pnpm check:no-maps dist website/.silen/dist
.silen/.temp/skills-ref-38a2ff82/bin/skills-ref validate dist/agent/skills/silen-docs-readonly
.silen/.temp/skills-ref-38a2ff82/bin/skills-ref read-properties dist/agent/skills/silen-docs-readonly
pnpm pack --dry-run
git diff --check
```

Expected: every check PASS at `0.5.0`; tests report no failure; AI evaluation is
24/24; package output contains the five Skill files and no source maps, source
directories, tests, secrets, or local paths.

- [ ] **Step 8: Commit the verified 0.5.0 release state**

```bash
git add package.json src/shared/version.ts CHANGELOG.md docs/project-map.md tests/ai/contract-schema.test.ts tests/documentation.test.ts
git commit -m "release: prepare Silen 0.5.0"
git status --short --branch
```

Expected: the commit succeeds and the working tree is clean on `main`.

---

### Task 8: Push, publish, deploy, and verify 0.5.0 externally

**Files:**
- No repository files change in this task.

**Interfaces:**
- Consumes: the clean verified `main` release commit and the existing Core CI, Pages, GitHub Release, and npm Trusted Publishing workflows.
- Produces: pushed default-branch evidence, green CI and Pages, GitHub Release `v0.5.0`, npm `latest` at `0.5.0`, a fresh-consumer Skill/MCP proof, and live documentation/contract verification.

- [ ] **Step 1: Synchronize main without discarding local release commits**

Run:

```bash
git status --short --branch
git fetch origin
git pull --rebase origin main
git status --short --branch
```

Expected: the working tree stays clean. If upstream moved, the rebase completes
without dropping any AI-005, AI-006, quality-gate, design, plan, documentation,
or release commit. Resolve no conflict by deleting user work.

- [ ] **Step 2: Push the verified release commit and wait for Core CI and Pages**

Run:

```bash
release_commit=$(git rev-parse HEAD)
git push origin main
ci_run_id=$(gh run list --workflow ci.yml --branch main --commit "$release_commit" --limit 1 --json databaseId --jq '.[0].databaseId')
pages_run_id=$(gh run list --workflow pages.yml --branch main --commit "$release_commit" --limit 1 --json databaseId --jq '.[0].databaseId')
test -n "$ci_run_id"
test -n "$pages_run_id"
gh run watch "$ci_run_id" --exit-status
gh run watch "$pages_run_id" --exit-status
```

If either run ID is initially empty, repeat only its `gh run list` command
after a short poll; do not create the release until both workflows finish
successfully.

Expected: push succeeds, every Core CI job is green, Pages deploys the release
commit, and the CI AI-readiness job passes pinned official Skill validation.

- [ ] **Step 3: Create the GitHub Release and wait for Trusted Publishing**

Run:

```bash
release_commit=$(git rev-parse HEAD)
gh release create v0.5.0 --target "$release_commit" --title "Silen v0.5.0" --generate-notes
publish_run_id=$(gh run list --workflow publish.yml --limit 10 --json databaseId,headSha --jq ".[] | select(.headSha == \"$release_commit\") | .databaseId" | head -n 1)
test -n "$publish_run_id"
gh run watch "$publish_run_id" --exit-status
gh release view v0.5.0 --json tagName,targetCommitish,url
```

Expected: Release `v0.5.0` points at the pushed release commit and npm Publish
passes static checks, site gate, report upload, pinned Skill validation, tests,
`publint`, and Trusted Publishing without `NPM_TOKEN`.

- [ ] **Step 4: Verify npm metadata and the published tarball**

Run:

```bash
npm view @aicode-nexus/silen version
npm view @aicode-nexus/silen dist-tags --json
npm view @aicode-nexus/silen@0.5.0 engines --json
npm pack @aicode-nexus/silen@0.5.0 --dry-run
```

Expected: version and `latest` are `0.5.0`, engines remain
`^20.19.0 || >=22.12.0`, and the dry-run contains all five files under
`dist/agent/skills/silen-docs-readonly`.

- [ ] **Step 5: Install npm latest in a fresh consumer and verify Skill bytes**

Run:

```bash
test ! -e /tmp/silen-0.5.0-consumer
mkdir /tmp/silen-0.5.0-consumer
release_check_root=/tmp/silen-0.5.0-consumer
cd "$release_check_root"
npm init --yes
npm install @aicode-nexus/silen@0.5.0 @modelcontextprotocol/client@2.0.0
node --input-type=module --eval "import { mkdir, writeFile } from 'node:fs/promises'; await mkdir('docs', { recursive: true }); await writeFile('docs/index.md', '# Published Silen check\n')"
npx silen --version
npx silen ai skills ./agent-skills
diff -r agent-skills/silen-docs-readonly node_modules/@aicode-nexus/silen/dist/agent/skills/silen-docs-readonly
if npx silen ai skills ./agent-skills; then exit 1; fi
```

Expected: version is `0.5.0`; the first materialization succeeds; recursive
`diff` prints nothing; the repeated command exits nonzero with
`SILEN_AGENT_SKILL_TARGET_EXISTS` and leaves the first copy unchanged.

- [ ] **Step 6: Verify both MCP eras from the fresh npm consumer**

From the same fresh consumer, run this exact inline interoperability check:

```bash
cd /tmp/silen-0.5.0-consumer
node --input-type=module --eval '
import assert from "node:assert/strict"
import path from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"

const legacy = "2025-11-25"
const modern = "2026-07-28"
for (const era of ["legacy", "modern"]) {
  const client = new Client(
    { name: `silen-release-${era}`, version: "1.0.0" },
    era === "legacy"
      ? { supportedProtocolVersions: [legacy] }
      : {
          supportedProtocolVersions: [legacy, modern],
          versionNegotiation: { mode: { pin: modern } },
        },
  )
  const transport = new StdioClientTransport({
    command: path.resolve("node_modules/.bin/silen"),
    args: ["mcp", "docs", "--experimental-skills-over-mcp"],
    cwd: process.cwd(),
    stderr: "pipe",
  })
  await client.connect(transport)
  assert.equal(client.getProtocolEra(), era)
  assert.deepEqual(
    client.getServerCapabilities()?.extensions?.[
      "io.modelcontextprotocol/skills"
    ],
    {},
  )
  assert.equal((await client.listTools()).tools.length, 7)
  assert.equal((await client.listResources()).resources.length, 6)
  const skill = await client.readResource({
    uri: "skill://silen-docs-readonly/SKILL.md",
  })
  assert.match(String(skill.contents[0]?.text), /name: silen-docs-readonly/)
  await client.close()
}
console.log("published-dual-era-skills-ok")
'
```

Expected: the script prints `published-dual-era-skills-ok`, with seven tools
and six Resources in both eras. It performs no write call and starts no remote
transport.

- [ ] **Step 7: Verify live Pages, public Agent Contract, release, and repository state**

Run:

```bash
node --input-type=module --eval '
const urls = [
  "https://aicode-nexus.github.io/silen/ai/",
  "https://aicode-nexus.github.io/silen/ai/local-workspace-mcp/",
  "https://aicode-nexus.github.io/silen/ai/agent-contract/",
  "https://aicode-nexus.github.io/silen/reference/",
]
for (const url of urls) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  const html = await response.text()
  if (!html.includes("silen-docs-readonly")) {
    throw new Error(`${url}: missing Agent Skill documentation`)
  }
}
const contractResponse = await fetch(
  "https://aicode-nexus.github.io/silen/.well-known/silen/manifest.json",
)
if (!contractResponse.ok) throw new Error(`manifest: ${contractResponse.status}`)
const manifest = await contractResponse.json()
if (manifest.schemaVersion !== 2) throw new Error("unexpected schema version")
if (manifest.generator.version !== "0.5.0") throw new Error("unexpected version")
if (JSON.stringify(manifest.capabilities.mcp.extensions) !== "[]") {
  throw new Error("default extensions changed")
}
console.log("live-pages-and-contract-ok")
'
cd /Users/admin/Documents/reactpress
release_commit=$(git rev-parse HEAD)
git fetch origin --tags
test "$(git rev-parse HEAD)" = "$release_commit"
test "$(git rev-parse origin/main)" = "$release_commit"
test "$(git rev-list -n 1 v0.5.0)" = "$release_commit"
git status --short --branch
```

Expected: the live pages mention the Skill, the public manifest is schema 2 at
version 0.5.0 with `extensions: []`, local `main`, `origin/main`, and `v0.5.0`
resolve to the same commit, and the repository working tree is clean.

- [ ] **Step 8: Record the final operational evidence in the handoff**

Report the release commit, green Core CI/Pages/Publish run URLs, GitHub Release
URL, npm `latest` result, clean-consumer location, dual-era result, live Pages
result, and the fact that no Remote MCP, model, key, shell, implicit write, or
HTTP Skill discovery surface was added. No additional repository commit is
needed when every check above agrees.
