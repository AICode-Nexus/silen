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

Identify content, citation, link, index, and Agent Contract problems without
changing source files.

## Steps

1. Run the deterministic AI audit.
2. Use the safe MCP build preflight when operating through MCP.
3. Inspect broken links, citations, stale indexes, and contract resources.
4. Run the full production build only in the trusted local project environment.

## Stop conditions

Do not fix findings unless the user separately authorizes a maintenance task.

## Final report

Group findings by stable issue code, relative path, and recommended next action.
