import { describe, expect, it } from 'vitest'
import { createConfigApiContract } from '../../src/ai/contract/config-api'
import {
  publicConfigApiCoverage,
  userConfigSchema,
} from '../../src/node/config-schema'

function valueAtPath(value: unknown, dottedPath: string): unknown {
  return dottedPath.split('.').reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) return undefined
    return (current as Record<string, unknown>)[segment]
  }, value)
}

describe('configuration Agent Contract', () => {
  it('defaults the contract on without changing existing artifact switches', () => {
    expect(userConfigSchema.parse({}).ai).toEqual({
      llmsTxt: true,
      llmsFullTxt: true,
      markdownRoutes: true,
      index: true,
      contract: { enabled: true },
    })

    expect(
      userConfigSchema.parse({ ai: { contract: { enabled: false } } }).ai,
    ).toEqual({
      llmsTxt: true,
      llmsFullTxt: true,
      markdownRoutes: true,
      index: true,
      contract: { enabled: false },
    })
  })

  it.each([
    '',
    '/absolute.md',
    '../private.md',
    'public/../../private.md',
    String.raw`C:\private.md`,
    String.raw`public\instructions.md`,
    'https://example.com/instructions.md',
    'file:private.md',
    'public/\0private.md',
    'public/%2e%2e/private.md',
  ])('rejects unsafe public Agent path %j', (candidate) => {
    expect(() =>
      userConfigSchema.parse({
        ai: { contract: { instructions: candidate } },
      }),
    ).toThrow()
    expect(() =>
      userConfigSchema.parse({
        ai: { contract: { tasksDir: candidate } },
      }),
    ).toThrow()
  })

  it('accepts bounded relative paths for explicitly public Agent content', () => {
    expect(
      userConfigSchema.parse({
        ai: {
          contract: {
            instructions: '.silen/ai-public.md',
            tasksDir: '.silen/ai-tasks',
          },
        },
      }).ai.contract,
    ).toEqual({
      enabled: true,
      instructions: '.silen/ai-public.md',
      tasksDir: '.silen/ai-tasks',
    })
  })

  it('documents every public config path exactly once', () => {
    const fields = createConfigApiContract().fields
    const paths = fields.map((field) => field.path)
    expect(new Set(paths).size).toBe(paths.length)
    expect(fields.every((field) => field.type !== 'unknown')).toBe(true)
    expect([...paths].sort()).toEqual([
      'ai.contract.enabled',
      'ai.contract.instructions',
      'ai.contract.tasksDir',
      'ai.index',
      'ai.llmsFullTxt',
      'ai.llmsTxt',
      'ai.markdownRoutes',
      'analytics',
      'base',
      'description',
      'lang',
      'onBrokenLinks',
      'outDir',
      'plugins',
      'themeConfig',
      'title',
    ])
    expect(Object.keys(publicConfigApiCoverage).sort()).toEqual([
      'ai',
      'analytics',
      'base',
      'description',
      'lang',
      'onBrokenLinks',
      'outDir',
      'plugins',
      'themeConfig',
      'title',
    ])
  })

  it('derives safe literal defaults from runtime behavior', () => {
    const resolved = userConfigSchema.parse({})
    const fields = createConfigApiContract().fields
    for (const field of fields) {
      if (field.path === 'plugins') {
        expect(field.default).toEqual([])
        expect(field.description).toContain('runtime')
        continue
      }
      const runtimeDefault = valueAtPath(resolved, field.path)
      if (runtimeDefault === undefined) {
        expect(field).not.toHaveProperty('default')
      } else {
        expect(field.default).toEqual(runtimeDefault)
      }
    }
  })
})
