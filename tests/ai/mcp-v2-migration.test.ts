import fg from 'fast-glob'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

interface PackageManifest {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const v1Package = ['@modelcontextprotocol', 'sdk'].join('/')
const codemodMarker = ['@mcp', 'codemod-error'].join('-')

describe('MCP SDK v2 migration boundary', () => {
  it('uses only the split stable SDK packages in their correct dependency sections', async () => {
    const manifest = JSON.parse(
      await readFile('package.json', 'utf8'),
    ) as PackageManifest

    expect(manifest.dependencies?.['@modelcontextprotocol/server']).toBe(
      '2.0.0',
    )
    expect(manifest.devDependencies?.['@modelcontextprotocol/client']).toBe(
      '2.0.0',
    )
    expect(manifest.dependencies?.[v1Package]).toBeUndefined()
    expect(manifest.devDependencies?.[v1Package]).toBeUndefined()
  })

  it('contains no v1 import or unresolved codemod marker in executable TypeScript', async () => {
    const files = await fg(
      ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', 'tooling/**/*.{ts,tsx}'],
      { onlyFiles: true },
    )
    const violations: string[] = []

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      if (source.includes(v1Package) || source.includes(codemodMarker)) {
        violations.push(file)
      }
    }

    expect(violations).toEqual([])
    expect(await readFile('pnpm-lock.yaml', 'utf8')).not.toContain(
      `${v1Package}@`,
    )
  })
})
