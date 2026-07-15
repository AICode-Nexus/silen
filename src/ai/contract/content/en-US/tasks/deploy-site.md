---
id: deploy-site
title: Prepare a Silen site for deployment
contractVersion: 1
mode: write
requiresExplicitAuthorization: true
references:
  - cli:build
  - cli:preview
  - cli:ai
  - artifact:silen-manifest
  - artifact:llms
---

# Prepare a Silen site for deployment

## Outcome

Produce and verify host-neutral static output. This task does not authorize an
external deployment.

## Steps

1. Confirm the intended base path and output directory.
2. Run the AI audit and production build.
3. Preview the built output and verify representative HTML, Markdown, llms, and
   Silen manifest URLs.
4. Inspect the output for local paths or secrets.

## Verification

1. Confirm the preview returns successful responses under the configured base.
2. Confirm the Git diff contains only intended source changes.
3. Report the output directory and host requirements.

## Stop conditions

Stop before upload, push, or provider mutation unless the user separately
authorizes that exact deployment.

## Final report

Report the verified output, base path, checks, and the remaining host action.
