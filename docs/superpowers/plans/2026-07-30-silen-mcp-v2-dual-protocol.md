# Silen MCP v2 Dual-Protocol Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Silen's local MCP server from the monolithic v1 SDK to stable split SDK v2 packages, serve verified legacy and modern protocol revisions from one stdio entry, and publish formal tool output schemas through Agent Contract v2 without changing Silen's safety boundary.

**Architecture:** Run the pinned official codemod once, then keep one v2 `McpServer` factory and host it through `serveStdio`. Extend the existing descriptor registry with Zod output schemas so runtime registration, structured results, and generated contracts stay aligned. Keep the contract revision minimal: two verified protocol versions, `stdio`, an empty extension list, and tool `outputSchema`.

**Tech Stack:** TypeScript 7, Node.js, pnpm, Zod 4, `@modelcontextprotocol/server` 2.0.0, `@modelcontextprotocol/client` 2.0.0, Vitest, tsup.

## Global Constraints

- Pin `@modelcontextprotocol/server` and `@modelcontextprotocol/client` to exact version `2.0.0`.
- Run `@modelcontextprotocol/codemod@2.0.0 v1-to-v2 .` at the repository root.
- Verify legacy revision `2025-11-25` and modern revision `2026-07-28`; do not use a moving latest-version constant.
- Keep exactly seven default read tools and exactly three explicitly authorized write tools with their current names.
- Preserve `--allow-write`, no-shell behavior, all input bounds, symlink defenses, safe errors, and workspace path confinement.
- Keep MCP local-only over stdio; do not add remote transport, OAuth, Tasks, Apps, subscriptions, sampling, elicitation, or other extensions.
- Agent Contract manifest and API documents move together from schema version 1 to schema version 2.
- Manifest MCP facts are exactly `transport`, `protocolVersions`, `extensions`, `localOnly`, `readOnlyByDefault`, and `writeRequiresFlag`.
- Keep package version `0.4.0` during AI-005; the authorized `0.5.0` version and release happen only after AI-006.
- Every implementation change follows red-green-refactor and ends in a focused commit.

---

### Task 1: Apply the official SDK v2 codemod and enforce dependency boundaries

**Files:**
- Create: `tests/ai/mcp-v2-migration.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/ai/mcp/contracts.ts`
- Modify: `src/ai/mcp/read-tools.ts`
- Modify: `src/ai/mcp/server.ts`
- Modify: `src/ai/mcp/stdio.ts`
- Modify: `src/ai/mcp/write-tools.ts`
- Modify: `tests/ai/mcp-e2e.test.ts`
- Modify: `tests/ai/mcp-read.test.ts`
- Modify: `tests/ai/mcp-stdio.test.ts`
- Modify: `tests/ai/mcp-write.test.ts`

**Interfaces:**
- Consumes: Existing `createMcpServer`, `serveMcp`, ten tool descriptors, and v1 interoperability tests.
- Produces: Runtime imports from `@modelcontextprotocol/server`, test imports from `@modelcontextprotocol/client`, and a repository invariant forbidding v1 residue.

- [ ] **Step 1: Write the failing migration invariant test**

Create `tests/ai/mcp-v2-migration.test.ts`:

```ts
import fg from 'fast-glob'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

interface PackageManifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const v1Package = ['@modelcontextprotocol', 'sdk'].join('/')
const codemodMarker = ['@mcp', 'codemod-error'].join('-')

describe('MCP SDK v2 migration boundary', () => {
  it('uses only the split stable SDK packages in their correct dependency sections', async () => {
    const manifest = JSON.parse(
      await readFile('package.json', 'utf8'),
    ) as PackageManifest

    expect(manifest.dependencies?.['@modelcontextprotocol/server']).toBe('2.0.0')
    expect(manifest.devDependencies?.['@modelcontextprotocol/client']).toBe(
      '2.0.0',
    )
    expect(manifest.dependencies?.[v1Package]).toBeUndefined()
    expect(manifest.devDependencies?.[v1Package]).toBeUndefined()
  })

  it('contains no v1 import or unresolved codemod marker in executable TypeScript', async () => {
    const files = await fg(
      ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', 'tooling/**/*.{ts,tsx}'],
      { onlyFiles: true },
    )
    const violations: string[] = []

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      if (source.includes(v1Package) || source.includes(codemodMarker)) {
        violations.push(file)
      }
    }

    expect(violations).toEqual([])
    expect(await readFile('pnpm-lock.yaml', 'utf8')).not.toContain(
      `${v1Package}@`,
    )
  })
})
```

