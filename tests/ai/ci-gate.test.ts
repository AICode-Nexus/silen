import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

function job(workflow: string, name: string): string {
  const marker = `  ${name}:\n`
  const start = workflow.indexOf(marker)
  expect(start, `expected ${name} job`).toBeGreaterThanOrEqual(0)
  const remainder = workflow.slice(start + marker.length)
  const nextJob = remainder.search(/\n {2}[a-z][a-z-]+:\n/)
  return nextJob === -1 ? remainder : remainder.slice(0, nextJob)
}

describe('AI release CI gate', () => {
  it('runs release behavior on every supported Node line and the browser gate once', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8')
    const quality = job(workflow, 'quality')
    const runtimeRelease = job(workflow, 'runtime-release')
    const browser = job(workflow, 'browser')

    expect(quality).toContain('node-version: 20.19.0')
    expect(quality).not.toContain('matrix:')
    expect(runtimeRelease).toContain('node-version: [20.19.0, 22.12.0]')
    expect(runtimeRelease).toContain('node-version: ${{ matrix.node-version }}')
    expect(runtimeRelease).toContain('corepack pnpm install --frozen-lockfile')
    expect(runtimeRelease).toContain('corepack pnpm build')
    expect(runtimeRelease).toContain(
      'corepack pnpm test -- --maxWorkers=1 --no-file-parallelism',
    )
    expect(runtimeRelease).toContain('corepack pnpm exec publint')

    expect(browser).toContain('node-version: 20.19.0')
    expect(browser).toContain(
      'corepack pnpm exec playwright install --with-deps chromium',
    )
    expect(browser).toContain('corepack pnpm exec playwright test tests/e2e')
    expect(browser).not.toContain('corepack pnpm test')

    expect(workflow).toContain('corepack prepare pnpm@11.12.0 --activate')
    expect(workflow.match(/corepack pnpm format:check/g)).toHaveLength(1)
    expect(workflow.match(/corepack pnpm lint/g)).toHaveLength(1)
    expect(workflow.match(/corepack pnpm typecheck/g)).toHaveLength(1)
    expect(workflow.match(/corepack pnpm build/g)).toHaveLength(1)
    expect(workflow.match(/corepack pnpm test/g)).toHaveLength(1)
    expect(workflow.match(/corepack pnpm exec playwright test/g)).toHaveLength(
      1,
    )
    expect(workflow).toContain(
      'run: corepack pnpm exec playwright test tests/e2e',
    )
    expect(workflow).not.toContain('playwright test tests/e2e/ai.spec.ts')
    expect(workflow.indexOf('corepack pnpm build')).toBeLessThan(
      workflow.indexOf('corepack pnpm test'),
    )
    expect(runtimeRelease.indexOf('corepack pnpm test')).toBeLessThan(
      runtimeRelease.indexOf('corepack pnpm exec publint'),
    )
  })
})
