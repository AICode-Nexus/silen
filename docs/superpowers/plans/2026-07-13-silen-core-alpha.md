# Silen Core Alpha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a publishable `silen` package that turns typed React MDX files into a statically rendered site with Vite-powered development, hydration, client navigation, build, and preview commands.

**Architecture:** One package exposes Node, client, and theme subpaths. The Node layer scans files, compiles MDX through Vite, creates virtual route/config modules, and renders every route to HTML; the client layer hydrates that HTML and owns only documentation-oriented navigation. Theme and AI features consume the stable page, route, and build interfaces defined here.

**Tech Stack:** TypeScript 7.0.2, React 19.2.7, Vite 8.1.4, MDX 3.1.1, CAC 7.0.0, fast-glob 3.3.3, Zod 4.4.3, tsup 8.5.1, Vitest 4.1.10, Playwright 1.61.1, pnpm 11.12.0.

## Global Constraints

- Package name is `silen`; public Node entry is `silen`, browser entry is `silen/client`, and theme entry is `silen/theme`.
- Support Node.js `^20.19.0 || >=22.12.0` and pnpm `11.12.0`.
- Compile all source with TypeScript strict mode; do not add JavaScript source files.
- React `19.2.7` and React DOM `19.2.7` are peer dependencies.
- Initial HTML must contain the complete primary document before hydration.
- MDX is trusted executable project source, never an untrusted-content sandbox.
- Alpha supports static file routes only; no dynamic parameters, loaders, actions, or route guards.
- Default output is `<root>/.silen/dist`; all paths must respect `base`.
- Use TDD, keep every commit focused, and run the named verification command before each commit.

---

## File map

```text
package.json                         Package metadata, scripts, exports, dependencies
tsconfig.json                        Strict shared TypeScript config
tsup.config.ts                       Node and client package bundles
vitest.config.ts                     Unit and fixture-test configuration
eslint.config.ts                     Type-aware linting
.prettierrc.json                     Formatting rules
.gitignore                           Generated and local-only files
src/index.ts                         defineConfig and public Node exports
src/shared/config.ts                 Public config and resolved-config types
src/shared/page.ts                   Page, heading, route, and manifest types
src/node/config.ts                   Config discovery, validation, and loading
src/node/routes.ts                   File scanning and route normalization
src/node/mdx.ts                      Frontmatter and MDX metadata extraction
src/node/virtual.ts                  Vite virtual-module source generation
src/node/plugin.ts                   Silen Vite plugin
src/node/render.ts                   React SSR entry and HTML document assembly
src/node/build.ts                    Client/SSR builds and per-route generation
src/node/server.ts                   Dev and preview server orchestration
src/node/cli.ts                      CAC commands and diagnostics
src/client/index.ts                  Public client exports
src/client/app.tsx                   Root providers and page rendering
src/client/router.tsx                Documentation router and navigation state
src/client/entry.tsx                 Browser hydration entry
src/client/ssr-entry.tsx             SSR module consumed by the build
src/theme-default/index.tsx          Minimal theme contract used before Theme plan
src/ai/index.ts                      Empty stable AI subpath extended by the AI plan
tests/config.test.ts                 Config behavior
tests/routes.test.ts                 Route behavior
tests/mdx.test.ts                    Metadata extraction
tests/router.test.tsx                Client navigation behavior
tests/build.test.ts                  Static build fixture
tests/cli.test.ts                    CLI smoke behavior
tests/fixtures/basic/                Minimal dogfood fixture
```

### Task 1: Bootstrap the publishable package

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `vitest.config.ts`
- Create: `eslint.config.ts`
- Create: `.prettierrc.json`
- Create: `.gitignore`
- Create: `LICENSE`
- Create: `src/index.ts`
- Create: `src/ai/index.ts`
- Create: `src/client/index.ts`
- Create: `src/theme-default/index.tsx`
- Create: `tests/package.test.ts`

**Interfaces:**
- Produces: package scripts `build`, `test`, `typecheck`, `lint`, `format:check`; `defineConfig<T extends UserConfig>(config: T): T`.

- [ ] **Step 1: Write the failing package contract test**

