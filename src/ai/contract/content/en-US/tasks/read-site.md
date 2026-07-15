---
id: read-site
title: Read a deployed Silen site
contractVersion: 1
mode: read
requiresExplicitAuthorization: false
references:
  - artifact:silen-manifest
  - artifact:llms
  - artifact:markdown-routes
  - artifact:ai-index
  - mcp:list
  - mcp:search
  - mcp:read
---

# Read a deployed Silen site

## Outcome

Answer from canonical Silen content while preserving source links.

## Steps

1. Read the Silen manifest if it exists.
2. Choose llms.txt, a clean Markdown page, or the AI index according to the
   amount of context required.
3. When local MCP is available, list or search before reading bounded ranges.
4. Cite the canonical public page URL rather than a local file path.

## Stop conditions

If the manifest schema is unsupported, remain read-only and fall back to
llms.txt and clean Markdown routes.

## Final report

Return the answer, canonical sources, and any contract or freshness limitation.
