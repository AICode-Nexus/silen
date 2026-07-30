# Silen MCP v2 Dual-Protocol Migration Design

- Status: Pending written-spec review
- Date: 2026-07-30
- Map item: AI-005
- Target release: 0.5.0
- Package: `@aicode-nexus/silen`

## 1. Summary

Silen will replace the monolithic `@modelcontextprotocol/sdk` v1 dependency
with the stable split TypeScript SDK v2 packages. Its existing local stdio MCP
entry will serve the verified legacy revision `2025-11-25` and modern revision
`2026-07-28` from one server factory.

The migration keeps Silen's current product boundary: the same tool names,
read-only default, explicit `--allow-write` opt-in, no shell, bounded inputs,
path confinement, local-only stdio transport, and model-free operation. It also
adds a formal output schema to every tool and publishes the verified protocol,
transport, extension, and output-schema facts through Agent Contract schema
version 2.

This design intentionally does not introduce a compatibility framework. It
uses the SDK's native dual-era stdio entry, one tool registry, one result path,
and one small contract-shape revision.

## 2. Current facts

The current package:

- Depends on `@modelcontextprotocol/sdk` `1.29.0`.
- Imports `McpServer`, `StdioServerTransport`, clients, shared types, and the
  in-memory transport from v1 deep paths.
- Exposes `createMcpServer` and `serveMcp` from
  `@aicode-nexus/silen/ai`.
- Registers seven read-only tools by default and three mutation tools only
  with `--allow-write`.
- Already returns object-valued `structuredContent` for JSON results, but does
  not declare tool output schemas and wraps non-object JSON values.
- Emits strict Agent Contract manifest and API documents with
  `schemaVersion: 1`; the manifest only declares stdio and permission facts.

The repository already satisfies SDK v2's runtime prerequisites: Silen
requires Node `^20.19.0 || >=22.12.0`, and uses Zod `4.4.3`.

On 2026-07-30, the public npm registry reported stable `2.0.0` releases for
`@modelcontextprotocol/server`, `@modelcontextprotocol/client`,
`@modelcontextprotocol/core`, and `@modelcontextprotocol/codemod`.

A pinned repository-root dry run:

```text
npx --yes @modelcontextprotocol/codemod@2.0.0 v1-to-v2 . --dry-run --verbose
```

reported 15 changes across 9 files. It identified server and client package
splits and one manual review of the existing descriptor input schema. It did
not report an unresolved codemod error.

## 3. Product decisions

The selected approach is a one-pass native v2 migration:

1. Run the official `2.0.0` codemod at the repository root.
2. Keep `@modelcontextprotocol/server` `2.0.0` as a runtime dependency.
3. Keep `@modelcontextprotocol/client` `2.0.0` as a development dependency for
   interoperability tests.
4. Do not depend directly on `@modelcontextprotocol/core`; Silen does not need
   raw protocol Zod schemas.
5. Replace direct `McpServer.connect(new StdioServerTransport())` hosting with
   `serveStdio(factory, { legacy: 'serve' })`.
6. Preserve the existing public Silen function and CLI names.
7. Add output schemas to the existing descriptors instead of creating a
   second MCP registry.
8. Emit Agent Contract manifest and API schema version 2 rather than adding
   fields under the strict version 1 schema.

Two alternatives are rejected:

- Keeping both SDK generations would duplicate runtime types and violate the
  completion requirement that no v1 dependency or import remain.
- Creating separate legacy and modern CLI entries would duplicate host
  configuration and make protocol choice a user-facing concern that the v2
  stdio entry already solves.

## 4. Goals

AI-005 must:

1. Use the official split SDK v2 packages with no v1 residue.
2. Serve verified `2025-11-25` and `2026-07-28` clients over the existing local
   stdio command.
3. Preserve the current ten tool names and all permission and filesystem
   boundaries.
4. Give every tool a formal output schema derived from the same source as its
   runtime result.
5. Return native arbitrary JSON `structuredContent` plus human-readable text
   for every successful tool call.
6. Extend the generated Agent Contract with only the protocol, transport,
   extension, and output-schema facts clients need.
7. Preserve deterministic contract generation and protocol-clean stdout.
8. Preserve clean shutdown on transport close, stdin end, `SIGINT`, and
   `SIGTERM`.

## 5. Non-goals

AI-005 will not:

- Add HTTP, SSE, WebSocket, remote MCP, OAuth, authentication, or tenancy.
- Add Tasks, Apps, Skills over MCP, subscriptions, sampling, elicitation, or
  other extensions.
