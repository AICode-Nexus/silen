# Silen Plugin System Implementation Plan

> Execute with the `executing-plans` skill. The user explicitly authorized
> implementation and release on the current `main` branch. Keep the user's
> existing analytics and search changes, review them, and include them in the
> final verified release.

**Goal:** Add a stable Silen plugin kernel for local and npm plugins, prove it
with reference plugins and packed-package tests, integrate all current local
changes, and publish the next Alpha release.

**Architecture:** Add a dedicated plugin runner beside the internal Vite
plugin. Resolve plugin factories once per command, execute Silen lifecycle hooks
in declaration order, and pass the same resolved runner to dev, client build,
SSR build, page compilation, rendering, and build completion. Keep protected
routes and theme ownership in core. Expose controlled MDX, Vite, page-data,
head, client-extension, and post-build surfaces.

**Tech stack:** TypeScript 7, React 19, Vite 8, MDX 3, Zod 4, Vitest 4,
Testing Library, Playwright, pnpm 10, npm public registry.

## Global constraints

- Work on `main` because the user explicitly authorized the complete
  commit/pull/push/release chain.
- Do not discard or overwrite pre-existing analytics and search changes.
- Do not add route creation, presets, a marketplace, or arbitrary HTML
  transformation.
- Plugin ordering is deterministic and sequential at the Silen layer.
- Plugin factories run once per Silen command, not separately for client and
  SSR bundles.
- Dev and build must use equivalent plugin contributions.
- Data crossing SSR/client boundaries must be JSON-serializable.
- Plugin client wrappers must be SSR-safe; browser setup runs only after
  hydration.
- Existing sites without `plugins` must remain compatible.
- Use focused tests while implementing and the full release gate before commit.

---

## Task 1: Establish the current local baseline

**Files:**

- Review all currently modified and untracked files.
- Review `src/client/analytics.ts`, `src/node/analytics.ts`, search changes, and
  their tests/documentation.

- [ ] Record `git status`, upstream divergence, Node/pnpm versions, and npm
  authentication against `https://registry.npmjs.org`.
- [ ] Run focused analytics, search, config, render, hydration, and package
  tests before plugin edits.
- [ ] Run `pnpm typecheck` and `pnpm lint` to identify pre-existing failures.
- [ ] Fix only demonstrated defects; keep unrelated behavior unchanged.

Verification:

```bash
pnpm exec vitest run tests/analytics.test.tsx tests/config.test.ts \
  tests/render.test.ts tests/hydration.test.tsx tests/theme/search.test.ts \
  tests/theme/search-ui.test.tsx tests/package.test.ts
pnpm typecheck
pnpm lint
```

---

## Task 2: Add public plugin types and a deterministic runner

**Files:**

- Create `src/shared/plugin.ts`.
- Create `src/node/plugins.ts`.
- Modify `src/shared/config.ts`.
- Modify `src/node/config.ts`.
- Modify `src/index.ts`.
- Modify `tests/config.test.ts` and `tests/package.test.ts`.
- Create `tests/plugins.test.ts` if the runner tests do not fit existing files.

- [ ] Write failing tests for direct factories, `[factory, options]`, falsy
  entries, async factories, and `definePlugin` identity.
- [ ] Define `SilenPluginEntry`, `SilenPluginFactory`, `SilenPlugin`, hook
  contexts, `SilenHeadEntry`, page extension data, and client extension types.
- [ ] Add `plugins?: readonly SilenPluginEntry[]` to `UserConfig` without
  serializing factories into browser config.
- [ ] Implement factory resolution, contract validation, default id,
  duplicate `name:id` rejection, and stable error wrapping with `cause`.
- [ ] Execute `config` patches sequentially, forbid patches to `plugins`, then
  validate the final config and execute read-only `configResolved` hooks.
- [ ] Store resolved plugin instances on Node-only resolved configuration so
  client and SSR builds share one initialization result.
- [ ] Export `definePlugin` and all documented public types.

Verification:

```bash
pnpm exec vitest run tests/config.test.ts tests/package.test.ts \
  tests/plugins.test.ts
pnpm typecheck
```

