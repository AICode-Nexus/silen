# Silen Design Specification

- Status: Proposed — design direction approved; document review pending
- Date: 2026-07-13
- Repository: `AICode-Nexus/silen` (planned, public)
- Package: `silen` (planned)

## 1. Summary

Silen is a lightweight, documentation-first static site generator for the React ecosystem. It combines the quiet, content-led experience associated with VitePress with React, TypeScript, Vite, MDX, Tailwind CSS, and selected shadcn/ui components.

Silen is AI-native by design. A normal build produces human-facing pages and AI-readable artifacts from the same MDX source. An optional local MCP server lets compatible agents inspect, search, validate, and—only when explicitly enabled—maintain the documentation workspace.

The product statement is:

> Silen is an AI-native documentation framework powered by React, TypeScript, Vite, and MDX.

## 2. Goals

Silen Alpha must:

1. Give React and component-library authors a VitePress-like authoring experience.
2. Produce fast static HTML that works without JavaScript for primary reading.
3. Support React components directly inside MDX.
4. Ship a polished, accessible, responsive default documentation theme.
5. Use TypeScript throughout the public and internal APIs.
6. Generate AI-readable documentation artifacts without requiring a model or API key.
7. Expose a safe local MCP interface for documentation agents.
8. Remain deployable to any static host.
9. Be usable as a public npm Alpha rather than only as a proof of concept.

## 3. Non-goals for Alpha

Silen Alpha will not provide:

- A general-purpose application framework.
- Dynamic server rendering or React Server Components.
- Dynamic route parameters or React Router data APIs.
- A hosted AI service, bundled model, or bundled vector database.
- A browser-side chat service that embeds provider credentials.
- Automatic ingestion of PDF, Word, PowerPoint, or spreadsheet files.
- Documentation versioning, full internationalization, CMS, authentication, or permissions.
- An extension marketplace or stable third-party plugin ABI.
- Islands architecture.
- Automatic scheduled rewriting of documentation.
- Knowledge-graph visualization.

## 4. Target users

The primary users are:

- React application teams that need product or developer documentation.
- React component-library and design-system authors.
- Open-source maintainers who want a small static documentation stack.
- AI-assisted engineering teams that want documentation consumable by coding agents.

## 5. Product principles

### 5.1 Content first

The interface stays visually quiet. Typography, navigation, search, code, and headings serve the document rather than compete with it.

### 5.2 Static by default

Every route is rendered to HTML at build time. Client JavaScript enhances navigation, search, theme switching, and interactive React components.

### 5.3 Ordinary files remain the source of truth

MDX, TypeScript, CSS, and standard Markdown links stay in Git. Generated indexes and caches can always be deleted and rebuilt.

### 5.4 AI capability without AI dependency

AI-readable output and deterministic indexing work without API keys. Provider-backed features are optional adapters rather than core requirements.

### 5.5 Progressive disclosure

A small site needs only `index.mdx` and a config file. Theme replacement, MCP write access, and provider integrations appear only when explicitly requested.

## 6. Technology stack

The initial implementation uses:

- TypeScript in strict mode.
- React 19.x as the initial peer baseline.
- Vite and its stable plugin and SSR APIs.
- MDX through the official Rollup/Vite integration.
- Tailwind CSS v4 through `@tailwindcss/vite`.
- Selected shadcn/ui component source.
- Radix primitives for accessible interactive components.
- CVA, `clsx`, and `tailwind-merge` for variants and class composition.
- Lucide React for icons.
- Shiki for code highlighting.
- Vitest for unit and integration tests.
- Playwright for browser behavior.

React is a peer dependency of the published package. Node.js support follows the minimum version supported by the selected stable Vite release at implementation time.

## 7. Repository and package shape

Alpha uses a single published package with subpath exports. This reduces release coordination while preserving internal boundaries.

