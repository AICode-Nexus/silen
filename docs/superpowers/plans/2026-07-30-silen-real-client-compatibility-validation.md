# Silen Real-Client Compatibility Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce reproducible real-client compatibility evidence for the published Silen `0.5.0` Skill and local MCP surface without adding product behavior.

**Architecture:** Run Codex CLI and Claude Code against an isolated synthetic npm consumer, retain Cursor as an honest inventory-only row, and use the official MCP v2 client as the deterministic control. Record sanitized outcomes in one quality report and use them only to decide whether `AI-008` has enough host evidence to leave Watch.

**Tech Stack:** Silen `0.5.0`, npm, Node.js, Codex CLI, Claude Code, Cursor CLI, MCP TypeScript client v2, Markdown.

## Global Constraints

- Do not modify runtime source, package version, lockfile, workflows, npm, Pages, or external systems.
- Do not install or update Agent clients, plugins, or extensions.
- Do not modify user-level Agent configuration, authentication, keychains, or global MCP registrations.
- Use only temporary synthetic public content and invocation-scoped configuration.
- Do not expose write tools, use `--allow-write`, start Remote MCP, or test Tasks, Apps, OAuth, or Ask AI.
- A normal MCP connection is not evidence of Tasks or Apps support.

---

### Task 1: Freeze the approved validation scope in the map

**Files:**
- Create: `docs/superpowers/specs/2026-07-30-silen-real-client-compatibility-validation-design.md`
- Create: `docs/superpowers/plans/2026-07-30-silen-real-client-compatibility-validation.md`
- Modify: `docs/project-map.md`

**Interfaces:**
- Consumes: shipped `AI-005`, `AI-006`, and `QUAL-003` evidence.
- Produces: one bounded `QUAL-004` Active item and the exact rules used by every probe.

- [x] **Step 1: Add the approved design and this implementation plan**

Use the exact paths above. Keep the scope validation-only and name Codex,
Claude, Cursor, and the MCP SDK control explicitly.

- [x] **Step 2: Set `QUAL-004` as the sole Active item**

Replace the empty Active section and default-next header in
`docs/project-map.md`; keep all `0.6.x` items in Watch.

- [x] **Step 3: Validate documentation formatting and links**

Run:

```bash
pnpm exec prettier --check docs/project-map.md docs/superpowers/specs/2026-07-30-silen-real-client-compatibility-validation-design.md docs/superpowers/plans/2026-07-30-silen-real-client-compatibility-validation.md
node --input-type=module --eval '
import { access } from "node:fs/promises"
for (const file of [
  "docs/project-map.md",
  "docs/superpowers/specs/2026-07-30-silen-real-client-compatibility-validation-design.md",
  "docs/superpowers/plans/2026-07-30-silen-real-client-compatibility-validation.md",
]) await access(file)
console.log("validation-plan-links-ok")
'
```

Expected: Prettier passes and the link check prints
`validation-plan-links-ok`.

- [x] **Step 4: Commit the approved validation scope**

```bash
git add docs/project-map.md docs/superpowers/specs/2026-07-30-silen-real-client-compatibility-validation-design.md docs/superpowers/plans/2026-07-30-silen-real-client-compatibility-validation.md
git commit -m "docs: plan real-client compatibility validation"
```

### Task 2: Inventory installed clients without changing them

**Files:**
- Create: `docs/quality/2026-07-30-agent-client-compatibility.md`

**Interfaces:**
- Consumes: executable paths and local application bundles.
- Produces: exact version rows and the executable two-host test set.

- [x] **Step 1: Capture executable and application presence**

Run:

```bash
for client in codex claude cursor gemini opencode; do
  resolved=$(command -v "$client" 2>/dev/null || true)
  if [ -n "$resolved" ]; then printf '%s\t%s\n' "$client" "$resolved"; fi
done
find /Applications /Users/admin/Applications -maxdepth 1 -type d \
  \( -iname '*Claude*.app' -o -iname '*Cursor*.app' -o \
     -iname '*Codex*.app' -o -iname '*Gemini*.app' \) -print 2>/dev/null
```

Expected: Codex CLI, Claude Code, and Cursor IDE are present. Missing clients
remain uninstalled.

- [x] **Step 2: Capture the installed versions and non-mutating help surfaces**

Run:

```bash
codex --version
codex exec --help
codex mcp --help
claude --version
claude --help
claude mcp --help
cursor --version
cursor --help
```

Expected: version commands succeed; Codex and Claude expose headless MCP
configuration. Cursor exposes IDE MCP configuration, while the separate
terminal Agent remains absent and is not installed.

