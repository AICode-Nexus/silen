# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-07-22

### Added

- Added `silen ai eval`, a deterministic model-free retrieval quality gate that
  validates committed questions against the production search index, supports
  expected routes and optional headings within Top K, and provides stable human
  and `--json` output with `0`/`1`/`2` exit semantics.
- Added a four-case bilingual evaluation suite for the official website and
  documented the complete `build` → `ai audit` → `ai eval` workflow.

### Changed

- Exposed rounded ranked-search diagnostics internally while preserving the
  existing score-free public search result contract.
- Treat the optional `.silen/ai/index.json` workspace snapshot as a notice when
  missing or stale because MCP search continues to use its in-memory index.

### Fixed

- Made AI workspace audits deployment-base-aware through the built Agent
  Contract manifest, with a trusted direct-CLI config fallback that MCP
  preflight never executes.
- Accept existing generated Agent Contract artifacts as valid internal link
  targets and reject unsafe or oversized evaluation inputs without executing
  project configuration, calling a model, using the network, or writing files.

## [0.3.1] - 2026-07-20

### Changed

- Render default-theme sidebar groups as persistent semantic sections on
  desktop while retaining collapsible groups in the labelled mobile navigation
  sheet.
- Strengthened the current-page treatment and nested-link spacing with semantic
  primary and muted theme tokens across light and dark appearances.

### Documentation

- Added a portable sidebar redesign QA record covering desktop and mobile
  behavior, visual fidelity, responsive overflow, and accessibility checks.

## [0.3.0] - 2026-07-20

### Added

- Added GitHub-flavored Markdown tables, task lists, strikethrough, autolinks,
  and footnotes across rendered HTML, local search, AI chunks, and generated
  Markdown, including localized responsive table semantics in the default
  theme.
- Added theme-aware home hero artwork through `ThemeHomeImage.darkSrc` and a
  dark workflow illustration for the official website.

### Changed

- Made `react` and `react-dom` runtime dependencies of Silen and routed Vite's
  React resolution through them, so a clean project only needs to install
  `@aicode-nexus/silen` before its first build.
- Load supported Shiki grammars on demand and map `ndjson` fences to the JSON
  Lines grammar instead of silently rendering valid languages as plain text.
- Let narrow tables size to their content, tightened desktop header controls,
  and made the official home illustration fill its visual frame.

### Fixed

- Generate rendered heading IDs and exported outline slugs from the same MDX
  syntax tree, including headings with inline formatting or links.
- Apply the saved appearance selection and default-theme stylesheet before
  hydration, and give the navigation logo explicit dimensions, preventing
  refresh-time theme and oversized-image flashes.
- Simplified the default install command and moved esbuild script approval to
  conditional troubleshooting for builds that actually fail without it.
- Included the generated `.well-known` Agent Contract directory in the GitHub
  Pages upload artifact so its live discovery URLs no longer return 404.
- Upgraded the GitHub Pages configuration and deployment actions to their
  Node.js 24 majors so the workflow no longer relies on deprecated Node.js 20
  action runtimes.

## [0.2.1] - 2026-07-18

### Fixed

- Documented React and React DOM as explicit direct project dependencies, plus
  the esbuild dependency-script allowance, in every quick-start path so a
  clean pnpm 11 consumer can install, resolve `react/jsx-runtime`, and complete
  its first build.

## [0.2.0] - 2026-07-17

### Added

- Added the safe `silen init` activation path for new and existing content
  directories.
- Added localized theme messages and search v2 language-aware indexing.
- Added canonical, alternate-locale, sitemap, and themed 404 SEO output.

### Documentation

- Rebuilt the bilingual English and Chinese product documentation, navigation,
  homepages, live artifact evidence, and npm quick reference.

## [0.1.4] - 2026-07-17

### Fixed

- Kept authored documentation links inside the configured base across default
  theme rendering, MDX content, and broken-link validation.
- Added themed default and locale-specific 404 output plus base- and
  locale-aware preview fallback responses.
- Made clean-checkout tests regenerate the Agent Contract, aligned the website
  with the exact Node.js engine contract, and repaired base-escaping Guide/AI
  links.
- Preserved the no-source-map release guard for package and website artifacts.

