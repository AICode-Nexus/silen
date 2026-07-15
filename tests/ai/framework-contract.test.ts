import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assembleFrameworkContract,
  renderFrameworkContract,
} from '../../src/ai/contract/framework'

const publicExports = [
  {
    entryPoint: '.',
    symbol: 'defineConfig',
    kind: 'function',
    signature: 'export declare function defineConfig<T>(config: T): T;',
    declaration: 'dist/index.d.ts',
  },
] as const

describe('framework Agent Contract', () => {
  it('assembles versioned config, CLI, MCP, exports, and bilingual tasks', async () => {
    const packageManifest = JSON.parse(
      await readFile(path.resolve('package.json'), 'utf8'),
    ) as { version: string }
    const bundle = await assembleFrameworkContract({ publicExports })

    expect(bundle.manifest).toMatchObject({
      schemaVersion: 1,
      kind: 'silen-framework',
      generator: { name: 'Silen', version: packageManifest.version },
    })
    expect(bundle.api.config.fields).toHaveLength(16)
    expect(bundle.api.cli.commands.map((command) => command.id)).toEqual([
      'dev',
      'build',
      'preview',
      'ai',
      'mcp',
    ])
    expect(bundle.api.mcp.tools).toHaveLength(10)
    expect(bundle.api.exports).toEqual(publicExports)

    const [english, chinese] = bundle.packs
    expect(english.tasks.map((task) => task.metadata.id)).toEqual(
      chinese.tasks.map((task) => task.metadata.id),
    )
    expect(bundle.manifest.tasks).toHaveLength(english.tasks.length * 2)
  })

  it('renders byte-identical, path-free package files', async () => {
    process.env.SILEN_FRAMEWORK_TEST_SECRET = 'must-not-appear-in-contract'
    const first = renderFrameworkContract(
      await assembleFrameworkContract({ publicExports }),
    )
    const second = renderFrameworkContract(
      await assembleFrameworkContract({ publicExports }),
    )
    expect(first).toEqual(second)
    expect(Object.keys(first)).toContain('tasks/create-site.md')
    expect(Object.keys(first)).toContain('locales/zh-CN/tasks/create-site.md')

    const content = Object.values(first).join('\n')
    expect(content).not.toContain(process.cwd())
    expect(content).not.toContain(path.resolve('tests/fixtures'))
    expect(content).not.toContain('must-not-appear-in-contract')
  })
})
