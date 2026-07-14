import { readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { build } from '../../src/node/build'

const disabledRoot = path.resolve('tests/fixtures/ask-ai-disabled')
const enabledRoot = path.resolve('tests/fixtures/ask-ai-enabled')

async function javascriptAssets(
  root: string,
): Promise<Array<{ file: string; source: string }>> {
  const outDir = path.join(root, '.silen/dist')
  const files = (await readdir(path.join(outDir, 'assets'))).filter((file) =>
    file.endsWith('.js'),
  )
  return Promise.all(
    files.map(async (file) => ({
      file,
      source: await readFile(path.join(outDir, 'assets', file), 'utf8'),
    })),
  )
}

afterAll(async () => {
  await Promise.all(
    [disabledRoot, enabledRoot].flatMap((root) => [
      rm(path.join(root, '.silen/dist'), { recursive: true, force: true }),
      rm(path.join(root, '.silen/.temp'), { recursive: true, force: true }),
    ]),
  )
})

describe('Ask AI production bundle boundary', () => {
  it('emits no Ask AI code or lazy chunk when endpoint is absent', async () => {
    await build(disabledRoot)
    const assets = await javascriptAssets(disabledRoot)
    const source = assets.map((asset) => asset.source).join('\n')

    expect(source).not.toContain('application/x-ndjson')
    expect(source).not.toContain('The AI provider could not complete')
    expect(source).not.toContain('Answers use the current documentation')
    expect(source).not.toContain('do-not-bundle-disabled-ai')
  })

  it('emits a dynamic Ask AI chunk only for endpoint configuration', async () => {
    const result = await build(enabledRoot)
    const assets = await javascriptAssets(enabledRoot)
    const askAsset = assets.find(({ source }) =>
      source.includes('Answers use the current documentation'),
    )
    const html = await readFile(path.join(result.outDir, 'index.html'), 'utf8')
    const source = assets.map((asset) => asset.source).join('\n')

    expect(askAsset).toBeDefined()
    expect(html).toContain('>Ask AI</button>')
    expect(html).toContain('\\"endpoint\\":\\"/api/ask\\"')
    expect(html).not.toContain('do-not-bundle-ask-ai')
    expect(source).not.toContain('do-not-bundle-ask-ai')
  })
})
