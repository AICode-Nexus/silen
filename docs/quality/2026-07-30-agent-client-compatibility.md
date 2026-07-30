# Silen Agent Client Compatibility Evidence

- **Date:** 2026-07-30
- **Status:** Complete with bounded host limitations
- **Published package:** `@aicode-nexus/silen@0.5.0`
- **Protocol control:** `@modelcontextprotocol/client@2.0.0`
- **Synthetic consumer:** `/tmp/silen-client-compat.HPbmKG`

## Decision

The published package and deterministic MCP compatibility surface are
`Compatible`. Codex CLI and Claude Code are `Partial`: both recognized or
started the intended local surfaces, but the machine's model API connections
did not complete, so neither host performed the final `guide` tool call.
Cursor remains `Unavailable` as a terminal Agent because only the IDE launcher
is installed.

This evidence does not justify starting MCP Tasks or Apps work. `AI-008`
remains in Watch.

## Compatibility matrix

| Surface | Installed version | Grade | Direct evidence | Limitation |
| --- | --- | --- | --- | --- |
| Codex CLI | `0.133.0` | `Partial` | Read-only app-server `skills/list` found the enabled repo-scoped `silen-docs-readonly` Skill; invocation-only MCP configuration started the published Silen stdio process | Repeated model-stream disconnects occurred before the requested Skill marker or `guide` call |
| Claude Code | `2.1.220` | `Partial` | Stream initialization listed `silen-docs-readonly` as both a Skill and slash command; strict invocation-only MCP configuration started the published Silen stdio process | Repeated API retries occurred before model output or the `guide` call; the bounded run used zero model tokens and reported zero cost |
| Cursor IDE | `3.7.12` (`b887a26`, arm64) | `Unavailable` | IDE bundle and launcher are installed | `cursor-agent`, Gemini CLI, and OpenCode CLI are absent; no Agent or extension was installed for this validation |
| MCP v2 client | `2.0.0` | `Compatible` | Four independent stdio sessions passed across both protocol eras and both extension modes | Protocol control is not a substitute for a completed model-mediated host call |

`Compatible`, `Partial`, and `Unavailable` describe the tested surface, not an
overall endorsement or failure of the client product.

## Published-package evidence

The guarded npm consumer resolved Node.js `22.22.3`, npm `10.9.8`, Silen
`0.5.0`, and the split MCP client `2.0.0`. `silen --version` returned
`silen/0.5.0 darwin-arm64 node-v22.22.3`.

The public CLI materialized both host layouts:

- `.agents/skills/silen-docs-readonly`: five files;
- `.claude/skills/silen-docs-readonly`: five files.

Recursive comparisons against
`node_modules/@aicode-nexus/silen/dist/agent/skills/silen-docs-readonly` were
empty before and after the host probes. The generated metadata retained
`name: silen-docs-readonly`, `silen-version: "0.5.0"`, contract version `2`,
and the explicit no-shell/no-write/no-deploy permission boundary.

## Actual-host observations

### Codex CLI

The effective probe placed global sandbox and approval flags before `exec`, as
required by Codex CLI `0.133.0`. It used an ephemeral session, ignored user
configuration and rule files, skipped only the non-Git-directory check, and
kept the sandbox read-only.

The installed Codex app-server's read-only `skills/list` method returned the
generated Skill as enabled with `repo` scope and no discovery errors. A
separate JSON-mode `exec` probe accepted invocation-only Silen MCP settings and
spawned the exact package-local `silen mcp docs` process. The model stream then
disconnected repeatedly. The run was interrupted after the bounded retries;
no tool call, file mutation, persistent session, or child process remained.

### Claude Code

Claude ran with project-only settings and no session persistence. Its streamed
initialization event listed `silen-docs-readonly` in both `skills` and
`slash_commands`. A strict invocation-only MCP definition also spawned the
exact package-local `silen mcp docs` process.

The API transport retried without receiving a model response. The bounded run
was interrupted before any tool call and reported zero input tokens, zero
output tokens, and zero cost. No Silen child process remained afterward. The
report intentionally omits client authentication details and local home paths.

### Cursor

Cursor's installed command is the IDE launcher, not the separate headless
Agent. Asking that launcher for Agent help attempted to fetch the missing
companion and failed; a post-check confirmed that `cursor-agent` was still
absent. The validation did not retry, persist an installation, launch a new IDE
profile, or alter Cursor configuration.

## Deterministic MCP control

The same npm consumer ran the official v2 client against the published Silen
stdio entry. It pinned each connection to one verified era:

| Protocol era | Mode | Tools | Resources | Skill bytes | Shutdown |
| --- | --- | ---: | ---: | --- | --- |
| `2025-11-25` | Default | 7 | Capability absent | Not exposed | Clean |
| `2025-11-25` | `--experimental-skills-over-mcp` | 7 | 6 | Exact npm match | Clean |
| `2026-07-28` | Default | 7 | Capability absent | Not exposed | Clean |
| `2026-07-28` | `--experimental-skills-over-mcp` | 7 | 6 | Exact npm match | Clean |

For experimental sessions, the client also observed the
`io.modelcontextprotocol/skills` extension, read
`skill://silen-docs-readonly/SKILL.md`, and confirmed that returned payloads
did not contain the temporary consumer path. Every session closed with a null
transport PID, no protocol error, and empty server stderr. The control made no
write call and started no remote transport.

## Repository gate

The isolated validation branch passed `pnpm format:check`, `pnpm lint`,
`pnpm typecheck`, `pnpm build`, and the complete single-worker test suite: 76
test files and 735 tests. `git diff --check` also passed, and the final change
scope remained the project map, validation plan, and dated quality report.

## `AI-008` promotion decision

Keep `AI-008` in Watch. The probes exercised filesystem Skills, ordinary MCP
tools, and experimental read-only Resources only. They did not demonstrate:

- MCP Tasks or Apps negotiation in an actual host;
- a bounded long-running audit/evaluation need;
- cancellation, expiry, persistence, or restart semantics;
- App sandbox, content-security-policy, or host-rendering boundaries.

A healthy standard MCP connection would still not satisfy those entry gates.

## Follow-up boundary

No source, package version, workflow, npm release, Pages deployment, global
client configuration, credential, write tool, Remote MCP surface, Task, or App
changed in this validation. When model API connectivity is healthy, the only
useful follow-up is to rerun the two blocked `guide` calls. Cursor should be
retested only after a separately authorized terminal Agent installation.