- Generate filesystem Agent Skills; that is AI-006.
- Add an extension registry, plugin API, protocol adapter abstraction, or
  per-version handler implementation.
- Verify every historical legacy revision. Runtime support comes from the SDK,
  while Silen's acceptance fixtures pin `2025-11-25` and `2026-07-28`.
- Rename tools, change tool descriptions for style alone, or add tools.
- Change workspace indexing, search ranking, write semantics, input bounds,
  error codes, or path policy.
- Change the `mcp` CLI syntax or make writes available by default.
- Publish, deploy, or release by itself. The authorized `0.5.0` release occurs
  after AI-006 and the complete release ladder pass.

## 6. Runtime architecture

### 6.1 Dependency boundary

Runtime source imports server types and hosting functions from
`@modelcontextprotocol/server` and `@modelcontextprotocol/server/stdio`.
Interoperability tests import their client and client-side stdio transport from
`@modelcontextprotocol/client`. Tests may import the in-memory transport from
one v2 package consistently; objects from client and server packages are not
checked with cross-package `instanceof`.

The codemod is an execution tool, not a package dependency. The migration runs
the pinned command once, reviews its diff, removes every
`@mcp-codemod-error`, and then confirms that no v1 package literal remains in
source, tests, tooling, manifests, or lockfiles.

### 6.2 Server factory and stdio entry

`createMcpServer(options)` remains the only server factory. It creates one v2
`McpServer`, registers the seven read descriptors, conditionally registers the
three write descriptors, and returns the server. Its public name and options
remain unchanged.

`serveMcp(options)` retains its `Promise<void>` lifecycle but delegates protocol
opening and era selection to:

```text
serveStdio(() => createMcpServer(options), { legacy: 'serve' })
```

The explicit legacy option records product intent even though it is the SDK
default. One server instance is pinned to one connection. Both protocol
revisions therefore use the same descriptors, workspace, and permission gate.

The returned stdio handle replaces direct calls to `server.close()`. Existing
signal and stdin listeners converge on one idempotent close operation. A custom
stdio transport is passed only where needed to retain the existing awaitable
transport-close behavior; no general transport abstraction is added.

### 6.3 Tool descriptors and results

Each `McpToolDescriptor` gains one `outputSchema` field. Input and output
schemas are Zod 4 schema objects. Output schema definitions live in one focused
MCP output-schema module because the ten workspace result shapes are shared by
runtime registration, Agent Contract generation, and tests.

The descriptor factory keeps input and output types connected to `execute`.
For a successful call:

- `structuredContent` is the exact output value, including strings, arrays,
  objects, numbers, booleans, or null, before protocol-era encoding.
- `content[0].text` remains directly useful to a person or model. Object and
  array values use stable pretty JSON; the guide string remains its existing
  text.

The `guide` tool therefore exposes a string output schema and native string
`structuredContent`. The other existing tools retain their current object
result shapes. Silen does not change result shapes merely to demonstrate every
JSON root type.

On a `2026-07-28` connection, the native guide string is sent directly. On a
legacy connection, SDK v2 applies the protocol-required `{ "result": value }`
compatibility envelope to a non-object output schema and structured value.
Silen relies on that codec and does not implement its own wrapper. The explicit
text block is unchanged in both eras.

Workspace failures keep the current safe object:

```json
{
  "code": "OUTSIDE_ROOT",
  "reason": "Path is outside the content root"
}
```

and `isError: true`. SDK v2 skips output-schema validation for error results,
so failure objects do not need to be unioned into every success schema.
Unexpected errors keep the generic `WORKSPACE_OPERATION_FAILED` response and
never expose absolute paths or internal details.

## 7. Agent Contract schema version 2

Both generated machine documents move to schema version 2 because their
current parsers are strict:

- Manifest v2 extends `capabilities.mcp`.
- API v2 adds `outputSchema` to every MCP tool.

The minimal manifest MCP shape is:

```json
{
  "transport": "stdio",
  "protocolVersions": ["2025-11-25", "2026-07-28"],
  "extensions": [],
  "localOnly": true,
  "readOnlyByDefault": true,
  "writeRequiresFlag": "--allow-write"
}
```

No separate era list is emitted because it duplicates the version facts. No
supported-versus-required extension split is emitted because Silen enables no
extension in AI-005. Future promoted work can version the schema again if its
extension semantics require more structure.

