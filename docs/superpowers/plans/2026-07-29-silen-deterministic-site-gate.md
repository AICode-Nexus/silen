# Silen Deterministic Site Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one provider-independent `pnpm site:check` command and make it the
mandatory GitHub Pages build gate for Silen's official website.

**Architecture:** A package script composes the existing build, AI audit,
model-free evaluation, and no-source-map commands with fail-fast `&&`
semantics. A focused repository-contract test protects the exact command and
workflow boundaries; no runtime source, dependency, or public CLI surface is
added.

**Tech Stack:** pnpm 10.34.0, Node.js `^20.19.0 || >=22.12.0`, GitHub Actions
YAML, TypeScript 7.0.2, Vitest 4.1.10, and Prettier 3.9.5.

## Global Constraints

- `package.json` must define this exact command:
  `pnpm site:build && node dist/node/cli.js ai audit website && node
  dist/node/cli.js ai eval website --json && pnpm check:no-maps dist
  website/.silen/dist`.
- Command order is build, audit, evaluation, then dual-output source-map check.
- The chain is fail-fast and preserves the first failing command's exit status.
- Evaluation uses `--json` and remains independent of models, provider secrets,
  embeddings, vector databases, and hosted evaluation services.
- The gate must not invoke `ai init`, `ai index`, MCP, `--allow-write`, Git,
  publication, deployment, or a remote URL.
- GitHub Pages must invoke `pnpm site:check` exactly once and retain the hidden
  Agent Contract manifest assertion afterward.
- `.github/workflows/ci.yml` and `.github/workflows/publish.yml` must not invoke
  `pnpm site:check`.
- Do not change `src/**`, public website content, `pnpm-lock.yaml`, package
  exports, package version, generated Agent Contract files, or changelog
  content.
- README documents `site:check` only as an official-repository maintainer
  command, not a consumer Silen CLI feature.
- Move `QUAL-002` to `Active` before behavior changes and to `Shipped` only
  after all completion evidence passes.
- The final project map has no active item and names `AI-004` as the default
  next item.
- Do not push, publish, deploy, or begin `AI-004` within this implementation
  plan.

---

## File map

- Modify `docs/project-map.md`: move `QUAL-002` through `Active` to `Shipped`
  and select `AI-004` next.
- Create `tests/ai/site-quality-gate.test.ts`: protect the exact package script
  and Pages/CI/Publish boundaries.
- Modify `package.json`: add the one canonical `site:check` script.
- Modify `.github/workflows/pages.yml`: replace duplicated build/no-map steps
  with the canonical gate.
- Modify `README.md`: document the maintainer command under Contributing.
- Reference
  `docs/superpowers/specs/2026-07-29-silen-deterministic-site-gate-design.md`:
  approved requirements.

### Task 1: Mark QUAL-002 active

**Files:**

- Modify: `docs/project-map.md:70-115`

**Interfaces:**

- Consumes: the `Ready` item `QUAL-002` and its approved deterministic-site-gate
  design.
- Produces: exactly one `Active` item, `QUAL-002`, while `AI-004` becomes the
  first `Ready` item.

- [ ] **Step 1: Verify the initial project-map state**

Run:

```sh
node --input-type=module <<'NODE'
import { readFile } from 'node:fs/promises'

const map = await readFile('docs/project-map.md', 'utf8')
if (!map.includes('- Default next item: `QUAL-002`')) {
  throw new Error('QUAL-002 is not the selected default')
}
if (!map.includes('No map-selected item is active.')) {
  throw new Error('The map already has an active item')
}
const ready = map.slice(map.indexOf('## Ready'), map.indexOf('## Candidate'))
if (ready.indexOf('### QUAL-002') < 0 || ready.indexOf('### AI-004') < 0) {
  throw new Error('Expected QUAL-002 and AI-004 in Ready')
}
if (ready.indexOf('### QUAL-002') > ready.indexOf('### AI-004')) {
  throw new Error('QUAL-002 is not first in Ready')
}
console.log('QUAL-002 ready for activation')
NODE
```

Expected:

```text
QUAL-002 ready for activation
```

- [ ] **Step 2: Move QUAL-002 from Ready to Active**

Use `apply_patch` with this exact diff:

