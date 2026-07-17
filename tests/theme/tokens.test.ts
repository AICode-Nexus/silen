import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { build } from '../../src/node/build'

const temporaryDirectories: string[] = []

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  )
})

describe('default theme tokens', () => {
  it('defines complete light, dark, layout, radius, and focus tokens', async () => {
    const [tokens, entry] = await Promise.all([
      readFile('src/theme-default/styles/tokens.css', 'utf8'),
      readFile('src/theme-default/styles/index.css', 'utf8'),
    ])
    const darkStart = tokens.indexOf('.dark')

    expect(darkStart).toBeGreaterThan(0)
    const light = tokens.slice(0, darkStart)
    const dark = tokens.slice(darkStart)

    for (const token of [
      'background',
      'foreground',
      'card',
      'card-foreground',
      'primary',
      'primary-foreground',
      'secondary',
      'secondary-foreground',
      'muted',
      'muted-foreground',
      'popover',
      'popover-foreground',
      'accent',
      'accent-foreground',
      'destructive',
      'border',
      'input',
      'ring',
    ]) {
      expect(light).toContain(`--silen-${token}:`)
      expect(dark).toContain(`--silen-${token}:`)
      expect(entry).toContain(`--color-${token}: var(--silen-${token});`)
    }

    for (const token of [
      'radius',
      'nav-height',
      'sidebar-width',
      'content-width',
      'layout-width',
    ]) {
      expect(light).toContain(`--silen-${token}:`)
    }

    expect(entry).toMatch(/@import ['"]tailwindcss['"];/)
    expect(entry).toMatch(/@import ['"]\.\/tokens\.css['"];/)
    expect(entry).toContain('--radius-lg: var(--silen-radius);')
    expect(entry).toMatch(/--font-sans:\s*['"]Inter Variable['"]/)
  })

  it('compiles semantic utilities and tokens into a real production build', async () => {
    const testRoot = path.resolve('.silen/.temp/tests')
    await mkdir(testRoot, { recursive: true })
    const root = await mkdtemp(path.join(testRoot, 'silen-theme-build-'))
    temporaryDirectories.push(root)
    await mkdir(path.join(root, '.silen'), { recursive: true })
    const silenEntry = path.resolve('src/index.ts')

    await Promise.all([
      writeFile(
        path.join(root, '.silen/config.ts'),
        `import { defineConfig } from ${JSON.stringify(silenEntry)}

export default defineConfig({
  title: 'Theme build',
  base: '/theme/',
})
`,
      ),
      writeFile(
        path.join(root, 'index.mdx'),
        `<div className="bg-background text-foreground bg-card text-card-foreground bg-secondary text-secondary-foreground bg-popover text-popover-foreground border-border border-input text-destructive focus:bg-accent focus:text-accent-foreground focus-visible:outline-ring">Semantic theme</div>\n`,
      ),
    ])

    const result = await build(root)
    const assetDirectory = path.join(result.outDir, 'assets')
    const assetFiles = await readdir(assetDirectory)
    const cssFiles = assetFiles.filter((file) => file.endsWith('.css'))
    const css = (
      await Promise.all(
        cssFiles.map((file) =>
          readFile(path.join(assetDirectory, file), 'utf8'),
        ),
      )
    ).join('\n')

    expect(cssFiles).not.toHaveLength(0)
    expect(css).toContain('--silen-background:')
    expect(css).toContain('.bg-background')
    expect(css).toContain('.text-foreground')
    expect(css).toContain('.bg-card')
    expect(css).toContain('.text-card-foreground')
    expect(css).toContain('.bg-secondary')
    expect(css).toContain('.text-secondary-foreground')
    expect(css).toContain('.bg-popover')
    expect(css).toContain('.text-popover-foreground')
    expect(css).toContain('.border-border')
    expect(css).toContain('.border-input')
    expect(css).toContain('.text-destructive')
    expect(css).toContain('.focus\\:bg-accent:focus')
    expect(css).toContain('.focus\\:text-accent-foreground:focus')
    expect(css).toContain('outline-color:var(--silen-ring)')
    expect(css).not.toContain(path.resolve('src/theme-default'))
    expect(css).not.toContain('src/theme-default/styles')
  })

  it('keeps homepage action labels and icons on one row', async () => {
    const documentStyles = await readFile(
      'src/theme-default/styles/document.css',
      'utf8',
    )
    const actionStart = documentStyles.indexOf('.silen-home-inline-link,')
    const actionEnd = documentStyles.indexOf(
      '.silen-home-proof-grid,',
      actionStart,
    )
    const actionStyles = documentStyles.slice(actionStart, actionEnd)

    expect(actionStart).toBeGreaterThanOrEqual(0)
    expect(actionEnd).toBeGreaterThan(actionStart)
    expect(actionStyles).toContain('display: inline-flex;')
    expect(actionStyles).toContain('justify-self: start;')
    expect(actionStyles).toContain('white-space: nowrap;')
    expect(actionStyles).toContain('.silen-home-inline-link > p,')
    expect(actionStyles).toContain('gap: inherit;')
    expect(actionStyles).toContain('margin: 0;')
    expect(actionStyles).toContain('flex: 0 0 auto;')
  })
})
