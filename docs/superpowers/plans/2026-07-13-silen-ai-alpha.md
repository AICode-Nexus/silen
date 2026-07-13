# Silen AI Alpha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every Silen build useful to AI agents through deterministic Markdown and index artifacts, then add a safe local MCP knowledge workspace and a provider-neutral Ask AI extension contract.

**Architecture:** Build-time AI output is model-free and derived from the same page model used for HTML. The local MCP server uses the stable v1 TypeScript SDK over stdio, exposes read-only tools by default, and registers mutating tools only when the CLI receives `--allow-write`. Runtime Ask AI code is absent unless a deployer supplies a server-side adapter endpoint.

**Tech Stack:** TypeScript 7.0.2, Zod 4.4.3, MiniSearch 7.2.0, `@modelcontextprotocol/sdk` 1.29.0, unified 11.0.5, remark-parse 11.0.0, remark-stringify 11.0.0, mdast-util-to-markdown 2.1.2, React 19.2.7, Vitest 4.1.10, Playwright 1.61.1.

## Global Constraints

- Execute after the Core plan; UI tasks that use Dialog/Button execute after the Default Theme plan.
- AI-readable output is enabled by default and must not call a model or require a key.
- Treat `llms.txt` as an emerging convention, not a finalized web standard.
- Exclude pages with `draft: true` or `ai: false` from public AI artifacts.
- Never serialize absolute paths, environment variables, private config, or provider credentials.
- Use stable MCP SDK v1 (`@modelcontextprotocol/sdk@1.29.0`); do not adopt v2 pre-release APIs.
- MCP uses stdio only in Alpha and never exposes arbitrary shell execution.
- MCP is read-only by default; write tools do not exist unless `--allow-write` is present.
- Resolve real paths, reject traversal and symlinks escaping the content root, limit input/output sizes, and return workspace-relative paths.
- Formal content remains ordinary MDX and standard Markdown links in Git; `.silen/ai` contains rebuildable cache only.
- Full-text search is deterministic; embeddings and vector databases are out of Alpha scope.

---

## File map

```text
src/shared/ai.ts                       AI config, chunk, artifact, and adapter types
src/node/markdown-output.ts            Clean per-page Markdown serialization
src/ai/chunks.ts                       Stable section chunk generation
src/ai/artifacts.ts                    llms.txt, llms-full.txt, ai-index.json
src/ai/index.ts                        Public AI exports
src/ai/workspace.ts                    Root/path policy and file operations
src/ai/search.ts                       Full-text workspace search
src/ai/audit.ts                        Deterministic artifact/link/citation checks
src/ai/mcp/server.ts                   McpServer construction and tool registration
src/ai/mcp/read-tools.ts               guide/list/search/read/backlinks/citations/build
src/ai/mcp/write-tools.ts              write/link/append, gated at registration
src/ai/mcp/stdio.ts                    Stdio transport lifecycle
src/theme-default/components/ai-actions.tsx    Copy Markdown and Copy for AI
src/theme-default/components/ask-ai.tsx       Optional runtime dialog
src/client/ai.ts                       Provider-neutral AskAiAdapter client contract
tests/ai/*.test.ts                     Artifact, workspace, MCP, and adapter tests
tests/e2e/ai.spec.ts                   Browser AI actions
```

### Task 1: Define normalized Markdown and stable AI chunks

**Files:**
- Create: `src/shared/ai.ts`
- Create: `src/node/markdown-output.ts`
- Create: `src/ai/chunks.ts`
- Create: `tests/ai/markdown-output.test.ts`

**Interfaces:**
- Produces: `serializePageMarkdown(page: CompiledPage): string`.
- Produces: `createAiChunks(page: AiPage): AiChunk[]`.
- `AiChunk` is `{ id; route; title; headingPath; text; code; links; order }` with stable IDs.

- [ ] **Step 1: Write failing normalization and chunk-ID tests**

