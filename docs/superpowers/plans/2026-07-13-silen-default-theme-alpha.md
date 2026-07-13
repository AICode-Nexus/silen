# Silen Default Theme Alpha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a polished VitePress-inspired documentation theme built with Tailwind CSS v4, selected shadcn/ui source, and accessible React components.

**Architecture:** The Core plan supplies route, page, and theme contracts. Static layout and document markup stay small and semantic; shadcn/ui source is used only for interactive primitives such as search, sheets, collapsibles, and tooltips. Semantic CSS variables isolate the visual system from component implementation and allow user overrides without a Tailwind config.

**Tech Stack:** React 19.2.7, Tailwind CSS 4.3.2, `@tailwindcss/vite` 4.3.2, shadcn CLI 4.13.0 with `radix-nova`, radix-ui 1.6.2, CVA 0.7.1, clsx 2.1.1, tailwind-merge 3.6.0, Lucide React 1.24.0, Shiki 4.3.1, MiniSearch 7.2.0, Playwright 1.61.1.

## Global Constraints

- Execute only after `2026-07-13-silen-core-alpha.md` passes its complete quality gate.
- Keep initial HTML readable and structurally complete before JavaScript executes.
- Use Tailwind v4 semantic tokens; component color and typography must not depend on raw palette utilities.
- Use shadcn components as owned source under `src/theme-default/components/ui`; consumers do not run the shadcn CLI.
- Use `rsc: false`, Radix primitives, Lucide icons, and the `radix-nova` preset.
- Use `gap-*`, `size-*`, `cn()`, component variants, complete Card composition, and titled Dialog/Sheet structures.
- The desktop shell is 64px navigation, 272px sidebar, approximately 720px reading width, and at most 1440px overall.
- At widths below 960px, use a sidebar Sheet; below 768px collapse navigation; below 640px use a single-column home layout.
- Respect reduced motion, keyboard navigation, focus restoration, skip links, and accessible contrast.
- Optional search code must be dynamically imported.

---

## File map

```text
components.json                                   shadcn CLI source ownership config
src/theme-default/styles/index.css                Tailwind import, sources, and layers
src/theme-default/styles/tokens.css               Light/dark semantic variables
src/theme-default/lib/cn.ts                       Class composition helper
src/theme-default/components/ui/                  Selected generated shadcn source
src/theme-default/components/layout.tsx           Nav/sidebar/content/outline shell
src/theme-default/components/nav.tsx              Brand, links, search, appearance
src/theme-default/components/sidebar.tsx          Desktop and Sheet navigation
src/theme-default/components/outline.tsx          Current-page headings
src/theme-default/components/doc.tsx              Document content and pager
src/theme-default/components/home.tsx             Hero and feature grid
src/theme-default/components/search.tsx           Lazy command search UI
src/theme-default/components/appearance.tsx       Color-mode control
src/theme-default/components/code-copy.tsx        Delegated copy interaction
src/theme-default/components/not-found.tsx        404 screen
src/node/highlight.ts                              Shared Shiki highlighter
src/theme-default/index.tsx                       Default theme export and component map
src/theme-default/search.ts                       MiniSearch client index loader
src/node/search.ts                                Build-time search document generation
tests/theme/*.test.tsx                            Component behavior tests
tests/theme/search.test.ts                        Search indexing tests
tests/e2e/theme.spec.ts                           Playwright theme workflow
```

### Task 1: Establish Tailwind and semantic theme tokens

**Files:**
- Create: `components.json`
- Create: `src/theme-default/styles/index.css`
- Create: `src/theme-default/styles/tokens.css`
- Create: `src/theme-default/lib/cn.ts`
- Modify: `src/node/plugin.ts`
- Modify: `package.json`
- Create: `tests/theme/tokens.test.ts`

**Interfaces:**
- Produces semantic variables `--silen-background`, `--silen-foreground`, `--silen-primary`, `--silen-muted`, `--silen-border`, layout sizes, radii, and focus ring.
- Produces `cn(...inputs: ClassValue[]): string`.

- [ ] **Step 1: Write the failing token contract test**

```ts
// tests/theme/tokens.test.ts
import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'

it('defines complete light and dark semantic tokens', async () => {
  const css = await readFile('src/theme-default/styles/tokens.css', 'utf8')
  for (const token of ['background', 'foreground', 'primary', 'muted', 'border', 'ring']) {
    expect(css).toContain(`--silen-${token}:`)
  }
  expect(css).toContain('.dark')
})
```