- [ ] **Step 2: Run the invariant test and verify it fails before migration**

Run:

```bash
pnpm exec vitest run tests/ai/mcp-v2-migration.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because `@modelcontextprotocol/server` is absent and the v1
package is still declared and imported.

- [ ] **Step 3: Run the pinned official codemod at the repository root**

Run:

```bash
npx --yes @modelcontextprotocol/codemod@2.0.0 v1-to-v2 . --verbose
```

Expected: the codemod reports the same nine-file migration surface found by the
approved dry run, updates imports and `package.json`, and leaves no
`@mcp-codemod-error` marker.

- [ ] **Step 4: Correct dependency placement and install the lockfile**

After reviewing the codemod diff, make the MCP entries in `package.json` exact:

```json
{
  "dependencies": {
    "@modelcontextprotocol/server": "2.0.0"
  },
  "devDependencies": {
    "@modelcontextprotocol/client": "2.0.0"
  }
}
```

Do not add `@modelcontextprotocol/core` or the codemod as a dependency. Keep all
unrelated dependency entries unchanged. Run:

```bash
pnpm install
```

Expected: install succeeds, `pnpm-lock.yaml` resolves the split packages at
`2.0.0`, and no v1 SDK entry remains.

- [ ] **Step 5: Review and normalize codemod imports**

Use these import boundaries consistently:

```ts
// Runtime server files
import { McpServer, type CallToolResult } from '@modelcontextprotocol/server'
import {
  StdioServerTransport,
  serveStdio,
} from '@modelcontextprotocol/server/stdio'

// Client and in-memory interoperability tests
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
```

Update `vi.mock` targets to the same v2 package paths. Keep the existing direct
legacy stdio implementation compiling in this task; `serveStdio` behavior is
introduced under tests in Task 3.

- [ ] **Step 6: Run migration invariants, types, and the existing MCP suite**

Run:

```bash
pnpm exec vitest run tests/ai/mcp-v2-migration.test.ts tests/ai/mcp-contract.test.ts tests/ai/mcp-read.test.ts tests/ai/mcp-write.test.ts tests/ai/mcp-stdio.test.ts tests/ai/mcp-e2e.test.ts --maxWorkers=1 --no-file-parallelism
pnpm typecheck
```

Expected: PASS. Any changed SDK-generated input-schema snapshots are updated
only to the observed JSON Schema 2020-12 output; tool names and behavior remain
unchanged.

- [ ] **Step 7: Commit the SDK package migration**

```bash
git add package.json pnpm-lock.yaml src/ai/mcp tests/ai/mcp-v2-migration.test.ts tests/ai/mcp-e2e.test.ts tests/ai/mcp-read.test.ts tests/ai/mcp-stdio.test.ts tests/ai/mcp-write.test.ts
git commit -m "chore(mcp): migrate to split SDK v2 packages"
```

---

### Task 2: Add formal output schemas and native structured results

**Files:**
- Create: `src/ai/mcp/output-schemas.ts`
- Modify: `src/ai/mcp/contracts.ts`
- Modify: `tests/ai/mcp-contract.test.ts`
- Modify: `tests/ai/mcp-read.test.ts`
- Modify: `tests/ai/mcp-write.test.ts`

**Interfaces:**
- Consumes: Existing workspace result types and the ten descriptor execution functions.
- Produces: `mcpOutputSchemas`, descriptor `outputSchema`, type-connected execution results, and text plus native `structuredContent` for successful calls.

- [ ] **Step 1: Write failing descriptor and structured-result assertions**

Extend `tests/ai/mcp-contract.test.ts` so every descriptor has an output schema
and the guide schema is a native string:

```ts
const descriptors = [...readToolDescriptors, ...writeToolDescriptors]
expect(descriptors).toHaveLength(10)
for (const descriptor of descriptors) {
  expect(descriptor.outputSchema).toBeDefined()
}
expect(
  z.toJSONSchema(
    readToolDescriptors.find(({ name }) => name === 'guide')!.outputSchema,
    { io: 'output' },
  ),
).toMatchObject({ type: 'string' })
```

Import `z` from `zod`. Change the API-contract key assertion to include
`outputSchema` immediately after `inputSchema`.

In `tests/ai/mcp-read.test.ts` and `tests/ai/mcp-write.test.ts`, add:

```ts
function structured(
  result: Awaited<ReturnType<Client['callTool']>>,
): unknown {
  return result.structuredContent
}
```

For existing object-valued successful calls, assert that `structured(result)`
equals `JSON.parse(text(result))`.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```bash
pnpm exec vitest run tests/ai/mcp-contract.test.ts tests/ai/mcp-read.test.ts tests/ai/mcp-write.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because descriptors do not expose `outputSchema`, the advertised
tool schemas omit it, and guide output has no native structured value.