---

## Task 3: Integrate MDX and Vite contributions

**Files:**

- Modify `src/node/mdx.ts`.
- Modify `src/node/plugin.ts`.
- Modify `src/node/build.ts`.
- Modify `src/node/server.ts`.
- Modify relevant virtual-module and plugin tests.

- [ ] Write failing tests proving Remark/Rehype contributions run in dev and
  build and Vite contributions affect both client and SSR builds.
- [ ] Collect `extendMdx` results in configuration order and feed one chain to
  every `createMdxPlugins` call.
- [ ] Collect Vite `PluginOption` results after protected Silen core handling
  and before MDX compilation.
- [ ] Wrap community Vite hooks that can address `virtual:silen/*` so protected
  resolve/load/transform collisions fail with plugin identity and stage.
- [ ] Preserve Vite `enforce`, object-hook handlers, and plugin arrays while
  flattening contributions deterministically.
- [ ] Ensure plugin initialization does not repeat across client and SSR Vite
  builds.

Verification:

```bash
pnpm exec vitest run tests/plugin.test.ts tests/mdx.test.ts \
  tests/build.test.ts tests/ssr.test.ts tests/server.test.ts
pnpm typecheck
```

---

## Task 4: Add page-data and head lifecycles

**Files:**

- Modify `src/node/mdx.ts` and page-data analysis.
- Modify `src/shared/page.ts`.
- Modify `src/client/data.tsx` and `src/client/app.tsx` as required.
- Modify `src/node/render.ts`, `src/node/build.ts`, and `src/node/server.ts`.
- Modify `src/node/search.ts` and AI artifact inputs only where required for
  transformed page data.
- Add focused page-data and head tests.

- [ ] Use a dedicated JSON extension-data bag for plugin page metadata instead
  of unrestricted top-level fields.
- [ ] Run `transformPageData` after core extraction in dev and build, in plugin
  order, with route/source context.
- [ ] Reject non-serializable results and attribute errors to route, plugin,
  instance, and hook.
- [ ] Feed finalized title, description, headings, frontmatter, and extension
  data consistently into SSR, hydration, search, and AI artifacts.
- [ ] Run `transformHead` for each dev and production page and render typed,
  escaped head entries without exposing arbitrary final HTML mutation.
- [ ] Preserve existing favicon, appearance, analytics, asset preload, and
  hydration behavior.

Verification:

```bash
pnpm exec vitest run tests/mdx.test.ts tests/render.test.ts \
  tests/hydration.test.tsx tests/theme/search.test.ts \
  tests/ai/artifacts.test.ts tests/build.test.ts tests/server.test.ts
pnpm typecheck
```

---

## Task 5: Add SSR-safe client extensions

**Files:**

- Modify `src/node/virtual.ts` and `src/virtual-modules.ts`.
- Modify `src/node/plugin.ts` as needed.
- Modify `src/client/app.tsx`, `src/client/entry.tsx`, and
  `src/client/ssr-entry.tsx` as needed.
- Modify `src/client/index.ts`.
- Add client-extension fixtures and hydration/SSR tests.

- [ ] Add a protected `virtual:silen/client-extensions` module generated from
  resolved `clientModules` contributions.
- [ ] Resolve relative modules from the site root and package identifiers from
  the project config/package context; reject unresolved or unsafe identifiers.
- [ ] Import extension modules during SSR and hydration and validate optional
  `wrapRoot` and `setup` exports.
- [ ] Compose wrappers in plugin order around the theme root without replacing
  its layout.
- [ ] Run `setup` in a React effect after hydration and run cleanup on effect
  disposal/HMR reinitialization.
- [ ] Prove SSR import safety, hydration parity, wrapper order, browser setup,
  cleanup, and no-plugin compatibility.

Verification:

```bash
pnpm exec vitest run tests/hydration.test.tsx tests/ssr.test.ts \
  tests/plugin.test.ts tests/render.test.ts
pnpm typecheck
```

---

## Task 6: Add `buildEnd`, reference plugins, and documentation