`outputSchema` is serialized from each descriptor with the same deterministic
JSON normalization used for `inputSchema`. Contract tests compare the generated
schemas with modern `tools/list` so public documentation cannot drift from the
canonical native runtime advertisement. Legacy tests separately verify the
SDK's required compatibility envelope for the string-valued guide tool.

The current-version parsers emit and accept schema version 2. Version 1
artifacts remain valid products of older Silen releases; AI-005 does not add a
dual-schema compatibility layer. A newer CLI auditing stale generated
artifacts continues to fail safely with a contract-version diagnostic and asks
for regeneration.

## 8. Protocol compatibility

Silen's runtime uses the SDK's native protocol opening behavior. Its explicit
compatibility claim is limited to the two revisions in the generated contract:

- `2025-11-25`: legacy initialize handshake.
- `2026-07-28`: modern server/discover opening and response metadata.

Tests pin literal versions rather than an SDK `LATEST_PROTOCOL_VERSION`
constant so a future dependency update cannot silently change the claimed
matrix. The modern fixture uses client pin mode and asserts a modern negotiated
era. The legacy fixture uses the default legacy opening with supported versions
restricted to `2025-11-25`.

Both fixtures assert the same tool names, annotations, calls, human-readable
content, errors, and permission behavior. Object-valued outputs remain equal in
both eras. The string-valued guide asserts native modern output and the SDK's
legacy compatibility envelope rather than pretending the wire formats are
identical. Modern support does not enable any extension or remote transport.

## 9. Public package impact

The public `@aicode-nexus/silen/ai` names remain:

- `createMcpServer`
- `CreateMcpServerOptions`
- `serveMcp`
- `CreateMcpOptions`

`createMcpServer` now returns the v2 `McpServer` type. This is an intentional
dependency-generation change in the planned `0.5.0` release, not a Silen API
rename. Runtime consumers receive `@modelcontextprotocol/server` transitively.
Client code is not part of the Silen runtime dependency surface.

The package version, `src/shared/version.ts`, generated Agent Contract version,
README, bilingual documentation, changelog, and package tarball are synchronized
during the later `0.5.0` release step, after AI-006 is complete.

## 10. Verification

Focused verification must cover:

1. Pinned codemod output and absence of unresolved markers.
2. No `@modelcontextprotocol/sdk` import, dependency, lockfile entry, or
   generated runtime import.
3. Exact server/client dependency placement and versions.
4. All ten descriptors advertise a valid output schema.
5. Success output validates against its schema and preserves text plus native
   `structuredContent`.
6. Error results remain safe and useful without output-schema validation.
7. Default discovery exposes exactly seven read-only tools.
8. `--allow-write` discovery exposes the same seven plus `write`, `link`, and
   `append`.
9. Legacy `2025-11-25` in-memory and built-stdio interoperability.
10. Modern `2026-07-28` built-stdio negotiation and calls.
11. Clean, once-only shutdown for transport close, stdin end, `SIGINT`, and
    `SIGTERM`.
12. Agent Contract v2 schema, protocol list, empty extensions, tool output
    schemas, version checks, package contents, and byte determinism.

Repository completion then requires the normal provider-free gates:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm exec publint
pnpm site:ai-check
pnpm check:no-maps dist website/.silen/dist
pnpm pack --dry-run
fresh tarball consumer install/import/MCP smoke test
```

## 11. Completion boundary

AI-005 is complete when all requirements above pass on the default branch and
the project map records the evidence. It does not release `0.5.0` alone.

AI-006 then generates deterministic read-only filesystem Agent Skills from the
versioned Agent Contract. Only after AI-005 and AI-006 pass their independent
design, implementation, and verification gates does the authorized release
workflow update versions, build and inspect the package, push, create the
GitHub Release, verify npm publication, deploy Pages, and verify the live
surfaces.

## 12. References

- [Silen project map](../../project-map.md)
- [Current MCP server](../../../src/ai/mcp/server.ts)
- [Current stdio lifecycle](../../../src/ai/mcp/stdio.ts)
- [Current tool descriptors](../../../src/ai/mcp/contracts.ts)
- [Current Agent Contract types](../../../src/shared/ai-contract.ts)
- [Official v1-to-v2 migration](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2)
- [Official 2026-07-28 migration](https://ts.sdk.modelcontextprotocol.io/v2/migration/support-2026-07-28)
- [Official protocol versions](https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions)
- [Official `serveStdio` API](https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/server/server/serveStdio.html)
- [Official tool output API](https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/server/server/mcp.html)
- [MCP JSON Schema 2020-12 decision](https://modelcontextprotocol.io/seps/2106-json-schema-2020-12)