```ts
// tests/ai/markdown-output.test.ts
import { expect, it } from 'vitest'
import { createAiChunks } from '../../src/ai/chunks'
import { serializePageMarkdown } from '../../src/node/markdown-output'

it('removes executable imports while preserving prose and fenced code', () => {
  const output = serializePageMarkdown({
    route: '/guide/',
    source: "import { Demo } from './Demo'\n\n# Guide\n\n```ts\nconst x = 1\n```",
    frontmatter: { title: 'Guide' }
  } as never)
  expect(output).not.toContain('import { Demo }')
  expect(output).toContain('# Guide')
  expect(output).toContain('```ts')
})

it('creates stable section IDs from route and heading ancestry', () => {
  const chunks = createAiChunks({ route: '/guide/', title: 'Guide', markdown: '# Guide\n\n## Install\n\nRun pnpm.' })
  expect(chunks[1]?.id).toBe('/guide/#install')
})
```

- [ ] **Step 2: Add pinned Markdown AST dependencies**

Run: `corepack pnpm add unified@11.0.5 remark-parse@11.0.0 remark-stringify@11.0.0 mdast-util-to-markdown@2.1.2`
Expected: install exits 0 without replacing Core MDX versions.

- [ ] **Step 3: Implement AST-based normalization and chunking**

```ts
// src/shared/ai.ts
export interface AiChunk {
  id: string
  route: string
  title: string
  headingPath: string[]
  text: string
  code: Array<{ language: string; value: string }>
  links: string[]
  order: number
}

export interface AiPage {
  route: string
  title: string
  markdown: string
  description?: string
}
```

Normalize through mdast rather than regular expressions: remove `mdxjsEsm`, omit interactive JSX nodes that have no text children, preserve headings, lists, tables, links, callout text, and fenced code. Chunk on H2/H3 boundaries with the page introduction as chunk zero.

- [ ] **Step 4: Verify determinism and exclusion controls**

Run: `corepack pnpm test tests/ai/markdown-output.test.ts tests/ai/chunks.test.ts`
Expected: repeated generation is byte-identical, duplicate headings receive stable suffixes, and excluded pages produce no chunks.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/shared/ai.ts src/node/markdown-output.ts src/ai/chunks.ts tests/ai/markdown-output.test.ts tests/ai/chunks.test.ts
git commit -m "feat(ai): normalize pages for machine consumption"
```

### Task 2: Emit per-page Markdown, llms files, and AI index

**Files:**
- Create: `src/ai/artifacts.ts`
- Create: `src/ai/index.ts`
- Modify: `src/node/build.ts`
- Modify: `src/shared/config.ts`
- Create: `tests/ai/artifacts.test.ts`

**Interfaces:**
- Produces: `generateAiArtifacts(options: ArtifactOptions): Promise<ArtifactResult>`.
- Emits route `.md`, `/llms.txt`, `/llms-full.txt`, and `/ai-index.json`.
- Adds `ai: { llmsTxt; llmsFullTxt; markdownRoutes; index }` config with all values defaulting to true.

- [ ] **Step 1: Write a failing artifact fixture test**

```ts
// tests/ai/artifacts.test.ts
import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { build } from '../../src/node/build'

it('emits canonical AI artifacts and excludes drafts', async () => {
  const { outDir } = await build('tests/fixtures/ai-site')
  const manifest = await readFile(`${outDir}/llms.txt`, 'utf8')
  const full = await readFile(`${outDir}/llms-full.txt`, 'utf8')
  const index = JSON.parse(await readFile(`${outDir}/ai-index.json`, 'utf8'))
  expect(manifest).toContain('- [Getting Started](/guide/getting-started.md): Install Silen')
  expect(full).not.toContain('Draft page')
  expect(index.version).toBe(1)
  expect(index.chunks[0]).not.toHaveProperty('file')
})
```

- [ ] **Step 2: Implement deterministic serializers**