- [ ] **Step 2: Add pinned Tailwind and component dependencies**

Run: `corepack pnpm add tailwindcss@4.3.2 @tailwindcss/vite@4.3.2 radix-ui@1.6.2 class-variance-authority@0.7.1 clsx@2.1.1 tailwind-merge@3.6.0 lucide-react@1.24.0 tw-animate-css@1.4.0 shiki@4.3.1 minisearch@7.2.0 @fontsource-variable/inter@5.2.8`
Expected: package manifest and lockfile change without peer warnings.

Create the explicit official-registry configuration:

```json
// components.json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/theme-default/styles/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/theme-default/components",
    "ui": "@/theme-default/components/ui",
    "lib": "@/theme-default/lib",
    "utils": "@/theme-default/lib/cn",
    "hooks": "@/theme-default/hooks"
  }
}
```

- [ ] **Step 3: Implement tokens and Tailwind mapping**

```css
/* src/theme-default/styles/tokens.css */
:root {
  --silen-background: oklch(1 0 0);
  --silen-foreground: oklch(0.24 0.01 285);
  --silen-primary: oklch(0.58 0.19 275);
  --silen-primary-foreground: oklch(0.99 0 0);
  --silen-muted: oklch(0.97 0.004 285);
  --silen-muted-foreground: oklch(0.51 0.012 285);
  --silen-border: oklch(0.91 0.006 285);
  --silen-ring: var(--silen-primary);
  --silen-radius: 0.75rem;
  --silen-nav-height: 4rem;
  --silen-sidebar-width: 17rem;
  --silen-content-width: 45rem;
  --silen-layout-width: 90rem;
}
.dark {
  --silen-background: oklch(0.17 0.008 285);
  --silen-foreground: oklch(0.92 0.006 285);
  --silen-primary: oklch(0.72 0.15 275);
  --silen-primary-foreground: oklch(0.17 0.008 285);
  --silen-muted: oklch(0.22 0.01 285);
  --silen-muted-foreground: oklch(0.68 0.012 285);
  --silen-border: oklch(0.29 0.01 285);
  --silen-ring: var(--silen-primary);
}
```

```css
/* src/theme-default/styles/index.css */
@import "tailwindcss";
@import "tw-animate-css";
@import "@fontsource-variable/inter";
@import "./tokens.css";
@source "../**/*.{ts,tsx}";

@theme inline {
  --color-background: var(--silen-background);
  --color-foreground: var(--silen-foreground);
  --color-primary: var(--silen-primary);
  --color-primary-foreground: var(--silen-primary-foreground);
  --color-muted: var(--silen-muted);
  --color-muted-foreground: var(--silen-muted-foreground);
  --color-border: var(--silen-border);
  --color-ring: var(--silen-ring);
  --radius-lg: var(--silen-radius);
  --font-sans: "Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
```

- [ ] **Step 4: Add `tailwindcss()` after React and before Silen plugins, then verify**

Run: `corepack pnpm test tests/theme/tokens.test.ts && corepack pnpm build`
Expected: token test passes and compiled theme CSS contains semantic utilities.

- [ ] **Step 5: Commit**

```bash
git add components.json package.json pnpm-lock.yaml src/node/plugin.ts src/theme-default/styles src/theme-default/lib tests/theme/tokens.test.ts
git commit -m "feat(theme): establish semantic design tokens"
```

### Task 2: Import and audit the selected shadcn primitives

**Files:**
- Create: `src/theme-default/components/ui/button.tsx`
- Create: `src/theme-default/components/ui/card.tsx`
- Create: `src/theme-default/components/ui/badge.tsx`
- Create: `src/theme-default/components/ui/dialog.tsx`
- Create: `src/theme-default/components/ui/sheet.tsx`
- Create: `src/theme-default/components/ui/command.tsx`
- Create: `src/theme-default/components/ui/tooltip.tsx`
- Create: `src/theme-default/components/ui/collapsible.tsx`
- Create: `src/theme-default/components/ui/scroll-area.tsx`
- Create: `src/theme-default/components/ui/alert.tsx`
- Create: `src/theme-default/components/ui/separator.tsx`
- Create: `src/theme-default/components/ui/skeleton.tsx`
- Create: `tests/theme/primitives.test.tsx`

**Interfaces:**
- Produces the named shadcn primitives using `@/theme-default/lib/cn` and `data-slot` attributes.

- [ ] **Step 1: Fetch current component documentation before generating source**

