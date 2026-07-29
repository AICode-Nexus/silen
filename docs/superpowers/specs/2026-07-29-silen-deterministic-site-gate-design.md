# Silen Deterministic Site Gate Design

- Status: Pending written-spec review
- Date: 2026-07-29
- Repository: `AICode-Nexus/silen`
- Package: `@aicode-nexus/silen`
- Project map item: `QUAL-002`

## 1. Summary

Silen will add one repository-level command, `pnpm site:check`, that proves the
official website is buildable and AI-ready without a model, provider secret, or
network-dependent evaluation service.

The command composes the already-shipped package build, official-site build,
AI audit, model-free retrieval evaluation, and source-map guard. GitHub Pages
will call this command directly, so the deployment path and the maintainer's
local verification path cannot drift.

This change adds no new public CLI command, runtime behavior, dependency,
provider integration, or release. It is an official-repository quality gate.

## 2. Product decision

The selected approach is a package-script composition:

```text
pnpm site:check
  -> pnpm site:build
  -> node dist/node/cli.js ai audit website
  -> node dist/node/cli.js ai eval website --json
  -> pnpm check:no-maps dist website/.silen/dist
```

This is preferred because every component already has stable behavior and exit
semantics. A shell `&&` chain supplies one portable maintainer command without
adding an orchestration layer that could itself diverge from the CLI.

Two alternatives are rejected for the first version:

- A TypeScript orchestration script could add labelled summaries or aggregate
  failures, but it would create production-like tooling code, subprocess
  abstractions, and tests for behavior already provided by the shell and CLI.
- Keeping four separate GitHub Actions steps would make individual checks more
  visible in the Actions UI, but it would not provide one local command and
  would preserve duplicate workflow configuration.

## 3. Goals

The first version must:

1. Provide exactly one official local command for the complete deterministic
   website quality chain.
2. Build the package and official website before reading generated artifacts.
3. Run `ai audit` against the trusted official `website` root.
4. Run `ai eval` against the production search index with stable JSON output.
5. Reject source maps in both package and website output.
6. Fail immediately with the first failing command's exit status.
7. Make GitHub Pages invoke the same local command.
8. Preserve the existing hidden Agent Contract artifact assertion.
9. Keep Core CI and npm Publish focused on their existing package-level
   responsibilities.
10. Prove the contract through a focused test and one real end-to-end command
    execution.
11. Update the project map so completed work has evidence and `AI-004` becomes
    the default next item.

## 4. Non-goals

The first version will not:

- Add a `silen site check` or other public CLI command.
- Add a TypeScript gate runner, subprocess abstraction, schema, or dependency.
- Run a model, embeddings service, vector database, remote evaluation API, or
  provider-specific code.
- Initialize or mutate the local AI workspace.
- Enable MCP write tools or remote MCP transport.
- Add the official-site build to every Node matrix entry in Core CI.
- Add the official-site build to npm Trusted Publishing.
- Replace the existing manifest-presence assertion in the Pages workflow.
- Aggregate multiple failures after an earlier step has already failed.
- Change `ai audit`, `ai eval`, build, or no-map semantics.
- Change package exports, package version, generated Agent Contract version, or
  changelog content.
- Publish npm, create a GitHub Release, or introduce a product release.

## 5. Current state

The repository already exposes:

- `site:build`, which runs `pnpm build` and builds `website` through the built
  CLI.
- `check:no-maps`, which recursively rejects source-map files and
  `sourceMappingURL` references.
- `silen ai audit`, which audits links, citations, generated artifacts, and the
  built Agent Contract and returns nonzero when blocking issues exist.
- `silen ai eval`, which evaluates committed questions against the production
  search index and returns `0` for pass, `1` for retrieval failure, and `2` for
  setup failure.
- A four-case bilingual `website/.silen/ai-evals.json` suite.

The Pages workflow currently runs `pnpm site:build` and the dual-output no-map
check but omits audit and evaluation. Core CI independently validates static,
runtime, package, and browser behavior. npm Publish independently validates and
publishes the package after a GitHub Release.

`QUAL-002` closes only the Pages/local parity gap.

## 6. Command contract

`package.json` adds this exact script:

```json
{
  "site:check": "pnpm site:build && node dist/node/cli.js ai audit website && node dist/node/cli.js ai eval website --json && pnpm check:no-maps dist website/.silen/dist"
}
```

The order is part of the contract:

1. `site:build` produces the distributable package, generated Agent Contract,
   official static site, search index, and AI artifacts.
2. `ai audit website` validates the trusted source and built output. Audit
   already emits JSON and sets a nonzero exit code for blocking issues.
3. `ai eval website --json` reads the committed suite and built production
   search index, then emits one stable JSON report.
4. `check:no-maps dist website/.silen/dist` inspects the final package and site
   outputs only after all output-producing work has finished.

The aggregate command creates only the normal build output. Audit, evaluation,
and no-map checks are read-only. The command does not refresh
`.silen/ai/index.json` or write authored content.

## 7. Failure semantics

The script uses `&&` and therefore stops on the first failure:

| Failing stage | Expected result |
| --- | --- |
| Package or site build | Preserve the build command's nonzero status and diagnostic |
| AI audit | Stop before evaluation and report audit JSON |
| AI evaluation regression | Exit `1` with stable JSON and ranked evidence |
| AI evaluation setup error | Exit `2` with one stable JSON error document |
| Source-map guard | Preserve its nonzero status and offending path evidence |

Fail-fast behavior is intentional. Later checks may depend on valid earlier
artifacts, and one clear first failure is more actionable than aggregated
secondary errors.

Successful output remains in `dist` and `website/.silen/dist` for Pages upload
and local diagnosis. Failure does not delete evidence or attempt remediation.

## 8. No-model and authority boundary

The gate must remain useful with provider credentials absent. It may execute the
trusted official website config through the existing build and direct audit
paths, but evaluation remains model-free and does not execute project config.

The script must not contain:

- `ai init`, `ai index`, `--allow-write`, or any MCP command.
- `curl`, remote URLs, provider SDK invocations, or credential arguments.
- Git, publishing, deployment, or mutation commands.

GitHub Actions may provide normal package-install network access before the
gate runs. The quality decision itself does not rely on a hosted evaluation
service or model response.

## 9. GitHub Pages integration

`.github/workflows/pages.yml` replaces:

```yaml
- name: Build Silen and its website
  run: pnpm site:build

- name: Assert upload artifact has no source maps
  run: pnpm check:no-maps dist website/.silen/dist
```

with:

```yaml
- name: Build and validate Silen website
  run: pnpm site:check
```

The following manifest assertion remains a separate step and must run after
`site:check`:

```yaml
- name: Assert public Agent Contract is present
  run: test -f website/.silen/dist/.well-known/silen/manifest.json
```

The upload step continues to use `include-hidden-files: true`. Deployment
permissions, concurrency, Node and pnpm versions, artifact path, and deploy job
remain unchanged.

`.github/workflows/ci.yml` and `.github/workflows/publish.yml` must not contain
`pnpm site:check` in this version. This avoids multiplying a complete site build
across the Node matrix or package publishing path while Pages remains a hard
deployment gate.

## 10. Test design

A focused `tests/ai/site-quality-gate.test.ts` contract test will read
`package.json` and all three workflows.

It must assert:

1. `scripts["site:check"]` equals the exact approved command.
2. Build, audit, evaluation, and no-map fragments occur once and in order.
3. Evaluation includes `--json`.
4. The command contains no init, index, MCP, write opt-in, remote URL, or
   provider invocation.
5. Pages invokes `pnpm site:check` exactly once.
6. Pages no longer invokes `pnpm site:build` or
   `pnpm check:no-maps dist website/.silen/dist` directly.
7. The manifest assertion follows `site:check`.
8. Core CI and npm Publish do not invoke `pnpm site:check`.

The test is intentionally a repository contract rather than an implementation
of the gate. Existing CLI tests continue to own command behavior and exit-code
semantics.

Implementation verification must additionally run:

1. The focused contract test.
2. `pnpm site:check` with common provider credentials absent.
3. The existing AI audit and evaluation focused tests.
4. Formatting, lint, type checking, and the full serial Vitest suite.
5. The project-map consistency and link checks established by `QUAL-002`'s
   parent map.

The real `site:check` execution is the proof that the composed local command
works; the static contract test prevents later workflow drift.

## 11. Documentation and project-map lifecycle

The README `Contributing` section adds one maintainer sentence identifying
`pnpm site:check` as the official website build, AI-readiness, and source-map
gate. Consumer CLI guidance remains unchanged because `site:check` is a
repository script, not a packaged Silen command.

During implementation:

1. Move `QUAL-002` from `Ready` to `Active` before behavior changes.
2. Preserve `AI-004` as the first `Ready` item.
3. After all completion evidence passes, move `QUAL-002` to `Shipped`.
4. Change `Default next item` from `QUAL-002` to `AI-004`.
5. Link the script, focused test, Pages workflow, this design, and its
   implementation plan as evidence.

The final map has no `Active` item. It does not start `AI-004` automatically
within this delivery.

## 12. File boundaries

The implementation changes only:

- `package.json`: add the aggregate script.
- `.github/workflows/pages.yml`: consume the aggregate script.
- `tests/ai/site-quality-gate.test.ts`: protect the command and workflow
  contract.
- `README.md`: document the maintainer command.
- `docs/project-map.md`: track `QUAL-002` through `Active` to `Shipped`.
- `docs/superpowers/plans/2026-07-29-silen-deterministic-site-gate.md`:
  implementation steps and evidence.

No `src/**`, public website content, lockfile, `.github/workflows/ci.yml`,
`.github/workflows/publish.yml`, package export, version, or generated contract
file should change.

## 13. Completion criteria

`QUAL-002` is complete only when:

1. `pnpm site:check` exists with the exact approved sequence.
2. Pages uses that command and retains the hidden-manifest assertion.
3. Core CI and npm Publish remain free of duplicate site checks.
4. The focused contract test passes.
5. A real provider-credential-free `pnpm site:check` run passes.
6. Formatting, lint, typecheck, the AI regression set, and the full test suite
   pass.
7. README documents the repository command without presenting it as a consumer
   CLI feature.
8. The project map marks `QUAL-002` `Shipped` with evidence and identifies
   `AI-004` as the default next item.
9. Git contains no unintended generated artifacts or unrelated changes.