```ts
// src/ai/artifacts.ts
export interface AiIndexFile { version: 1; generatedBy: string; pages: AiPage[]; chunks: AiChunk[] }

export function markdownUrlForRoute(route: string): string {
  if (route === '/') return '/index.md'
  if (route.endsWith('/')) return `${route}index.md`
  return `${route}.md`
}

function joinUrl(base: string, pathname: string): string {
  return `${base.replace(/\/$/, '')}/${pathname.replace(/^\//, '')}`
}

export function renderLlmsTxt(site: Pick<ResolvedConfig, 'title' | 'description' | 'base'>, pages: AiPage[]): string {
  const links = pages.map(page => `- [${page.title}](${joinUrl(site.base, markdownUrlForRoute(page.route))})${page.description ? `: ${page.description}` : ''}`)
  return [`# ${site.title}`, '', `> ${site.description}`, '', '## Documentation', '', ...links, ''].join('\n')
}
```

Sort pages by route-manifest order, use LF line endings, terminate text files with one newline, and serialize JSON with two-space indentation. Use URL joining instead of filesystem joining.

- [ ] **Step 3: Integrate artifact generation after successful HTML rendering and before final link validation**

Run: `corepack pnpm test tests/ai/artifacts.test.ts tests/ai/artifact-config.test.ts`
Expected: default files exist, every manifest link resolves, config can disable each artifact, and no private fields appear.

- [ ] **Step 4: Commit**

```bash
git add src/ai/artifacts.ts src/ai/index.ts src/node/build.ts src/shared/config.ts tests/ai tests/fixtures/ai-site
git commit -m "feat(ai): emit LLM-readable build artifacts"
```

### Task 3: Add Copy Markdown and Copy for AI actions

**Files:**
- Create: `src/theme-default/components/ai-actions.tsx`
- Modify: `src/theme-default/components/doc.tsx`
- Create: `tests/ai/actions.test.tsx`
- Create: `tests/e2e/ai.spec.ts`

**Interfaces:**
- Produces: `AiPageActions({ markdownUrl, title }: Props)`.
- Copy for AI includes canonical URL, page title, and normalized Markdown without hidden navigation content.

- [ ] **Step 1: Write failing clipboard tests**

```tsx
// tests/ai/actions.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { AiPageActions } from '../../src/theme-default/components/ai-actions'

it('copies context with canonical source attribution', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('# Install\nRun pnpm.')))
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  render(<AiPageActions title="Install" markdownUrl="/guide/install.md" canonicalUrl="https://docs.example/guide/install" />)
  await userEvent.click(screen.getByRole('button', { name: 'Copy for AI' }))
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Source: https://docs.example/guide/install'))
})
```

- [ ] **Step 2: Compose the actions from shadcn Button, Tooltip, and DropdownMenu**

Fetch current docs first:

Run: `corepack pnpm dlx shadcn@4.13.0 docs button tooltip dropdown-menu`
Expected: official docs URLs print before code changes.

Run: `corepack pnpm dlx shadcn@4.13.0 add @shadcn/dropdown-menu`
Expected: the official DropdownMenu source is added without overwriting existing customized primitives.

```tsx
// src/theme-default/components/ai-actions.tsx
import { useState } from 'react'
import { Button } from './ui/button'

interface Props { title: string; markdownUrl: string; canonicalUrl: string }

export function AiPageActions({ title, markdownUrl, canonicalUrl }: Props) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'copied' | 'error'>('idle')
  async function copy(forAi: boolean) {
    setStatus('loading')
    try {
      const markdown = await fetch(markdownUrl).then(response => response.ok ? response.text() : Promise.reject(new Error(`HTTP ${response.status}`)))
      const value = forAi ? `# ${title}\n\nSource: ${canonicalUrl}\n\n${markdown}` : markdown
      await navigator.clipboard.writeText(value)
      setStatus('copied')
    } catch { setStatus('error') }
  }
  return <div className="flex items-center gap-2">
    <Button variant="outline" size="sm" disabled={status === 'loading'} onClick={() => void copy(false)}>Copy Markdown</Button>
    <Button variant="outline" size="sm" disabled={status === 'loading'} onClick={() => void copy(true)}>Copy for AI</Button>
    <span className="sr-only" aria-live="polite">{status === 'copied' ? 'Copied' : status === 'error' ? 'Copy failed' : ''}</span>
  </div>
}
```

- [ ] **Step 3: Verify browser permissions and fallback behavior**

Run: `corepack pnpm test tests/ai/actions.test.tsx && corepack pnpm exec playwright test tests/e2e/ai.spec.ts --grep "copy"`
Expected: both actions work, failed fetch/clipboard shows an accessible error, and page navigation is unaffected.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml src/theme-default/components/ai-actions.tsx src/theme-default/components/doc.tsx tests/ai/actions.test.tsx tests/e2e/ai.spec.ts
git commit -m "feat(ai): add page context copy actions"
```

