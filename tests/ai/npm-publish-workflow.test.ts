import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('npm publish workflow', () => {
  it('publishes GitHub releases with npm auth and the latest dist-tag', async () => {
    const workflow = await readFile('.github/workflows/publish.yml', 'utf8')

    expect(workflow).toContain('release:')
    expect(workflow).toContain('types: [created]')
    expect(workflow).toContain('id-token: write')
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('node-version: 24')
    expect(workflow).toContain('registry-url: https://registry.npmjs.org')
    expect(workflow).toContain('package-manager-cache: false')
    expect(workflow).toContain('npm install --global pnpm@10.34.0')
    expect(workflow).toContain('npm install --global npm@11.12.1')
    expect(workflow).toContain('pnpm install --frozen-lockfile')
    expect(workflow).toContain('pnpm format:check')
    expect(workflow).toContain('pnpm lint')
    expect(workflow).toContain('pnpm typecheck')
    expect(workflow).toContain('pnpm build')
    expect(workflow).toContain('run: pnpm test')
    expect(workflow).not.toContain('pnpm test --maxWorkers')
    expect(workflow).toContain('pnpm exec publint')
    expect(workflow).toContain('npm publish --access public --tag latest')
    expect(workflow).not.toContain('NODE_AUTH_TOKEN')
    expect(workflow).not.toContain('NPM_TOKEN')
  })
})
