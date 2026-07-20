# 0002 - Unify GFM content processing

**Status:** accepted
**Date:** 2026-07-20
**Spec:** `docs/superpowers/specs/2026-07-13-silen-design.md`
**Deciders:** project owner

## Context

Silen previously parsed MDX pages, search text, AI chunks, and generated
Markdown through separate pipelines. GitHub-flavored Markdown tables could
therefore look correct in a generated `.md` file while rendering as pipe text
in HTML and leaking authoring delimiters into search and AI output. The project
owner approved fixing the framework-level cause across all content surfaces
instead of rewriting the affected documentation as JSX.

## Decision

- Enable the same pinned GFM grammar in MDX compilation, search extraction, AI
  chunk extraction, and clean Markdown generation.
- Serialize GFM constructs with the matching `mdast-util-gfm` extension rather
  than maintaining a table-detection regular expression.
- Map semantic HTML tables to one default-theme table component that supplies
  localized accessible labeling and responsive horizontal overflow.
- Cover tables, strikethrough, task lists, autolinks, and footnotes at the
  relevant output boundaries.

## Consequences

- HTML, search, AI chunks, and Markdown routes share one authoring grammar.
- GFM dependencies are runtime dependencies of the published package.
- Table presentation remains theme-overridable through the standard MDX
  component map.
- Future Markdown extensions must be evaluated across every generated surface,
  not added to only one parser.

## Alternatives considered

- **Rewrite tables as JSX.** Rejected because it fixes only the official site
  and leaves consumer Markdown inconsistent.
- **Keep the table regular-expression exception.** Rejected because it cannot
  model the complete GFM grammar and had already hidden cross-output drift.
- **Enable GFM only in the HTML compiler.** Rejected because search and AI
  artifacts are first-class outputs from the same source.