### Task 4: Create the read-only local workspace and MCP server

**Files:**
- Create: `src/ai/workspace.ts`
- Create: `src/ai/search.ts`
- Create: `src/ai/audit.ts`
- Create: `src/ai/mcp/server.ts`
- Create: `src/ai/mcp/read-tools.ts`
- Create: `src/ai/mcp/stdio.ts`
- Modify: `src/node/cli.ts`
- Modify: `package.json`
- Create: `tests/ai/workspace.test.ts`
- Create: `tests/ai/mcp-read.test.ts`

**Interfaces:**
- Produces: `createWorkspace(root: string): Promise<Workspace>` with `resolve`, `list`, `read`, `search`, `backlinks`, `citations`, `build`, and `audit`.
- Produces: `createMcpServer({ workspace, allowWrite: false }): McpServer`.
- Produces CLI `silen ai init|index|audit` and `silen mcp`.

- [ ] **Step 1: Write failing path-boundary and read-tool tests**

```ts
// tests/ai/workspace.test.ts
import { expect, it } from 'vitest'
import { createWorkspace } from '../../src/ai/workspace'

it('rejects traversal and escaping symlinks', async () => {
  const workspace = await createWorkspace('tests/fixtures/ai-workspace')
  await expect(workspace.read('../secret.txt')).rejects.toThrow('Path is outside the content root')
  await expect(workspace.read('escape-link')).rejects.toThrow('Path is outside the content root')
})
```

- [ ] **Step 2: Install the stable v1 MCP SDK and implement stdio registration**

Run: `corepack pnpm add @modelcontextprotocol/sdk@1.29.0 minisearch@7.2.0 zod@4.4.3`
Expected: v1 SDK installs; no `@modelcontextprotocol/server` v2 prerelease package is added.

```ts
// src/ai/mcp/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Workspace } from '../workspace'
import { registerReadTools } from './read-tools'

export function createMcpServer(options: { workspace: Workspace; allowWrite: boolean }) {
  const server = new McpServer({ name: 'silen', version: '0.1.0-alpha.0' }, {
    instructions: 'Use list or search before read. Paths are relative to the documentation root. Write tools are absent unless the server was started with explicit write permission.'
  })
  registerReadTools(server, options.workspace)
  return server
}
```

Register all read tools through one typed helper so error handling is consistent:

```ts
// src/ai/mcp/read-tools.ts
export function registerReadTools(server: McpServer, workspace: Workspace) {
  server.registerTool('guide', { description: 'Explain the Silen workspace and safe workflow', inputSchema: z.object({}) }, async () => textResult(await workspace.guide()))
  server.registerTool('list', { description: 'List documentation files and routes', inputSchema: z.object({ path: z.string().default('.') }) }, async ({ path }) => jsonResult(await workspace.list(path)))
  server.registerTool('search', { description: 'Search documentation text', inputSchema: z.object({ query: z.string().min(1), limit: z.number().int().min(1).max(50).default(10) }) }, async input => jsonResult(await workspace.search(input.query, input.limit)))
  server.registerTool('read', { description: 'Read a workspace-relative Markdown or MDX file', inputSchema: z.object({ path: z.string(), startLine: z.number().int().positive().default(1), endLine: z.number().int().positive().max(4000).optional() }) }, async input => jsonResult(await workspace.read(input)))
  server.registerTool('backlinks', { description: 'List pages linking to a route', inputSchema: z.object({ route: z.string().startsWith('/') }) }, async ({ route }) => jsonResult(await workspace.backlinks(route)))
  server.registerTool('citations', { description: 'Inspect citation links and footnotes', inputSchema: z.object({ path: z.string().optional() }) }, async ({ path }) => jsonResult(await workspace.citations(path)))
  server.registerTool('build', { description: 'Build and validate the site', inputSchema: z.object({}) }, async () => jsonResult(await workspace.build()))
}

function textResult(text: string) { return { content: [{ type: 'text' as const, text }] } }
function jsonResult(value: unknown) { return textResult(JSON.stringify(value, null, 2)) }
```

