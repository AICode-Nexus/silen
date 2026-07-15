---
id: migrate-content
title: Migrate Markdown content into Silen
contractVersion: 1
mode: write
requiresExplicitAuthorization: true
references:
  - config:title
  - config:description
  - config:lang
  - config:base
  - cli:build
  - cli:ai
---

# Migrate Markdown content into Silen

## Outcome

Move an existing Markdown or trusted MDX tree into Silen without inventing an
unsupported ingestion pipeline.

## Steps

1. Inventory Markdown, MDX, public assets, internal links, and locale roots.
2. Preserve source text and file history where possible.
3. Add only the Silen config and route changes required for a valid build.
4. Repair links with standard Markdown paths.
5. Mark private, draft, or AI-excluded pages explicitly.

## Verification

1. Run pnpm silen ai audit with the content root.
2. Run pnpm silen build with the content root.
3. Compare the source and migrated content counts and inspect the Git diff.

## Stop conditions

Stop when the source requires an unsupported binary importer, contains
untrusted executable MDX, or has an unresolved ownership decision.

## Final report

Report migrated files, exclusions, repaired links, and verification results.