Run: `corepack pnpm dlx shadcn@4.13.0 docs button card badge dialog sheet command tooltip collapsible scroll-area alert separator skeleton`
Expected: official documentation and example URLs are printed for all selected components.

- [ ] **Step 2: Preview and add only the selected registry items**

Run: `corepack pnpm dlx shadcn@4.13.0 add @shadcn/button @shadcn/card @shadcn/badge @shadcn/dialog @shadcn/sheet @shadcn/command @shadcn/tooltip @shadcn/collapsible @shadcn/scroll-area @shadcn/alert @shadcn/separator @shadcn/skeleton --dry-run`
Expected: the preview lists only theme component files and required dependencies.

Run: `corepack pnpm dlx shadcn@4.13.0 add @shadcn/button @shadcn/card @shadcn/badge @shadcn/dialog @shadcn/sheet @shadcn/command @shadcn/tooltip @shadcn/collapsible @shadcn/scroll-area @shadcn/alert @shadcn/separator @shadcn/skeleton`
Expected: source files are created under `src/theme-default/components/ui`.

- [ ] **Step 3: Add composition and accessibility tests**

```tsx
// tests/theme/primitives.test.tsx
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '../../src/theme-default/components/ui/sheet'

it('gives the mobile navigation sheet an accessible title', () => {
  render(<Sheet defaultOpen><SheetTrigger>Menu</SheetTrigger><SheetContent><SheetTitle>Documentation navigation</SheetTitle></SheetContent></Sheet>)
  expect(screen.getByRole('dialog', { name: 'Documentation navigation' })).toBeVisible()
})
```

- [ ] **Step 4: Audit generated code against the shadcn skill rules and verify**

Run: `corepack pnpm test tests/theme/primitives.test.tsx && corepack pnpm lint`
Expected: every overlay has a title, item components use their groups, icons are not manually sized inside controls, and tests pass.

- [ ] **Step 5: Commit**

```bash
git add components.json package.json pnpm-lock.yaml src/theme-default/components/ui tests/theme/primitives.test.tsx
git commit -m "feat(theme): add accessible UI primitives"
```

### Task 3: Build the responsive documentation shell

**Files:**
- Create: `src/theme-default/components/layout.tsx`
- Create: `src/theme-default/components/nav.tsx`
- Create: `src/theme-default/components/sidebar.tsx`
- Create: `src/theme-default/components/outline.tsx`
- Create: `src/theme-default/components/appearance.tsx`
- Create: `tests/theme/layout.test.tsx`

**Interfaces:**
- Consumes: Core `useData`, `useRoute`, `Link`, `Heading`, and theme config types.
- Produces: `Layout({ children }: { children: ReactNode })` and `AppearanceSwitch`.

- [ ] **Step 1: Write failing landmark and active-navigation tests**

```tsx
// tests/theme/layout.test.tsx
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { TestSiteProvider } from '../helpers/test-site-provider'
import { Layout } from '../../src/theme-default/components/layout'

it('renders skip link, navigation, sidebar, main content, and outline', () => {
  render(<TestSiteProvider path="/guide/"><Layout><h1>Guide</h1></Layout></TestSiteProvider>)
  expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content')
  expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  expect(screen.getByRole('main')).toHaveTextContent('Guide')
  expect(screen.getByRole('link', { name: 'Guide' })).toHaveAttribute('aria-current', 'page')
})
```

- [ ] **Step 2: Implement the semantic shell**

```tsx
// src/theme-default/components/layout.tsx
import type { ReactNode } from 'react'
import { Nav } from './nav'
import { Sidebar } from './sidebar'
import { Outline } from './outline'

export function Layout({ children }: { children: ReactNode }) {
  return <div className="min-h-svh bg-background text-foreground">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:m-4 focus:rounded-md focus:bg-background focus:p-3">Skip to content</a>
    <Nav />
    <div className="mx-auto grid max-w-[var(--silen-layout-width)] lg:grid-cols-[var(--silen-sidebar-width)_minmax(0,1fr)] xl:grid-cols-[var(--silen-sidebar-width)_minmax(0,1fr)_14rem]">
      <Sidebar />
      <main id="main-content" className="min-w-0 px-6 py-10 lg:px-10">{children}</main>
      <Outline />
    </div>
  </div>
}
```

- [ ] **Step 3: Implement color mode before paint and the accessible toggle**