### Task 3: Create one guarded published-package consumer

**Files:**
- No repository files change.

**Interfaces:**
- Consumes: npm `@aicode-nexus/silen@0.5.0` and
  `@modelcontextprotocol/client@2.0.0`.
- Produces: a synthetic consumer root used by both Agent hosts and the SDK
  control.

- [x] **Step 1: Create and verify an isolated temporary root**

Run:

```bash
compat_root=$(mktemp -d /tmp/silen-client-compat.XXXXXX)
test -d "$compat_root"
cd "$compat_root"
node -e 'if (!process.cwd().includes("silen-client-compat.")) process.exit(1)'
npm init --yes
npm install @aicode-nexus/silen@0.5.0 @modelcontextprotocol/client@2.0.0
mkdir docs
printf '# Compatibility fixture\n' > docs/index.md
npx silen --version
```

Expected: the resolved working directory is the newly created temporary root
and Silen reports `0.5.0`. The `printf` writes only the new synthetic fixture,
not a repository or user document.

- [x] **Step 2: Materialize host-local Skill copies and compare bytes**

Run:

```bash
npx silen ai skills .agents/skills
npx silen ai skills .claude/skills
diff -r .agents/skills/silen-docs-readonly node_modules/@aicode-nexus/silen/dist/agent/skills/silen-docs-readonly
diff -r .claude/skills/silen-docs-readonly node_modules/@aicode-nexus/silen/dist/agent/skills/silen-docs-readonly
```

Expected: both diffs are empty and no existing directory is overwritten.

### Task 4: Probe Codex and Claude as actual hosts

**Files:**
- No repository files change.

**Interfaces:**
- Consumes: the Task 3 consumer, project-local Skill directories, and
  invocation-scoped stdio MCP configuration.
- Produces: actual-host Skill discovery and one read-only MCP call per host.

- [x] **Step 1: Run an ephemeral read-only Codex Skill probe**

From the guarded consumer root, run:

```bash
codex --sandbox read-only --ask-for-approval never exec \
  --ephemeral --ignore-user-config --ignore-rules --skip-git-repo-check \
  'Do not run commands or call tools. Read the available project Skill metadata and return exactly: CODEX_SKILL_OK silen-docs-readonly 0.5.0'
```

Expected: final output contains
`CODEX_SKILL_OK silen-docs-readonly 0.5.0` and contains no tool call.

- [x] **Step 2: Run Codex with invocation-only Silen MCP configuration**

Run:

```bash
codex --sandbox read-only --ask-for-approval never \
  -c "mcp_servers.silen.command=\"$PWD/node_modules/.bin/silen\"" \
  -c 'mcp_servers.silen.args=["mcp","docs"]' \
  exec --ephemeral --ignore-user-config --ignore-rules \
  --skip-git-repo-check \
  'Call only the silen guide MCP tool. Return exactly CODEX_MCP_OK when its result states that Silen is read-only by default.'
```

Expected: output contains `CODEX_MCP_OK`; no shell or write tool is invoked.

- [x] **Step 3: Run a non-persistent Claude Skill probe**

Run:

```bash
claude --print --no-session-persistence --setting-sources project \
  --tools '' --permission-mode plan --max-budget-usd 0.05 \
  'Invoke the project skill /silen-docs-readonly, then return exactly: CLAUDE_SKILL_OK silen-docs-readonly 0.5.0'
```

Expected: output contains
`CLAUDE_SKILL_OK silen-docs-readonly 0.5.0`; no tool is available.

- [x] **Step 4: Run Claude with strict invocation-only Silen MCP configuration**

Run:

```bash
silen_command="$PWD/node_modules/.bin/silen"
claude --print --no-session-persistence --setting-sources project \
  --mcp-config "{\"mcpServers\":{\"silen\":{\"command\":\"$silen_command\",\"args\":[\"mcp\",\"docs\"]}}}" \
  --strict-mcp-config --tools 'mcp__silen__guide' \
  --allowedTools 'mcp__silen__guide' --permission-mode dontAsk \
  --max-budget-usd 0.05 \
  'Call only the silen guide MCP tool. Return exactly CLAUDE_MCP_OK when its result states that Silen is read-only by default.'
```

Expected: output contains `CLAUDE_MCP_OK`; no shell or write tool is exposed.

### Task 5: Run the deterministic dual-era control

**Files:**
- No repository files change.

