# Silen Plugin System Design Specification

- Status: Approved for written review
- Date: 2026-07-15
- Repository: `AICode-Nexus/silen`
- Target release: next `0.1.0-alpha` release on the npm `alpha` tag

## 1. Summary

Silen will add a stable, documentation-framework-level plugin API so local and
community packages can extend content processing, Vite integration, page data,
document head entries, browser behavior, and build artifacts without depending
on Silen internals.

The first release provides the plugin kernel and npm-ready reference examples.
It does not add a marketplace, presets, plugin-generated routes, or a stable API
for replacing theme layouts. This specification supersedes the earlier Core
Alpha non-goal that excluded a stable third-party plugin ABI.

## 2. Goals

The first plugin release must:

1. Accept local plugins and imported npm plugins in `.silen/config.ts`.
2. Accept typed plugin options without requiring runtime string-based loading.
3. Provide deterministic lifecycle ordering in development and production.
4. Reuse the underlying Vite and MDX ecosystems through explicit hooks.
5. Support SSR-safe application extensions and browser-only setup code.
6. Attribute validation and runtime failures to a plugin instance and hook.
7. Keep core routing, theme ownership, and output installation safe.
8. Prove the public API through a packed-package consumer and reference plugins.

## 3. Non-goals

The first plugin release will not provide:

- A hosted plugin marketplace or online installer.
- Presets or plugin bundles.
- Plugin-defined routes or new content types.
- Plugin-driven theme layout replacement.
- Arbitrary final-HTML string transformation.
- Automatic discovery of installed packages.
- Separate npm publication of the reference plugins.
- A compatibility promise for undocumented internal modules.

## 4. Public configuration API

Plugins are imported as ordinary ESM values. Silen does not resolve plugin
package-name strings at runtime; this keeps TypeScript inference, module errors,
and dependency ownership visible to the user's package manager.

```ts
import { defineConfig, definePlugin } from '@aicode-nexus/silen'
import analytics from '@silen/plugin-analytics'
import sitemap from '@silen/plugin-sitemap'

const readingTime = definePlugin(async (context, options) => ({
  name: 'local-reading-time',
  transformPageData(page) {
    return {
      ...page,
      readingTime: calculateReadingTime(page, options.wordsPerMinute),
    }
  },
}))

export default defineConfig({
  plugins: [
    sitemap,
    [analytics, { id: 'G-XXXX' }],
    [readingTime, { wordsPerMinute: 300 }],
  ],
})
```

The public entry point exports `definePlugin` and the plugin-related types.
`definePlugin` returns its factory unchanged and exists for inference and API
discoverability.

### 4.1 Plugin entries

```ts
type SilenPluginEntry =
  | SilenPluginFactory
  | readonly [SilenPluginFactory, unknown]
  | false
  | null
  | undefined

type SilenPluginFactory<Options = undefined> = (
  context: SilenPluginFactoryContext,
  options: Options,
) => Awaitable<SilenPlugin>
```

Falsy entries allow conditional activation. An entry without an options tuple
receives `undefined`. Options belong to the plugin and may be validated inside
the factory; Silen validates the returned plugin contract.

### 4.2 Plugin identity

Every plugin returns a non-empty `name` and may return an `id`. The identity is
`name:id`, where the default id is `default`. Duplicate identities are a
configuration error. Multiple instances of one plugin are supported when they
use distinct ids.

## 5. Plugin contract

```ts
interface SilenPlugin {
  readonly name: string
  readonly id?: string
  readonly config?: SilenConfigHook
  readonly configResolved?: SilenConfigResolvedHook
  readonly extendMdx?: SilenExtendMdxHook
  readonly vite?: SilenViteHook
  readonly clientModules?: SilenClientModulesHook
  readonly transformPageData?: SilenTransformPageDataHook
  readonly transformHead?: SilenTransformHeadHook
  readonly buildEnd?: SilenBuildEndHook
}
```

Unknown fields are rejected in the first stable ABI. This catches misspelled
hook names and prevents consumers from treating accidental internal behavior as
supported API.

## 6. Lifecycle and ordering

Silen-level plugin hooks run sequentially in configuration order. The core does
not infer dependencies or parallelize hooks. A plugin may parallelize its own
independent work.

The lifecycle is:

1. Load the user config and normalize conditional plugin entries.
2. Instantiate plugin factories and validate unique identities.
3. Run `config` hooks in order. Each hook sees the current config and may return
   a typed config patch. A patch cannot replace the `plugins` collection.
4. Resolve and validate the final Silen config.
5. Run read-only `configResolved` hooks.
6. Collect `extendMdx`, `vite`, and `clientModules` contributions.
7. Compile pages and run `transformPageData` in both dev and build paths.
8. Run `transformHead` for each rendered page in dev and build.
9. Complete Vite builds, static rendering, search, AI artifacts, and safe output
   installation.
10. Run `buildEnd` after the final output directory is installed.

`buildEnd` may add files inside the installed output directory. If it fails, the
build command fails and reports that the core output was installed before the
post-build hook. Silen does not roll back arbitrary external side effects made
by a plugin.

## 7. Hook contracts

### 7.1 `config`

`config` receives a read-only view of the current user config and a command
environment. It may return a partial user-config patch. Patches are merged in
plugin order; later plugin patches win at the same property. `plugins` is not a
patchable field. The original user config and hook arguments are not mutated.

### 7.2 `configResolved`

`configResolved` receives the final read-only `ResolvedConfig`. It is intended
for validation and initialization and cannot return a config patch.