```ts
// tests/package.test.ts
import { describe, expect, it } from 'vitest'
import { defineConfig } from '../src/index'

describe('public package contract', () => {
  it('returns typed configuration unchanged', () => {
    const config = defineConfig({ title: 'Docs', base: '/project/' })
    expect(config).toEqual({ title: 'Docs', base: '/project/' })
  })
})
```

- [ ] **Step 2: Create the package/tooling files and install the pinned dependency set**

```json
// package.json
{
  "name": "silen",
  "version": "0.1.0-alpha.0",
  "type": "module",
  "packageManager": "pnpm@11.12.0",
  "engines": { "node": "^20.19.0 || >=22.12.0" },
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./client": { "types": "./dist/client/index.d.ts", "import": "./dist/client/index.js" },
    "./theme": { "types": "./dist/theme-default/index.d.ts", "import": "./dist/theme-default/index.js" },
    "./ai": { "types": "./dist/ai/index.d.ts", "import": "./dist/ai/index.js" },
    "./package.json": "./package.json"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format:check": "prettier --check ."
  },
  "peerDependencies": { "react": "^19.2.7", "react-dom": "^19.2.7" },
  "dependencies": {
    "@mdx-js/react": "3.1.1",
    "@mdx-js/rollup": "3.1.1",
    "@vitejs/plugin-react": "6.0.3",
    "cac": "7.0.0",
    "esbuild": "0.28.1",
    "fast-glob": "3.3.3",
    "gray-matter": "4.0.3",
    "github-slugger": "2.0.0",
    "remark-frontmatter": "5.0.0",
    "remark-mdx-frontmatter": "5.2.0",
    "unist-util-visit": "5.1.0",
    "vite": "8.1.4",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@playwright/test": "1.61.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/user-event": "14.6.1",
    "@types/node": "26.1.1",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "@eslint/js": "10.0.1",
    "eslint": "10.7.0",
    "eslint-plugin-react-hooks": "7.1.1",
    "execa": "9.6.1",
    "globals": "17.7.0",
    "jsdom": "29.1.1",
    "prettier": "3.9.5",
    "publint": "0.3.21",
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "tsup": "8.5.1",
    "typescript": "7.0.2",
    "typescript-eslint": "8.63.0",
    "vitest": "4.1.10"
  }
}
```

Run: `corepack pnpm install`
Expected: lockfile created and install exits 0.

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "tests", "*.ts"]
}
```

```ts
// tsup.config.ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'client/index': 'src/client/index.ts',
    'theme-default/index': 'src/theme-default/index.tsx',
    'ai/index': 'src/ai/index.ts'
  },
  format: ['esm'], dts: true, splitting: true, sourcemap: true, clean: true,
  external: ['react', 'react-dom']
})
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/**/*.test.tsx', 'jsdom']],
    include: ['tests/**/*.test.{ts,tsx}']
  }
})
```

```ts
// eslint.config.ts
import eslint from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'docs/.silen'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  { languageOptions: { parserOptions: { projectService: true }, globals: { ...globals.browser, ...globals.node } }, plugins: { 'react-hooks': reactHooks }, rules: reactHooks.configs.recommended.rules }
)
```

- [ ] **Step 3: Add the minimal typed export**

```ts
// src/index.ts
import type { UserConfig } from './shared/config'

export function defineConfig<const T extends UserConfig>(config: T): T {
  return config
}

export type { UserConfig } from './shared/config'
```

```ts
// src/ai/index.ts
export {}
```

```ts
// src/client/index.ts
export {}
```

```tsx
// src/theme-default/index.tsx
import type { ReactNode } from 'react'

function Layout({ children }: { children: ReactNode }) { return children }
export default { Layout }
```

```ts
// src/shared/config.ts
export interface UserConfig {
  title?: string
  description?: string
  lang?: string
  base?: string
  outDir?: string
  onBrokenLinks?: 'error' | 'warn' | 'ignore'
}
```

- [ ] **Step 4: Verify the foundation**

Run: `corepack pnpm test tests/package.test.ts && corepack pnpm typecheck && corepack pnpm build && corepack pnpm exec publint`
Expected: one passing test, zero type errors, package bundles produced, publint reports no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json tsup.config.ts vitest.config.ts eslint.config.ts .prettierrc.json .gitignore LICENSE src tests/package.test.ts
git commit -m "chore: bootstrap Silen package"
```

