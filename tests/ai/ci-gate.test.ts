import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('AI release CI gate', () => {
  it('pins the supported toolchain and runs built stdio plus the full browser gate once', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8')

    expect(workflow).toContain('node-version: [20.19.0, 22.12.0]')
    expect(workflow).toContain('corepack prepare pnpm@11.12.0 --activate')
    expect(workflow).toContain(
      'corepack pnpm exec playwright install --with-deps chromium',
    )
    expect(workflow).toContain(
      'corepack pnpm test -- --maxWorkers=1 --no-file-parallelism',
    )
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
    expect(workflow.indexOf('corepack pnpm test')).toBeLessThan(
      workflow.indexOf('corepack pnpm exec playwright test'),
    )
    expect(workflow.indexOf('corepack pnpm exec playwright test')).toBeLessThan(
      workflow.indexOf('corepack pnpm exec publint'),
    )
  })
})