**Files:**

- Modify `src/node/build.ts`.
- Create `examples/plugins/sitemap.ts`.
- Create `examples/plugins/reading-time.ts`.
- Create `examples/plugins/analytics-client.ts` and its client module.
- Modify `README.md`.
- Create English and Chinese plugin-authoring website pages.
- Modify website navigation/sidebars as required.
- Add example, build-end, package, and website tests.

- [ ] Execute `buildEnd` after safe output installation with final config,
  routes, page data, and output directory.
- [ ] Make failures explicit that core output was already installed; do not
  claim rollback of plugin side effects.
- [ ] Add npm-ready source examples for sitemap, reading time, and analytics
  client behavior without publishing separate packages.
- [ ] Add bilingual consumption, authoring, ordering, SSR, error, and version
  compatibility documentation.
- [ ] Extend the independent tarball smoke fixture to consume the packed public
  plugin API with a local plugin.

Verification:

```bash
pnpm exec vitest run tests/build.test.ts tests/package-smoke.test.ts \
  tests/package.test.ts tests/website.test.ts tests/plugins.test.ts
pnpm site:build
```

---

## Task 7: Review and integrate the pre-existing analytics and search work

**Files:**

- All analytics/search implementation, tests, README, and bilingual guide files
  present in the working tree before plugin implementation.

- [ ] Confirm analytics HTML escaping, script-attribute validation, production
  gating, duplicate pageview prevention, provider id encoding, and navigation
  behavior.
- [ ] Confirm search description ranking/snippets, escaping, keyboard behavior,
  accessible labels, result context, responsive sizing, and no regressions.
- [ ] Reconcile analytics with plugin head/client hooks without converting the
  approved site-level analytics feature into an undocumented plugin dependency.
- [ ] Run their focused unit, hydration, render, config, and UI tests.
- [ ] Document any behavior change made during integration.

Verification:

```bash
pnpm exec vitest run tests/analytics.test.tsx tests/config.test.ts \
  tests/render.test.ts tests/hydration.test.tsx tests/theme/search.test.ts \
  tests/theme/search-ui.test.tsx
```

---

## Task 8: Perform full repository review and release gates

- [ ] Use the `code-review` skill to inspect the complete diff for correctness,
  compatibility, security, SSR/hydration, lifecycle ordering, and packaging.
- [ ] Fix all actionable findings and rerun affected focused tests.
- [ ] Run formatting, lint, typecheck, all Vitest tests, the website build, and
  Playwright E2E tests.
- [ ] Build the package, run `publint`, create a tarball, inspect its contents,
  and install it in an independent temporary project.
- [ ] Verify the working tree contains only intended source, docs, tests, plan,
  version, and lockfile changes.

Verification:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test --maxWorkers=1 --no-file-parallelism
pnpm site:build
pnpm exec playwright test tests/e2e
pnpm build
pnpm exec publint
pnpm pack
```

---

## Task 9: Version, commit, sync, push, publish, and verify deployment

- [ ] Set the package and lockfile to `0.1.0-alpha.2` without creating an
  automatic npm commit or tag.
- [ ] Rerun the release-sensitive package, build, tarball, and `publint` gates.
- [ ] Stage and commit all approved local changes, including analytics and
  search, with release notes/changelog text if the repository convention needs
  it.
- [ ] Pull from `origin/main` with rebase; resolve conflicts without discarding
  local work and rerun affected gates.
- [ ] Create annotated tag `v0.1.0-alpha.2` only after the rebased commit is
  final.
- [ ] Push `main` and the release tag.
- [ ] Publish to `https://registry.npmjs.org` with the `alpha` dist-tag and add
  the `next` dist-tag for continuity with prior Alpha releases.
- [ ] Verify npm version, dist-tags, tarball integrity, public exports, and a
  fresh registry install.
- [ ] Verify GitHub CI and Pages workflows complete successfully and the live
  English/Chinese plugin documentation routes return HTTP 200.

Release commands will always pass the official npm registry explicitly because
the machine's default registry is currently `https://registry.npmmirror.com`.