Wrap domain failures at the workspace boundary so tool results set `isError: true` and never contain absolute paths.

- [ ] **Step 3: Connect stdio and add graceful shutdown**

```ts
// src/ai/mcp/stdio.ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Workspace } from '../workspace'
import { createMcpServer } from './server'

export interface CreateMcpOptions { workspace: Workspace; allowWrite: boolean }

export async function serveMcp(options: CreateMcpOptions) {
  const server = createMcpServer(options)
  process.once('SIGINT', async () => { await server.close(); process.exit(0) })
  await server.connect(new StdioServerTransport())
}
```

Add the four explicit CLI entry points without writing logs to stdout after stdio starts:

```ts
// additions to src/node/cli.ts
cli.command('ai init [root]', 'Initialize the local AI workspace').action(async (root = '.') => {
  const workspace = await createWorkspace(root)
  await workspace.init()
  console.log(`Initialized ${workspace.relativeRoot}`)
})
cli.command('ai index [root]', 'Rebuild the deterministic AI index').action(async (root = '.') => {
  const workspace = await createWorkspace(root)
  console.log(JSON.stringify(await workspace.reindex()))
})
cli.command('ai audit [root]', 'Audit AI artifacts, links, and citations').action(async (root = '.') => {
  const workspace = await createWorkspace(root)
  const result = await workspace.audit()
  console.log(JSON.stringify(result, null, 2))
  if (!result.ok) process.exitCode = 1
})
cli.command('mcp [root]', 'Serve the documentation workspace over MCP').option('--allow-write', 'Register write tools', { default: false }).action(async (root = '.', options) => {
  const workspace = await createWorkspace(root)
  await serveMcp({ workspace, allowWrite: options.allowWrite })
})
```

`workspace.init()` creates `wiki/`, `.silen/ai/`, and `.silen/ai/.gitignore` containing `*`, `!.gitignore`; it does not modify existing MDX.

- [ ] **Step 4: Verify tool discovery and calls with an SDK client**

Run: `corepack pnpm test tests/ai/workspace.test.ts tests/ai/mcp-read.test.ts`
Expected: seven read-only tools are listed, search/read/build return relative structured data, traversal fails, and stdout contains only MCP protocol messages.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/ai/workspace.ts src/ai/search.ts src/ai/audit.ts src/ai/mcp src/node/cli.ts tests/ai/workspace.test.ts tests/ai/mcp-read.test.ts tests/fixtures/ai-workspace
git commit -m "feat(mcp): expose a read-only documentation workspace"
```

### Task 5: Gate and implement MCP write tools

**Files:**
- Create: `src/ai/mcp/write-tools.ts`
- Modify: `src/ai/mcp/server.ts`
- Modify: `src/ai/workspace.ts`
- Create: `tests/ai/mcp-write.test.ts`

**Interfaces:**
- Produces optional tools `write`, `link`, and `append` only when `allowWrite === true`.
- `write` supports create and exact-content replacement; `link` adds a standard relative Markdown link; `append` appends UTF-8 text with one separating newline.

- [ ] **Step 1: Write failing registration and mutation tests**

```ts
// tests/ai/mcp-write.test.ts
import { expect, it } from 'vitest'
import { listToolNames, startTestMcp } from './helpers/mcp-client'

it('does not register mutation tools by default', async () => {
  const client = await startTestMcp({ allowWrite: false })
  expect(await listToolNames(client)).not.toEqual(expect.arrayContaining(['write', 'link', 'append']))
})