- [ ] **Step 3: Create the exact output-schema registry**

Create `src/ai/mcp/output-schemas.ts` with strict schemas for current workspace
results:

```ts
import { z } from 'zod'

const workspaceFileSchema = z
  .object({ path: z.string(), route: z.string(), title: z.string() })
  .strict()

const searchResultSchema = z
  .object({
    path: z.string(),
    route: z.string(),
    title: z.string(),
    score: z.number().finite(),
    excerpt: z.string(),
  })
  .strict()

const backlinkSchema = z
  .object({ path: z.string(), route: z.string(), title: z.string() })
  .strict()

const citationSchema = z
  .object({
    path: z.string(),
    line: z.number().int().positive(),
    kind: z.enum(['footnote', 'link']),
    label: z.string(),
    target: z.string().optional(),
    valid: z.boolean(),
  })
  .strict()

const auditIssueSchema = z
  .object({
    code: z.enum([
      'broken-link',
      'citation',
      'artifact',
      'index',
      'contract-missing',
      'contract-schema',
      'contract-version',
      'contract-resource',
      'contract-reference',
      'contract-locale',
      'contract-fallback',
    ]),
    path: z.string(),
    message: z.string(),
  })
  .strict()

const auditNoticeSchema = z
  .object({
    code: z.enum(['base-unknown', 'index-cache']),
    path: z.string(),
    message: z.string(),
  })
  .strict()

const mutationSchema = z
  .object({
    path: z.string(),
    created: z.boolean(),
    bytesBefore: z.number().int().nonnegative(),
    bytesAfter: z.number().int().nonnegative(),
    diff: z.string(),
    index: z
      .object({
        fileCount: z.number().int().nonnegative(),
        index: z.string(),
        fingerprint: z.string(),
      })
      .strict(),
  })
  .strict()

export const mcpOutputSchemas = {
  guide: z.string(),
  list: z
    .object({ path: z.string(), files: z.array(workspaceFileSchema) })
    .strict(),
  search: z
    .object({ query: z.string(), results: z.array(searchResultSchema) })
    .strict(),
  read: z
    .object({
      path: z.string(),
      route: z.string(),
      startLine: z.number().int().positive(),
      endLine: z.number().int().positive(),
      totalLines: z.number().int().nonnegative(),
      text: z.string(),
      truncated: z.boolean(),
    })
    .strict(),
  backlinks: z
    .object({ route: z.string(), backlinks: z.array(backlinkSchema) })
    .strict(),
  citations: z.object({ citations: z.array(citationSchema) }).strict(),
  build: z
    .object({
      outDir: z.literal('.silen/dist'),
      routes: z.array(
        z.object({ path: z.string(), file: z.string() }).strict(),
      ),
      ok: z.boolean(),
      issues: z.array(auditIssueSchema),
      notices: z.array(auditNoticeSchema),
    })
    .strict(),
  write: mutationSchema,
  link: mutationSchema,
  append: mutationSchema,
} as const
```

- [ ] **Step 4: Connect descriptor output types to registration and execution**

In `src/ai/mcp/contracts.ts`, remove the `result: 'json' | 'text'` switch. Give
`McpToolDescriptor` an `outputSchema: z.ZodType` field, and make the internal
factory generic over both schemas:

```ts
interface DescriptorOptions<
  InputSchema extends z.ZodType<Record<string, unknown>>,
  OutputSchema extends z.ZodType,
> {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: InputSchema
  readonly outputSchema: OutputSchema
  readonly annotations: SilenMcpToolAnnotations
  readonly requiresExplicitAuthorization: boolean
  readonly renderText?: (value: z.output<OutputSchema>) => string
  execute(
    workspace: Workspace,
    input: z.output<InputSchema>,
  ): Promise<z.output<OutputSchema>>
}
```

Register both schemas and return the exact value:

