# Silen

Silen is a React-first documentation engine that turns trusted Markdown and
MDX into static HTML for people and deterministic Markdown, discovery files,
and an optional local MCP workspace for AI clients.

[Documentation](https://aicode-nexus.github.io/silen/) ·
[Quick start](https://aicode-nexus.github.io/silen/guide/) ·
[npm](https://www.npmjs.com/package/@aicode-nexus/silen) ·
[GitHub](https://github.com/AICode-Nexus/silen)

## Requirements

Use Node.js `^20.19.0 || >=22.12.0` and pnpm. Silen installs its required
React runtime automatically:

```sh
pnpm add -D @aicode-nexus/silen
```

## Quick reference

Activate a documentation directory, start the local server, then build its
static output:

```sh
pnpm silen init docs
pnpm silen dev docs
pnpm silen build docs
pnpm silen preview docs
```

`init` adds `.silen/config.ts` and `index.mdx` without overwriting existing
files. Production output defaults to `docs/.silen/dist`.

For a deterministic AI-readiness gate that needs no model, API key, endpoint,
embeddings service, or network, commit `.silen/ai-evals.json` and run:

```sh
pnpm silen build docs
pnpm silen ai audit docs
pnpm silen ai eval docs
```

`ai eval --json` provides stable CI output. Exit codes `0`, `1`, and `2` mean
pass, retrieval failure, and setup failure.

## Local MCP compatibility

`pnpm silen mcp docs` uses the split TypeScript SDK v2 over local `stdio`. One
entry accepts verified `2025-11-25` and `2026-07-28` clients, exposes seven
read-only tools by default, and adds three write tools only with
`--allow-write`. Successful calls include human-readable text and
schema-validated `structuredContent`.

Generated Agent Contract manifests and API documents use `schemaVersion: 2`;
they declare the protocol versions, an empty extension set, and each tool's
`outputSchema`. Silen does not enable remote MCP, models, provider keys, or a
shell through this local server.

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

## Minimal configuration

```ts
// docs/.silen/config.ts
import { defineConfig } from '@aicode-nexus/silen'

export default defineConfig({
  title: 'My documentation',
  description: 'Product and engineering knowledge.',
  base: '/',
  onBrokenLinks: 'error',
})
```

Markdown creates static routes and supports GFM tables, task lists,
strikethrough, autolinks, and footnotes. MDX can import trusted React
components. Fenced code loads supported Shiki grammars on demand. The default
theme adds accessible responsive tables and optional light/dark hero artwork.
Configuration also supports locales, navigation, semantic theme tokens,
analytics, ordered plugins, AI artifacts, and a public Agent Contract.
Desktop sidebar groups stay visible as semantic sections, while the labelled
mobile navigation sheet keeps the same groups collapsible. The current page is
exposed with `aria-current` and emphasized through the theme's primary token.

- [Project structure](https://aicode-nexus.github.io/silen/guide/project-structure/)
- [Configuration](https://aicode-nexus.github.io/silen/guide/configuration/)
- [Markdown and MDX](https://aicode-nexus.github.io/silen/guide/markdown-mdx/)
- [Theme](https://aicode-nexus.github.io/silen/theme/)
- [Integrations](https://aicode-nexus.github.io/silen/integrations/)
- [AI output and MCP](https://aicode-nexus.github.io/silen/ai/)
- [Configuration, CLI, and troubleshooting reference](https://aicode-nexus.github.io/silen/reference/)

## Package

- Package: [`@aicode-nexus/silen`](https://www.npmjs.com/package/@aicode-nexus/silen)
- Public exports: package root, `/client`, `/theme`, `/ai`, and `/agent/*`
- Source and issues: [AICode-Nexus/silen](https://github.com/AICode-Nexus/silen)
- License: [MIT](./LICENSE)

## Contributing

The [project map](./docs/project-map.md) is the canonical view of Silen's
current baseline, executable next work, candidate directions, and watched
ecosystem signals.

For official-site changes, run `pnpm site:ai-check`. It runs `site:build`,
`ai audit`, `ai eval`, and `check:no-maps` in order, then saves the evaluator's
exact JSON as `artifacts/ai-eval/site-ai-eval.json`. The ignored local report
is uploaded by Core CI, GitHub Pages, and npm release for ranking-drift review.
`pnpm site:check` remains a compatibility alias for the same gate.

The gate is deterministic, model-free, credential-free, and read-only with
respect to source content.

Focused bug reports and pull requests are welcome. Open an
[issue](https://github.com/AICode-Nexus/silen/issues) to describe observable
behavior, or submit a pull request with tests and the relevant documentation.
