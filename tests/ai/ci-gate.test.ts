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
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: { test: string }
    }
    const quality = job(workflow, 'quality')
    const runtimeRelease = job(workflow, 'runtime-release')
    const browser = job(workflow, 'browser')

    expect(quality).toContain('node-version: 20.19.0')
    expect(quality).not.toContain('matrix:')
    expect(runtimeRelease).toContain('node-version: [20.19.0, 22.12.0]')
    expect(runtimeRelease).toContain('node-version: ${{ matrix.node-version }}')
    expect(runtimeRelease).toContain('pnpm install --frozen-lockfile')
    expect(runtimeRelease).toContain('pnpm build')
    expect(runtimeRelease).toContain('run: pnpm test')
    expect(runtimeRelease).not.toContain('--maxWorkers')
    expect(runtimeRelease).not.toContain('--no-file-parallelism')
    expect(packageJson.scripts.test).toBe(
      'vitest run --maxWorkers=1 --no-file-parallelism',
    )
    expect(runtimeRelease).toContain('pnpm exec publint')

    expect(browser).toContain('node-version: 20.19.0')
    expect(browser).toContain('pnpm build')
    expect(browser).toContain(
      'pnpm exec playwright install --with-deps chromium',
    )
    expect(browser).toContain('pnpm exec playwright test tests/e2e')
    expect(browser).not.toContain('pnpm test')

    expect(workflow.match(/npm install --global pnpm@10\.34\.0/g)).toHaveLength(
      3,
    )
    expect(workflow.match(/pnpm format:check/g)).toHaveLength(1)
    expect(workflow.match(/pnpm lint/g)).toHaveLength(1)
    expect(workflow.match(/pnpm typecheck/g)).toHaveLength(1)
    expect(workflow.match(/pnpm build/g)).toHaveLength(2)
    expect(workflow.match(/pnpm test/g)).toHaveLength(1)
    expect(workflow.match(/pnpm exec playwright test/g)).toHaveLength(1)
    expect(workflow).toContain('run: pnpm exec playwright test tests/e2e')
    expect(workflow).not.toContain('playwright test tests/e2e/ai.spec.ts')
    expect(workflow).not.toContain('corepack')
    expect(workflow.indexOf('pnpm build')).toBeLessThan(
      workflow.indexOf('pnpm test'),
    )
    expect(runtimeRelease.indexOf('pnpm test')).toBeLessThan(
      runtimeRelease.indexOf('pnpm exec publint'),
    )
    expect(browser.indexOf('pnpm build')).toBeLessThan(
      browser.indexOf('pnpm exec playwright test'),
    )
  })
})