```ts
server.registerTool(
  options.name,
  {
    title: options.title,
    description: options.description,
    inputSchema: options.inputSchema,
    outputSchema: options.outputSchema,
    annotations: options.annotations,
  },
  async (input) => {
    try {
      const value = await options.execute(workspace, input)
      return {
        content: [
          {
            type: 'text' as const,
            text: options.renderText
              ? options.renderText(value)
              : JSON.stringify(value, null, 2),
          },
        ],
        structuredContent: value,
      }
    } catch (error) {
      return safeFailure(error)
    }
  },
)
```

Import `mcpOutputSchemas`, assign the matching schema on every descriptor, and
set only the guide's renderer:

```ts
outputSchema: mcpOutputSchemas.guide,
renderText: (value) => value,
```

Use `mcpOutputSchemas.list`, `.search`, `.read`, `.backlinks`, `.citations`,
`.build`, `.write`, `.link`, and `.append` for the remaining named descriptors.
Keep `safeFailure` and `isError: true` unchanged.

- [ ] **Step 5: Run output-schema and MCP behavior tests**

Run:

```bash
pnpm exec vitest run tests/ai/mcp-contract.test.ts tests/ai/mcp-read.test.ts tests/ai/mcp-write.test.ts --maxWorkers=1 --no-file-parallelism
pnpm typecheck
```

Expected: PASS. All successful object results validate and their text parses to
the same value as `structuredContent`; errors remain safe tool errors.

- [ ] **Step 6: Commit formal tool outputs**

```bash
git add src/ai/mcp/output-schemas.ts src/ai/mcp/contracts.ts tests/ai/mcp-contract.test.ts tests/ai/mcp-read.test.ts tests/ai/mcp-write.test.ts
git commit -m "feat(mcp): add formal tool output schemas"
```

---

### Task 3: Host stdio through the native dual-era entry

**Files:**
- Modify: `src/ai/mcp/stdio.ts`
- Modify: `tests/ai/mcp-stdio.test.ts`

**Interfaces:**
- Consumes: `createMcpServer(options)` and v2 `serveStdio`.
- Produces: Existing `serveMcp(options): Promise<void>` backed by a connection-pinned dual-era factory and an idempotent close path.

- [ ] **Step 1: Rewrite lifecycle mocks and add failing dual-era assertions**

In `tests/ai/mcp-stdio.test.ts`, mock `serveStdio` from
`@modelcontextprotocol/server/stdio`. Capture the factory and options and
return a handle whose `close` is the existing `mocks.close` function:

```ts
serveStdio: vi.fn((factory, options) => {
  mocks.factory = factory
  mocks.options = options
  return { close: mocks.close }
}),
```

Add a test that starts `serveMcp`, waits for `serveStdio`, and asserts:

```ts
expect(mocks.options).toMatchObject({
  legacy: 'serve',
  onerror: expect.any(Function),
})
expect(mocks.factory).toBeTypeOf('function')
```

Replace the direct-transport-close cases with one case that calls the captured
`onerror` callback and verifies rejection plus listener cleanup. Retain the
repeated-signal and once-only handle-close assertions. Do not intercept
`transport.onclose`; `serveStdio` owns that callback internally.

- [ ] **Step 2: Run the lifecycle test and verify it fails**

Run:

```bash
pnpm exec vitest run tests/ai/mcp-stdio.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because `serveMcp` still calls `server.connect()` directly and
never invokes `serveStdio`.

- [ ] **Step 3: Replace direct hosting while preserving the public lifecycle**

Refactor `src/ai/mcp/stdio.ts` to this shape:

```ts
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import type { Workspace } from '../workspace.js'
import { createMcpServer } from './server.js'

export interface CreateMcpOptions {
  workspace: Workspace
  allowWrite: boolean
}

