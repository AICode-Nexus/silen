# Sidebar redesign QA

**Date:** 2026-07-20

**Route:** `/silen/zh/theme/`

**Result:** Passed

## Scope

The sidebar redesign was compared with the approved Chinese reference at a
`1600 x 1000` desktop viewport and in a `390 x 844` mobile drawer. Light mode
was used for the focused reference comparison, with dark mode checked as a
separate regression surface.

## Findings

- No P0, P1, or P2 mismatch remained after the final comparison.
- Desktop groups render as persistent semantic sections without disclosure
  buttons, chevrons, separators, or filled group headings.
- Mobile keeps genuine collapsible groups, scrollable navigation, visible
  focus, and distinct current-page styling without horizontal overflow.
- The current page uses the existing Silen primary token on a `primary/10`
  surface; group labels remain transparent in light and dark appearances.
- The existing Silen header, logo, copy, group order, and Lucide mobile
  affordances remain unchanged.

## Fidelity checks

- Existing Inter Variable typography was retained at `14px`; section labels
  and the current page use weight `600`.
- Section headings use an `8px` horizontal inset. Nested links use a `6px`
  outer inset, `16px` trailing inset, and `14px` internal left padding.
- The selected-row width, child alignment, vertical rhythm, radius, and
  semantic color separation match the approved reference.
- Desktop regions are labelled by level-two headings, the current page retains
  `aria-current="page"`, mobile disclosures retain `aria-expanded`, and focus
  enters the drawer when it opens.
- Browser verification reported no console warnings or errors.

## Intentional constraint

The approved reference uses a slightly more saturated selected-link color.
Silen keeps its shared primary design token so this change remains compatible
with consumer themes.
