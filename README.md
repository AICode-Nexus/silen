# Silen

Silen is a lightweight, documentation-first static site generator powered by
React, TypeScript, Vite, and MDX. Core Alpha turns trusted MDX project files
into complete static HTML with client-side navigation.

## Requirements and installation

Silen supports Node.js `^20.19.0 || >=22.12.0` and pnpm `11.12.0`. React
`^19.2.7` and React DOM `^19.2.7` are peer dependencies.

```sh
pnpm add -D silen
```

## Quick start

Create `docs/.silen/config.ts`:

```ts
import { defineConfig } from 'silen'

export default defineConfig({ title: 'My documentation' })
```

Add a `docs/index.mdx` file, then use the three primary commands:

```sh
pnpm silen dev docs
pnpm silen build docs
pnpm silen preview docs
```

`dev` starts the development server, `build` writes the static site, and
`preview` serves the built output for a local deployment check.

## Project structure

```text
docs/
├── .silen/
│   └── config.ts
├── public/
│   └── logo.svg
├── guide/
│   └── index.mdx
└── index.mdx
```

Markdown and MDX files become static routes: `index.mdx` maps to `/`,
`guide.mdx` maps to `/guide`, and `guide/index.mdx` maps to `/guide`.
Files in `public/` are copied unchanged to the output root and should be linked
with the configured `base`, such as `/handbook/logo.svg`.

## Configuration

```ts
import { defineConfig } from 'silen'

export default defineConfig({
  title: 'My documentation',
  description: 'Project reference',
  lang: 'en-US',
  base: '/handbook/',
  outDir: 'dist',
  onBrokenLinks: 'error',
  themeConfig: {},
})
```

`base` is the absolute URL path where the site will be mounted. `outDir` is
resolved from the documentation root and defaults to `.silen/dist`.
`onBrokenLinks` accepts `error`, `warn`, or `ignore`.

## Trusted MDX

MDX may import and run React components. Treat it as trusted executable project
source; Silen is not a sandbox for untrusted submissions.

## Deployment

Run `pnpm silen build docs`, then publish the contents of the configured
`outDir` to any static host. When deploying below a subpath, set `base` to that
mount path and configure the host to serve the generated `index.html` files and
assets without rewriting their URLs.

## Core Alpha scope

Core Alpha includes typed configuration, static file routing, MDX compilation,
server-rendered HTML, hydration, client navigation, internal-link validation,
and the `dev`, `build`, and `preview` commands. The polished default theme,
search, AI-readable artifacts, local MCP tools, and Ask AI integration belong
to later plans and are not implemented in this package yet.