```diff
*** Begin Patch
*** Update File: docs/project-map.md
@@
 ## Active
 
-No map-selected item is active. With no special user scope, promote and begin
-`QUAL-002`.
+### QUAL-002 — Unify the official deterministic site gate
+
+- Outcome: One documented repository command builds the package and official
+  site, runs `silen ai audit` and `silen ai eval` against `website`, and checks
+  package and site output for source maps.
+- Horizon: `0.4.x`
+- Depends on: `QUAL-001` and `AI-003`.
+- Entry gate: The `0.4.0` build, audit, evaluation, and no-map commands already
+  pass independently; the current Pages workflow invokes build and no-map
+  checks but not audit or evaluation.
+- Done when: The aggregate command has stable failure behavior, is documented,
+  is exercised by the official-site deployment or CI path, and passes from a
+  clean checkout without model credentials or network-dependent evaluation.
+- Evidence:
+  [deterministic site gate design](./superpowers/specs/2026-07-29-silen-deterministic-site-gate-design.md),
+  [package scripts](../package.json),
+  [Pages workflow](../.github/workflows/pages.yml), and
+  [`0.4.0` quality-loop design](./superpowers/specs/2026-07-22-silen-model-free-ai-quality-loop-design.md).
 
 ## Ready
 
 Items are ordered. Start the first item whose dependencies remain satisfied.
 
-### QUAL-002 — Unify the official deterministic site gate
-
-- Outcome: One documented repository command builds the package and official
-  site, runs `silen ai audit` and `silen ai eval` against `website`, and checks
-  package and site output for source maps.
-- Horizon: `0.4.x`
-- Depends on: `QUAL-001` and `AI-003`.
-- Entry gate: The `0.4.0` build, audit, evaluation, and no-map commands already
-  pass independently; the current Pages workflow invokes build and no-map
-  checks but not audit or evaluation.
-- Done when: The aggregate command has stable failure behavior, is documented,
-  is exercised by the official-site deployment or CI path, and passes from a
-  clean checkout without model credentials or network-dependent evaluation.
-- Evidence:
-  [package scripts](../package.json),
-  [Pages workflow](../.github/workflows/pages.yml),
-  [CI workflow](../.github/workflows/ci.yml), and
-  [`0.4.0` quality-loop design](./superpowers/specs/2026-07-22-silen-model-free-ai-quality-loop-design.md).
-
 ### AI-004 — Strengthen official retrieval evaluation precision
*** End Patch
```

- [ ] **Step 3: Verify the active and ready sections**

Run:

```sh
node --input-type=module <<'NODE'
import { readFile } from 'node:fs/promises'

const map = await readFile('docs/project-map.md', 'utf8')
const active = map.slice(map.indexOf('## Active'), map.indexOf('## Ready'))
const ready = map.slice(map.indexOf('## Ready'), map.indexOf('## Candidate'))
const activeIds = [
  ...active.matchAll(/^### ((?:CORE|THEME|AI|PLUGIN|QUAL)-[0-9]{3}) —/gm),
].map((match) => match[1])
if (JSON.stringify(activeIds) !== JSON.stringify(['QUAL-002'])) {
  throw new Error('Unexpected active items: ' + activeIds.join(', '))
}
if (ready.includes('### QUAL-002')) {
  throw new Error('QUAL-002 remains duplicated in Ready')
}
if (!ready.includes('### AI-004')) {
  throw new Error('AI-004 is not ready')
}
console.log('project map active state OK')
NODE
```

Expected:

```text
project map active state OK
```

- [ ] **Step 4: Format and commit the active state**

Run:

```sh
pnpm exec prettier --check docs/project-map.md
git diff --check
git add docs/project-map.md
git commit -m "docs: start deterministic site gate"
```

Expected: formatting and diff checks pass, then one commit contains only
`docs/project-map.md`.

### Task 2: Implement and prove the canonical site gate

**Files:**

- Create: `tests/ai/site-quality-gate.test.ts`
- Modify: `package.json:59-69`
- Modify: `.github/workflows/pages.yml:46-53`
- Modify: `README.md:87-95`
- Read: `.github/workflows/ci.yml`
- Read: `.github/workflows/publish.yml`

**Interfaces:**

- Consumes: the exact `site:check` string and workflow boundaries from the
  approved design.
- Produces: one red-then-green Vitest contract, `pnpm site:check`, one Pages
  invocation, unchanged CI/Publish responsibilities, and maintainer-facing
  README guidance.

- [ ] **Step 1: Create the focused contract test**

Use `apply_patch` to create
`tests/ai/site-quality-gate.test.ts` with:

```ts
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const expectedSiteCheck =
  'pnpm site:build && node dist/node/cli.js ai audit website && ' +
  'node dist/node/cli.js ai eval website --json && ' +
  'pnpm check:no-maps dist website/.silen/dist'

function occurrenceCount(source: string, token: string): number {
  return source.split(token).length - 1
}

describe('official deterministic site quality gate', () => {
  it('keeps local and Pages checks aligned without duplicating CI or publish work', async () => {
    const [packageSource, pages, ci, publish] = await Promise.all([
      readFile('package.json', 'utf8'),
      readFile('.github/workflows/pages.yml', 'utf8'),
      readFile('.github/workflows/ci.yml', 'utf8'),
      readFile('.github/workflows/publish.yml', 'utf8'),
    ])
    const packageJson = JSON.parse(packageSource) as {
      scripts: Record<string, string>
    }
    const command = packageJson.scripts['site:check']

    expect(command).toBeDefined()
    if (command === undefined) {
      throw new Error('site:check script is missing')
    }
    expect(command).toBe(expectedSiteCheck)

    const orderedFragments = [
      'pnpm site:build',
      'node dist/node/cli.js ai audit website',
      'node dist/node/cli.js ai eval website --json',
      'pnpm check:no-maps dist website/.silen/dist',
    ]
    let previousIndex = -1
    for (const fragment of orderedFragments) {
      expect(occurrenceCount(command, fragment), fragment).toBe(1)
      const currentIndex = command.indexOf(fragment)
      expect(currentIndex, fragment).toBeGreaterThan(previousIndex)
      previousIndex = currentIndex
    }

    for (const forbidden of [
      'ai init',
      'ai index',
      ' mcp ',
      '--allow-write',
      'curl ',
      'http://',
      'https://',
    ]) {
      expect(command, forbidden).not.toContain(forbidden)
    }

    expect(occurrenceCount(pages, 'pnpm site:check')).toBe(1)
    expect(pages).toContain('run: pnpm site:check')
    expect(pages).not.toContain('run: pnpm site:build')
    expect(pages).not.toContain(
      'run: pnpm check:no-maps dist website/.silen/dist',
    )
    const siteCheck = pages.indexOf('run: pnpm site:check')
    const manifest = pages.indexOf(
      'test -f website/.silen/dist/.well-known/silen/manifest.json',
    )
    expect(manifest).toBeGreaterThan(siteCheck)

    expect(ci).not.toContain('pnpm site:check')
    expect(publish).not.toContain('pnpm site:check')
  })
})
```

- [ ] **Step 2: Run the focused test and verify the missing script**

Run:

```sh
pnpm test tests/ai/site-quality-gate.test.ts
```

Expected: FAIL in `official deterministic site quality gate` because
`packageJson.scripts["site:check"]` is undefined. The failure must occur before
any implementation file is changed.

- [ ] **Step 3: Add the exact package script**

Use `apply_patch`:

```diff
*** Begin Patch
*** Update File: package.json
@@
     "build": "tsup && jiti tooling/build-agent-contract.ts",
     "site:build": "pnpm build && node dist/node/cli.js build website",
+    "site:check": "pnpm site:build && node dist/node/cli.js ai audit website && node dist/node/cli.js ai eval website --json && pnpm check:no-maps dist website/.silen/dist",
     "site:dev": "pnpm build && node dist/node/cli.js dev website",
*** End Patch
```

- [ ] **Step 4: Make Pages consume the canonical command**

Use `apply_patch`:

```diff
*** Begin Patch
*** Update File: .github/workflows/pages.yml
@@
-      - name: Build Silen and its website
-        run: pnpm site:build
-
-      - name: Assert upload artifact has no source maps
-        run: pnpm check:no-maps dist website/.silen/dist
+      - name: Build and validate Silen website
+        run: pnpm site:check
 
       - name: Assert public Agent Contract is present
*** End Patch
```

- [ ] **Step 5: Document the maintainer command**

Use `apply_patch`:

```diff
*** Begin Patch
*** Update File: README.md
@@
 The [project map](./docs/project-map.md) is the canonical view of Silen's
 current baseline, executable next work, candidate directions, and watched
 ecosystem signals.
 
+For official-site changes, run `pnpm site:check`. It builds the package and
+site, audits the AI artifacts, evaluates production retrieval, and rejects
+source maps before deployment.
+
 Focused bug reports and pull requests are welcome. Open an
*** End Patch
```

