# Silen

Silen is a lightweight, documentation-first static site generator powered by
React, TypeScript, Vite, and MDX. Core Alpha turns trusted MDX project files
into complete static HTML with client-side navigation.

**Website:** https://aicode-nexus.github.io/silen/

## Requirements and installation

Silen supports Node.js `^20.19.0 || >=22.12.0` and pnpm `10.34.0`. React
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
│   ├── config.ts
│   └── theme.tsx        # optional default-theme extension
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

## AI-readable build output

Every build produces deterministic AI-readable files without calling a model
or requiring an API key. With `base: '/handbook/'`, the public URLs are
`/handbook/llms.txt`, `/handbook/llms-full.txt`,
`/handbook/ai-index.json`, and one clean Markdown URL per page, such as
`/handbook/index.md`, `/handbook/guide/index.md`, or
`/handbook/about.md`. Copy Markdown and Copy for AI use those same files.

`llms.txt` is an emerging convention, not a finalized web standard. Pages with
`draft: true` or `ai: false` frontmatter are excluded from every public AI
artifact. Each output can be disabled independently; all four switches default
to `true`:

```ts
export default defineConfig({
  ai: {
    llmsTxt: true,
    llmsFullTxt: true,
    markdownRoutes: true,
    index: true,
  },
})
```

## Local AI workspace and MCP

The workspace commands are deterministic and model-free:

```sh
pnpm silen ai init docs
pnpm silen ai index docs
pnpm silen ai audit docs
```

`ai init` creates `wiki/` and the ignored `.silen/ai/` cache without changing
existing MDX. `ai index` rebuilds the local search index. `ai audit` checks
links, citations, generated artifacts, and index freshness, and exits nonzero
when it finds an issue.

Configure an MCP client from the repository root like this:

```json
{
  "mcpServers": {
    "silen": {
      "command": "pnpm",
      "args": ["silen", "mcp", "docs"]
    }
  }
}
```

The default server registers exactly seven read-only tools: `guide`, `list`,
`search`, `read`, `backlinks`, `citations`, and `build`. The `build` tool is a
safe preflight: it reads bounded Markdown inputs and existing artifacts, but
does not load project config, execute MDX, invoke Vite, or write files.

Write tools do not exist unless the process is started explicitly with
`pnpm silen mcp docs --allow-write`. That flag adds exactly three tools:
`write`, `link`, and `append`. They can change content, so grant this permission
only to a trusted local client and review its Git diff. Writes accept only
workspace-relative `.md` or `.mdx` paths, reject traversal and escaping
symlinks, use atomic replacement, and enforce a 2 MiB UTF-8 limit. MCP never
offers arbitrary shell execution.

## Ask AI endpoint

Ask AI is an optional endpoint-only integration. Public configuration contains
only the endpoint URL:

```ts
export default defineConfig({
  themeConfig: {
    ai: { endpoint: '/api/ask' },
  },
})
```

Silen sends an HTTP `POST` with this JSON shape:

```json
{
  "route": "/guide/",
  "selectedText": "optional selected text",
  "messages": [{ "role": "user", "content": "How do I install it?" }]
}
```

The server responds with `Content-Type: application/x-ndjson`, one event per
line. This is a complete valid response:

```ndjson
{"type":"text","value":"Install with pnpm."}
{"type":"citation","title":"Installation guide","url":"/guide/"}
```

The accepted event types are `text`, `citation`, and `error`. Citations become
links only for safe site-relative or HTTP(S) URLs; unsafe URLs render as plain
text. Provider keys stay on the server—never put credentials, provider headers,
or raw upstream errors in `.silen/config.ts` or an NDJSON response. With no
endpoint, no Ask AI button or client bundle is emitted.

## Default theme and layouts

The built-in theme provides a responsive navigation shell, local search,
light/dark/system appearance, Shiki code highlighting and copy controls,
document outlines, sidebars, home-page heroes and features, page navigation,
and a complete 404 screen.

