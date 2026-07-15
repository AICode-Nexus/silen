---
id: create-site
title: Create a Silen knowledge base
contractVersion: 1
mode: write
requiresExplicitAuthorization: true
references:
  - config:title
  - config:description
  - config:lang
  - config:base
  - config:ai
  - cli:dev
  - cli:build
  - cli:ai
---

# Create a Silen knowledge base

## Outcome

Create the smallest buildable Silen site from the installed package.

## Steps

1. Confirm the content root and the user's authorization to create files.
2. Create .silen/config.ts using only fields present in the config contract.
3. Create index.mdx and the smallest useful content hierarchy.
4. Keep ordinary Markdown or MDX files as the source of truth.
5. Run the development command only when an interactive preview is required.

## Verification

1. Run pnpm silen ai audit with the content root.
2. Run pnpm silen build with the content root.
3. Inspect the Git diff and generated contract URLs.

## Stop conditions

Stop on an unknown config field, failed audit, failed build, or path outside the
authorized project.

## Final report

List created files, build output, verification results, and any remaining
deployment step.