### Task 2: Load and validate site configuration

**Files:**
- Modify: `src/shared/config.ts`
- Create: `src/node/config.ts`
- Create: `tests/config.test.ts`
- Create: `tests/fixtures/configured/.silen/config.ts`

**Interfaces:**
- Produces: `resolveConfig(root: string, command: 'serve' | 'build'): Promise<ResolvedConfig>`.
- Produces: `ResolvedConfig` with normalized absolute `root`, `configFile`, `base`, and `outDir`.

- [ ] **Step 1: Write failing normalization and file-loading tests**

```ts
// tests/config.test.ts
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/node/config'

describe('resolveConfig', () => {
  it('loads .silen/config.ts and normalizes base', async () => {
    const root = path.resolve('tests/fixtures/configured')
    const config = await resolveConfig(root, 'build')
    expect(config.title).toBe('Configured Docs')
    expect(config.base).toBe('/project/')
    expect(config.outDir).toBe(path.join(root, '.silen/dist'))
  })

  it('rejects base values without a leading slash', async () => {
    await expect(resolveConfig(path.resolve('tests/fixtures/invalid-base'), 'build'))
      .rejects.toThrow('base must start with /')
  })
})
```

- [ ] **Step 2: Implement the config types and loader**

```ts
// src/node/config.ts
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { z } from 'zod'
import type { ResolvedConfig, UserConfig } from '../shared/config'

const schema = z.object({
  title: z.string().default('Silen'),
  description: z.string().default(''),
  lang: z.string().default('en-US'),
  base: z.string().default('/').refine(value => value.startsWith('/'), 'base must start with /'),
  outDir: z.string().optional(),
  onBrokenLinks: z.enum(['error', 'warn', 'ignore']).default('error')
}).passthrough()

export async function resolveConfig(root: string, command: 'serve' | 'build'): Promise<ResolvedConfig> {
  const absoluteRoot = path.resolve(root)
  const configFile = path.join(absoluteRoot, '.silen/config.ts')
  const bundled = path.join(absoluteRoot, '.silen/.temp/config.mjs')
  await build({ entryPoints: [configFile], outfile: bundled, bundle: true, platform: 'node', format: 'esm' })
  const loaded = (await import(`${pathToFileURL(bundled).href}?t=${Date.now()}`)).default as UserConfig
  const parsed = schema.parse(loaded)
  const base = parsed.base.endsWith('/') ? parsed.base : `${parsed.base}/`
  return {
    ...parsed,
    command,
    root: absoluteRoot,
    configFile,
    base,
    outDir: path.resolve(absoluteRoot, parsed.outDir ?? '.silen/dist')
  }
}
```

Use the direct `esbuild@0.28.1` dependency declared in Task 1 so config bundling never relies on a transitive import.

- [ ] **Step 3: Run the focused test**

Run: `corepack pnpm test tests/config.test.ts`
Expected: both config tests pass and invalid config errors name `base`.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/shared/config.ts src/node/config.ts tests/config.test.ts tests/fixtures/configured tests/fixtures/invalid-base
git commit -m "feat(config): load typed site configuration"
```

### Task 3: Build the static file-route manifest

**Files:**
- Create: `src/shared/page.ts`
- Create: `src/node/routes.ts`
- Create: `tests/routes.test.ts`
- Create: `tests/fixtures/routes/`

**Interfaces:**
- Produces: `scanRoutes(root: string): Promise<RouteRecord[]>`.
- Produces: `fileToRoute(relativeFile: string): string`.
- `RouteRecord` is `{ path: string; file: string; relativeFile: string }`.

- [ ] **Step 1: Write failing route and conflict tests**

```ts
// tests/routes.test.ts
import { describe, expect, it } from 'vitest'
import { fileToRoute, scanRoutes } from '../src/node/routes'

