# Silen Real-Client Compatibility Validation Design

- **Status:** Approved
- **Date:** 2026-07-30
- **Project map item:** `QUAL-004`
- **Horizon:** `0.5.x` validation

## 1. Summary

Validate the published Silen `0.5.0` Agent Skill and local MCP surface against
the actual Agent clients already installed on this machine. The work produces
compatibility evidence and a promotion decision for `AI-008`; it does not add
runtime behavior, install clients, alter user-level client configuration, or
start `0.6.x` implementation.

The machine currently provides two headless Agent clients suitable for full
probes—Codex CLI and Claude Code—and one installed Cursor IDE whose terminal
Agent companion is absent. The official MCP v2 client remains the protocol
control, not a substitute for a real host.

## 2. Decision

Use a four-row matrix with explicit evidence grades:

| Surface | Role | Required evidence |
| --- | --- | --- |
| Codex CLI | Actual Agent host | Filesystem Skill discovery and one read-only Silen MCP call |
| Claude Code | Actual Agent host | Filesystem Skill discovery and one read-only Silen MCP call |
| Cursor IDE | Installed-host inventory | Version and locally exposed Skill/MCP entry points; no Agent installation |
| MCP v2 client | Protocol control | Default boundary, opt-in Resources, and both protocol eras |

Each result is one of `Compatible`, `Partial`, `Unavailable`, or `Failed`.
`Unavailable` means the required host surface is not installed and is not a
product failure. `Partial` means the installed host exposes only part of the
portable surface or cannot be exercised non-interactively without persistent
configuration.

## 3. Goals

1. Verify the exact npm `latest` package rather than the repository build.
2. Confirm Codex and Claude can discover `silen-docs-readonly` from their
   project-local Skill directories without write, shell, or deployment tools.
3. Confirm both hosts can start the published local stdio MCP server from
   invocation-scoped configuration and call one read-only tool.
4. Reconfirm with the official MCP v2 client that default startup exposes only
   seven read tools and no Resources, while the experimental flag exposes six
   immutable Resources in both `2025-11-25` and `2026-07-28` eras.
5. Record whether the evidence is sufficient to promote `AI-008` from Watch.

## 4. Non-goals

- Install or upgrade Codex, Claude, Cursor Agent, extensions, or plugins.
- Modify `~/.codex`, `~/.claude`, Cursor user data, login state, keychains, or
  global MCP registrations.
- Exercise write tools, `--allow-write`, shell commands, source edits, Git,
  deployment, Remote MCP, OAuth, Tasks, Apps, or Ask AI.
- Add a permanent compatibility harness or another CI matrix.
- Change package version, runtime source, public contracts, workflows, or npm.
- Treat model wording as protocol proof; deterministic SDK assertions remain
  the control for counts, bytes, and protocol negotiation.

## 5. Isolation and data boundary

Every probe runs in a newly created directory beneath the operating system
temporary directory. The command verifies its resolved working directory
before `npm init` or client execution. Only the public `0.5.0` package, a tiny
synthetic Markdown page, generated Skill files, and invocation-scoped MCP JSON
are present.

Codex runs ephemerally with read-only sandboxing, no approvals, ignored user
configuration, and no persistent session. Claude runs non-interactively with
no session persistence, project-only settings, strict invocation-scoped MCP
configuration, and an allowlist containing only the selected MCP read tool.
Neither probe receives repository source, credentials, private content, or a
write-capable tool.

Cursor is inventory-only because invoking `cursor agent` attempts to install a
separate terminal Agent when it is absent. This validation will not authorize
that installation or launch an IDE profile merely to manufacture a green row.

## 6. Evidence rules

Filesystem Skill discovery passes only when the host identifies
`silen-docs-readonly` and the published `silen-version: 0.5.0` from a
host-local project directory. MCP host validation passes only when the host
calls Silen's `guide` tool and reports its read-only contract without invoking
shell or another tool.

The deterministic control must additionally prove:

- seven tools and no Resource capability by default;
- seven tools and six Resources behind
  `--experimental-skills-over-mcp`;
- `skill://silen-docs-readonly/SKILL.md` equals the installed npm bytes;
- both supported protocol eras close cleanly;
- no write call, remote transport, local absolute path, or environment secret
  appears in returned content.

## 7. `AI-008` promotion rule

This validation can keep `AI-008` in Watch or supply host-compatibility input,
but it cannot promote the item by itself. Promotion still requires actual
Tasks and Apps host negotiation, a bounded long-running audit/evaluation need,
cancellation and durable-state rules, and an App sandbox/CSP design.

If the installed clients demonstrate only Skills and ordinary MCP
tools/Resources, the decision is explicitly **keep `AI-008` in Watch**. A
working standard MCP connection must not be misreported as Tasks or Apps
support.

## 8. Deliverables

- A dated report at
  `docs/quality/2026-07-30-agent-client-compatibility.md`.
- A compatibility matrix with client versions, exact scope, result, and
  limitations.
- Deterministic protocol-control evidence and the `AI-008` decision.
- Updated `QUAL-004` state and linked evidence in `docs/project-map.md`.
