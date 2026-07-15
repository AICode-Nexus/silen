# Silen Homepage Density and Contact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

> **Post-implementation update (2026-07-15):** The original hand-authored `silen-workflow.svg` was later replaced by the approved, image-generated `silen-workflow.png` at 1200×800. The original SVG steps below remain as implementation history.

**Goal:** Deliver a denser bilingual Silen homepage, a base-safe workflow visual, an AI Dev Hub WeChat contact section, and zero-error SSR hydration.

**Architecture:** Keep the public hero/features configuration model small. Fix development SSR at the HTML-transform boundary, strengthen the reusable HomeLayout with stable class hooks and Lucide icon tokens, and author the richer product narrative in the English and Chinese MDX pages. Use a public workflow image for the configured hero and a Vite-imported PNG for the QR code so each asset follows the correct base-path pipeline.

**Tech Stack:** TypeScript 7, React 19, Vite 8, MDX 3, Tailwind CSS 4, Lucide React, Vitest, Testing Library, Playwright CLI, macOS sips.

## Global Constraints

- Do not redesign Guide or AI information architecture.
- Do not add a global footer, contact backend, analytics, third-party embed, or large homepage-section schema.
- Keep the existing ThemeHomeHero and ThemeHomeFeature fields; known icon string tokens gain Lucide rendering without removing arbitrary string fallback.
- Desktop section separation is 48–56px; mobile section separation is 36–40px.
- Verify 375px, 768px, and 1440px viewports in light and dark appearance modes.
- Preserve one h1, sequential h2/h3 headings, keyboard focus, meaningful localized alt text, and WCAG AA text contrast.
- Preserve the original QR file at /Users/admin/Desktop/qrcode_for_gh_d6a14f8e7285_344.jpg.
- Convert the QR once to PNG, preserve its complete quiet zone, declare 344x344 intrinsic dimensions, render it at 160–176 CSS pixels on desktop and at least 144 CSS pixels on mobile, and load it lazily.
- Do not crop, mask, recolor, overlay, or round the QR image.
- The homepage must require no image-generation or provider API key.
- Development SSR and hydrated client image src values must match exactly.
- Final browser verification must show no broken local images, horizontal overflow, hydration warnings, or other console errors.

---

## File Map

- Modify src/node/server.ts — keep SSR application markup out of Vite's index-HTML asset rewrite.
- Modify tests/server.test.ts — reproduce and lock the base-prefixed logo/hero regression.
- Modify src/theme-default/components/home.tsx — add stable home wrappers, compact layout, visual container, feature icon mapping, and consistent card structure.
- Modify src/theme-default/styles/document.css — add reusable home typography, section, panel, contact, QR, and responsive rules.
- Modify tests/theme/content.test.tsx — verify wrapper semantics, Lucide token mapping, fallback icons, and safe image output.
- Create tests/website.test.ts — verify homepage assets and bilingual information architecture.
- Create website/public/silen-workflow.svg — explanatory hero pipeline visual.
- Create website/assets/wechat-ai-dev-hub.png — lossless site copy of the supplied QR image.
- Modify website/.silen/config.ts — update English/Chinese hero copy, images, actions, and feature cards.
- Replace website/index.mdx — English quick start, two-audience, outputs, and contact sections.
- Replace website/zh/index.mdx — structurally equivalent Chinese content.
- Modify docs/superpowers/specs/2026-07-15-silen-homepage-density-design.md — record approval and the corrected root cause.

---

### Task 1: Make development SSR image URLs base-idempotent

**Files:**
- Modify: tests/server.test.ts:68-130
- Modify: src/node/server.ts:230-269

**Interfaces:**
- Consumes: RenderedPage.appHtml and ViteDevServer.transformIndexHtml(requestUrl, html).
- Produces: transformDevelopmentDocument(page, vite, requestUrl, favicon): Promise<string>.

- [ ] **Step 1: Extend the server fixture with base-aware theme images**

In tests/server.test.ts, create public/logo.svg in beforeAll and make the fixture homepage use the home layout:

~~~ts
await mkdir(path.join(root, 'public'), { recursive: true })