## [0.1.3] - 2026-07-15

### Documentation

- Updated the README accessibility note to describe the explicit dark, system,
  and light appearance controls introduced in 0.1.2.

## [0.1.2] - 2026-07-15

### Changed

- Reworked the default theme appearance control into an accessible three-option
  radio group for explicit dark, system, and light selection.
- Reduced generated page head weight by avoiding non-critical image, font,
  audio, and video preloads while preserving modulepreload coverage for the
  client entry.
- Replaced the docs workflow illustration with a compressed JPEG asset.

## [0.1.1] - 2026-07-15

### Documentation

- Refreshed the npm README for the stable 0.1 release line.
- Added this changelog to the repository and npm package.

## [0.1.0] - 2026-07-15

### Added

- Published Silen as `@aicode-nexus/silen` with the `latest` npm dist-tag.
- Added typed site configuration, static MDX routing, server-rendered HTML,
  hydration, client navigation, internal-link validation, and the `dev`,
  `build`, and `preview` CLI commands.
- Added the extensible default theme with responsive documentation layout,
  home pages, page layouts, local search, appearance mode, code highlighting,
  copy controls, locale switching, semantic theme tokens, and accessibility
  behavior.
- Added deterministic AI-readable build artifacts: `llms.txt`,
  `llms-full.txt`, `ai-index.json`, and Markdown routes.
- Added the local AI workspace commands: `ai init`, `ai index`, and `ai audit`.
- Added the permission-gated MCP workspace with read-only tools by default and
  explicit write tools behind `--allow-write`.
- Added endpoint-only Ask AI integration with NDJSON streaming and safe
  citation handling.
- Added analytics configuration for Google Analytics, Baidu Analytics, and
  custom providers.
- Added the versioned Agent Contract for AI clients, including package-level
  resources, site discovery manifests, public project instructions, and
  bilingual task playbooks.
- Added the public plugin runtime with documented lifecycle hooks, typed
  extension contracts, and npm-ready examples.
- Added GitHub Actions release publishing through npm Trusted Publishing.

### Fixed

- Hardened MDX frontmatter handling, raw `base` validation, route refreshes,
  published page contracts, static output validation, default favicon emission,
  SSR image paths, and theme URL isolation.
- Fixed client navigation race conditions, interrupted scroll restoration, and
  page-copy routes so generated AI artifacts stay aligned with UI actions.
- Made MCP sessions and workspace mutations safer with repeated shutdown
  handling, transactional writes, traversal rejection, symlink escaping
  protection, and bounded input limits.
- Published typed plugin/theme contracts and ensured packaged theme classes are
  present for CSS scanning.

### Changed

- Shared CLI command metadata and MCP tool contracts across runtime and AI
  surfaces.
- Hardened release gates with formatting, linting, type checking, builds,
  serial Vitest execution, Playwright coverage, and package metadata
  validation.

## [0.1.0-alpha.3] - 2026-07-15

### Fixed

- Published typed extension contracts for plugin consumers.

## [0.1.0-alpha.2] - 2026-07-15

### Added

- Added the public plugin runtime.

### Fixed

- Reused finalized page metadata in plugin hooks.
- Cached build contributions across plugin execution.

## [0.1.0-alpha.1] - 2026-07-15

### Added

- Published Silen under the `@aicode-nexus` organization scope.

[unreleased]: https://github.com/AICode-Nexus/silen/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/AICode-Nexus/silen/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/AICode-Nexus/silen/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/AICode-Nexus/silen/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/AICode-Nexus/silen/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/AICode-Nexus/silen/compare/v0.1.4...v0.2.0
[0.1.4]: https://github.com/AICode-Nexus/silen/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/AICode-Nexus/silen/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/AICode-Nexus/silen/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/AICode-Nexus/silen/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/AICode-Nexus/silen/compare/v0.1.0-alpha.3...v0.1.0
[0.1.0-alpha.3]: https://github.com/AICode-Nexus/silen/compare/v0.1.0-alpha.2...v0.1.0-alpha.3
[0.1.0-alpha.2]: https://github.com/AICode-Nexus/silen/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/AICode-Nexus/silen/compare/v0.1.0-alpha.0...v0.1.0-alpha.1
