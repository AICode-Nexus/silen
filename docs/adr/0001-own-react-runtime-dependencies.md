# 0001 - Own the React runtime dependencies

**Status:** accepted
**Date:** 2026-07-20
**Spec:** `docs/superpowers/specs/2026-07-13-silen-design.md`
**Deciders:** project owner

## Context

The original Alpha design made `react` and `react-dom` peer dependencies. In a
clean pnpm consumer this required users to install those packages before Silen,
and an otherwise valid first build could fail to resolve `react/jsx-runtime`.
The project owner explicitly required Silen to internalize these mandatory
runtime dependencies so the documented installation remains one command.

Silen renders its own React theme during development SSR, production SSR, and
client hydration. Those three environments must resolve the same React runtime
to avoid missing JSX-runtime modules or duplicate React instances.

## Decision

- Publish `react` and `react-dom` as Silen runtime dependencies, not peers.
- Route Vite resolution for `react`, `react-dom`, and their subpaths through the
  copies installed with Silen in development, client builds, and SSR builds.
- Prove the contract with packed-tarball consumers that declare only
  `@aicode-nexus/silen` before building, serving, and hydrating a site.
- Keep the public install path as `pnpm add -D @aicode-nexus/silen`; consumers do
  not need a separate React installation for a normal Silen documentation site.

## Consequences

- Clean consumers have a smaller and less surprising activation flow.
- Silen controls the React version used by its renderer and default theme.
- Existing React applications may install another compatible React version for
  their application code, but Silen's documentation build remains isolated to
  the runtime version declared by Silen.
- React upgrades now require a Silen release and package-smoke verification.

## Alternatives considered

- **Keep React as a peer dependency.** Rejected because it preserves the manual
  prerequisite and the clean-pnpm resolution failure the owner asked to remove.
- **Install React from a postinstall script.** Rejected because hidden package
  mutation conflicts with package-manager security and reproducibility.
- **Bundle React into every emitted artifact.** Rejected because package-manager
  ownership plus explicit Vite resolution is easier to inspect and update.