export async function serveMcp(options: CreateMcpOptions): Promise<void> {
  let resolveStopped!: () => void
  let rejectStopped!: (error: unknown) => void
  const stopped = new Promise<void>((resolve, reject) => {
    resolveStopped = resolve
    rejectStopped = reject
  })

  const handle = serveStdio(() => createMcpServer(options), {
    legacy: 'serve',
    onerror: rejectStopped,
  })

  let closePromise: Promise<void> | undefined
  const close = (): void => {
    closePromise ??= handle.close()
    void closePromise.then(resolveStopped, rejectStopped)
  }

  process.on('SIGINT', close)
  process.on('SIGTERM', close)
  process.stdin.once('end', close)
  try {
    await stopped
  } finally {
    process.off('SIGINT', close)
    process.off('SIGTERM', close)
    process.stdin.off('end', close)
    await (closePromise ?? handle.close())
  }
}
```

Let the SDK own its default stdio transport. Do not add a transport adapter or
duplicate `serveStdio`'s internal close routing.

- [ ] **Step 4: Run lifecycle, type, and legacy smoke tests**

Run:

```bash
pnpm exec vitest run tests/ai/mcp-stdio.test.ts tests/ai/mcp-read.test.ts tests/ai/mcp-write.test.ts --maxWorkers=1 --no-file-parallelism
pnpm typecheck
```

Expected: PASS. Closing remains once-only, listeners return to baseline, and
default read/write behavior is unchanged.

- [ ] **Step 5: Commit dual-era stdio hosting**

```bash
git add src/ai/mcp/stdio.ts tests/ai/mcp-stdio.test.ts
git commit -m "feat(mcp): serve legacy and modern stdio eras"
```

---

### Task 4: Add pinned legacy and modern built-stdio fixtures

**Files:**
- Modify: `tests/ai/mcp-e2e.test.ts`
- Modify: `tests/ai/mcp-stdio.test.ts`

**Interfaces:**
- Consumes: Built `dist/node/cli.js`, v2 client pinning, and the existing temporary workspace fixture.
- Produces: Explicit `2025-11-25` and `2026-07-28` acceptance evidence using the real CLI process.

- [ ] **Step 1: Parameterize the built client by verified protocol revision**

In `tests/ai/mcp-e2e.test.ts`, define:

```ts
type VerifiedEra = 'legacy' | 'modern'

const LEGACY_PROTOCOL_VERSION = '2025-11-25'
const MODERN_PROTOCOL_VERSION = '2026-07-28'

function createVerifiedClient(era: VerifiedEra): Client {
  return new Client(
    { name: `silen-${era}-test`, version: '1.0.0' },
    era === 'legacy'
      ? { supportedProtocolVersions: [LEGACY_PROTOCOL_VERSION] }
      : {
          supportedProtocolVersions: [
            LEGACY_PROTOCOL_VERSION,
            MODERN_PROTOCOL_VERSION,
          ],
          versionNegotiation: { mode: { pin: MODERN_PROTOCOL_VERSION } },
        },
  )
}
```

Change `startBuiltClient` to accept `era` and `allowWrite`, construct this
client, connect it to `StdioClientTransport`, and assert:

```ts
expect(client.getProtocolEra()).toBe(era)
expect(client.getNegotiatedProtocolVersion()).toBe(
  era === 'legacy' ? LEGACY_PROTOCOL_VERSION : MODERN_PROTOCOL_VERSION,
)
```

- [ ] **Step 2: Add failing era-specific guide and permission tests**

Run the read-only CLI test for both eras. Assert seven tool names, no write
tool, object-valued search output, and guide compatibility:

```ts
if (era === 'modern') {
  expect(guide.structuredContent).toContain('read-only')
  expect(guideTool?.outputSchema).toMatchObject({ type: 'string' })
} else {
  expect(guide.structuredContent).toMatchObject({
    result: expect.stringContaining('read-only'),
  })
  expect(guideTool?.outputSchema).toMatchObject({
    type: 'object',
    properties: { result: { type: 'string' } },
  })
}
```

Run the explicit-write test for both eras and assert the same ten names and one
safe temporary write. Keep absolute workspace paths absent from text and
structured output.

In `tests/ai/mcp-stdio.test.ts`, remove the SDK
`LATEST_PROTOCOL_VERSION` import and use the literal legacy constant in the raw
signal fixture.

- [ ] **Step 3: Build and run the fixtures to verify the modern cases fail first**

Run:

```bash
pnpm build
pnpm exec vitest run tests/ai/mcp-e2e.test.ts tests/ai/mcp-stdio.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected before completing the fixture/runtime adjustments: modern pinning or
the native guide assertions FAIL. Legacy assertions must remain green.

- [ ] **Step 4: Make only compatibility-driven fixture corrections**

Use `client.getNegotiatedProtocolVersion()` exactly as shown above. Do not read
private fields or parse SDK build output.

Keep timeout at `60_000` for modern stdio cases because the official client may
spawn a disposable probe sibling before the pinned session process.

