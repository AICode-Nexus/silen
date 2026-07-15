---
id: maintain-site
title: Maintain an existing Silen knowledge base
contractVersion: 1
mode: write
requiresExplicitAuthorization: true
references:
  - mcp:guide
  - mcp:list
  - mcp:search
  - mcp:read
  - mcp:backlinks
  - mcp:citations
  - mcp:write
  - mcp:link
  - mcp:append
  - cli:ai
  - cli:build
---

# Maintain an existing Silen knowledge base

## Outcome

Make a bounded, reviewable documentation change with verified links and output.

## Steps

1. Use read-only MCP tools to locate the relevant pages and dependencies.
2. Confirm that the server exposes write tools and that the user authorized the
   requested mutation.
3. Use the smallest matching write operation.
4. Re-read every changed page and inspect affected backlinks or citations.

## Verification

1. Run pnpm silen ai audit with the content root.
2. Run pnpm silen build with the content root.
3. Inspect the Git diff. Do not commit or deploy without separate permission.

## Stop conditions

Stop if write tools are absent, the requested path escapes the content root, or
audit or build fails.

## Final report

Report changed files, checks, warnings, and the uncommitted diff state.
