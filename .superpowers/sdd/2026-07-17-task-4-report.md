# Task 4 report: optional `siteUrl` and SEO/discovery artifacts

## Status

Implemented and verified optional absolute-site metadata for Silen. `siteUrl` is an optional canonical HTTP(S) origin; when configured, production builds emit canonical, Open Graph, Twitter, locale-aware hreflang, and sitemap artifacts. When omitted, existing output remains free of those artifacts.

Starting base: `f3faa38e2a79f53862dbfad0488189470383a4c5` (`feat(theme): add locale-aware messages and search`)

Branch: `agent/prevent-source-maps`

## TDD evidence

### RED cycle 1: feature behavior

Tests were written before production changes in:

- `tests/config.test.ts`
- `tests/plugin.test.ts`
- `tests/build.test.ts`
- `tests/seo.test.ts`
- `tests/website.test.ts`
- `tests/fixtures/seo-site/**`

Initial focused command:

```sh
pnpm vitest run tests/config.test.ts tests/plugin.test.ts tests/build.test.ts tests/seo.test.ts tests/website.test.ts --maxWorkers=1 --no-file-parallelism
```

Initial result: 4 failed files, 1 passed file; 11 failed tests, 50 passed tests, 6 skipped. The intended failures demonstrated missing `siteUrl` canonicalization/rejection, missing public virtual exposure, and missing official sitemap. The first run also exposed a fixture-only relative import error in the new SEO fixture; after correcting that setup typo, the SEO suite was rerun to obtain behavior-level RED:

```text
Test Files  1 failed (1)
Tests       4 failed | 2 passed (6)
```

The four intended SEO failures were missing canonical/social metadata, missing compiled-counterpart hreflang, missing locale-only canonical behavior, and missing sitemap output.

### GREEN cycle 1

After the minimal implementation:

```sh
pnpm vitest run tests/config.test.ts tests/plugin.test.ts tests/build.test.ts tests/seo.test.ts tests/website.test.ts --maxWorkers=1 --no-file-parallelism
```

```text
Test Files  5 passed (5)
Tests       67 passed (67)
Duration    3.70s
```

An `exactOptionalPropertyTypes` pass then preserved true property absence for omitted `siteUrl`; the focused post-fix result was 3 files and 47 tests passing.

### RED/GREEN cycle 2: strict authored origin syntax

Self-review found that WHATWG parsing normalizes malformed authored inputs such as `https:docs.example.com`, `https:///docs.example.com`, and `https://docs.example.com/.` into a root origin. New rejection cases were added first:

```text
Test Files  1 failed (1)
Tests       3 failed | 32 passed (35)
```

After enforcing explicit `http://` or `https://` authority syntax and root-only path:

```text
Test Files  1 passed (1)
Tests       35 passed (35)
```

## Public interface

- `UserConfig.siteUrl?: string`
- `ResolvedConfig.siteUrl?: string`
- `virtual:silen/config` exposes `VirtualConfig.siteUrl?: string`
- Production public virtual config includes the canonicalized origin only when configured.
- The generated Agent Config API documents `siteUrl` as field 17, with HTTP(S)-origin and no-credentials/path/query/fragment constraints.
- The official website config now uses `siteUrl: 'https://aicode-nexus.github.io'` with the existing `base: '/silen/'`.

Accepted values are canonicalized with `URL.origin`, for example:

```text
HTTPS://Docs.Example.COM:443/ -> https://docs.example.com
http://localhost:8080         -> http://localhost:8080
```

Invalid values receive the actionable message:

```text
siteUrl must be an absolute http:// or https:// origin without credentials, a deployment path, query, or fragment; configure the deployment path with base
```

## Behavior and implementation

- Normal content pages get exactly one absolute canonical URL.
- OG emits `og:type=website`, rendered title/description when available, and absolute `og:url`.
- Twitter emits `summary` plus rendered title/description when available.
- No social image is invented.
- Hreflang matching removes the current locale root, looks up only exact compiled route counterparts, uses configured locale `lang`, and never fabricates a translation.
- Alternate ordering is deterministic: default locale, configured locale order, then `x-default`.
- Duplicate locale declarations are deduplicated; the asymmetric fixture contains a duplicate `zh-CN` entry and exact output assertions.
- `x-default` is emitted only when the corresponding compiled default-language route exists.
- Generated 404 pages receive no absolute SEO metadata.
- `sitemap.xml` contains every compiled content route exactly once, sorts absolute URLs bytewise, excludes generated 404 outputs, and XML-escapes URL text.
- Sitemap generation occurs before plugin `buildEnd`; the existing example sitemap plugin remains compatible and can overwrite the core sitemap as before.
- Omitted `siteUrl` emits no canonical, hreflang, OG, Twitter, or generated sitemap.
- Static `robots.txt` passthrough is unchanged and covered by a byte-identical fixture assertion.