- [ ] **Step 5: Run both era fixtures and commit**

Run:

```bash
pnpm build
pnpm exec vitest run tests/ai/mcp-e2e.test.ts tests/ai/mcp-stdio.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: PASS for legacy and modern read-only and explicit-write cases;
closing each client leaves `transport.pid` null, stderr empty, and stdout
protocol-clean.

```bash
git add tests/ai/mcp-e2e.test.ts tests/ai/mcp-stdio.test.ts
git commit -m "test(mcp): verify legacy and modern stdio protocols"
```

---

### Task 5: Upgrade generated Agent Contract documents to schema version 2

**Files:**
- Modify: `src/shared/ai-contract.ts`
- Modify: `src/ai/contract/schema.ts`
- Modify: `src/ai/contract/mcp-api.ts`
- Modify: `src/ai/contract/serialize.ts`
- Modify: `src/ai/contract/framework.ts`
- Modify: `src/ai/contract/site.ts`
- Modify: `src/ai/audit.ts`
- Modify: `tests/ai/contract-schema.test.ts`
- Modify: `tests/ai/contract-audit.test.ts`
- Modify: `tests/ai/mcp-contract.test.ts`
- Modify: `tests/ai/public-api.test.ts`
- Modify: `tests/ai/site-contract.test.ts`
- Modify: `tests/ai/framework-contract.test.ts`

**Interfaces:**
- Consumes: Descriptor input/output schemas, contract builders, strict parsers, and deterministic serializer.
- Produces: Strict manifest/API schema version 2 with verified MCP facts and generated `outputSchema`.

- [ ] **Step 1: Change contract fixtures first and verify schema v2 fails**

Update test fixture objects to this exact MCP capability:

```ts
mcp: {
  transport: 'stdio',
  protocolVersions: ['2025-11-25', '2026-07-28'],
  extensions: [],
  localOnly: true,
  readOnlyByDefault: true,
  writeRequiresFlag: '--allow-write',
}
```

Change manifest and API fixture `schemaVersion` to `2`. Add
`outputSchema: { type: 'object' }` to API tool fixtures. Rename the contract
describe block to `Silen Agent Contract v2`. Assert schema versions 1 and 3 are
rejected. In audit tests, verify both versions produce the existing safe
`contract-fallback` diagnostic.

Run:

```bash
pnpm exec vitest run tests/ai/contract-schema.test.ts tests/ai/contract-audit.test.ts tests/ai/mcp-contract.test.ts tests/ai/public-api.test.ts tests/ai/site-contract.test.ts tests/ai/framework-contract.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because production types, schemas, builders, and serializers
still require version 1 and omit the new MCP fields.

- [ ] **Step 2: Update public contract types**

In `src/shared/ai-contract.ts`, make the minimal changes:

```ts
export interface SilenMcpCapability {
  readonly transport: 'stdio'
  readonly protocolVersions: readonly ['2025-11-25', '2026-07-28']
  readonly extensions: readonly []
  readonly localOnly: true
  readonly readOnlyByDefault: true
  readonly writeRequiresFlag: '--allow-write'
}

export interface SilenMcpToolContract {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: { readonly [key: string]: SilenJsonValue }
  readonly outputSchema: { readonly [key: string]: SilenJsonValue }
  readonly annotations: SilenMcpToolAnnotations
  readonly requiresExplicitAuthorization: boolean
}
```

Change both manifest and API `schemaVersion` literals from `1` to `2`. Keep task
`contractVersion: 1`; task Markdown format is not changing in AI-005.

- [ ] **Step 3: Update strict runtime schemas and builders**

In `src/ai/contract/schema.ts`, require:

```ts
protocolVersions: z.tuple([
  z.literal('2025-11-25'),
  z.literal('2026-07-28'),
]),
extensions: z.tuple([]),
```

Change manifest and API root literals to `z.literal(2)` and add
`outputSchema: z.record(z.string(), jsonValueSchema)` to `mcpToolSchema`.

In both `framework.ts` and `site.ts`, emit version 2 and the exact capability
fields from Step 1. In `audit.ts`, change the supported schema check and message
from v1 to v2; keep the existing `contract-fallback` behavior for any other
schema version.

- [ ] **Step 4: Generate and normalize output schemas from descriptors**

Refactor `src/ai/contract/mcp-api.ts` to serialize either schema:

