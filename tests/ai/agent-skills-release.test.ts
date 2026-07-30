import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const SKILLS_REF_COMMIT = '38a2ff82958afee88dadf4831509e6f7e9d8ef4e'
const SKILLS_REF_INSTALL = `git+https://github.com/agentskills/agentskills.git@${SKILLS_REF_COMMIT}#subdirectory=skills-ref`
const SKILL_PATH = 'dist/agent/skills/silen-docs-readonly'

function occurrenceCount(source: string, token: string): number {
  return source.split(token).length - 1
}

describe('Agent Skills package and release gate', () => {
  it('ships nested Agent assets through the existing package export only', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8')) as {
      exports: Record<string, unknown>
      files: string[]
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(manifest.exports['./agent/*']).toBe('./dist/agent/*')
    expect(manifest.files).toContain('dist')
    expect(
      Object.keys(manifest.exports).filter((key) => key.includes('skill')),
    ).toEqual([])
    expect(manifest.dependencies).not.toHaveProperty('skills-ref')
    expect(manifest.devDependencies).not.toHaveProperty('skills-ref')
  })

  it('pins official validation once in Core CI and once before npm publish', async () => {
    const [ci, publish, pages] = await Promise.all([
      readFile('.github/workflows/ci.yml', 'utf8'),
      readFile('.github/workflows/publish.yml', 'utf8'),
      readFile('.github/workflows/pages.yml', 'utf8'),
    ])

    for (const [name, workflow] of [
      ['Core CI', ci],
      ['npm Publish', publish],
    ] as const) {
      expect(workflow, name).toContain('uses: actions/setup-python@v6')
      expect(workflow, name).toContain("python-version: '3.13'")
      expect(workflow, name).toContain(SKILLS_REF_INSTALL)
      expect(workflow, name).toContain(`skills-ref validate ${SKILL_PATH}`)
      expect(workflow, name).toContain(
        `skills-ref read-properties ${SKILL_PATH}`,
      )
      expect(occurrenceCount(workflow, SKILLS_REF_COMMIT), name).toBe(1)
      expect(workflow.indexOf('pnpm site:ai-check'), name).toBeLessThan(
        workflow.indexOf(`skills-ref validate ${SKILL_PATH}`),
      )
    }

    expect(pages).not.toContain('setup-python')
    expect(pages).not.toContain('skills-ref')
    expect(ci).not.toContain('pip install skills-ref')
    expect(publish).not.toContain('pip install skills-ref')
  })
})
