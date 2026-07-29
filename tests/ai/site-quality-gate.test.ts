import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const expectedSiteCheck =
  'pnpm site:build && node dist/node/cli.js ai audit website && ' +
  'node dist/node/cli.js ai eval website --json && ' +
  'pnpm check:no-maps dist website/.silen/dist'

function occurrenceCount(source: string, token: string): number {
  return source.split(token).length - 1
}

describe('official deterministic site quality gate', () => {
  it('keeps local and Pages checks aligned without duplicating CI or publish work', async () => {
    const [packageSource, pages, ci, publish] = await Promise.all([
      readFile('package.json', 'utf8'),
      readFile('.github/workflows/pages.yml', 'utf8'),
      readFile('.github/workflows/ci.yml', 'utf8'),
      readFile('.github/workflows/publish.yml', 'utf8'),
    ])
    const packageJson = JSON.parse(packageSource) as {
      scripts: Record<string, string>
    }
    const command = packageJson.scripts['site:check']

    expect(command).toBeDefined()
    if (command === undefined) {
      throw new Error('site:check script is missing')
    }
    expect(command).toBe(expectedSiteCheck)

    const orderedFragments = [
      'pnpm site:build',
      'node dist/node/cli.js ai audit website',
      'node dist/node/cli.js ai eval website --json',
      'pnpm check:no-maps dist website/.silen/dist',
    ]
    let previousIndex = -1
    for (const fragment of orderedFragments) {
      expect(occurrenceCount(command, fragment), fragment).toBe(1)
      const currentIndex = command.indexOf(fragment)
      expect(currentIndex, fragment).toBeGreaterThan(previousIndex)
      previousIndex = currentIndex
    }

    for (const forbidden of [
      'ai init',
      'ai index',
      ' mcp ',
      '--allow-write',
      'curl ',
      'http://',
      'https://',
    ]) {
      expect(command, forbidden).not.toContain(forbidden)
    }

    expect(occurrenceCount(pages, 'pnpm site:check')).toBe(1)
    expect(pages).toContain('run: pnpm site:check')
    expect(pages).not.toContain('run: pnpm site:build')
    expect(pages).not.toContain(
      'run: pnpm check:no-maps dist website/.silen/dist',
    )
    const siteCheck = pages.indexOf('run: pnpm site:check')
    const manifest = pages.indexOf(
      'test -f website/.silen/dist/.well-known/silen/manifest.json',
    )
    expect(manifest).toBeGreaterThan(siteCheck)

    expect(ci).not.toContain('pnpm site:check')
    expect(publish).not.toContain('pnpm site:check')
  })
})
