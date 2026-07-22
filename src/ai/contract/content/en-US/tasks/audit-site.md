---
id: audit-site
title: Audit a Silen knowledge base
contractVersion: 1
mode: read
requiresExplicitAuthorization: false
references:
  - cli:ai
  - cli:build
  - mcp:build
  - mcp:citations
  - mcp:backlinks
  - artifact:silen-manifest
  - artifact:ai-index
---

# Audit a Silen knowledge base

## Outcome

Identify content, citation, link, production-index, retrieval, and Agent
Contract problems without changing source files or using a model.

## Steps

1. Run the full production build in the trusted local project environment.
2. Run the deterministic AI audit against those built artifacts.
3. When `.silen/ai-evals.json` exists, run `silen ai eval` against the production
   `.silen/dist/search-index.json`.
4. Use the safe MCP build preflight when operating through MCP.
5. Inspect broken links, citations, production-index failures, retrieval misses,
   and contract resources. Treat a missing or stale optional
   `.silen/ai/index.json` workspace cache as a notice because MCP search remains
   in memory.

## Stop conditions

Do not fix findings unless the user separately authorizes a maintenance task.

## Final report

Group findings by stable issue code, relative path, and recommended next action.
Report AI-evaluation exit `0` as pass, `1` as retrieval failure, and `2` as setup
failure; use `--json` for CI output.