```ts
function publicJsonSchema(
  schema: z.ZodType,
  io: 'input' | 'output',
): Record<string, SilenJsonValue> {
  return JSON.parse(
    JSON.stringify(z.toJSONSchema(schema, { io })),
  ) as Record<string, SilenJsonValue>
}
```

Each tool entry becomes:

```ts
inputSchema: publicJsonSchema(descriptor.inputSchema, 'input'),
outputSchema: publicJsonSchema(descriptor.outputSchema, 'output'),
```

In `serialize.ts`, normalize both fields:

```ts
inputSchema: normalizeJsonRecord(tool.inputSchema),
outputSchema: normalizeJsonRecord(tool.outputSchema),
```

- [ ] **Step 5: Run contract generation and focused tests**

Run:

```bash
pnpm build
pnpm exec vitest run tests/ai/contract-schema.test.ts tests/ai/contract-audit.test.ts tests/ai/mcp-contract.test.ts tests/ai/public-api.test.ts tests/ai/site-contract.test.ts tests/ai/framework-contract.test.ts --maxWorkers=1 --no-file-parallelism
pnpm typecheck
```

Expected: PASS. Repeated `pnpm build` emits byte-identical `dist/agent` contract
files, all ten API tools contain `outputSchema`, and old/new unsupported schema
versions fail safely.

- [ ] **Step 6: Commit Agent Contract v2**

```bash
git add src/shared/ai-contract.ts src/ai/contract src/ai/audit.ts tests/ai/contract-schema.test.ts tests/ai/contract-audit.test.ts tests/ai/mcp-contract.test.ts tests/ai/public-api.test.ts tests/ai/site-contract.test.ts tests/ai/framework-contract.test.ts
git commit -m "feat(ai): publish MCP protocol and output contracts"
```

---

### Task 6: Synchronize public documentation and package-consumer evidence

**Files:**
- Modify: `README.md`
- Modify: `website/ai/index.mdx`
- Modify: `website/zh/ai/index.mdx`
- Modify: `website/ai/local-workspace-mcp/index.mdx`
- Modify: `website/zh/ai/local-workspace-mcp/index.mdx`
- Modify: `website/ai/agent-contract/index.mdx`
- Modify: `website/zh/ai/agent-contract/index.mdx`
- Modify: `website/reference/index.mdx`
- Modify: `website/zh/reference/index.mdx`
- Modify: `tests/ai/documentation.test.ts`

**Interfaces:**
- Consumes: Shipped MCP behavior and Agent Contract v2 fields from Tasks 1-5.
- Produces: Bilingual user guidance and fresh-package proof for the unchanged public API over SDK v2.

- [ ] **Step 1: Add failing documentation assertions**

Add one test in `tests/ai/documentation.test.ts` that reads README plus the
English and Chinese MCP and Agent Contract pages, joins them into one corpus,
and asserts:

```ts
const corpus = documents.join('\n')
for (const value of [
  '2025-11-25',
  '2026-07-28',
  'schemaVersion: 2',
  'outputSchema',
  'structuredContent',
  'stdio',
]) {
  expect(corpus).toContain(value)
}
```

Use locale-appropriate prose but keep these machine tokens identical. Also
assert each local MCP page contains `--allow-write`, describes the default as
read-only, and explicitly says remote transport is not enabled.

- [ ] **Step 2: Run the documentation test and verify it fails**

Run:

```bash
pnpm exec vitest run tests/ai/documentation.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: FAIL because current docs describe only the v1-era stdio contract.

- [ ] **Step 3: Update bilingual docs without duplicating protocol internals**

Document these user-visible facts:

- The existing `silen mcp [root]` command now uses stable SDK v2.
- One stdio entry accepts verified `2025-11-25` and `2026-07-28` clients.
- Default discovery remains seven read-only tools; `--allow-write` adds exactly
  three mutation tools.
- Successful calls expose text and schema-validated structured content.
- Agent Contract schema version 2 lists protocol versions, empty extensions,
  and each tool output schema.
- No remote transport, model, provider key, shell, or default extension is
  introduced.

Link to the official protocol-version page instead of copying its full era
matrix into Silen docs.

- [ ] **Step 4: Reuse the existing fresh package-consumer coverage**

Do not add a second package-consumer fixture. The existing script in
`tests/package-nodenext.test.ts` already imports the public AI entry, constructs
the packaged `createMcpServer`, and closes it cleanly:

```ts
import {
  createMcpServer,
  createWorkspace,
  WorkspaceError,
} from '@aicode-nexus/silen/ai'
```

Running this unchanged after the dependency split proves the fresh consumer can
resolve `@modelcontextprotocol/server` through Silen. The built stdio fixtures
in Task 4 own client interoperability, so do not install or import
`@modelcontextprotocol/client` here.

- [ ] **Step 5: Run docs, package, and public API tests**

Run:

```bash
pnpm build
pnpm exec vitest run tests/ai/documentation.test.ts tests/ai/public-api.test.ts tests/package-nodenext.test.ts tests/package-smoke.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: PASS. The packed NodeNext consumer installs, typechecks, imports the
AI entry, constructs the v2 server, and exits cleanly.