await Promise.all([
  writeFile(
    path.join(root, '.silen/config.ts'),
    \`import { defineConfig } from \${JSON.stringify(packageEntry)}
export default defineConfig({
  title: 'Server fixture',
  description: 'HTTP integration fixture',
  base: '/docs/',
  outDir: 'output',
  themeConfig: {
    logo: '/logo.svg',
    home: {
      hero: {
        name: 'Server fixture',
        image: { src: '/logo.svg', alt: 'Server fixture workflow' },
      },
    },
  },
})
\`,
  ),
  writeFile(
    path.join(root, 'index.mdx'),
    \`---
layout: home
---

import './page.css'

## Development home

Rendered by Vite SSR.
\`,
  ),
  writeFile(
    path.join(root, 'public/logo.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32"/></svg>\n',
  ),
  writeFile(
    path.join(root, 'guide.mdx'),
    '# Preview guide\n\nBuilt output only.\n',
  ),
  writeFile(path.join(root, 'page.css'), 'body { color: #123456; }\n'),
  writeFile(path.join(root, 'secret.txt'), 'outside output\n'),
])
~~~

Add these assertions after homeHtml is read:

~~~ts
expect(homeHtml).toContain('<h1')
expect(homeHtml).toContain('>Server fixture</h1>')
expect(homeHtml).toContain('<h2>Development home</h2>')
expect(homeHtml).toContain('src="/docs/logo.svg"')
expect(homeHtml).not.toContain('/docs/docs/logo.svg')
expect(homeHtml.match(/src="\/docs\/logo\.svg"/g)).toHaveLength(2)
~~~

Replace the existing expectation for <h1>Development home</h1> with the h1/h2 expectations above because the configured hero now owns the single page h1.

- [ ] **Step 2: Run the focused test and verify the regression**

Run:

~~~bash
pnpm exec vitest run tests/server.test.ts -t "serves base-aware Vite SSR HTML"
~~~

Expected: FAIL because transformIndexHtml rewrites the already mounted /docs/logo.svg URL to /docs/docs/logo.svg.

- [ ] **Step 3: Transform the development shell before inserting SSR markup**

Add this helper above renderDevelopmentRequest in src/node/server.ts:

~~~ts
const developmentSsrOutlet = '<!--silen-development-ssr-outlet-->'

async function transformDevelopmentDocument(
  page: RenderedPage,
  vite: ViteDevServer,
  requestUrl: string,
  favicon: ResolvedFavicon,
): Promise<string> {
  const shell = renderDocument(
    { ...page, appHtml: developmentSsrOutlet },
    {
      base: '/',
      clientEntry: viteFileUrl(clientEntrySource()),
      favicon,
    },
  )
  const transformed = await vite.transformIndexHtml(requestUrl, shell)
  return transformed.replace(developmentSsrOutlet, () => page.appHtml)
}
~~~

Replace the current renderDocument plus transformIndexHtml block with:

~~~ts
const page = await render(requestUrl)
const document = await transformDevelopmentDocument(
  page,
  vite,
  requestUrl,
  favicon,
)
~~~

The callback form of replace is required so dollar sequences in rendered content are inserted literally.

- [ ] **Step 4: Run focused and neighboring server tests**

Run:

~~~bash
pnpm exec prettier --write src/node/server.ts tests/server.test.ts
pnpm exec vitest run tests/server.test.ts tests/render.test.ts
~~~

Expected: PASS, including HMR URLs, favicon behavior, 404 rendering, preview security, and the two correct image src attributes.

- [ ] **Step 5: Commit the SSR repair**

~~~bash
git add src/node/server.ts tests/server.test.ts
git commit -m "fix(server): preserve base-aware SSR image paths"
~~~

---

### Task 2: Build the reusable dense HomeLayout

**Files:**
- Modify: tests/theme/content.test.tsx:36-110
- Modify: src/theme-default/components/home.tsx:1-235,350-430
- Modify: src/theme-default/styles/document.css:1-153

**Interfaces:**
- Consumes: existing ThemeHomeHero, ThemeHomeFeature, HomeLink, CodeBlock, and semantic theme tokens.
- Produces: class hooks silen-home, silen-home-hero, silen-home-visual, silen-home-features, silen-home-feature-card, and silen-home-content.
- Produces: icon token mapping for blocks, zap, and sparkles, with arbitrary string fallback.

- [ ] **Step 1: Write failing layout and icon assertions**

Capture the render container in the existing semantic hero test and add one fallback feature:

~~~tsx
const { container } = render(
  <TestSiteProvider base="/project/">
    <HomeLayout
      hero={{
        name: 'Build calmer docs',
        tagline: 'React, Vite, and MDX without the weight.',
        image: { src: '/hero.svg', alt: 'Silen documentation preview' },
        actions: [{ text: 'Get started', link: '/guide/' }],
      }}
      features={[
        {
          icon: 'blocks',
          title: 'Fast by default',
          details: 'Server-rendered pages with focused client behavior.',
          link: '/guide/performance',
          linkText: 'Performance guide',
        },
        {
          icon: 'custom-mark',
          title: 'Typed configuration',
          details: 'Small, explicit contracts.',
        },
      ]}
    >
      <section aria-label="Additional home content">
        Additional home content
      </section>
    </HomeLayout>
  </TestSiteProvider>,
)

expect(container.querySelector('.silen-home')).not.toBeNull()
expect(container.querySelector('.silen-home-hero')).not.toBeNull()
expect(container.querySelector('.silen-home-visual')).not.toBeNull()
expect(container.querySelector('.silen-home-features')).not.toBeNull()
expect(container.querySelector('.silen-home-content')).not.toBeNull()
expect(container.querySelector('svg.lucide-blocks')).not.toBeNull()
expect(screen.getByText('custom-mark')).not.toBeNull()
~~~

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

~~~bash
pnpm exec vitest run tests/theme/content.test.tsx -t "renders a semantic, base-aware hero"
~~~

Expected: FAIL because the new class hooks and Lucide token renderer do not exist.

- [ ] **Step 3: Add the feature icon renderer and compact card classes**

Change the Lucide import:

~~~tsx
import {
  ArrowRightIcon,
  BlocksIcon,
  SparklesIcon,
  ZapIcon,
} from 'lucide-react'
~~~

Add above FeatureCard:

~~~tsx
const featureIcons = {
  blocks: BlocksIcon,
  sparkles: SparklesIcon,
  zap: ZapIcon,
} as const

function FeatureIcon({ icon }: { readonly icon: string }): React.JSX.Element {
  const Icon = featureIcons[icon as keyof typeof featureIcons]
  return (
    <span aria-hidden="true" className="silen-home-feature-icon">
      {Icon ? <Icon /> : icon}
    </span>
  )
}
~~~

Replace the FeatureCard opening and header/icon block with:

~~~tsx
<Card className="silen-home-feature-card h-full">
  <CardHeader className="flex-1">
    {feature.icon ? <FeatureIcon icon={feature.icon} /> : null}
    <CardTitle>
      <h3>{feature.title}</h3>
    </CardTitle>
    <CardDescription>{feature.details}</CardDescription>
  </CardHeader>
~~~

Add className="mt-auto" to CardFooter.

- [ ] **Step 4: Wrap the hero image and all MDX children**

Replace the HomeLayout return block with:

~~~tsx
return (
  <div className="silen-home mx-auto flex max-w-[var(--silen-layout-width)] flex-col gap-12 px-6 py-12 sm:py-16 lg:px-10">
    {hero ? (
      <section
        aria-labelledby={heroTitleId}
        className="silen-home-hero grid items-center gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(28rem,1.08fr)] lg:gap-12"
      >
        <div className="silen-home-hero-copy flex flex-col gap-5">
          <h1
            id={heroTitleId}
            className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl"
          >
            {hero.name}
          </h1>
          {hero.text ? (
            <p className="text-balance text-2xl font-medium">{hero.text}</p>
          ) : null}
          {hero.tagline ? (
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              {hero.tagline}
            </p>
          ) : null}
          <HeroActions actions={hero.actions ?? []} base={base} />
        </div>
        {imageSource && imageData ? (
          <div className="silen-home-visual">
            <img
              src={imageSource}
              alt={imageData.alt}
              className="silen-home-hero-image"
            />
          </div>
        ) : null}
      </section>
    ) : null}
    {features.length > 0 ? (
      <section
        aria-labelledby={featuresTitleId}
        className="silen-home-features"
      >
        <h2 id={featuresTitleId} className="sr-only">
          Features
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard
              key={\`\${feature.title}:\${feature.link ?? ''}\`}
              feature={feature}
              base={base}
            />
          ))}
        </div>
      </section>
    ) : null}
    <div className="silen-home-content">{children}</div>
  </div>
)
~~~

- [ ] **Step 5: Add reusable home styles**

Append this block before the pager styles in document.css:

~~~css
.silen-home-visual {
  display: flex;
  min-height: 18rem;
  aspect-ratio: 3 / 2;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--silen-border);
  border-radius: calc(var(--silen-radius) + 0.5rem);
  background: var(--silen-muted);
  padding: clamp(1rem, 3vw, 2rem);
}

.silen-home-hero-image {
  width: 100%;
  max-height: 22rem;
  object-fit: contain;
}

.silen-home-feature-icon {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;
  border-radius: 0.65rem;
  background: color-mix(in oklab, var(--silen-primary) 12%, transparent);
  color: var(--silen-primary);
  font-size: 0.875rem;
  font-weight: 700;
}

.silen-home-feature-icon svg {
  width: 1.125rem;
  height: 1.125rem;
  stroke-width: 1.8;
}

.silen-home-content {
  min-width: 0;
  line-height: 1.7;
}

.silen-home-content:empty {
  display: none;
}

.silen-home-content > * {
  margin-block: 0;
}

.silen-home-content > * + * {
  margin-top: 1rem;
}

.silen-home-content > h2 {
  margin-top: 3rem;
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 650;
  letter-spacing: -0.02em;
  line-height: 1.25;
}

.silen-home-content > p {
  max-width: 72ch;
  color: var(--silen-muted-foreground);
}

.silen-home-content > .silen-code-block {
  margin-top: 1.5rem;
}

.silen-home-section {
  display: grid;
  min-width: 0;
  gap: 1.5rem;
  padding-top: 3rem;
  border-top: 1px solid var(--silen-border);
}

.silen-home-section + .silen-home-section {
  margin-top: 3.5rem;
}

.silen-home-section :where(h2, h3, p, ul, figure) {
  margin: 0;
}

.silen-home-section h2 {
  max-width: 22ch;
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 650;
  letter-spacing: -0.025em;
  line-height: 1.2;
}

.silen-home-section h3 {
  font-size: 1rem;
  font-weight: 650;
}

.silen-home-section-copy {
  display: grid;
  align-content: start;
  gap: 0.875rem;
}

.silen-home-eyebrow {
  color: var(--silen-primary);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.silen-home-lede {
  max-width: 68ch;
  color: var(--silen-muted-foreground);
  font-size: 1.05rem;
}

.silen-home-code-panel .silen-code-block {
  margin: 0;
}

.silen-home-inline-link,
.silen-home-action {
  display: inline-flex;
  width: fit-content;
  min-height: 2.75rem;
  align-items: center;
  gap: 0.5rem;
  border-radius: 0.65rem;
  font-weight: 650;
}

.silen-home-inline-link {
  color: var(--silen-primary);
}

.silen-home-action {
  border: 1px solid var(--silen-border);
  padding: 0.65rem 0.9rem;
  color: var(--silen-foreground);
}

.silen-home-inline-link:focus-visible,
.silen-home-action:focus-visible {
  outline: 2px solid var(--silen-ring);
  outline-offset: 3px;
}

.silen-home-inline-link svg,
.silen-home-action svg {
  width: 1rem;
  height: 1rem;
}

.silen-home-panel-grid,
.silen-home-output-grid {
  display: grid;
  gap: 1rem;
}

.silen-home-panel,
.silen-home-output {
  display: grid;
  align-content: start;
  gap: 0.75rem;
  border: 1px solid var(--silen-border);
  border-radius: var(--silen-radius);
  background: var(--silen-card);
  padding: 1.25rem;
}

.silen-home-panel-icon,
.silen-home-output-icon {
  display: inline-flex;
  width: 2rem;
  height: 2rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.55rem;
  background: var(--silen-muted);
  color: var(--silen-primary);
}

.silen-home-panel-icon svg,
.silen-home-output-icon svg {
  width: 1rem;
  height: 1rem;
}

.silen-home-panel ul {
  display: grid;
  gap: 0.45rem;
  padding-left: 1.2rem;
  color: var(--silen-muted-foreground);
  list-style: disc;
}

.silen-home-output p,
.silen-home-panel p {
  color: var(--silen-muted-foreground);
}

.silen-home-contact {
  align-items: center;
  border: 1px solid var(--silen-border);
  border-radius: calc(var(--silen-radius) + 0.25rem);
  background: var(--silen-muted);
  padding: clamp(1.5rem, 4vw, 2.5rem);
}

.silen-home-qr {
  display: grid;
  justify-items: center;
  gap: 0.75rem;
}

.silen-home-qr img {
  width: clamp(9rem, 24vw, 11rem);
  height: auto;
  border-radius: 0;
  background: white;
}

.silen-home-qr figcaption {
  color: var(--silen-muted-foreground);
  font-size: 0.875rem;
}

@media (min-width: 48rem) {
  .silen-home-panel-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .silen-home-output-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 60rem) {
  .silen-home-section--split,
  .silen-home-contact {
    grid-template-columns: minmax(0, 0.9fr) minmax(24rem, 1.1fr);
    gap: 3rem;
  }

  .silen-home-output-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 39.999rem) {
  .silen-home-visual {
    min-height: 13rem;
  }

  .silen-home-section {
    gap: 1.25rem;
    padding-top: 2.25rem;
  }

  .silen-home-section + .silen-home-section {
    margin-top: 2.5rem;
  }
}
~~~

- [ ] **Step 6: Run theme tests and quality checks**

Run:

~~~bash
pnpm exec prettier --write src/theme-default/components/home.tsx src/theme-default/styles/document.css tests/theme/content.test.tsx
pnpm exec vitest run tests/theme/content.test.tsx
pnpm typecheck
pnpm lint
~~~

Expected: PASS. Existing safe URL, locale override, network-path, document, pager, and code-copy tests remain green.

- [ ] **Step 7: Commit the reusable theme**

~~~bash
git add src/theme-default/components/home.tsx src/theme-default/styles/document.css tests/theme/content.test.tsx
git commit -m "feat(theme): tighten homepage content rhythm"
~~~

---

### Task 3: Add verified homepage assets and localized theme configuration

**Files:**
- Create: tests/website.test.ts
- Create: website/public/silen-workflow.svg
- Create: website/assets/wechat-ai-dev-hub.png
- Modify: website/.silen/config.ts:53-134

**Interfaces:**
- Produces: /silen-workflow.svg through the public-asset and base-aware theme image path.
- Produces: wechat QR as a Vite-importable 344x344 PNG.
- Produces: blocks, zap, and sparkles icon tokens for Task 2.

- [ ] **Step 1: Write failing asset tests**

Create tests/website.test.ts:

~~~ts
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('example website homepage', () => {
  it('ships an explanatory workflow SVG', async () => {
    const source = await readFile(
      path.resolve('website/public/silen-workflow.svg'),
      'utf8',
    )
    expect(source).toContain('<svg')
    expect(source).toContain('MDX')
    expect(source).toContain('Static HTML')
    expect(source).toContain('llms.txt')
    expect(source).toContain('MCP')
  })

  it('ships the AI Dev Hub QR code as a PNG', async () => {
    const source = await readFile(
      path.resolve('website/assets/wechat-ai-dev-hub.png'),
    )
    expect([...source.subarray(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
  })
})
~~~

- [ ] **Step 2: Run the asset tests and verify they fail**

Run:

~~~bash
pnpm exec vitest run tests/website.test.ts
~~~

Expected: FAIL with ENOENT for both missing assets.

- [ ] **Step 3: Create the hero workflow SVG**

Create website/public/silen-workflow.svg with this complete asset:

~~~svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 480" role="img" aria-labelledby="title desc">
  <title id="title">Silen documentation build workflow</title>
  <desc id="desc">MDX and React content flows through Silen into static HTML, search, Markdown, llms.txt, and an optional MCP workspace.</desc>
  <defs>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c6cff"/>
      <stop offset="1" stop-color="#4f46e5"/>
    </linearGradient>
  </defs>
  <g font-family="Inter, ui-sans-serif, system-ui, sans-serif">
    <rect x="24" y="30" width="672" height="420" rx="32" fill="#17172b"/>
    <rect x="58" y="76" width="156" height="104" rx="18" fill="#25253d" stroke="#474766"/>
    <text x="82" y="116" fill="#a9a4ff" font-size="14" font-weight="700">TRUSTED SOURCE</text>
    <text x="82" y="151" fill="#ffffff" font-size="28" font-weight="700">MDX + React</text>
    <path d="M230 128h74" stroke="#7c6cff" stroke-width="6" stroke-linecap="round"/>
    <path d="m292 114 18 14-18 14" fill="none" stroke="#7c6cff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="324" y="76" width="156" height="104" rx="18" fill="url(#accent)"/>
    <text x="350" y="116" fill="#dedcff" font-size="14" font-weight="700">ONE BUILD</text>
    <text x="350" y="151" fill="#ffffff" font-size="30" font-weight="750">Silen</text>
    <path d="M496 128h58" stroke="#7c6cff" stroke-width="6" stroke-linecap="round"/>
    <path d="m542 114 18 14-18 14" fill="none" stroke="#7c6cff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="576" y="76" width="86" height="104" rx="18" fill="#25253d" stroke="#474766"/>
    <text x="619" y="117" text-anchor="middle" fill="#ffffff" font-size="18" font-weight="700">Fast</text>
    <text x="619" y="145" text-anchor="middle" fill="#aaaac0" font-size="13">static output</text>
    <g transform="translate(58 226)">
      <rect width="184" height="92" rx="16" fill="#25253d" stroke="#474766"/>
      <text x="22" y="38" fill="#ffffff" font-size="20" font-weight="700">Static HTML</text>
      <text x="22" y="65" fill="#aaaac0" font-size="13">Readable before hydration</text>
    </g>
    <g transform="translate(268 226)">
      <rect width="184" height="92" rx="16" fill="#25253d" stroke="#474766"/>
      <text x="22" y="38" fill="#ffffff" font-size="20" font-weight="700">Local search</text>
      <text x="22" y="65" fill="#aaaac0" font-size="13">Fast, deterministic index</text>
    </g>
    <g transform="translate(478 226)">
      <rect width="184" height="92" rx="16" fill="#25253d" stroke="#474766"/>
      <text x="22" y="38" fill="#ffffff" font-size="20" font-weight="700">Markdown</text>
      <text x="22" y="65" fill="#aaaac0" font-size="13">Clean route output</text>
    </g>
    <g transform="translate(163 340)">
      <rect width="184" height="72" rx="16" fill="#302d69" stroke="#625bd5"/>
      <text x="92" y="44" text-anchor="middle" fill="#ffffff" font-size="20" font-weight="700">llms.txt</text>
    </g>
    <g transform="translate(373 340)">
      <rect width="184" height="72" rx="16" fill="#302d69" stroke="#625bd5"/>
      <text x="92" y="34" text-anchor="middle" fill="#ffffff" font-size="19" font-weight="700">Optional MCP</text>
      <text x="92" y="54" text-anchor="middle" fill="#c9c6ff" font-size="12">permission-gated</text>
    </g>
  </g>
</svg>
~~~

- [ ] **Step 4: Convert the supplied QR image exactly once**

Run:

~~~bash
mkdir -p website/assets
sips -s format png /Users/admin/Desktop/qrcode_for_gh_d6a14f8e7285_344.jpg --out website/assets/wechat-ai-dev-hub.png
file website/assets/wechat-ai-dev-hub.png
sips -g pixelWidth -g pixelHeight website/assets/wechat-ai-dev-hub.png
~~~

Expected: PNG image data, pixelWidth 344, pixelHeight 344. Do not run any crop, resize, optimize, or compression command on the QR.

- [ ] **Step 5: Update both localized home configurations**

Replace the Chinese home block in website/.silen/config.ts with:

~~~ts
home: {
  hero: {
    name: 'Silen',
    text: '为人类与 AI 构建的 React 文档。',
    tagline:
      '使用 MDX 写作、用 React 扩展，再从同一个可信源输出静态 HTML、本地搜索、干净 Markdown 与可选 MCP 工作区。',
    image: {
      src: '/silen-workflow.svg',
      alt: 'Silen 将 MDX 与 React 内容构建为静态 HTML、搜索、Markdown、llms.txt 和 MCP 工作区',
    },
    actions: [
      { text: '快速开始', link: '/zh/guide/', theme: 'brand' },
      {
        text: '查看 GitHub',
        link: 'https://github.com/AICode-Nexus/silen',
        theme: 'alt',
        target: '_blank',
      },
    ],
  },
  features: [
    {
      icon: 'blocks',
      title: 'React 优先',
      details: '在可信 MDX 中组合 TypeScript 与 React 组件，保留轻量写作体验。',
      link: '/zh/guide/',
      linkText: '了解写作流程',
    },
    {
      icon: 'zap',
      title: 'Vite 驱动',
      details: '快速启动、无整页刷新的导航，并为生产环境生成完整静态 HTML。',
      link: '/zh/guide/',
      linkText: '查看快速开始',
    },
    {
      icon: 'sparkles',
      title: 'AI-ready',
      details: '生成 llms.txt、Markdown 路由、搜索索引与有权限边界的 MCP 工作区。',
      link: '/zh/ai/',
      linkText: '了解 AI 能力',
    },
  ],
},
~~~

Replace the English home block with:

~~~ts
home: {
  hero: {
    name: 'Silen',
    text: 'React documentation for people and AI.',
    tagline:
      'Write in MDX, extend with React, and ship static HTML, local search, clean Markdown, and an optional MCP workspace from one trusted source.',
    image: {
      src: '/silen-workflow.svg',
      alt: 'Silen builds MDX and React content into static HTML, search, Markdown, llms.txt, and an MCP workspace',
    },
    actions: [
      { text: 'Get started', link: '/guide/', theme: 'brand' },
      {
        text: 'View on GitHub',
        link: 'https://github.com/AICode-Nexus/silen',
        theme: 'alt',
        target: '_blank',
      },
    ],
  },
  features: [
    {
      icon: 'blocks',
      title: 'React-first',
      details: 'Compose TypeScript and React components inside trusted MDX without losing a focused authoring loop.',
      link: '/guide/',
      linkText: 'Explore authoring',
    },
    {
      icon: 'zap',
      title: 'Vite-fast',
      details: 'Start quickly, navigate without full reloads, and emit complete static HTML for production.',
      link: '/guide/',
      linkText: 'See the quick start',
    },
    {
      icon: 'sparkles',
      title: 'AI-ready',
      details: 'Generate llms.txt, Markdown routes, search indexes, and a permission-gated MCP workspace.',
      link: '/ai/',
      linkText: 'Explore AI features',
    },
  ],
},
~~~

- [ ] **Step 6: Run asset tests and build the example site**

Run:

~~~bash
pnpm exec prettier --write tests/website.test.ts website/.silen/config.ts website/public/silen-workflow.svg
pnpm exec vitest run tests/website.test.ts
pnpm site:build
~~~

Expected: PASS; six localized routes build; generated HTML references /silen/silen-workflow.svg, never /silen/silen/silen-workflow.svg.

- [ ] **Step 7: Commit assets and theme configuration**

~~~bash
git add tests/website.test.ts website/public/silen-workflow.svg website/assets/wechat-ai-dev-hub.png website/.silen/config.ts
git commit -m "feat(site): add homepage visual assets"
~~~

---

### Task 4: Author complete English and Chinese homepage content

**Files:**
- Modify: tests/website.test.ts
- Replace: website/index.mdx
- Replace: website/zh/index.mdx

**Interfaces:**
- Consumes: CodeBlock from silen/theme, Link from silen/client, Lucide icons, Task 2 class hooks, and Task 3 QR import.
- Produces: equivalent quick-start, dual-audience, build-output, and contact sections in both locales.

- [ ] **Step 1: Add failing bilingual content assertions**

Append to the website describe block:

~~~ts
it.each([
  {
    file: 'website/index.mdx',
    markers: [
      'Start in seconds',
      'One source, two audiences',
      'What every build ships',
      'Stay connected',
      'AI Dev Hub on WeChat',
    ],
  },
  {
    file: 'website/zh/index.mdx',
    markers: [
      '几秒内开始',
      '一份内容，两类读者',
      '每次构建都会产出',
      '联系与关注',
      '微信公众号：AI Dev Hub',
    ],
  },
])('keeps $file complete and localized', async ({ file, markers }) => {
  const source = await readFile(path.resolve(file), 'utf8')
  for (const marker of markers) expect(source).toContain(marker)
  expect(source).toContain('wechat-ai-dev-hub.png')
  expect(source).toContain('width={344}')
  expect(source).toContain('height={344}')
  expect(source).toContain('loading="lazy"')
})
~~~

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

~~~bash
pnpm exec vitest run tests/website.test.ts
~~~

Expected: FAIL because the current homepages do not contain the four structured sections or QR import.

- [ ] **Step 3: Replace the English homepage**

Use this structure and exact copy in website/index.mdx:

~~~mdx
---
layout: home
title: Silen
description: React documentation for people and AI.
---

import {
  ArrowRightIcon,
  BotIcon,
  BracesIcon,
  FileCode2Icon,
  FileTextIcon,
  GitForkIcon,
  Globe2Icon,
  SearchIcon,
  ServerCogIcon,
  UsersIcon,
} from 'lucide-react'
import { Link } from 'silen/client'
import { CodeBlock } from 'silen/theme'
import wechatQr from './assets/wechat-ai-dev-hub.png'

<section className="silen-home-section silen-home-section--split" aria-labelledby="quick-start-title">
  <div className="silen-home-section-copy">
    <p className="silen-home-eyebrow">Two commands, one calm workflow</p>
    <h2 id="quick-start-title">Start in seconds</h2>
    <p className="silen-home-lede">
      Add Silen to a project, point it at your docs folder, and get React-powered
      MDX with fast local navigation and production-ready static output.
    </p>
    <Link className="silen-home-inline-link" href="guide/">
      Read the guide <ArrowRightIcon aria-hidden="true" />
    </Link>
  </div>
  <div className="silen-home-code-panel">
    <CodeBlock
      language="sh"
      code={'pnpm add -D silen\npnpm silen dev docs'}
    />
  </div>
</section>

<section className="silen-home-section" aria-labelledby="audiences-title">
  <div className="silen-home-section-copy">
    <p className="silen-home-eyebrow">One trusted source</p>
    <h2 id="audiences-title">One source, two audiences</h2>
    <p className="silen-home-lede">
      Every route starts as ordinary MDX and becomes a dependable reading
      experience for people and a deterministic interface for AI clients.
    </p>
  </div>
  <div className="silen-home-panel-grid">
    <article className="silen-home-panel">
      <span className="silen-home-panel-icon"><UsersIcon aria-hidden="true" /></span>
      <h3>Human readers</h3>
      <p>Fast, accessible documentation that stays useful before hydration.</p>
      <ul>
        <li>Responsive navigation and local search</li>
        <li>Readable code highlighting and copy controls</li>
        <li>Complete static HTML on every route</li>
      </ul>
    </article>
    <article className="silen-home-panel">
      <span className="silen-home-panel-icon"><BotIcon aria-hidden="true" /></span>
      <h3>AI clients</h3>
      <p>Clean artifacts with explicit boundaries instead of scraped UI.</p>
      <ul>
        <li>Deterministic Markdown routes and manifests</li>
        <li>llms.txt plus a local search index</li>
        <li>Optional, permission-gated MCP workspace</li>
      </ul>
    </article>
  </div>
</section>

<section className="silen-home-section" aria-labelledby="outputs-title">
  <div className="silen-home-section-copy">
    <p className="silen-home-eyebrow">Useful by default</p>
    <h2 id="outputs-title">What every build ships</h2>
    <p className="silen-home-lede">
      Silen turns one content tree into the formats each reader actually needs.
    </p>
  </div>
  <div className="silen-home-output-grid">
    <article className="silen-home-output">
      <span className="silen-home-output-icon"><Globe2Icon aria-hidden="true" /></span>
      <h3>Static HTML</h3>
      <p>Deployable pages with primary content already rendered.</p>
    </article>
    <article className="silen-home-output">
      <span className="silen-home-output-icon"><SearchIcon aria-hidden="true" /></span>
      <h3>Local search</h3>
      <p>A fast, private index with no hosted search dependency.</p>
    </article>
    <article className="silen-home-output">
      <span className="silen-home-output-icon"><FileTextIcon aria-hidden="true" /></span>
      <h3>Markdown routes</h3>
      <p>Clean source-shaped output for tools and agents.</p>
    </article>
    <article className="silen-home-output">
      <span className="silen-home-output-icon"><FileCode2Icon aria-hidden="true" /></span>
      <h3>llms.txt</h3>
      <p>A predictable entry point into the documentation corpus.</p>
    </article>
    <article className="silen-home-output">
      <span className="silen-home-output-icon"><ServerCogIcon aria-hidden="true" /></span>
      <h3>Optional MCP</h3>
      <p>A local workspace with explicit read and write permissions.</p>
    </article>
    <article className="silen-home-output">
      <span className="silen-home-output-icon"><BracesIcon aria-hidden="true" /></span>
      <h3>React MDX</h3>
      <p>Typed components only where documentation benefits from them.</p>
    </article>
  </div>
</section>

<section className="silen-home-section silen-home-contact" aria-labelledby="contact-title">
  <div className="silen-home-section-copy">
    <p className="silen-home-eyebrow">Build with us</p>
    <h2 id="contact-title">Stay connected</h2>
    <p className="silen-home-lede">
      Follow development on GitHub or scan the WeChat official-account QR code
      for AI development notes and Silen updates from AI Dev Hub.
    </p>
    <a
      className="silen-home-action"
      href="https://github.com/AICode-Nexus/silen"
      target="_blank"
      rel="noopener noreferrer"
    >
      <GitForkIcon aria-hidden="true" /> Open GitHub
    </a>
  </div>
  <figure className="silen-home-qr">
    <img
      src={wechatQr}
      alt="QR code for the AI Dev Hub WeChat official account"
      width={344}
      height={344}
      loading="lazy"
    />
    <figcaption>AI Dev Hub on WeChat</figcaption>
  </figure>
</section>
~~~

- [ ] **Step 4: Replace the Chinese homepage**

Replace website/zh/index.mdx with this complete localized page:

~~~mdx
---
layout: home
lang: zh-CN
title: Silen
description: 为人类与 AI 构建的 React 文档。
---

import {
  ArrowRightIcon,
  BotIcon,
  BracesIcon,
  FileCode2Icon,
  FileTextIcon,
  GitForkIcon,
  Globe2Icon,
  SearchIcon,
  ServerCogIcon,
  UsersIcon,
} from 'lucide-react'
import { Link } from 'silen/client'
import { CodeBlock } from 'silen/theme'
import wechatQr from '../assets/wechat-ai-dev-hub.png'

<section className="silen-home-section silen-home-section--split" aria-labelledby="quick-start-title">
  <div className="silen-home-section-copy">
    <p className="silen-home-eyebrow">两条命令，一个安静的工作流</p>
    <h2 id="quick-start-title">几秒内开始</h2>
    <p className="silen-home-lede">
      将 Silen 加入项目并指向文档目录，即可获得 React 驱动的 MDX、
      快速本地导航和可直接部署的静态输出。
    </p>
    <Link className="silen-home-inline-link" href="guide/">
      阅读指南 <ArrowRightIcon aria-hidden="true" />
    </Link>
  </div>
  <div className="silen-home-code-panel">
    <CodeBlock
      language="sh"
      code={'pnpm add -D silen\npnpm silen dev docs'}
    />
  </div>
</section>

<section className="silen-home-section" aria-labelledby="audiences-title">
  <div className="silen-home-section-copy">
    <p className="silen-home-eyebrow">一个可信源</p>
    <h2 id="audiences-title">一份内容，两类读者</h2>
    <p className="silen-home-lede">
      每条路由都从普通 MDX 出发，同时成为面向人类的可靠阅读体验，
      以及面向 AI 客户端的确定性接口。
    </p>
  </div>
  <div className="silen-home-panel-grid">
    <article className="silen-home-panel">
      <span className="silen-home-panel-icon"><UsersIcon aria-hidden="true" /></span>
      <h3>人类读者</h3>
      <p>快速、可访问，并且在 hydration 之前就能完整阅读。</p>
      <ul>
        <li>响应式导航与本地搜索</li>
        <li>清晰的代码高亮与复制控件</li>
        <li>每条路由都输出完整静态 HTML</li>
      </ul>
    </article>
    <article className="silen-home-panel">
      <span className="silen-home-panel-icon"><BotIcon aria-hidden="true" /></span>
      <h3>AI 客户端</h3>
      <p>提供边界明确的干净产物，而不是抓取浏览器界面。</p>
      <ul>
        <li>确定性的 Markdown 路由与清单</li>
        <li>llms.txt 与本地搜索索引</li>
        <li>可选且有权限边界的 MCP 工作区</li>
      </ul>
    </article>
  </div>
</section>

<section className="silen-home-section" aria-labelledby="outputs-title">
  <div className="silen-home-section-copy">
    <p className="silen-home-eyebrow">默认就有用</p>
    <h2 id="outputs-title">每次构建都会产出</h2>
    <p className="silen-home-lede">
      Silen 将同一棵内容树转换成不同读者真正需要的格式。
    </p>
  </div>
  <div className="silen-home-output-grid">
    <article className="silen-home-output">
      <span className="silen-home-output-icon"><Globe2Icon aria-hidden="true" /></span>
      <h3>静态 HTML</h3>
      <p>主要内容已经渲染，可直接部署到任意静态托管。</p>
    </article>
    <article className="silen-home-output">
      <span className="silen-home-output-icon"><SearchIcon aria-hidden="true" /></span>
      <h3>本地搜索</h3>
      <p>快速、私有，不依赖托管搜索服务。</p>
    </article>
    <article className="silen-home-output">
      <span className="silen-home-output-icon"><FileTextIcon aria-hidden="true" /></span>
      <h3>Markdown 路由</h3>
      <p>为工具与智能体提供接近源文件的干净输出。</p>
    </article>
    <article className="silen-home-output">
      <span className="silen-home-output-icon"><FileCode2Icon aria-hidden="true" /></span>
      <h3>llms.txt</h3>
      <p>为整套文档提供稳定、可预测的入口。</p>
    </article>
    <article className="silen-home-output">
      <span className="silen-home-output-icon"><ServerCogIcon aria-hidden="true" /></span>
      <h3>可选 MCP</h3>
      <p>拥有明确读写权限的本地文档工作区。</p>
    </article>
    <article className="silen-home-output">
      <span className="silen-home-output-icon"><BracesIcon aria-hidden="true" /></span>
      <h3>React MDX</h3>
      <p>只在文档真正受益时加入类型化组件。</p>
    </article>
  </div>
</section>

<section className="silen-home-section silen-home-contact" aria-labelledby="contact-title">
  <div className="silen-home-section-copy">
    <p className="silen-home-eyebrow">一起构建</p>
    <h2 id="contact-title">联系与关注</h2>
    <p className="silen-home-lede">
      通过 GitHub 关注开发、提交问题或参与贡献；也可以扫码关注
      AI Dev Hub，获取 AI 开发内容与 Silen 更新。
    </p>
    <a
      className="silen-home-action"
      href="https://github.com/AICode-Nexus/silen"
      target="_blank"
      rel="noopener noreferrer"
    >
      <GitForkIcon aria-hidden="true" /> 打开 GitHub
    </a>
  </div>
  <figure className="silen-home-qr">
    <img
      src={wechatQr}
      alt="微信公众号 AI Dev Hub 的二维码"
      width={344}
      height={344}
      loading="lazy"
    />
    <figcaption>微信公众号：AI Dev Hub</figcaption>
  </figure>
</section>
~~~

- [ ] **Step 5: Run content, type, lint, and build checks**

Run:

~~~bash
pnpm exec prettier --write tests/website.test.ts website/index.mdx website/zh/index.mdx
pnpm exec vitest run tests/website.test.ts
pnpm typecheck
pnpm lint
pnpm site:build
~~~

Expected: PASS; the build emits all six routes, a hashed QR asset, /silen/silen-workflow.svg, and localized contact copy.

- [ ] **Step 6: Commit bilingual content**

~~~bash
git add website/index.mdx website/zh/index.mdx tests/website.test.ts
git commit -m "feat(site): complete bilingual homepage content"
~~~

---

### Task 5: Complete automated and browser verification

**Files:**
- Modify only if verification exposes a concrete regression in the files already listed.
- Do not commit output/playwright, .playwright-cli, .silen temporary data, or generated image intermediates.

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: verified English/Chinese, light/dark, desktop/tablet/mobile homepages and clean Guide/AI regressions.

- [ ] **Step 1: Run the full automated suite**

~~~bash
pnpm typecheck
pnpm lint
pnpm test
pnpm site:build
pnpm format:check
~~~

Expected: all commands exit 0. If tests/server.test.ts has a one-off timeout, rerun that exact file once before treating it as a regression.

- [ ] **Step 2: Start the real development server**

~~~bash
node dist/node/cli.js dev website --host 127.0.0.1 --port 4173
~~~

Expected: Silen dev server running at http://127.0.0.1:4173/silen/.

- [ ] **Step 3: Verify HTTP routes and image assets**

In a second terminal:

~~~bash
curl -I http://127.0.0.1:4173/silen/
curl -I http://127.0.0.1:4173/silen/zh/
curl -I http://127.0.0.1:4173/silen/guide/
curl -I http://127.0.0.1:4173/silen/ai/
curl -I http://127.0.0.1:4173/silen/silen-workflow.svg
~~~

Expected: 200 for every route and asset.

- [ ] **Step 4: Run Playwright viewport and theme checks**

~~~bash
export PWCLI="/Users/admin/.agents/skills/playwright/scripts/playwright_cli.sh"
"$PWCLI" open http://127.0.0.1:4173/silen/
"$PWCLI" resize 1440 1000
"$PWCLI" screenshot
"$PWCLI" resize 768 1024
"$PWCLI" screenshot
"$PWCLI" resize 375 812
"$PWCLI" screenshot
"$PWCLI" snapshot
~~~

Use fresh snapshot refs to:

- Cycle Appearance to dark and capture 1440px and 375px screenshots.
- Open the Language menu and navigate to 中文.
- Confirm the current page is /silen/zh/ and the contact heading is 联系与关注.
- Tab through primary actions, quick-start link, copy control, GitHub action, language control, and appearance control.
- Read console output with "$PWCLI" console and require zero errors.
- Check requests with "$PWCLI" requests and require no 404 image requests.

- [ ] **Step 5: Inspect final screenshots**

Acceptance:

- Hero and workflow visual are both visible without an empty half-screen.
- Feature cards are compact and aligned.
- Section gaps visually match the 48–56px desktop and 36–40px mobile targets.
- No horizontal overflow at 375px.
- QR retains its full white quiet zone and renders no smaller than 144px.
- Chinese and English contain the same six information sections.
- Dark-mode borders, text, diagram, and QR container remain legible.

- [ ] **Step 6: Clean temporary browser artifacts and inspect Git**

~~~bash
"$PWCLI" close
rm -rf .playwright-cli output/playwright
git status --short --branch
git diff --check
~~~

Expected: only intentional source changes remain; after all task commits the working tree is clean.

- [ ] **Step 7: Commit any narrow QA fix**

Only if Step 4 or 5 required a source correction:

~~~bash
git add src/node/server.ts src/theme-default/components/home.tsx src/theme-default/styles/document.css tests/server.test.ts tests/theme/content.test.tsx tests/website.test.ts website/.silen/config.ts website/index.mdx website/zh/index.mdx website/public/silen-workflow.svg website/assets/wechat-ai-dev-hub.png
git commit -m "fix(site): polish homepage responsive behavior"
~~~

If no correction was needed, do not create an empty commit.

---

## Final Acceptance Checklist

- [ ] The screenshot's 64px-per-node gap regression is eliminated by silen-home-content.
- [ ] The reusable default HomeLayout remains compatible with arbitrary string feature icons.
- [ ] Known icon tokens use Lucide SVGs.
- [ ] Development SSR never emits /silen/silen/... local image paths.
- [ ] English and Chinese homepages each contain hero, capabilities, quick start, dual audiences, build outputs, and contact.
- [ ] The AI Dev Hub QR is local, lossless, uncropped, lazy-loaded, intrinsically sized, and visible in both locales.
- [ ] Guide and AI routes still render without redesign.
- [ ] 375px, 768px, and 1440px light/dark checks pass.
- [ ] The browser console contains zero errors and the network log contains no broken images.
- [ ] pnpm typecheck, pnpm lint, pnpm test, pnpm site:build, and pnpm format:check all pass.
