import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../../src/node/config'

describe('AI artifact config', () => {
  it('enables every artifact by default', async () => {
    const config = await resolveConfig(
      path.resolve('tests/fixtures/ai-site'),
      'build',
    )

    expect(config.ai).toEqual({
      llmsTxt: true,
      llmsFullTxt: true,
      markdownRoutes: true,
      index: true,
      contract: { enabled: true },
    })
  })

  it('fills omitted artifact controls without overriding an explicit false', async () => {
    const config = await resolveConfig(
      path.resolve('tests/fixtures/ai-config-partial'),
      'build',
    )

    expect(config.ai).toEqual({
      llmsTxt: true,
      llmsFullTxt: false,
      markdownRoutes: true,
      index: true,
      contract: { enabled: true },
    })
  })
})
