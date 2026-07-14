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
`dev`, `build`, and `preview` commands. AI-readable artifacts, local MCP tools,
and Ask AI integration belong to later plans and are not implemented in this
package yet.