- [ ] **Step 6: Run the contract test and verify green behavior**

Run:

```sh
pnpm test tests/ai/site-quality-gate.test.ts
```

Expected: PASS with one test in
`tests/ai/site-quality-gate.test.ts`.

- [ ] **Step 7: Run the real gate without common provider credentials**

Run:

```sh
env \
  -u OPENAI_API_KEY \
  -u ANTHROPIC_API_KEY \
  -u GOOGLE_API_KEY \
  -u AZURE_OPENAI_API_KEY \
  pnpm site:check
```

Expected:

- Exit code `0`.
- Build completes for the package and `website`.
- Audit JSON contains `"ok": true`.
- Evaluation JSON contains
  `"summary":{"total":4,"passed":4,"failed":0}`, allowing whitespace.
- The final no-map check reports no source-map violation in `dist` or
  `website/.silen/dist`.

- [ ] **Step 8: Run the focused AI regression set**

Run:

```sh
pnpm test \
  tests/ai/site-quality-gate.test.ts \
  tests/ai/audit.test.ts \
  tests/ai/eval.test.ts \
  tests/cli.test.ts
```

Expected: all selected test files pass with zero failures.

- [ ] **Step 9: Run static checks for the changed contract**

Run:

```sh
pnpm exec prettier --check \
  package.json \
  .github/workflows/pages.yml \
  README.md \
  tests/ai/site-quality-gate.test.ts
pnpm lint
pnpm typecheck
git diff --check
```

Expected: every command exits `0` and reports no formatting, lint, type, or
whitespace failure.

- [ ] **Step 10: Commit the working gate**

Run:

```sh
git add \
  package.json \
  .github/workflows/pages.yml \
  README.md \
  tests/ai/site-quality-gate.test.ts
git commit -m "ci: unify deterministic site gate"
```

Expected: one commit contains only the package script, Pages integration,
README guidance, and focused contract test.

### Task 3: Close verification and ship QUAL-002 on the map

**Files:**

- Modify: `docs/project-map.md`
- Verify: `package.json`
- Verify: `.github/workflows/pages.yml`
- Verify: `.github/workflows/ci.yml`
- Verify: `.github/workflows/publish.yml`
- Verify: `README.md`
- Verify: `tests/ai/site-quality-gate.test.ts`

**Interfaces:**

- Consumes: the passing canonical gate and all Task 3 verification evidence.
- Produces: `QUAL-002` in `Shipped`, no active item, and `AI-004` as the
  default next item.

- [ ] **Step 1: Run the complete repository and site gates**

Run:

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
env \
  -u OPENAI_API_KEY \
  -u ANTHROPIC_API_KEY \
  -u GOOGLE_API_KEY \
  -u AZURE_OPENAI_API_KEY \
  pnpm site:check
pnpm exec publint
```

Expected:

- Formatting, lint, typecheck, all Vitest files, the real site gate, and
  `publint` pass.
- The full suite reports zero failed test files and zero failed tests.
- The site evaluation reports all four committed cases passing.

- [ ] **Step 2: Move QUAL-002 to Shipped and select AI-004**

Use `apply_patch` with this exact diff:

```diff
*** Begin Patch
*** Update File: docs/project-map.md
@@
-- Default next item: `QUAL-002`
+- Default next item: `AI-004`
@@
 ## Active
 
-### QUAL-002 — Unify the official deterministic site gate
-
-- Outcome: One documented repository command builds the package and official
-  site, runs `silen ai audit` and `silen ai eval` against `website`, and checks
-  package and site output for source maps.
-- Horizon: `0.4.x`
-- Depends on: `QUAL-001` and `AI-003`.
-- Entry gate: The `0.4.0` build, audit, evaluation, and no-map commands already
-  pass independently; the current Pages workflow invokes build and no-map
-  checks but not audit or evaluation.
-- Done when: The aggregate command has stable failure behavior, is documented,
-  is exercised by the official-site deployment or CI path, and passes from a
-  clean checkout without model credentials or network-dependent evaluation.
-- Evidence:
-  [deterministic site gate design](./superpowers/specs/2026-07-29-silen-deterministic-site-gate-design.md),
-  [package scripts](../package.json),
-  [Pages workflow](../.github/workflows/pages.yml), and
-  [`0.4.0` quality-loop design](./superpowers/specs/2026-07-22-silen-model-free-ai-quality-loop-design.md).
+No map-selected item is active. With no special user scope, promote and begin
+`AI-004`.
@@
 ### AI-003 — Model-Free AI Quality Loop