describe('file routes', () => {
  it.each([
    ['index.mdx', '/'],
    ['guide/index.mdx', '/guide/'],
    ['guide/getting-started.mdx', '/guide/getting-started'],
    ['about.mdx', '/about']
  ])('maps %s to %s', (file, route) => expect(fileToRoute(file)).toBe(route))

  it('rejects duplicate normalized paths', async () => {
    await expect(scanRoutes('tests/fixtures/routes-conflict'))
      .rejects.toThrow('Duplicate route /guide/')
  })
})
```

- [ ] **Step 2: Implement normalized scanning**

```ts
// src/node/routes.ts
import path from 'node:path'
import fg from 'fast-glob'
import type { RouteRecord } from '../shared/page'

export function fileToRoute(relativeFile: string): string {
  const normalized = relativeFile.split(path.sep).join('/').replace(/\.mdx?$/, '')
  if (normalized === 'index') return '/'
  if (normalized.endsWith('/index')) return `/${normalized.slice(0, -5)}`
  return `/${normalized}`
}

export async function scanRoutes(root: string): Promise<RouteRecord[]> {
  const files = await fg(['**/*.md', '**/*.mdx'], { cwd: root, ignore: ['.silen/**'], onlyFiles: true })
  const routes = files.sort().map(relativeFile => ({
    path: fileToRoute(relativeFile),
    relativeFile,
    file: path.resolve(root, relativeFile)
  }))
  const seen = new Map<string, string>()
  for (const route of routes) {
    const previous = seen.get(route.path)
    if (previous) throw new Error(`Duplicate route ${route.path}: ${previous}, ${route.relativeFile}`)
    seen.set(route.path, route.relativeFile)
  }
  return routes
}
```

- [ ] **Step 3: Verify Windows separators and deterministic order**

Run: `corepack pnpm test tests/routes.test.ts`
Expected: route mappings, conflict message, and sorted manifest tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/shared/page.ts src/node/routes.ts tests/routes.test.ts tests/fixtures/routes tests/fixtures/routes-conflict
git commit -m "feat(routes): generate static route manifest"
```

### Task 4: Compile MDX into page modules and metadata

**Files:**
- Create: `src/node/mdx.ts`
- Create: `src/node/remark-page-data.ts`
- Create: `tests/mdx.test.ts`
- Create: `tests/fixtures/mdx/page.mdx`

**Interfaces:**
- Produces: `createMdxPlugins(): Plugin[]` for Vite.
- Produces module exports `frontmatter`, `headings`, `links`, and default React component.
- `Heading` is `{ depth: number; title: string; slug: string }`.
- Produces `CompiledPage` as `{ file; route; source; frontmatter; headings; links; title; description }`.

- [ ] **Step 1: Write a failing compiled-module metadata test**

```ts
// tests/mdx.test.ts
import { describe, expect, it } from 'vitest'
import { compilePage } from '../src/node/mdx'

describe('MDX compilation', () => {
  it('extracts frontmatter, headings, and links', async () => {
    const page = await compilePage('tests/fixtures/mdx/page.mdx')
    expect(page.frontmatter).toMatchObject({ title: 'Getting Started' })
    expect(page.headings).toEqual([{ depth: 2, title: 'Install', slug: 'install' }])
    expect(page.links).toContain('/guide/configuration')
  })
})
```

- [ ] **Step 2: Implement metadata extraction as a remark plugin and wire it into `@mdx-js/rollup`**

```ts
// src/node/remark-page-data.ts
import GithubSlugger from 'github-slugger'
import { visit } from 'unist-util-visit'

export function remarkPageData() {
  return (tree: any, file: any) => {
    const slugger = new GithubSlugger()
    const headings: Array<{ depth: number; title: string; slug: string }> = []
    const links: string[] = []
    visit(tree, node => {
      if (node.type === 'heading') {
        const title = node.children.map((child: any) => child.value ?? '').join('')
        headings.push({ depth: node.depth, title, slug: slugger.slug(title) })
      }
      if (node.type === 'link') links.push(node.url)
    })
    file.data.headings = headings
    file.data.links = links
  }
}
```

Implement the page-data pre-transform and official MDX plugin composition:

```ts
// src/node/mdx.ts
import { readFile } from 'node:fs/promises'
import mdx from '@mdx-js/rollup'
import matter from 'gray-matter'
import GithubSlugger from 'github-slugger'
import { remarkPageData } from './remark-page-data'

export async function compilePage(file: string) {
  const source = await readFile(file, 'utf8')
  const parsed = matter(source)
  return analyzePageSource(parsed.content, parsed.data)
}

export function createMdxPlugins() {
  return [{
    name: 'silen:page-data',
    enforce: 'pre' as const,
    async transform(source: string, id: string) {
      if (!/\.mdx?$/.test(id)) return undefined
      const parsed = matter(source)
      const data = analyzePageSource(parsed.content, parsed.data)
      return `${parsed.content}\nexport const frontmatter = ${JSON.stringify(data.frontmatter)}\nexport const headings = ${JSON.stringify(data.headings)}\nexport const links = ${JSON.stringify(data.links)}`
    }
  }, mdx({ remarkPlugins: [remarkPageData] })]
}

function analyzePageSource(content: string, frontmatter: Record<string, unknown>) {
  const slugger = new GithubSlugger()
  const headings = Array.from(content.matchAll(/^(#{2,6})\s+(.+)$/gm), match => ({ depth: match[1].length, title: match[2].trim(), slug: slugger.slug(match[2].trim()) }))
  const links = Array.from(content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g), match => match[1])
  return { frontmatter, headings, links }
}
```

The regex analyzer is the minimal Alpha implementation tested here; replace it in the AI plan with the shared mdast analyzer before emitting machine-readable artifacts.

- [ ] **Step 3: Verify MDX compilation and TypeScript declarations**

Run: `corepack pnpm test tests/mdx.test.ts && corepack pnpm typecheck`
Expected: metadata test passes and importing `*.mdx` has a typed default component plus typed metadata exports.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/node/mdx.ts src/node/remark-page-data.ts src/mdx.d.ts tests/mdx.test.ts tests/fixtures/mdx
git commit -m "feat(mdx): compile pages with structured metadata"
```

### Task 5: Generate Vite virtual modules and SSR entries

**Files:**
- Create: `src/node/virtual.ts`
- Create: `src/node/plugin.ts`
- Create: `src/client/app.tsx`
- Create: `src/client/ssr-entry.tsx`
- Create: `src/theme-default/index.tsx`
- Create: `tests/plugin.test.ts`

**Interfaces:**
- Produces virtual IDs `virtual:silen/routes`, `virtual:silen/config`, and `virtual:silen/theme`.
- Produces `render(url: string): Promise<RenderedPage>` from the SSR entry.

- [ ] **Step 1: Write failing virtual-module tests**

```ts
// tests/plugin.test.ts
import { describe, expect, it } from 'vitest'
import { createVirtualModules } from '../src/node/virtual'

describe('virtual modules', () => {
  it('emits lazy route imports with normalized Vite paths', () => {
    const modules = createVirtualModules({
      routes: [{ path: '/', file: '/repo/docs/index.mdx', relativeFile: 'index.mdx' }],
      config: { title: 'Docs', base: '/' } as never
    })
    expect(modules.routes).toContain("'/': () => import('/repo/docs/index.mdx')")
  })
})
```

- [ ] **Step 2: Implement the virtual-module source and plugin hooks**

```ts
// src/node/plugin.ts
import type { Plugin } from 'vite'
import type { ResolvedConfig } from '../shared/config'
import { scanRoutes } from './routes'
import { createVirtualModules } from './virtual'

export async function silenPlugin(config: ResolvedConfig): Promise<Plugin[]> {
  const routes = await scanRoutes(config.root)
  const modules = createVirtualModules({ routes, config })
  const prefix = '\0virtual:silen/'
  return [{
    name: 'silen:core',
    resolveId(id) { return id.startsWith('virtual:silen/') ? `\0${id}` : undefined },
    load(id) {
      if (!id.startsWith(prefix)) return undefined
      return modules[id.slice(prefix.length) as keyof typeof modules]
    }
  }]
}
```

- [ ] **Step 3: Implement SSR rendering for a route or 404**

```tsx
// src/client/app.tsx
import routes from 'virtual:silen/routes'

