import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/node/config'

describe('resolveConfig', () => {
  it('loads .silen/config.ts and normalizes base', async () => {
    const root = path.resolve('tests/fixtures/configured')
    const config = await resolveConfig(root, 'build')
    expect(config.title).toBe('Configured Docs')
    expect(config.base).toBe('/project/')
    expect(config.outDir).toBe(path.join(root, '.silen/dist'))
  })

  it('rejects base values without a leading slash', async () => {
    await expect(
      resolveConfig(path.resolve('tests/fixtures/invalid-base'), 'build'),
    ).rejects.toThrow('base must start with /')
  })
})
