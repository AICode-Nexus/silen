# Silen Homepage Density and Contact Design

- Status: Approved
- Date: 2026-07-15
- Scope: Default `HomeLayout`, English and Chinese example homepages, base-aware home imagery, and homepage contact section
- Source QR image: `/Users/admin/Desktop/qrcode_for_gh_d6a14f8e7285_344.jpg`

## 1. Summary

The Silen homepage will become a compact, product-led documentation landing page while preserving the calm visual character of the default theme. The redesign will improve information density, replace accidental whitespace with explicit section rhythm, make the product's human-and-AI value visible, and add a bilingual contact section containing the AI Dev Hub WeChat official-account QR code.

The work will improve the reusable default `HomeLayout` without turning the Alpha theme into a large landing-page schema. Rich example-site sections will remain authored in MDX, while the theme supplies a stronger hero, feature presentation, home-specific content rhythm, responsive behavior, and accessible visual primitives.

## 2. Goals

The implementation must:

1. Make the homepage feel complete at desktop, tablet, and mobile sizes.
2. Remove the large vertical gaps caused by individual MDX nodes becoming direct children of the home container's uniform layout gap.
3. Communicate Silen's React, Vite, MDX, static-output, search, and AI-ready capabilities before the user reaches the guide.
4. Keep the homepage quiet, legible, and documentation-oriented rather than marketing-heavy.
5. Improve the reusable default theme, not only the example website.
6. Keep English and Chinese homepage content structurally equivalent.
7. Add a clear contact and follow section with the supplied AI Dev Hub WeChat QR code.
8. Fix base-path image resolution so development SSR and client hydration produce identical URLs.
9. Preserve accessible landmarks, heading order, focus states, contrast, and reduced-motion behavior.
10. Produce no browser console errors on the verified homepage routes.

## 3. Non-goals

This change will not:

- Redesign the Guide or AI information architecture.
- Add a new global footer or site-wide contact system.
- Introduce a large public homepage-section configuration API.
- Add carousels, parallax, autoplay media, decorative background video, or heavy animation.
- Add remote analytics, third-party embeds, or a hosted form.
- Require an AI provider or API key at runtime.
- Modify or overwrite the original QR image on the user's Desktop.

## 4. Current problems

### 4.1 Content depth

The homepage currently contains one hero, three feature cards, a two-line quick-start command, and two short prose sections. It does not explain the build outputs, human-versus-AI experience, workflow, or next steps in enough depth.

### 4.2 Spacing and hierarchy

`HomeLayout` places the MDX fragment directly inside a `gap-16` flex column. Each heading, paragraph, and code block therefore becomes a separate flex item with 64px between nodes, while the same content has no dedicated homepage typography context. The result is both oversized blank bands and under-styled headings.

### 4.3 Hero visual

The hero's right column contains only the product logo. It occupies substantial space without explaining the product, and a broken image leaves an even larger blank area on mobile.

### 4.4 Base-path mismatch

During development SSR, local logo and hero paths can be resolved to `/silen/silen/logo.svg`, while the client resolves them to `/silen/logo.svg`. The result is a 404 and a React hydration mismatch. Asset resolution must be idempotent and identical on the server and client.

### 4.5 Structural icons

Feature cards currently use emoji-like glyphs. These will be replaced with a consistent Lucide icon treatment so stroke, size, color, and theme behavior are predictable.

## 5. Chosen approach

Use a hybrid theme-and-content approach:

- Strengthen the generic `HomeLayout` structure, class hooks, hero proportions, feature-card density, icon rendering, and home-only content rhythm.
- Keep the existing public `hero` and `features` configuration shape.
- Treat known feature icon names as Lucide icons while retaining a safe text fallback for existing custom values.
- Author the deeper quick-start, dual-audience, output, and contact sections in the example site's MDX.
- Add a lightweight, locally stored SVG workflow illustration for the hero because no image-generation API key is configured.
- Store the QR code as a local site asset and import it through MDX so Vite owns hashing and base-path-safe URLs.

This approach improves every Silen homepage while avoiding a premature, highly structured landing-page schema during Alpha.

## 6. Information architecture

The English and Chinese homepages will use the same sequence:

1. **Hero** — product identity, concise value proposition, primary actions, technology proof row, and workflow visual.
2. **Core capabilities** — three compact cards for React-first authoring, Vite-powered delivery, and AI-ready output.
3. **Quick start** — installation explanation, command block, and a clear guide link.
4. **One source, two audiences** — a balanced human-reader and AI-client comparison.
5. **What each build ships** — concise output items for static HTML, Markdown routes, search index, `llms.txt`, and optional MCP workspace.
6. **Contact and follow** — GitHub action plus the AI Dev Hub WeChat QR code.

The page will end after the contact section; no separate decorative CTA band is required.

## 7. Component and content design

### 7.1 Hero

The hero will remain a semantic labelled region and use a two-column desktop layout.

The text column will contain:

- Product name.
- A stronger one-line promise.
- A short supporting paragraph capped at a readable measure.
- Primary `Get started` / `快速开始` action.
- Secondary GitHub action.

The visual column will show a restrained pipeline illustration with a compact proof row for React, Vite, MDX, static-first, and AI-ready:

```text
MDX source -> Silen build -> HTML / Search / Markdown / MCP
```

The illustration will use the theme's semantic colors, borders, and radii, contain no gradients that reduce dark-mode clarity, and include an informative alt description. It will use a fixed aspect ratio to avoid layout shift.

### 7.2 Core capability cards

Three cards will remain because they form a clear product triad. Their internal padding and minimum height will be reduced, descriptions will be tightened, and all cards will have consistent footer treatment.

Known icon tokens will map to Lucide components:

- `blocks` for React and MDX composition.
- `zap` for Vite and fast static delivery.
- `sparkles` for AI-ready artifacts.

Icons will be decorative when the heading already names the concept. Existing arbitrary string icons will continue to render as text for compatibility.

### 7.3 Quick start

The quick-start section will use a two-column layout on wide screens and a single column on narrow screens. The explanatory side will state what the two commands accomplish. The code side will use the existing accessible code block and copy action.

The section must not allow its heading, paragraph, code block, and follow-up link to become separate items in the outer home layout gap. They will share a local spacing rhythm inside the dedicated home content wrapper.

### 7.4 One source, two audiences

This section will contain two equal panels:

- Human readers: accessible navigation, local search, code highlighting, responsive layout, and static HTML.
- AI clients: deterministic Markdown routes, indexes, `llms.txt`, and an explicitly permissioned local MCP workspace.

The two panels will use text and icons rather than color alone to distinguish their roles.

### 7.5 Build outputs

A compact responsive grid will list the concrete artifacts produced by a build. Each item will contain a short name and a one-line explanation. The grid will avoid equal-height cards when content does not require them and will not repeat copy from the core capability cards.

### 7.6 Contact and follow

The final section will be a contained contact panel with two parts:

- GitHub: repository link for source, issues, and contribution.
- WeChat: `微信公众号：AI Dev Hub` with a short scan prompt and the supplied QR code.

English copy will identify the channel as `AI Dev Hub on WeChat`; Chinese copy will use `微信公众号：AI Dev Hub`.

QR requirements:

- Copy the source image into the website as a local asset without changing the original file.
- Convert the supplied JPEG once to a lossless PNG site asset; do not repeatedly recompress it.
- Preserve the complete white quiet zone and do not crop, mask, round, recolor, overlay, or decorate the QR modules.
- Declare intrinsic width and height to prevent layout shift.
- Display at approximately 160–176 CSS pixels on desktop and no smaller than 144 CSS pixels on mobile.
- Use descriptive localized alt text.
- Load below the fold with `loading="lazy"`.
- Verify recognition from the rendered desktop and mobile screenshots.

## 8. Layout and visual system

The design remains calm minimalism with higher information density.

### 8.1 Widths

- Navigation retains the shared layout width.
- Homepage content uses a visually tighter maximum width inside the global shell.
- Long prose remains capped around 65–75 characters per line.
- The hero and structured sections may use the wider grid; body copy within them may not stretch edge to edge.

### 8.2 Spacing

- Desktop section separation: approximately 48–56px.
- Mobile section separation: approximately 36–40px.
- Internal card and panel padding follows a 4/8px scale.
- Home headings use local margins; document-page `h2` separators do not apply inside the homepage body.
- Related heading, description, action, and visual content remain visibly grouped.

### 8.3 Color and elevation