**Interfaces:**
- Consumes: the same published-package consumer.
- Produces: stable counts, byte equality, default-off proof, and clean legacy
  and modern protocol shutdown.

- [x] **Step 1: Execute the SDK control**

From the guarded consumer root, run this exact Node ESM control:

```bash
node --input-type=module --eval '
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"

assert.match(process.cwd(), /silen-client-compat\./)
const legacy = "2025-11-25"
const modern = "2026-07-28"
const packagedSkill = await readFile(
  path.resolve(
    "node_modules/@aicode-nexus/silen/dist/agent/skills/silen-docs-readonly/SKILL.md",
  ),
  "utf8",
)

function createClient(era) {
  return new Client(
    { name: `silen-client-control-${era}`, version: "1.0.0" },
    era === "legacy"
      ? { supportedProtocolVersions: [legacy] }
      : {
          supportedProtocolVersions: [legacy, modern],
          versionNegotiation: { mode: { pin: modern } },
        },
  )
}

async function run(era, experimental) {
  const client = createClient(era)
  const protocolErrors = []
  client.onerror = (error) => protocolErrors.push(error)
  const transport = new StdioClientTransport({
    command: path.resolve("node_modules/.bin/silen"),
    args: [
      "mcp",
      "docs",
      ...(experimental ? ["--experimental-skills-over-mcp"] : []),
    ],
    cwd: process.cwd(),
    stderr: "pipe",
  })
  const stderrStream = transport.stderr
  assert.ok(stderrStream instanceof Readable)
  stderrStream.setEncoding("utf8")
  let stderr = ""
  stderrStream.on("data", (chunk) => {
    stderr += chunk
  })

  await client.connect(transport)
  assert.equal(client.getProtocolEra(), era)
  assert.equal(
    client.getNegotiatedProtocolVersion(),
    era === "legacy" ? legacy : modern,
  )
  const capabilities = client.getServerCapabilities()
  const tools = await client.listTools()
  assert.equal(tools.tools.length, 7)

  if (experimental) {
    assert.deepEqual(
      capabilities?.extensions?.["io.modelcontextprotocol/skills"],
      {},
    )
    const resources = await client.listResources()
    assert.equal(resources.resources.length, 6)
    const skill = await client.readResource({
      uri: "skill://silen-docs-readonly/SKILL.md",
    })
    const content = skill.contents[0]
    assert.ok(content && "text" in content)
    assert.equal(content.text, packagedSkill)
    assert.equal(JSON.stringify([resources, skill]).includes(process.cwd()), false)
  } else {
    assert.equal(capabilities?.resources, undefined)
  }

  await client.close()
  assert.equal(transport.pid, null)
  assert.deepEqual(protocolErrors, [])
  assert.equal(stderr, "")
}

for (const era of ["legacy", "modern"]) {
  await run(era, false)
  await run(era, true)
}
console.log("dual-era-client-control-ok")
'
```

Expected: `dual-era-client-control-ok` and zero write calls.

### Task 6: Record evidence and close the map item

**Files:**
- Create: `docs/quality/2026-07-30-agent-client-compatibility.md`
- Modify: `docs/project-map.md`

**Interfaces:**
- Consumes: all Task 2–5 outputs.
- Produces: the durable compatibility matrix, limitations, `AI-008` decision,
  and completed `QUAL-004` map evidence.

- [x] **Step 1: Write the dated compatibility report**

Record exact client versions, result grades, tested surfaces, protocol-control
counts, any failed probe without reinterpretation, and the temporary consumer
path. Do not include credentials, auth details, absolute home paths, or model
transcripts beyond the expected markers.

- [x] **Step 2: Apply the `AI-008` promotion rule**

Keep `AI-008` in Watch unless the probes explicitly demonstrate Tasks and Apps
negotiation and the other entry gates. Ordinary Skills, tools, or Resources do
not satisfy the rule.

- [x] **Step 3: Move `QUAL-004` from Active to Shipped with evidence**

Restore an empty Active section, set the default-next header to `None`, and
link the design, plan, and dated report. State the exact verified and partial
host rows.

- [x] **Step 4: Run the final repository gate**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test:run
git diff --check
git status --short --branch
```

Expected: every command exits zero, 76 test files and 735 tests pass, and only
the planned documentation files are modified.

- [x] **Step 5: Commit the evidence**

```bash
git add docs/project-map.md docs/quality/2026-07-30-agent-client-compatibility.md \
  docs/superpowers/plans/2026-07-30-silen-real-client-compatibility-validation.md
git commit -m "docs: record real-client compatibility evidence"
```