```text
silen/
├── src/
│   ├── node/                # CLI, config, routing, Vite integration, SSG
│   ├── client/              # React app, router, contexts, runtime hooks
│   ├── theme-default/       # Default theme and selected UI source
│   ├── ai/                  # AI artifacts, index, MCP server
│   └── shared/              # Shared data structures and public types
├── playground/
│   └── basic/               # Development and end-to-end fixture
├── docs/                    # Silen's own dogfood documentation
└── tests/
    └── fixtures/            # Build fixtures
```

Planned exports:

```text
silen
silen/client
silen/theme
silen/ai
```

The theme and AI layers may become separate packages only after their APIs stabilize.

## 8. User project structure

```text
my-docs/
├── docs/
│   ├── .silen/
│   │   ├── config.ts
│   │   ├── theme.tsx        # optional
│   │   └── ai/              # generated cache, ignored by Git
│   ├── index.mdx
│   ├── guide/
│   │   └── getting-started.mdx
│   └── wiki/                # optional AI-maintained knowledge pages
└── package.json
```

The default output directory is `docs/.silen/dist`.

## 9. CLI

The primary commands are:

```bash
silen dev docs
silen build docs
silen preview docs
```

AI-aware commands are:

```bash
silen ai init docs
silen ai index docs
silen ai audit docs
silen mcp docs
silen mcp docs --allow-write
```

`ai audit` is deterministic in Alpha. It checks structure, internal links, citations, AI artifacts, and index freshness; it does not call an LLM.

## 10. Configuration API

```ts
import { defineConfig } from 'silen'

export default defineConfig({
  title: 'My Project',
  description: 'Project documentation',
  lang: 'zh-CN',
  base: '/',
  themeConfig: {
    logo: '/logo.svg',
    nav: [],
    sidebar: [],
    socialLinks: [],
    search: true
  },
  ai: {
    llmsTxt: true,
    llmsFullTxt: true,
    markdownRoutes: true,
    index: true,
    mcp: {
      enabled: true,
      write: false
    }
  },
  onBrokenLinks: 'error'
})
```

`defineConfig` returns its input and exists to provide validation and TypeScript inference.

## 11. Page model and layouts

The default theme supports three layouts:

- `doc`: styled document content with sidebar, outline, and pager.
- `home`: hero, actions, features, and optional MDX content.
- `page`: navigation plus unstyled page content.

Example homepage:

```mdx
---
layout: home
hero:
  name: Silen
  text: Quietly powerful documentation
  tagline: React, Vite and MDX in a beautifully minimal package.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/AICode-Nexus/silen
features:
  - title: React Native
    details: Use React components directly inside MDX.
  - title: Vite Fast
    details: Instant feedback and optimized static builds.
  - title: AI Ready
    details: Machine-readable output and local MCP support by default.
---
```

## 12. File routing

Routes are static and derived from files:

```text
docs/index.mdx                 -> /
docs/guide/index.mdx           -> /guide/
docs/guide/getting-started.mdx -> /guide/getting-started
docs/about.mdx                 -> /about
```

The generated virtual manifest maps normalized paths to dynamic imports:

```ts
export const routes = {
  '/': () => import('/docs/index.mdx'),
  '/guide/': () => import('/docs/guide/index.mdx'),
  '/guide/getting-started': () =>
    import('/docs/guide/getting-started.mdx')
}
```

Duplicate normalized paths are build errors. Dynamic parameters such as `[id].mdx` are not supported in Alpha.

## 13. MDX compilation

The MDX pipeline produces a React module plus serializable page data. It extracts:

- Frontmatter.
- Title and description.
- Heading hierarchy and stable heading IDs.
- Internal and external links.
- Plain text and code blocks for search and AI output.
- Previous and next page metadata.
- Source citations and backlinks where present.

MDX components are resolved from the default component map and then the user's theme component map. User components override defaults by name.

MDX is treated as trusted executable source code. Silen must not present it as a safe renderer for untrusted user submissions.

## 14. Development flow

```text
silen dev
  -> load and validate .silen/config.ts
  -> scan MDX and create virtual route/config modules
  -> start Vite with React, MDX, Tailwind, and Silen plugins
  -> SSR the initial requested route
  -> hydrate the React application in the browser
  -> let the Silen router handle later internal navigation
  -> update MDX and theme modules through Vite HMR
```