### 7.3 `extendMdx`

`extendMdx` returns ordered Remark and Rehype plugin entries. Contributions are
applied after Silen's required frontmatter/page-data preparation and before the
final MDX-to-React compilation. The same configured chain is used by dev and
production builds.

Page metadata used by navigation, search, and AI artifacts is finalized through
`transformPageData`. An MDX plugin must not rely on undocumented compiler state
to change Silen page metadata.

### 7.4 `vite`

`vite` returns Vite `PluginOption` values. Silen inserts them after protected
core virtual-module handling and before MDX compilation. Vite's own `enforce`
semantics continue to apply, but a plugin cannot resolve protected
`virtual:silen/*` identifiers. A collision produces a Silen configuration
error rather than silently replacing core behavior.

### 7.5 `clientModules`

`clientModules` returns resolvable ESM module identifiers. Each module may
export:

```ts
interface SilenClientExtension {
  readonly wrapRoot?: React.ComponentType<React.PropsWithChildren>
  readonly setup?: (context: SilenClientContext) => void | (() => void)
}
```

Modules and `wrapRoot` are imported by both SSR and hydration and must be safe
without `window` or `document`. Wrappers are composed in plugin order around the
theme root without replacing the selected theme layout. `setup` runs only in
the browser after hydration; its optional cleanup runs before reinitialization
during HMR and on application disposal where supported.

### 7.6 `transformPageData`

`transformPageData` receives an immutable page-data snapshot plus route and
command context. It may return a partial page-data patch. Silen applies patches
in plugin order and validates the final value as JSON-serializable because it
crosses the SSR-to-client boundary and feeds search and AI artifacts.

This hook runs for initial development renders, HMR updates, production static
rendering, search indexing, and AI artifact generation.

### 7.7 `transformHead`

`transformHead` receives finalized page data and returns typed head entries.
Entries are appended in plugin order in dev and build. Silen validates tag names
and serializable attributes and keeps its escaping and URL-safety rules in
control. Final HTML string mutation is not exposed.

### 7.8 `buildEnd`

`buildEnd` receives the resolved config, final route list, page data, and
installed output directory. It runs only for `silen build`, never for `dev` or
`preview`. It is suitable for sitemap, feed, and integration metadata files.

## 8. Error behavior

Plugin boundaries wrap thrown values with a stable message:

```text
Silen plugin analytics:default failed in transformHead: <detail>
```

The original error is retained as `cause`. Errors include the page route when a
hook is page-specific. Invalid plugin results, duplicate identities, protected
virtual-module collisions, unsafe client module identifiers, and
non-serializable page data fail fast.

Development uses Vite's error overlay where applicable. Builds stop at the
failed stage and return a non-zero exit code. Silen does not catch a plugin
failure and continue with a partially enhanced site.

## 9. Reference examples and documentation

The repository will include npm-ready reference directories demonstrating:

1. `sitemap`: `buildEnd` and safe output generation.
2. `reading-time`: options and `transformPageData`.
3. `analytics`: `transformHead`, `clientModules`, browser-only `setup`, and SSR
   import safety.

The examples remain source examples in this release. They are exercised by
tests and documented on the Silen website, but are not separate published npm
packages. The documentation must include plugin authoring, plugin consumption,
lifecycle ordering, SSR rules, error behavior, and version compatibility.

## 10. Testing and acceptance

The implementation is accepted only when it covers:

- Plugin entry normalization and conditional entries.
- Typed options and `definePlugin` inference.
- Duplicate `name:id` detection and multi-instance success.
- Deterministic hook ordering and config-patch behavior.
- Hook error attribution and retained causes.
- Remark/Rehype contribution in dev and build.
- Vite plugin contribution and protected-module collision rejection.
- Page-data transformation in rendering, search, and AI outputs.
- Head entry generation in dev and static HTML.
- Client wrapper composition, browser setup, cleanup, SSR, and hydration.
- `buildEnd` timing and failure behavior.
- Existing sites with no `plugins` field producing unchanged output.
- Packed-package consumption by a fresh fixture with a local community plugin.
- Public exports and NodeNext package resolution.

The release gate is:

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm test`
4. `pnpm site:build`
5. `pnpm pack` plus an independent tarball smoke test
6. `publint`
7. Review all repository changes, including the pre-existing search UI changes
8. Commit all approved changes
9. Pull with rebase, resolve and rerun affected gates if upstream changed
10. Push the release commit and tag
11. Publish the next Alpha version to npm with the `alpha` dist-tag
12. Verify the registry version, dist-tag, tarball contents, and documentation
    deployment status

## 11. Compatibility and versioning

The plugin API is introduced during the `0.1.0-alpha` line. Public types and
documented hooks are compatibility targets within that line, but breaking
changes may still occur in a later Alpha with release notes. Plugins should
declare a peer dependency range on `@aicode-nexus/silen` and must not import
`dist/node/*` or source-internal paths.

The package continues to publish one core artifact. Plugin helpers and types are
exported from the main package, while runtime client-extension types that are
needed by browser modules are also exported through the existing client entry.

## 12. Implementation boundaries

Implementation should introduce a dedicated plugin runner and public types
rather than expand the existing internal Vite plugin into a general lifecycle
manager. Build and dev composition should share one plugin-resolution result so
factories and initialization hooks do not run inconsistently across client and
SSR builds.

Existing theme extension behavior remains intact. Existing search UI changes in
the working tree must be reviewed and verified, not overwritten by plugin work.
