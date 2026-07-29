import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SITE_AI_REPORT_PATH,
  SITE_AI_STAGES,
} from '../../tooling/site-ai-check'

function occurrenceCount(source: string, token: string): number {
  return source.split(token).length - 1
}

describe('official deterministic site quality gate', () => {
  it('defines one canonical local runner and one compatibility alias', async () => {
    const [packageSource, runnerSource] = await Promise.all([
      readFile('package.json', 'utf8'),
      readFile('tooling/site-ai-check.ts', 'utf8'),
    ])
    const packageJson = JSON.parse(packageSource) as {
      scripts: Record<string, string>
    }

    expect(packageJson.scripts['site:ai-check']).toBe(
      'jiti tooling/site-ai-check.ts',
    )
    expect(packageJson.scripts['site:check']).toBe('pnpm site:ai-check')
    expect(packageJson.scripts.pretest).toBe('pnpm build')
    expect(packageJson.scripts.test).toBe('pnpm test:run')
    expect(packageJson.scripts['test:run']).toBe(
      'vitest run --maxWorkers=1 --no-file-parallelism',
    )
    expect(SITE_AI_STAGES.map(({ id }) => id)).toEqual([
      'build',
      'audit',
      'eval',
      'no-maps',
    ])
    expect(SITE_AI_STAGES.map(({ args }) => args)).toEqual([
      ['site:build'],
      ['dist/node/cli.js', 'ai', 'audit', 'website'],
      ['dist/node/cli.js', 'ai', 'eval', 'website', '--json'],
      ['check:no-maps', 'dist', 'website/.silen/dist'],
    ])
    expect(SITE_AI_REPORT_PATH).toBe(
      path.resolve('artifacts/ai-eval/site-ai-eval.json'),
    )
    expect(runnerSource).toContain('shell: false')
    for (const forbidden of [
      'ai init',
      'ai index',
      ' mcp ',
      '--allow-write',
      'curl ',
      'http://',
      'https://',
    ]) {
      expect(runnerSource, forbidden).not.toContain(forbidden)
    }
  })

  it('enforces the canonical gate and uploads its report in every workflow', async () => {
    const [pages, ci, publish] = await Promise.all([
      readFile('.github/workflows/pages.yml', 'utf8'),
      readFile('.github/workflows/ci.yml', 'utf8'),
      readFile('.github/workflows/publish.yml', 'utf8'),
    ])

    for (const [name, artifactName, workflow] of [
      ['Pages', 'silen-ai-eval-pages', pages],
      ['CI', 'silen-ai-eval-ci', ci],
      ['publish', 'silen-ai-eval-publish', publish],
    ] as const) {
      expect(occurrenceCount(workflow, 'pnpm site:ai-check'), name).toBe(1)
      expect(workflow, name).toContain('if: ${{ always() }}')
      expect(workflow, name).toContain('uses: actions/upload-artifact@v7')
      expect(workflow, name).toContain(
        'path: artifacts/ai-eval/site-ai-eval.json',
      )
      expect(workflow, name).toContain(`name: ${artifactName}`)
      expect(workflow, name).toContain('if-no-files-found: ignore')
      expect(workflow, name).toContain('retention-days: 90')
      expect(workflow.indexOf('pnpm site:ai-check'), name).toBeLessThan(
        workflow.indexOf('uses: actions/upload-artifact@v7'),
      )
    }

    expect(pages).not.toContain('run: pnpm site:check')
    expect(pages).not.toContain('run: pnpm site:build')
    expect(pages).toContain("- 'tooling/**'")
    expect(pages.indexOf('pnpm site:ai-check')).toBeLessThan(
      pages.indexOf(
        'test -f website/.silen/dist/.well-known/silen/manifest.json',
      ),
    )
    expect(ci).not.toContain('run: pnpm site:check')
    expect(publish).not.toContain('run: pnpm site:check')
  })
})