Compilation errors use Vite's development overlay. Adding or deleting a page invalidates the route manifest and triggers the smallest safe reload.

## 15. Build flow

```text
silen build
  -> validate config
  -> scan pages and detect route conflicts
  -> compile client and SSR bundles
  -> render every route to static HTML
  -> inject route CSS, JavaScript, and preload hints
  -> emit plain Markdown routes
  -> generate full-text and AI indexes
  -> generate llms.txt and llms-full.txt
  -> validate internal links and citations
  -> write docs/.silen/dist
```

Independent build work is parallelized where safe. The generated HTML contains the full primary document content before hydration.

## 16. Client runtime and router

The custom router supports only documentation-site needs:

- Same-origin link interception.
- History API navigation.
- Hash navigation.
- Scroll restoration.
- Current navigation highlighting.
- Loading state.
- Hover and keyboard-focus preloading.
- 404 fallback.
- Correct `base` handling.

It does not implement data loaders, actions, route guards, or a general nested-routing API.

State remains local by default. Site, page, route, and theme data use small React contexts. Expensive optional features such as search and Ask AI are dynamically loaded.

## 17. Default theme

### 17.1 Layout

The desktop document layout uses:

- A 64px top navigation bar.
- A 272px left sidebar.
- A reading column of approximately 720px.
- A right-side page outline.
- A maximum layout width of 1440px.

Responsive behavior:

- Below 960px, the outline is hidden and the sidebar becomes a sheet.
- Below 768px, navigation links collapse and search becomes an icon entry.
- Below 640px, the homepage hero and feature grid become single-column.

### 17.2 Visual language

- Neutral surfaces with one quiet blue-violet accent.
- Strong typographic hierarchy and restrained decoration.
- Inter for Latin text with system CJK fallbacks.
- Light separators, moderate radii, and minimal shadows.
- Purposeful motion limited to opacity and transforms.
- Full light and dark semantic token sets.
- A pre-hydration color-mode script to prevent theme flash.
- Visible keyboard focus, skip links, reduced-motion support, and accessible contrast.

### 17.3 Tailwind and shadcn/ui boundary

Tailwind CSS v4 is a build-time implementation detail and customization surface. It has no browser runtime. Silen's Vite integration scans the default theme, user theme, React components, and MDX sources.

The default theme owns selected shadcn/ui source under `src/theme-default/components/ui`. It does not install every component and does not make consumers run the shadcn CLI.

Semantic document structure remains custom and lightweight. shadcn/ui is used for interactive or reusable primitives such as:

- Button and Badge.
- Dialog and Sheet.
- Command-based search.
- Tooltip and Popover.
- Collapsible navigation.
- ScrollArea.
- Alert and Separator.
- Skeleton for deferred optional features.

Components use semantic theme tokens, composition, `data-slot`, CVA variants, `cn()`, and accessible primitive behavior. Theme code avoids raw palette utilities for component colors, manual overlay z-indexes, and ad hoc replacements for existing primitives.

Silen is not an RSC framework, so shadcn configuration uses `rsc: false`. Browser-only behavior is isolated so SSR output remains deterministic.

### 17.4 Theme extension

```tsx
// docs/.silen/theme.tsx
import DefaultTheme, { defineTheme } from 'silen/theme'
import { Demo } from './components/Demo'

export default defineTheme({
  extends: DefaultTheme,
  components: { Demo },
  wrapRoot({ children }) {
    return children
  }
})
```

Users can first override `--silen-*` semantic CSS variables, then component mappings, and finally the complete layout. A Silen shadcn registry may be added after Alpha but is not required for Alpha.

## 18. AI-native architecture

AI capability is divided into three layers so the static core remains small.

### 18.1 Layer 1: AI-readable build output

Enabled by default and requiring no model, the build emits:

```text
dist/
├── llms.txt
├── llms-full.txt
├── ai-index.json
├── sitemap.xml
└── guide/
    ├── getting-started.html
    └── getting-started.md
```

Responsibilities:

- `llms.txt` provides a concise site summary, section index, page links, and descriptions.
- `llms-full.txt` concatenates normalized documentation into a context-ready Markdown document.
- Every page has a clean `.md` representation without navigation chrome.
- `ai-index.json` contains stable chunks with route, title, heading ancestry, text, code-language metadata, and source links.
- The default theme offers Copy Markdown and Copy for AI actions.

The output follows the emerging `llms.txt` convention without treating it as a finalized web standard. Pages marked `draft: true` or `ai: false` are excluded from public AI artifacts. Generated indexes contain route-relative metadata and never include absolute local paths, environment variables, or non-public config fields.

Large sites can disable the full file or generate section-specific full-context files. Generated output must be deterministic so content changes produce reviewable diffs when users choose to retain it.

### 18.2 Layer 2: local knowledge workspace and MCP

`silen mcp <root>` starts a stdio MCP server over the local documentation workspace.

Read-only tools available by default:

- `guide`: explain workspace conventions and capabilities.
- `list`: browse routes and files.
- `search`: search page and chunk indexes.
- `read`: read a page, section, route, or source file.
- `backlinks`: list pages linking to a target.
- `citations`: inspect and validate citations.
- `build`: build or validate the site and return structured diagnostics.

Write tools are registered only with `--allow-write`:

- `write`: create or update MDX within the configured content root.
- `link`: add or repair ordinary Markdown cross-links.
- `append`: append a change-log or research note.

The MCP server never exposes arbitrary shell execution. It resolves real paths inside the content root, rejects traversal and escaping symlinks, applies file-size limits, and returns workspace-relative patches or structured change summaries. Write operations preserve ordinary MDX and standard Markdown links rather than proprietary document formats.

The optional `docs/wiki/` directory follows the LLM Wiki pattern: AI agents can accumulate concept pages, source pages, cross-links, citations, and a change log while Git remains the audit trail. `.silen/ai/` stores only rebuildable indexes and caches.

Alpha search is deterministic full-text search. Embeddings and semantic vector search are deferred until an adapter can provide them without imposing a model or database on every user.

### 18.3 Layer 3: runtime Ask AI adapter

The default theme exposes an extension point and reusable dialog components for Ask AI, but Silen does not ship a hosted endpoint.

An adapter receives the current route, selected text, and conversation messages, and returns a streamed answer with citations. Deployers can connect it to an OpenAI-compatible endpoint, an internal model gateway, a serverless function, or their own RAG service.

Provider keys must remain server-side. Silen never writes model credentials into the static client bundle. The Ask AI feature is absent from the client bundle when no adapter is configured.

## 19. Public runtime APIs

Initial public APIs are intentionally small:

```ts
import { defineConfig } from 'silen'
import {
  Link,
  useData,
  useRoute,
  useRouter
} from 'silen/client'
import DefaultTheme, { defineTheme } from 'silen/theme'
```

Public data is serializable and exposed through readonly TypeScript types. Internal build objects and Vite server objects are not part of the public contract.

## 20. Error handling

- Invalid config stops before server startup and reports the file and field.
- MDX syntax errors use the Vite overlay in development and fail builds.
- Duplicate routes fail with all conflicting files listed.
- Internal broken links fail builds by default; config can change this to `warn` or `ignore`.
- External links are not fetched during Alpha builds.
- SSR failures report the route, source file, and component stack.
- AI artifact failures identify the page and generation stage.
- MCP requests return structured errors without leaking absolute paths or secrets to remote model output.
- MCP write attempts without explicit permission are rejected.
- Malformed or stale AI indexes are rebuilt rather than partially used.

## 21. Testing strategy

### 21.1 Unit tests

Vitest covers:

- Config defaults and validation.
- File-to-route normalization.
- Frontmatter and heading extraction.
- Internal-link resolution and `base` handling.
- Client navigation and scroll state.
- AI chunk generation and stable identifiers.
- `llms.txt`, `llms-full.txt`, and Markdown serialization.
- MCP path authorization and write gating.

### 21.2 Fixture builds

Fixtures verify:

- Static HTML and hydration data.
- Route-specific JS and CSS.
- Tailwind classes from theme, MDX, and user components.
- Light and dark semantic tokens.
- 404 output.
- Subpath deployment.
- Search and AI indexes.
- Citations, backlinks, and broken-link behavior.

### 21.3 Browser tests

Playwright covers:

- Client navigation and hash behavior.
- Search keyboard workflow.
- Mobile navigation sheet.
- Color mode and no-flash behavior.
- Copy code, Copy Markdown, and Copy for AI actions.
- Keyboard navigation, focus restoration, and reduced motion.
- Hydration without console errors.

### 21.4 Package smoke test

CI packs `silen` into a tarball, installs it into a clean fixture, and runs:

```text
dev -> build -> preview
```

The smoke test verifies that no undeclared workspace dependency is required.

## 22. Alpha feature boundary

Alpha includes:

- React, TypeScript, Vite, and MDX core.
- Static file routing, SSR build, hydration, and client navigation.
- Default VitePress-inspired theme.
- Tailwind CSS v4 and selected shadcn/ui source.
- Responsive navigation, outline, dark mode, and local search.
- Code highlighting, anchors, code copy, 404, and subpath deployment.
- Custom theme entry and MDX component mapping.
- Internal-link validation.
- `llms.txt`, `llms-full.txt`, per-page Markdown, and `ai-index.json`.
- Copy Markdown and Copy for AI actions.
- Local MCP read, search, build, backlink, and citation tools.
- Explicitly gated MCP write, link, and append tools.
- Optional `docs/wiki/` knowledge workspace.
- A provider-neutral runtime Ask AI extension contract without a hosted implementation.

## 23. Acceptance criteria

The Alpha is ready for public npm publication when:

1. A clean project can install `silen`, run the three primary commands, and deploy the result as static files.
2. Initial HTML contains readable document content before JavaScript executes.
3. MDX can import and render typed React components in development and production.
4. The default theme works at desktop and mobile widths, in light and dark mode, with keyboard navigation.
5. Search, routing, 404, anchors, and `base` pass browser tests.
6. Tailwind styles from Silen and user MDX are included without requiring a user Tailwind configuration.
7. `llms.txt`, `llms-full.txt`, per-page Markdown, and `ai-index.json` are correct and link to canonical routes.
8. An MCP client can list, search, read, and validate the site without write permission.
9. MCP write tools are unavailable by default and cannot escape the configured content root when enabled.
10. A packed npm tarball passes the clean-install smoke test.
11. Silen's own documentation is built by Silen.

## 24. Follow-up decisions for implementation planning

The implementation plan must pin:

- Exact stable dependency versions and supported Node.js versions.
- The initial shadcn base/preset and exact component inventory.
- Search implementation details and index format versioning.
- MCP SDK choice and tool schemas.
- Package size and client JavaScript budgets.
- npm name availability immediately before publication.
- GitHub branch protection, release automation, and prerelease versioning.

These are implementation details and do not change the approved product architecture.

## 25. References

- [Vite plugin API](https://vite.dev/guide/api-plugin)
- [Vite SSR guide](https://main.vite.dev/guide/ssr)
- [MDX Rollup/Vite integration](https://mdxjs.com/packages/rollup/)
- [React server rendering](https://react.dev/reference/react-dom/server/renderToString)
- [Tailwind CSS with Vite](https://tailwindcss.com/docs/installation/using-vite)
- [shadcn/ui with Vite](https://ui.shadcn.com/docs/installation/vite)
- [shadcn/ui Tailwind v4 support](https://ui.shadcn.com/docs/tailwind-v4)
- [VitePress default theme layouts](https://vitepress.dev/reference/default-theme-layout)
- [VitePress default home page](https://vitepress.dev/reference/default-theme-home-page)
- [VitePress theme extension](https://vitepress.dev/guide/extending-default-theme)
- [llms.txt proposal](https://llmstxt.org/)
- [Chrome Lighthouse llms.txt audit](https://developer.chrome.com/docs/lighthouse/agentic-browsing/llms-txt)
- [LLMWiki reference implementation](https://github.com/lucasastorian/llmwiki)