export async function resolveRoute(url: string) {
  const pathname = new URL(url, 'https://silen.local').pathname
  const loader = routes[pathname] ?? routes[pathname.endsWith('/') ? pathname.slice(0, -1) : `${pathname}/`]
  if (!loader) return { found: false, page: { title: 'Page not found', description: '', publicData: { lang: 'en-US', route: pathname }, Component: () => <h1>404</h1> } }
  const module = await loader()
  return { found: true, page: { title: module.frontmatter.title ?? 'Silen', description: module.frontmatter.description ?? '', publicData: { lang: module.frontmatter.lang ?? 'en-US', route: pathname, frontmatter: module.frontmatter, headings: module.headings }, Component: module.default } }
}
```

```tsx
// src/client/ssr-entry.tsx
import { renderToString } from 'react-dom/server'
import { App, resolveRoute } from './app'

export async function render(url: string) {
  const match = await resolveRoute(url)
  const appHtml = renderToString(<App initialUrl={url} initialPage={match.page} />)
  return {
    appHtml,
    status: match.found ? 200 : 404,
    title: match.page.title,
    description: match.page.description,
    publicData: match.page.publicData
  }
}
```

- [ ] **Step 4: Verify virtual modules and SSR**

Run: `corepack pnpm test tests/plugin.test.ts tests/ssr.test.ts`
Expected: route import, config serialization, theme resolution, rendered content, and 404 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/node/virtual.ts src/node/plugin.ts src/client/app.tsx src/client/ssr-entry.tsx src/theme-default/index.tsx tests/plugin.test.ts tests/ssr.test.ts
git commit -m "feat(vite): add virtual modules and SSR entry"
```

### Task 6: Hydrate pages and implement documentation navigation

**Files:**
- Create: `src/client/router.tsx`
- Create: `src/client/entry.tsx`
- Create: `src/client/index.ts`
- Create: `tests/router.test.tsx`

**Interfaces:**
- Produces: `RouterProvider`, `Link`, `useRoute()`, `useRouter()`.
- `Router` exposes `go(href: string): Promise<void>` and `prefetch(href: string): Promise<void>`.

- [ ] **Step 1: Write failing internal/external navigation tests**

```tsx
// tests/router.test.tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Link, RouterProvider } from '../src/client/router'

it('intercepts same-origin links and preserves external links', async () => {
  const go = vi.fn().mockResolvedValue(undefined)
  render(<RouterProvider value={{ path: '/', go, prefetch: vi.fn() }}><Link href="/guide">Guide</Link></RouterProvider>)
  fireEvent.click(screen.getByRole('link', { name: 'Guide' }))
  expect(go).toHaveBeenCalledWith('/guide')
})
```

- [ ] **Step 2: Implement the small router with history, hash, scroll, and focus behavior**

```tsx
// src/client/router.tsx
import { createContext, useContext, type AnchorHTMLAttributes, type ReactNode } from 'react'

export interface Router { path: string; go(href: string): Promise<void>; prefetch(href: string): Promise<void> }
const RouterContext = createContext<Router | null>(null)
export function RouterProvider({ value, children }: { value: Router; children: ReactNode }) {
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}
export function useRouter(): Router {
  const router = useContext(RouterContext)
  if (!router) throw new Error('useRouter must be used within RouterProvider')
  return router
}
export function Link({ href = '', onClick, onFocus, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const router = useRouter()
  const internal = href.startsWith('/') && !href.startsWith('//')
  return <a href={href} {...props} onFocus={event => { onFocus?.(event); if (internal) void router.prefetch(href) }}
    onClick={event => { onClick?.(event); if (internal && !event.defaultPrevented && event.button === 0) { event.preventDefault(); void router.go(href) } }} />
}
```

- [ ] **Step 3: Hydrate the SSR markup**

```tsx
// src/client/entry.tsx
import { hydrateRoot } from 'react-dom/client'
import { App } from './app'

hydrateRoot(document.getElementById('app')!, <App initialUrl={location.pathname + location.search + location.hash} />)
```

- [ ] **Step 4: Verify routing and hydration**

