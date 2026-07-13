import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { execa } from 'execa'

const fixturePath = join(process.cwd(), 'tests', 'lint-contract-fixture.ts')

async function runLintAgainst(source: string) {
  await mkdir(join(process.cwd(), 'tests'), { recursive: true })
  await writeFile(fixturePath, source)

  return execa('corepack', ['pnpm', 'lint'], {
    cwd: process.cwd(),
    reject: false,
    all: true,
  })
}

afterEach(async () => {
  await rm(fixturePath, { force: true })
})

describe('type-aware lint contract', () => {
  it('rejects an unused typed local', async () => {
    const result = await runLintAgainst(`
export function getTitle(): string {
  const unusedTitle: string = 'Docs'
  return 'Silen'
}
`)

    expect(result.exitCode).not.toBe(0)
    expect(result.all).toContain('@typescript-eslint/no-unused-vars')
  })

  it('rejects a floating Promise', async () => {
    const result = await runLintAgainst(`
async function saveConfig(): Promise<void> {}

saveConfig()
`)

    expect(result.exitCode).not.toBe(0)
    expect(result.all).toContain('@typescript-eslint/no-floating-promises')
  })
})
