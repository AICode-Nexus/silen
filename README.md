# Silen

Silen is a React-first documentation engine that turns trusted Markdown and
MDX into static HTML for people and deterministic Markdown, discovery files,
and an optional local MCP workspace for AI clients.

[Documentation](https://aicode-nexus.github.io/silen/) ·
[Quick start](https://aicode-nexus.github.io/silen/guide/) ·
[npm](https://www.npmjs.com/package/@aicode-nexus/silen) ·
[GitHub](https://github.com/AICode-Nexus/silen)

## Requirements

Use Node.js `^20.19.0 || >=22.12.0` and pnpm. Install the React runtime peers
as direct project dependencies, then add Silen:

```sh
pnpm add react@^19.2.7 react-dom@^19.2.7
pnpm add -D @aicode-nexus/silen --allow-build=esbuild
```

The explicit build allowance keeps esbuild usable under pnpm's strict
dependency-script policy.

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

Markdown creates static routes; MDX can import trusted React components.
Configuration also supports locales, navigation, semantic theme tokens,
analytics, ordered plugins, AI artifacts, and a public Agent Contract.

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

Focused bug reports and pull requests are welcome. Open an
[issue](https://github.com/AICode-Nexus/silen/issues) to describe observable
behavior, or submit a pull request with tests and the relevant documentation.