Run: `corepack pnpm test tests/router.test.tsx tests/hydration.test.tsx`
Expected: internal navigation, modified clicks, external URLs, hashes, popstate, prefetch, and hydration tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/client tests/router.test.tsx tests/hydration.test.tsx
git commit -m "feat(client): hydrate pages and handle navigation"
```

### Task 7: Generate the static production site

**Files:**
- Create: `src/node/render.ts`
- Create: `src/node/build.ts`
- Create: `src/node/links.ts`
- Modify: `src/shared/config.ts`
- Create: `tests/build.test.ts`
- Create: `tests/fixtures/basic/index.mdx`
- Create: `tests/fixtures/basic/guide/index.mdx`
- Create: `tests/fixtures/basic/.silen/config.ts`

**Interfaces:**
- Produces: `build(root: string): Promise<BuildResult>`.
- `BuildResult` is `{ outDir: string; routes: Array<{ path: string; file: string }> }`.

- [ ] **Step 1: Write a failing end-to-end build test**

```ts
// tests/build.test.ts
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { build } from '../src/node/build'

it('renders each route to static HTML with base-aware assets', async () => {
  const result = await build('tests/fixtures/basic')
  const home = await readFile(`${result.outDir}/index.html`, 'utf8')
  const guide = await readFile(`${result.outDir}/guide/index.html`, 'utf8')
  expect(home).toContain('<h1>Basic Docs</h1>')
  expect(guide).toContain('Getting Started')
  expect(home).toMatch(/<script type="module" src="\/project\/assets\//)
})
```

- [ ] **Step 2: Implement client build, SSR build, and per-route rendering**

```ts
// src/node/build.ts
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { build as viteBuild } from 'vite'
import { resolveConfig } from './config'
import { scanRoutes } from './routes'
import { renderDocument } from './render'

export async function build(root: string) {
  const config = await resolveConfig(root, 'build')
  const routes = await scanRoutes(config.root)
  const ssrOutDir = path.join(config.root, '.silen/.temp/ssr')
  await viteBuild({ root: config.root, base: config.base, build: { outDir: config.outDir, emptyOutDir: true, manifest: true } })
  await viteBuild({ root: config.root, build: { ssr: path.resolve('src/client/ssr-entry.tsx'), outDir: ssrOutDir, emptyOutDir: true, rollupOptions: { output: { entryFileNames: 'ssr-entry.js' } } } })
  const renderer = await import(path.join(ssrOutDir, 'ssr-entry.js'))
  for (const route of routes) {
    const rendered = await renderer.render(route.path)
    const document = renderDocument(rendered, { base: config.base, clientEntry: 'assets/entry.js' })
    const file = route.path.endsWith('/') ? `${route.path}index.html` : `${route.path}/index.html`
    const destination = path.join(config.outDir, file)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, document, 'utf8')
  }
  return { outDir: config.outDir, routes }
}
```

```ts
// src/node/render.ts
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

export function renderDocument(page: RenderedPage, assets: { base: string; clientEntry: string }): string {
  const publicData = JSON.stringify(page.publicData).replace(/</g, '\\u003c')
  return `<!doctype html><html lang="${escapeHtml(page.publicData.lang)}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${escapeHtml(page.title)}</title><meta name="description" content="${escapeHtml(page.description)}"></head><body><div id="app">${page.appHtml}</div><script>window.__SILEN__=${publicData}</script><script type="module" src="${assets.base}${assets.clientEntry}"></script></body></html>`
}
```

Never serialize the resolved config object; `publicData` contains only lang, base, route, frontmatter, headings, and theme config fields declared public.

- [ ] **Step 3: Add duplicate-link and SSR error diagnostics**

```ts
// src/node/links.ts
export function validateInternalLinks(routes: RouteRecord[], pages: CompiledPage[], mode: 'error' | 'warn' | 'ignore'): LinkDiagnostic[] {
  if (mode === 'ignore') return []
  const known = new Set(routes.flatMap(route => [route.path, route.path.replace(/\/$/, '') || '/']))
  const diagnostics = pages.flatMap(page => page.links
    .filter(link => link.startsWith('/') && !known.has(link.split('#')[0] || '/'))
    .map(link => ({ file: page.file, route: page.route, link, message: `Broken internal link ${link}` })))
  if (mode === 'error' && diagnostics.length) throw new Error(diagnostics.map(item => `${item.file}: ${item.message}`).join('\n'))
  return diagnostics
}
```

Call `validateInternalLinks` after page metadata is compiled and before writing final output. Do not fetch external links.

Run: `corepack pnpm test tests/build.test.ts tests/build-errors.test.ts`
Expected: fixture files exist, base assets are correct, HTML is populated, and failures name route plus source file.

- [ ] **Step 4: Commit**

```bash
git add src/node/render.ts src/node/build.ts src/node/links.ts tests/build.test.ts tests/build-errors.test.ts tests/fixtures/basic
git commit -m "feat(build): render routes to static HTML"
```

### Task 8: Add dev, preview, and CLI commands

**Files:**
- Create: `src/node/server.ts`
- Create: `src/node/cli.ts`
- Create: `tests/cli.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `createDevServer(root, options)`, `createPreviewServer(root, options)`.
- Produces CLI commands `silen dev`, `silen build`, `silen preview`.