Select a content layout in frontmatter:

```md
---
layout: home
---
```

- `doc` is the default and adds documentation typography plus previous/next
  links from `themeConfig.sidebar`.
- `home` renders the configured or frontmatter-defined hero and features in a
  full-width shell.
- `page` keeps the document shell but uses a neutral article layout without
  documentation paging.

At widths below `60rem` (960px), the desktop sidebar becomes a modal navigation
Sheet. At 960px and above, the persistent documentation sidebar and outline are
shown.

Add locale roots to show a language switcher that preserves the current page:

```ts
export default defineConfig({
  lang: 'en-US',
  themeConfig: {
    locales: [
      { lang: 'en-US', label: 'English', root: '/' },
      { lang: 'zh-CN', label: '中文', root: '/zh/' },
    ],
  },
})
```

With that configuration, `/guide/` switches to `/zh/guide/`, and `/zh/ai/`
switches back to `/ai/`. Pages can set `lang` in frontmatter when a route uses a
different language from the site default.

## Theme tokens

Override semantic CSS variables instead of internal utility classes. Import
the override from `docs/.silen/theme.tsx` so Vite includes it:

```css
/* docs/.silen/custom.css */
:root {
  --silen-primary: oklch(0.58 0.2 250);
  --silen-radius: 0.5rem;
  --silen-content-width: 48rem;
}

.dark {
  --silen-primary: oklch(0.75 0.14 250);
}
```

The color tokens are `--silen-background`, `--silen-foreground`,
`--silen-primary`, `--silen-primary-foreground`, `--silen-muted`,
`--silen-muted-foreground`, `--silen-border`, and `--silen-ring`. Shape and
layout tokens are `--silen-radius`, `--silen-nav-height`,
`--silen-sidebar-width`, `--silen-content-width`, and `--silen-layout-width`.
Light values live on `:root`; dark overrides live on `.dark`.

## Extending the default theme

Create `docs/.silen/theme.tsx`:

```tsx
import type { ReactNode } from 'react'
import DefaultTheme, { defineTheme } from 'silen/theme'
import './custom.css'

function Demo({ children }: { readonly children?: ReactNode }) {
  return <section className="demo">{children}</section>
}

export default defineTheme({
  extends: DefaultTheme,
  components: { Demo },
  wrapRoot({ children }) {
    return <div data-site-root="">{children}</div>
  },
})
```

`extends` inherits the base `Layout` and merges `layouts` and MDX `components`
by key, so an extension can replace one entry without copying the rest.
`NotFound` is inherited unless explicitly replaced. `wrapRoot` runs during both
server rendering and hydration; when a base theme also has a wrapper, the
extension wrapper is composed outside it. A theme definition cannot extend
itself recursively.

Use custom components directly from trusted MDX:

```mdx
<Demo>Rendered through the project theme.</Demo>
```

The same `silen/theme` runtime and declarations are included in the packed
package, so theme files type-check and build without source aliases.

## Accessibility and keyboard behavior

The default shell includes a skip link and visible focus indicators. Mobile
navigation is a labelled modal Sheet: opening moves focus into the active
navigation item, Escape closes it, and focus returns to the trigger. Search is
loaded only when requested, opens with `Control+K` or `Command+K`, supports
arrow-key selection and Enter, and restores focus when dismissed.

The appearance control cycles system, light, and dark, persists the selection
in `localStorage`, follows operating-system changes in system mode, and applies
the stored mode from an inline head script before hydration to avoid a color
flash. Code-copy controls are keyboard buttons with live success/failure
labels. Reduced-motion preferences disable nonessential transitions.

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
the responsive extensible default theme, local documentation search, and the
`dev`, `build`, and `preview` commands. It also includes deterministic AI
artifacts, the permission-gated local MCP workspace, and optional endpoint-only
Ask AI integration.
