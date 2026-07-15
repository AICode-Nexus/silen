# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[unreleased]: https://github.com/AICode-Nexus/silen/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/AICode-Nexus/silen/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/AICode-Nexus/silen/compare/v0.1.0-alpha.3...v0.1.0
[0.1.0-alpha.3]: https://github.com/AICode-Nexus/silen/compare/v0.1.0-alpha.2...v0.1.0-alpha.3
[0.1.0-alpha.2]: https://github.com/AICode-Nexus/silen/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/AICode-Nexus/silen/compare/v0.1.0-alpha.0...v0.1.0-alpha.1