- [ ] **Step 1: Write failing CLI help and build tests**

```ts
// tests/cli.test.ts
import { execa } from 'execa'
import { expect, it } from 'vitest'

it('prints the three primary commands', async () => {
  const result = await execa('node', ['dist/node/cli.js', '--help'])
  expect(result.stdout).toContain('dev [root]')
  expect(result.stdout).toContain('build [root]')
  expect(result.stdout).toContain('preview [root]')
})
```

- [ ] **Step 2: Implement CAC command dispatch**

```ts
// src/node/cli.ts
#!/usr/bin/env node
import cac from 'cac'
import { build } from './build'
import { createDevServer, createPreviewServer } from './server'

const cli = cac('silen')
cli.command('dev [root]', 'Start the development server').option('--host [host]').option('--port <port>').action((root = '.', options) => createDevServer(root, options))
cli.command('build [root]', 'Build a static site').action((root = '.') => build(root))
cli.command('preview [root]', 'Preview the static build').option('--host [host]').option('--port <port>').action((root = '.', options) => createPreviewServer(root, options))
cli.help()
cli.version('0.1.0-alpha.0')
cli.parse()
```

Add `"bin": { "silen": "./dist/node/cli.js" }` to `package.json` and add `node/cli`, `client/entry`, and `client/ssr-entry` to `tsup.config.ts` using the exact source paths created by Tasks 5, 6, and 8.

- [ ] **Step 3: Verify CLI and real HTTP responses**

Run: `corepack pnpm build && corepack pnpm test tests/cli.test.ts tests/server.test.ts`
Expected: help succeeds, build exits 0, dev serves SSR HTML, and preview serves the generated fixture.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/node/server.ts src/node/cli.ts tests/cli.test.ts tests/server.test.ts
git commit -m "feat(cli): add dev build and preview commands"
```

### Task 9: Close the Core Alpha quality gate

**Files:**
- Create: `README.md`
- Create: `.github/workflows/ci.yml`
- Create: `tests/package-smoke.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: a tarball-install smoke test and documented three-command quick start.
- Consumes: every Core interface above.

- [ ] **Step 1: Add a clean tarball smoke test**

```ts
// tests/package-smoke.test.ts
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { expect, it } from 'vitest'

it('installs the packed package and builds a clean fixture', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'silen-smoke-'))
  const { stdout } = await execa('pnpm', ['pack', '--pack-destination', cwd])
  expect(stdout).toContain('.tgz')
})
```

- [ ] **Step 2: Document installation, project structure, commands, routing, and deployment**

```md
# Silen

AI-native documentation powered by React, TypeScript, Vite, and MDX.

Install with `pnpm add -D silen`, then run `pnpm silen dev docs`,
`pnpm silen build docs`, and `pnpm silen preview docs`.
```

- [ ] **Step 3: Add CI and run the complete gate**

Run: `corepack pnpm format:check && corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm build && corepack pnpm exec publint`
Expected: all commands exit 0; smoke test installs only declared package dependencies.

- [ ] **Step 4: Commit**

```bash
git add README.md .github/workflows/ci.yml package.json pnpm-lock.yaml tests/package-smoke.test.ts
git commit -m "ci: verify the Core Alpha package"
```