```ts
export const appearanceScript = `(function(){var v=localStorage.getItem('silen-theme');var d=v==='dark'||(!v&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'})()`
```

- [ ] **Step 4: Verify desktop/mobile structure and hydration stability**

Run: `corepack pnpm test tests/theme/layout.test.tsx tests/theme/appearance.test.tsx`
Expected: landmarks, active links, Sheet title/focus, saved/system color mode, and SSR/client markup tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/theme-default/components src/node/render.ts tests/theme/layout.test.tsx tests/theme/appearance.test.tsx tests/helpers
git commit -m "feat(theme): add responsive documentation layout"
```

### Task 4: Style documents, code, home, pager, and 404

**Files:**
- Create: `src/theme-default/components/doc.tsx`
- Create: `src/theme-default/components/home.tsx`
- Create: `src/theme-default/components/code-copy.tsx`
- Create: `src/theme-default/components/not-found.tsx`
- Create: `src/theme-default/styles/document.css`
- Create: `src/node/highlight.ts`
- Modify: `src/node/mdx.ts`
- Modify: `src/theme-default/index.tsx`
- Create: `tests/theme/content.test.tsx`

**Interfaces:**
- Produces `DocLayout`, `HomeLayout`, `NotFound`, and the MDX component map.
- Consumes Core `frontmatter.layout`, headings, page links, and rendered Shiki markup.

- [ ] **Step 1: Write failing layout-selection and copy tests**

```tsx
// tests/theme/content.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import DefaultTheme from '../../src/theme-default'

it('exposes doc, home, page, and 404 layouts', () => {
  expect(Object.keys(DefaultTheme.layouts)).toEqual(['doc', 'home', 'page'])
  expect(DefaultTheme.NotFound).toBeTypeOf('function')
})

it('copies a delegated code block', async () => {
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  render(<DefaultTheme.components.CodeBlock code="pnpm add silen" language="sh" />)
  await userEvent.click(screen.getByRole('button', { name: 'Copy code' }))
  expect(writeText).toHaveBeenCalledWith('pnpm add silen')
})
```

- [ ] **Step 2: Implement layouts with complete Card and Button composition**

```tsx
export function HomeLayout({ hero, features, children }: HomeProps) {
  return <div className="mx-auto flex max-w-[var(--silen-layout-width)] flex-col gap-16 px-6 py-20 lg:px-10">
    <section className="grid items-center gap-12 lg:grid-cols-2">
      <div className="flex flex-col gap-6"><h1 className="text-balance text-5xl font-semibold tracking-tight">{hero.name}</h1><p className="text-xl text-muted-foreground">{hero.tagline}</p><HeroActions actions={hero.actions} /></div>
      {hero.image ? <HeroImage image={hero.image} /> : null}
    </section>
    <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{features.map(feature => <FeatureCard key={feature.title} feature={feature} />)}</section>
    {children}
  </div>
}
```

- [ ] **Step 3: Add delegated code-copy behavior without per-block hydration roots**

```ts
// src/node/highlight.ts
import { createHighlighter, type Highlighter } from 'shiki'

let highlighter: Promise<Highlighter> | undefined
export async function highlightCode(code: string, language: string): Promise<string> {
  highlighter ??= createHighlighter({ themes: ['github-light', 'github-dark'], langs: ['bash', 'css', 'html', 'javascript', 'json', 'jsx', 'markdown', 'tsx', 'typescript'] })
  const instance = await highlighter
  const lang = instance.getLoadedLanguages().includes(language) ? language : 'text'
  return instance.codeToHtml(code, { lang, themes: { light: 'github-light', dark: 'github-dark' } })
}
```

Wire `highlightCode` into the MDX code-node transform, add the source language as metadata, and leave copy behavior delegated to one hydrated document listener.

Run: `corepack pnpm test tests/theme/content.test.tsx`
Expected: layout selection, hero actions, semantic cards, pager, 404, Shiki tokens, and copy state tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/theme-default/components src/theme-default/styles/document.css src/theme-default/index.tsx tests/theme/content.test.tsx
git commit -m "feat(theme): style documentation and home pages"
```

### Task 5: Add build-time local search and lazy command UI

**Files:**
- Create: `src/node/search.ts`
- Create: `src/theme-default/search.ts`
- Create: `src/theme-default/components/search.tsx`
- Modify: `src/node/build.ts`
- Modify: `src/theme-default/components/nav.tsx`
- Create: `tests/theme/search.test.ts`

**Interfaces:**
- Produces: `createSearchIndex(documents: SearchDocument[]): SerializedSearchIndex`, `querySearchIndex(index, query): SearchResult[]`, and emitted `search-index.json`.
- Produces: lazy `SearchDialog` loaded only after click or `Meta/Ctrl+K`.
- Produces: `SearchResult` as `{ id: string; title: string; route: string; snippet: string; heading?: string }`.

- [ ] **Step 1: Write failing index and ranking tests**

```ts
// tests/theme/search.test.ts
import { expect, it } from 'vitest'
import { createSearchIndex, querySearchIndex } from '../../src/node/search'

it('ranks title matches above body-only matches', () => {
  const index = createSearchIndex([
    { id: '/config', title: 'Configuration', text: 'Site options', route: '/config' },
    { id: '/intro', title: 'Introduction', text: 'Configuration overview', route: '/intro' }
  ])
  expect(querySearchIndex(index, 'configuration')[0]?.route).toBe('/config')
})
```

- [ ] **Step 2: Generate and serialize MiniSearch with stable fields**

```ts
const miniSearch = new MiniSearch<SearchDocument>({ fields: ['title', 'headings', 'text'], storeFields: ['title', 'route', 'heading'], searchOptions: { boost: { title: 4, headings: 2 }, prefix: true, fuzzy: 0.2 } })
```

- [ ] **Step 3: Implement a titled Command Dialog with keyboard navigation and highlighted snippets**

```tsx
// src/theme-default/components/search.tsx
import { useEffect, useState } from 'react'
import { useRouter } from 'silen/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command'
import { search, type SearchResult } from '../search'

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  useEffect(() => { if (query) void search(query).then(setResults); else setResults([]) }, [query])
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent aria-describedby={undefined}>
      <DialogHeader><DialogTitle>Search documentation</DialogTitle></DialogHeader>
      <Command shouldFilter={false}>
        <CommandInput value={query} onValueChange={setQuery} placeholder="Search documentation" />
        <CommandList><CommandEmpty>No results found.</CommandEmpty><CommandGroup heading="Documentation">
          {results.map(result => <CommandItem key={result.id} value={result.id} onSelect={() => void router.go(result.route)}><span>{result.title}</span><span className="text-muted-foreground">{result.snippet}</span></CommandItem>)}
        </CommandGroup></CommandList>
      </Command>
    </DialogContent>
  </Dialog>
}
```

Run: `corepack pnpm test tests/theme/search.test.ts tests/theme/search-ui.test.tsx`
Expected: deterministic index, title ranking, empty state, keyboard selection, focus restoration, and route navigation pass.

- [ ] **Step 4: Commit**

```bash
git add src/node/search.ts src/node/build.ts src/theme-default/search.ts src/theme-default/components/search.tsx src/theme-default/components/nav.tsx tests/theme/search.test.ts tests/theme/search-ui.test.tsx
git commit -m "feat(search): add lazy local documentation search"
```

### Task 6: Verify accessibility, responsiveness, and theme extension

**Files:**
- Modify: `src/theme-default/index.tsx`
- Create: `tests/e2e/theme.spec.ts`
- Create: `tests/fixtures/basic/.silen/theme.tsx`
- Modify: `README.md`

**Interfaces:**
- Produces `defineTheme`, `DefaultTheme`, CSS-variable customization, component override, `wrapRoot`, and complete browser acceptance coverage.

- [ ] **Step 1: Add the custom-theme fixture**

```tsx
// tests/fixtures/basic/.silen/theme.tsx
import DefaultTheme, { defineTheme } from 'silen/theme'

export default defineTheme({
  extends: DefaultTheme,
  components: { Demo: ({ children }) => <section data-demo>{children}</section> },
  wrapRoot({ children }) { return <div data-custom-root>{children}</div> }
})
```

- [ ] **Step 2: Add Playwright acceptance tests**

```ts
// tests/e2e/theme.spec.ts
import { expect, test } from '@playwright/test'

test('supports mobile navigation, search, and appearance', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.getByRole('dialog', { name: 'Documentation navigation' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Meta+k')
  await expect(page.getByRole('dialog', { name: 'Search documentation' })).toBeVisible()
})
```

- [ ] **Step 3: Document tokens, theme extension, layouts, and accessibility behavior**

Run: `corepack pnpm test && corepack pnpm exec playwright test tests/e2e/theme.spec.ts && corepack pnpm build`
Expected: unit and browser suites pass at desktop/mobile widths with no hydration or accessibility console errors.

- [ ] **Step 4: Commit**

```bash
git add src/theme-default/index.tsx tests/e2e/theme.spec.ts tests/fixtures/basic/.silen/theme.tsx README.md
git commit -m "test(theme): verify the default documentation experience"
```