- [ ] **Step 6: Commit documentation and consumer proof**

```bash
git add README.md website/ai website/zh/ai website/reference/index.mdx website/zh/reference/index.mdx tests/ai/documentation.test.ts
git commit -m "docs(mcp): explain dual-protocol SDK v2 support"
```

---

### Task 7: Run complete gates and record AI-005 as shipped

**Files:**
- Modify: `docs/project-map.md`

**Interfaces:**
- Consumes: All AI-005 implementation commits and the repository's canonical quality gates.
- Produces: Default-branch verification evidence and a project map with AI-005 in `Shipped` and no premature AI-006 activation.

- [ ] **Step 1: Run the focused AI-005 suite once more**

Run:

```bash
pnpm build
pnpm exec vitest run tests/ai/mcp-v2-migration.test.ts tests/ai/mcp-contract.test.ts tests/ai/mcp-read.test.ts tests/ai/mcp-write.test.ts tests/ai/mcp-stdio.test.ts tests/ai/mcp-e2e.test.ts tests/ai/contract-schema.test.ts tests/ai/contract-audit.test.ts tests/ai/framework-contract.test.ts tests/ai/site-contract.test.ts tests/ai/documentation.test.ts tests/ai/public-api.test.ts tests/package-nodenext.test.ts --maxWorkers=1 --no-file-parallelism
```

Expected: every focused test passes with both verified protocol fixtures.

- [ ] **Step 2: Run the complete repository gates**

Run each command separately and stop at the first failure:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm exec publint
pnpm site:ai-check
pnpm check:no-maps dist website/.silen/dist
pnpm pack --dry-run
```

Expected: all commands exit 0; the full test count is recorded from the actual
run; the official 24-case AI suite passes; no `.map` file or
`sourceMappingURL` appears; the tarball contains generated Agent Contract v2
and no client SDK runtime dependency.

- [ ] **Step 3: Verify deterministic contract bytes**

Run two clean package builds and hash the generated contract files after each:

```bash
pnpm build
shasum -a 256 dist/agent/manifest.json dist/agent/api.json
pnpm build
shasum -a 256 dist/agent/manifest.json dist/agent/api.json
```

Expected: the two hash pairs are identical. Record the observed hashes in the
AI-005 project-map evidence paragraph.

- [ ] **Step 4: Move AI-005 from Active to Shipped**

Update `docs/project-map.md` in the same change set:

- Set `Last reviewed` to the completion date.
- Set `Default next item` to `None; refine AI-006 before promotion.`
- Replace the Active AI-005 block with “No map-selected item is active.”
- Keep Ready empty.
- Leave AI-006 as Candidate until its own mapping design is approved.
- Add AI-005 to Shipped with links to the approved design, this plan, runtime,
  output schemas, contract types, protocol tests, and the exact verification
  counts and deterministic hashes observed above.

- [ ] **Step 5: Validate the map and documentation change**

Run:

```bash
pnpm exec prettier --check docs/project-map.md
pnpm exec vitest run tests/ai/documentation.test.ts --maxWorkers=1 --no-file-parallelism
git diff --check
```

Expected: PASS, with exactly one durable roadmap state for AI-005.

- [ ] **Step 6: Commit the shipped evidence**

```bash
git add docs/project-map.md
git commit -m "docs: ship MCP v2 dual-protocol migration"
```

- [ ] **Step 7: Confirm the implementation branch is clean**

Run:

```bash
git status --short --branch
git log --oneline --decorate -8
```

Expected: no unstaged or untracked files from AI-005. Do not bump version,
push, publish, or deploy in this task; proceed to the separately designed
AI-006 work before the authorized `0.5.0` release ladder.