@@
   [quality-loop plan](./superpowers/plans/2026-07-22-silen-model-free-ai-quality-loop.md),
   [`0.4.0` changelog](../CHANGELOG.md#040---2026-07-22), and
   [`v0.4.0`](https://github.com/AICode-Nexus/silen/releases/tag/v0.4.0).
+
+### QUAL-002 — Unified deterministic site gate
+
+- Outcome: One maintainer command builds the package and official site, audits
+  AI artifacts, evaluates production retrieval, and rejects source maps before
+  GitHub Pages deployment.
+- Horizon: `0.4.x`.
+- Depends on: `QUAL-001` and `AI-003`.
+- Entry gate: The independent `0.4.0` build, audit, evaluation, and no-map
+  commands passed before composition.
+- Done when: `pnpm site:check` passes without provider credentials, Pages uses
+  it once, CI and Publish avoid duplicate site builds, and the full repository
+  gate remains green.
+- Evidence:
+  [deterministic site gate design](./superpowers/specs/2026-07-29-silen-deterministic-site-gate-design.md),
+  [implementation plan](./superpowers/plans/2026-07-29-silen-deterministic-site-gate.md),
+  [package script](../package.json),
+  [focused contract test](../tests/ai/site-quality-gate.test.ts), and
+  [Pages workflow](../.github/workflows/pages.yml).
*** End Patch
```

- [ ] **Step 3: Verify final map state, links, and authority boundaries**

Run:

```sh
node --input-type=module <<'NODE'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const map = await readFile('docs/project-map.md', 'utf8')
const agents = await readFile('AGENTS.md', 'utf8')
const readme = await readFile('README.md', 'utf8')
const active = map.slice(map.indexOf('## Active'), map.indexOf('## Ready'))
const ready = map.slice(map.indexOf('## Ready'), map.indexOf('## Candidate'))
const shipped = map.slice(
  map.indexOf('## Shipped'),
  map.indexOf('## Default execution contract'),
)
const ids = [
  ...map.matchAll(/^### ((?:CORE|THEME|AI|PLUGIN|QUAL)-[0-9]{3}) —/gm),
].map((match) => match[1])

if (ids.length !== 14 || ids.length !== new Set(ids).size) {
  throw new Error('Expected 14 unique project item IDs')
}
if (!map.includes('- Default next item: `AI-004`')) {
  throw new Error('AI-004 is not the default next item')
}
if (!active.includes('No map-selected item is active.')) {
  throw new Error('Final Active state is ambiguous')
}
if (!ready.includes('### AI-004') || ready.includes('### QUAL-002')) {
  throw new Error('Ready state is inconsistent')
}
if (!shipped.includes('### QUAL-002')) {
  throw new Error('QUAL-002 is not shipped')
}
if (/(CORE|THEME|AI|PLUGIN|QUAL)-[0-9]{3}/.test(agents)) {
  throw new Error('AGENTS.md duplicates project-map item state')
}
if (!readme.includes('pnpm site:check')) {
  throw new Error('README maintainer command is missing')
}

for (const match of map.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
  const target = match[1]
  if (/^(?:https?:|mailto:|#)/.test(target)) continue
  const relative = decodeURIComponent(target.split('#', 1)[0])
  if (!relative) continue
  if (!existsSync(resolve(dirname('docs/project-map.md'), relative))) {
    throw new Error('Broken project-map link: ' + target)
  }
}
console.log('QUAL-002 shipped; AI-004 is next')
NODE
```

Expected:

```text
QUAL-002 shipped; AI-004 is next
```

- [ ] **Step 4: Format and commit the shipped map**

Run:

```sh
pnpm exec prettier --check docs/project-map.md
git diff --check
git add docs/project-map.md
git commit -m "docs: ship deterministic site gate"
```

Expected: one commit contains only the final project-map state.

- [ ] **Step 5: Verify the completed branch**

Run:

```sh
git status --short --branch
git log -3 --oneline --decorate
```

Expected:

- The worktree is clean.
- The three implementation commits are the active-map transition, working
  deterministic gate, and shipped-map transition.
- `docs/project-map.md` identifies `AI-004` as the default next item.

Do not push, publish, deploy, or start `AI-004` as part of this plan.