- Continue using semantic theme tokens rather than page-specific raw colors.
- Use borders and subtle surface contrast as the primary separation mechanism.
- Keep one consistent card elevation level.
- Maintain at least WCAG AA text contrast in light and dark themes.
- Use the primary color only for actions, focus, small accents, and selected diagram connections.

### 8.4 Motion

- No entrance animation is required.
- Existing hover and press transitions remain within 150–300ms.
- Motion must use transform or opacity only and respect `prefers-reduced-motion`.

## 9. Responsive behavior

### Mobile, 375–639px

- Hero becomes one column.
- Actions wrap without horizontal scrolling.
- Workflow visual appears after actions with reserved aspect-ratio space.
- Feature cards, comparison panels, outputs, and contact content stack vertically.
- QR code remains centered and large enough to scan.
- Body text remains at least 16px.

### Tablet, 640–1023px

- Hero remains stacked or uses an asymmetric layout only when both columns retain readable width.
- Feature cards may use two columns with the third spanning or forming a balanced second row.
- Quick-start and comparison content may remain stacked.

### Desktop, 1024px and above

- Hero, quick start, dual-audience section, and contact panel use intentional two-column layouts.
- Feature cards use three columns.
- No section should create an empty half-screen merely to preserve symmetry.

## 10. Accessibility

- Preserve a single `h1` and sequential `h2`/`h3` hierarchy.
- Every major section has a visible heading or an accessible label.
- Structural icons use Lucide SVG and are hidden from assistive technology when redundant.
- The workflow illustration and QR code have meaningful localized alt text.
- Links and buttons retain visible focus rings and keyboard access.
- Interactive targets remain at least 44px where they are primary touch controls.
- The contact section does not rely on the QR code alone; GitHub and descriptive text provide alternative contact context.
- Light and dark themes are checked independently.

## 11. Base-path and hydration repair

The implementation will trace the point at which theme image URLs become base-aware during development SSR and ensure each local path is resolved exactly once.

The invariant is:

```text
resolve local path with base -> stable path
resolve stable path again     -> same stable path
```

Expected examples for base `/silen/`:

- `/logo.svg` -> `/silen/logo.svg`
- `/silen/logo.svg` -> `/silen/logo.svg`
- imported hashed asset -> unchanged generated URL
- `https://...`, `data:image/...`, `blob:...`, `#fragment` -> unchanged

Server-rendered and hydrated client markup must contain the same `src` values.

## 12. Expected implementation surface

The likely implementation files are:

- `src/theme-default/components/home.tsx`
- `src/theme-default/styles/document.css`
- `src/theme-default/styles/tokens.css` if a reusable home token is justified
- `src/theme-default/lib/navigation.ts` or the closest shared asset resolver
- `website/.silen/config.ts`
- `website/index.mdx`
- `website/zh/index.mdx`
- `website/public/silen-workflow.svg` for the base-aware hero illustration
- `website/assets/wechat-ai-dev-hub.png` for MDX-imported QR content
- Theme, render, server, build, and content tests that cover the changed contracts

No unrelated Guide, AI, sidebar, search, or MCP refactor is included.

## 13. Verification

Automated verification:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm site:build
pnpm format:check
```

Browser verification will use the real Silen dev server and cover:

- English `/silen/` and Chinese `/silen/zh/` homepages.
- Route-preserving language switching.
- 375px, 768px, and 1440px viewports.
- Light and dark appearance modes.
- Keyboard focus through navigation, actions, code copy, GitHub, and contact links.
- No horizontal overflow.
- No broken local images.
- No hydration mismatch or other console errors.
- QR visibility and scanability at desktop and mobile rendered sizes.
- Guide and AI routes as regression checks, without content redesign.

## 14. Acceptance criteria

The work is complete when:

1. The marked whitespace gaps are replaced by consistent, intentional section rhythm.
2. The homepage presents all six information sections in both languages.
3. The hero visual explains the Silen build pipeline and does not become an empty block on mobile.
4. Feature icons are visually consistent SVGs rather than emoji glyphs.
5. The AI Dev Hub WeChat QR code appears in the final homepage contact section, remains readable, and preserves its quiet zone.
6. Development SSR and hydration use identical base-aware image paths.
7. All automated checks pass.
8. Browser checks pass at the required viewports and in both themes with zero console errors.
9. The working tree contains no temporary browser or image-generation artifacts.