## Official website build artifact inspection

Command:

```sh
pnpm site:build
```

Result:

```text
Silen built 8 routes to /Users/admin/Documents/reactpress/website/.silen/dist
```

Representative English output (`guide/index.html`):

```html
<link rel="canonical" href="https://aicode-nexus.github.io/silen/guide/">
<link rel="alternate" hreflang="en-US" href="https://aicode-nexus.github.io/silen/guide/">
<link rel="alternate" hreflang="zh-CN" href="https://aicode-nexus.github.io/silen/zh/guide/">
<link rel="alternate" hreflang="x-default" href="https://aicode-nexus.github.io/silen/guide/">
<meta property="og:title" content="Get started">
<meta property="og:description" content="Create and publish your first Silen documentation site.">
<meta property="og:url" content="https://aicode-nexus.github.io/silen/guide/">
```

Representative Chinese output (`zh/guide/index.html`):

```html
<link rel="canonical" href="https://aicode-nexus.github.io/silen/zh/guide/">
<meta property="og:title" content="快速开始">
<meta property="og:description" content="创建并发布你的第一个 Silen 文档站点。">
<meta property="og:url" content="https://aicode-nexus.github.io/silen/zh/guide/">
```

`sitemap.xml` inspection found 8 locations, 8 unique locations, deterministic sorted order, and no `404` entry:

```text
/silen/
/silen/ai/
/silen/guide/
/silen/guide/plugins
/silen/zh/
/silen/zh/ai/
/silen/zh/guide/
/silen/zh/guide/plugins
```

No `.map` file was found under the official output.

## Verification commands and exact results

```sh
pnpm typecheck
```

Passed (`tsc --noEmit`, exit 0).

```sh
pnpm lint
```

Passed (`eslint .`, exit 0).

```sh
pnpm format:check
```

Passed: `All matched files use Prettier code style!`

```sh
pnpm test
```

Final exact result:

```text
Test Files  63 passed (63)
Tests       535 passed (535)
Duration    61.31s
```

The post-interruption recovery-focused suite also passed 8 files and 89 tests covering config, virtual/plugin serialization, build compatibility, SEO, the official website, and all three Agent Contract suites.

```sh
pnpm check:no-maps
```

Passed (exit 0).

```sh
test -z "$(find dist -type f -name '*.map' -print -quit)"
```

Passed: `dist source maps: none`.

```sh
git diff --check
```

Passed with no whitespace errors.

The full suite also passed the existing plugin example tests, build/404/init/messages/search behavior, package smoke tests, and no-source-map guards.

## Files

Production:

- `src/shared/config.ts`
- `src/node/config-schema.ts`
- `src/node/config.ts`
- `src/node/virtual.ts`
- `src/virtual-modules.ts`
- `src/node/render.ts`
- `src/node/seo.ts`
- `src/node/build.ts`
- `website/.silen/config.ts`

Tests and fixtures:

- `tests/config.test.ts`
- `tests/plugin.test.ts`
- `tests/build.test.ts`
- `tests/seo.test.ts`
- `tests/website.test.ts`
- `tests/ai/config-contract.test.ts`
- `tests/ai/framework-contract.test.ts`
- `tests/ai/site-contract.test.ts`
- `tests/fixtures/seo-site/**`

## Self-review

- Escaping: canonical/social attributes reuse HTML escaping; sitemap escapes all five XML-sensitive characters. The integration fixture proves HTML escaping with `<`, `>`, `&`, and quotes and XML escaping with a Unicode/space/ampersand route.
- URL normalization: `siteUrl` is canonicalized to `URL.origin`; explicit origin syntax is required; `base` remains the sole deployment path; route trailing slash and existing percent encoding are preserved by URL resolution; no base/route double slash is introduced.
- Locale counterpart matching: roots and route pathnames are normalized, the longest current locale root wins, only exact compiled target routes are linked, duplicates are suppressed, and missing French/default counterparts are explicitly asserted absent.
- Absence: omitted `siteUrl` keeps the resolved and public virtual property absent and emits none of the new artifacts; 404 pages also omit them.
- Determinism: hreflang ordering follows the required locale order; sitemap sorting and complete exact serialization are asserted.
- Compatibility: plugin head metadata remains present, the example sitemap plugin tests pass, robots passthrough is byte-identical in the fixture, and the full prior suite is green.

## Concerns

No unresolved implementation concerns. The official website does not currently provide a source `public/robots.txt`; passthrough compatibility is therefore verified with the dedicated SEO fixture rather than an official-site artifact.