it('registers mutation tools only with explicit permission', async () => {
  const client = await startTestMcp({ allowWrite: true })
  expect(await listToolNames(client)).toEqual(expect.arrayContaining(['write', 'link', 'append']))
})
```

- [ ] **Step 2: Register mutating tools with destructive/read-only annotations**

```ts
if (options.allowWrite) registerWriteTools(server, options.workspace)
```

Use atomic same-directory temporary-file plus rename for replacements, preserve LF/UTF-8, reject files above 2 MiB, reject extensions outside `.md` and `.mdx`, and return a unified diff summary with workspace-relative paths.

- [ ] **Step 3: Verify denied, successful, concurrent, and traversal writes**

Run: `corepack pnpm test tests/ai/mcp-write.test.ts tests/ai/workspace-write.test.ts`
Expected: default server has no write tools; enabled writes are atomic and indexed; traversal, escaping symlink, oversized, and unsupported-extension writes fail.

- [ ] **Step 4: Commit**

```bash
git add src/ai/mcp/write-tools.ts src/ai/mcp/server.ts src/ai/workspace.ts tests/ai/mcp-write.test.ts tests/ai/workspace-write.test.ts tests/ai/helpers
git commit -m "feat(mcp): add explicitly gated wiki maintenance"
```

### Task 6: Add the provider-neutral Ask AI extension contract

**Files:**
- Create: `src/client/ai.ts`
- Create: `src/theme-default/components/ask-ai.tsx`
- Modify: `src/theme-default/components/nav.tsx`
- Modify: `src/shared/config.ts`
- Create: `tests/ai/ask-ai.test.tsx`

**Interfaces:**
- Produces `AskAiAdapter`, `AskAiRequest`, `AskAiEvent`, and lazy `AskAiDialog`.
- Adapter config contains a public endpoint URL only; provider secrets remain in the deployer's server.

- [ ] **Step 1: Write failing absence, streaming, and citation tests**

```tsx
// tests/ai/ask-ai.test.tsx
import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Nav } from '../../src/theme-default/components/nav'
import { TestSiteProvider } from '../helpers/test-site-provider'

it('does not render Ask AI when no adapter is configured', () => {
  render(<TestSiteProvider config={{}}><Nav /></TestSiteProvider>)
  expect(screen.queryByRole('button', { name: 'Ask AI' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Define the adapter contract**

```ts
// src/client/ai.ts
export interface AskAiRequest { route: string; selectedText?: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> }
export type AskAiEvent = { type: 'text'; value: string } | { type: 'citation'; title: string; url: string } | { type: 'error'; message: string }
export interface AskAiAdapter { ask(request: AskAiRequest, signal: AbortSignal): AsyncIterable<AskAiEvent> }
```

- [ ] **Step 3: Implement lazy titled Dialog UI with abort, citations, and accessible streaming status**

Fetch current docs first:

Run: `corepack pnpm dlx shadcn@4.13.0 docs dialog input-group button scroll-area skeleton alert`
Expected: official API examples are available before the component is composed.

Run: `corepack pnpm dlx shadcn@4.13.0 add @shadcn/input-group @shadcn/input`
Expected: official form primitives are added and existing components remain unchanged.

The Nav imports the dialog with `React.lazy` only when `themeConfig.ai.adapter` exists. Never serialize an API key or arbitrary headers into public config.

```tsx
// src/theme-default/components/ask-ai.tsx
import { useRef, useState, type FormEvent } from 'react'
import { useRoute } from 'silen/client'
import type { AskAiAdapter, AskAiEvent } from 'silen/client'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group'
import { ScrollArea } from './ui/scroll-area'
import { Skeleton } from './ui/skeleton'

interface Props { adapter: AskAiAdapter; open: boolean; onOpenChange(open: boolean): void }

export function AskAiDialog({ adapter, open, onOpenChange }: Props) {
  const route = useRoute()
  const [events, setEvents] = useState<AskAiEvent[]>([])
  const [pending, setPending] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  async function submit(question: string) {
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setPending(true)
    try {
      for await (const event of adapter.ask({ route: route.path, messages: [{ role: 'user', content: question }] }, abortRef.current.signal)) setEvents(current => [...current, event])
    } finally { setPending(false) }
  }
  return <Dialog open={open} onOpenChange={value => { if (!value) abortRef.current?.abort(); onOpenChange(value) }}>
    <DialogContent><DialogHeader><DialogTitle>Ask AI</DialogTitle><DialogDescription>Answers use the current documentation and include source links.</DialogDescription></DialogHeader>
      <ScrollArea aria-live="polite">{events.map((event, index) => <AskAiEventView key={index} event={event} />)}{pending ? <Skeleton className="h-16" /> : null}</ScrollArea>
      <AskAiInput disabled={pending} onSubmit={submit} />
    </DialogContent>
  </Dialog>
}

function AskAiEventView({ event }: { event: AskAiEvent }) {
  if (event.type === 'citation') return <a href={event.url} rel="noreferrer" target="_blank">{event.title}</a>
  if (event.type === 'error') return <p role="alert">{event.message}</p>
  return <p>{event.value}</p>
}

function AskAiInput({ disabled, onSubmit }: { disabled: boolean; onSubmit(value: string): Promise<void> }) {
  const [value, setValue] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    const question = value.trim()
    if (!question) return
    setValue('')
    await onSubmit(question)
  }
  return <form onSubmit={submit}>
    <InputGroup><InputGroupInput aria-label="Question" value={value} onChange={event => setValue(event.target.value)} disabled={disabled} />
      <InputGroupAddon align="inline-end"><Button type="submit" disabled={disabled || !value.trim()}>Ask</Button></InputGroupAddon>
    </InputGroup>
  </form>
}
```

- [ ] **Step 4: Verify lazy bundling and streaming behavior**

Run: `corepack pnpm test tests/ai/ask-ai.test.tsx tests/ai/ask-ai-bundle.test.ts`
Expected: no adapter means no button/chunk; configured adapter streams text, renders canonical citations, aborts on close, and displays provider-safe errors.

- [ ] **Step 5: Commit**

```bash
git add src/client/ai.ts src/theme-default/components/ask-ai.tsx src/theme-default/components/nav.tsx src/shared/config.ts tests/ai/ask-ai.test.tsx tests/ai/ask-ai-bundle.test.ts
git commit -m "feat(ai): add a provider-neutral Ask AI adapter"
```

### Task 7: Close the AI Alpha security and interoperability gate

**Files:**
- Create: `tests/ai/mcp-e2e.test.ts`
- Modify: `tests/e2e/ai.spec.ts`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces documented AI artifacts, MCP configuration snippets, permission model, and Ask AI adapter example.
- Consumes every AI interface above.

- [ ] **Step 1: Add a real stdio client interoperability test**

```ts
// tests/ai/mcp-e2e.test.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { expect, it } from 'vitest'

it('serves Silen tools over stdio', async () => {
  const client = new Client({ name: 'silen-test', version: '1.0.0' })
  const transport = new StdioClientTransport({ command: 'node', args: ['dist/node/cli.js', 'mcp', 'tests/fixtures/ai-workspace'] })
  await client.connect(transport)
  const tools = await client.listTools()
  expect(tools.tools.map(tool => tool.name)).toContain('search')
  expect(tools.tools.map(tool => tool.name)).not.toContain('write')
  await client.close()
})
```

- [ ] **Step 2: Document generated URLs, AI exclusions, MCP client config, write opt-in, and server-side adapter security**

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

- [ ] **Step 3: Run the complete security and release gate**

Run: `corepack pnpm format:check && corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && corepack pnpm exec playwright test tests/e2e/ai.spec.ts && corepack pnpm build && corepack pnpm exec publint`
Expected: all checks pass; packed output contains no fixture paths, environment values, cache databases, provider keys, or MCP write permission by default.

- [ ] **Step 4: Commit**

```bash
git add tests/ai/mcp-e2e.test.ts tests/e2e/ai.spec.ts README.md .github/workflows/ci.yml
git commit -m "test(ai): verify AI and MCP interoperability"
```
