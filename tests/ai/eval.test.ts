import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  truncate,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatAiEvalReport,
  runAiEvaluation,
  serializeAiEvalReport,
} from '../../src/ai/eval'
import { createSearchIndex, serializeSearchIndex } from '../../src/node/search'

const roots: string[] = []

async function temporaryRoot(): Promise<string> {
  await mkdir(path.resolve('.silen/.temp/tests'), { recursive: true })
  const value = await mkdtemp(path.resolve('.silen/.temp/tests/ai-eval-'))
  roots.push(value)
  return value
}

async function writeIndex(site: string): Promise<void> {
  await mkdir(path.join(site, '.silen/dist'), { recursive: true })
  const index = createSearchIndex([
    {
      id: '/ai',
      lang: 'en-US',
      title: 'AI-ready documentation',
      route: '/ai/',
      headings: ['Public AI artifacts'],
      text: 'Deterministic model-free public AI artifacts.',
    },
    {
      id: '/zh/ai',
      lang: 'zh-CN',
      title: 'AI-ready 文档',
      route: '/zh/ai/',
      headings: ['面向 AI 的公开产物'],
      text: '确定性、无模型的公开产物。',
    },
  ])
  await writeFile(
    path.join(site, '.silen/dist/search-index.json'),
    serializeSearchIndex(index),
  )
}

async function writeSuite(site: string, value: unknown): Promise<void> {
  await mkdir(path.join(site, '.silen'), { recursive: true })
  await writeFile(
    path.join(site, '.silen/ai-evals.json'),
    `${JSON.stringify(value, null, 2)}\n`,
  )
}

async function expectSetupCode(site: string, code: string): Promise<void> {
  await expect(runAiEvaluation(site)).rejects.toMatchObject({ code })
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(
    roots.splice(0).map((value) => rm(value, { recursive: true, force: true })),
  )
})

describe('model-free AI evaluation', () => {
  it('matches route and heading within Top K and reports rounded scores', async () => {
    const site = await temporaryRoot()
    await writeIndex(site)
    await writeSuite(site, {
      schemaVersion: 1,
      topK: 5,
      cases: [
        {
          id: 'public-artifacts',
          query: 'Public AI artifacts',
          lang: 'en-US',
          expected: {
            route: '/ai/',
            heading: 'public   ai ARTIFACTS',
          },
        },
      ],
    })

    const result = await runAiEvaluation(site)
    expect(result).toMatchObject({
      schemaVersion: 1,
      ok: true,
      summary: { total: 1, passed: 1, failed: 0 },
      cases: [
        {
          id: 'public-artifacts',
          ok: true,
        },
      ],
    })
    expect(result.cases[0]?.actual[0]).toMatchObject({
      rank: 1,
      route: '/ai/',
      heading: 'Public AI artifacts',
      lang: 'en-US',
    })
    expect(result.cases[0]?.actual[0]?.score).toBeGreaterThan(0)
  })

  it('collects all misses and keeps identical serialized output', async () => {
    const site = await temporaryRoot()
    await writeIndex(site)
    await writeSuite(site, {
      schemaVersion: 1,
      topK: 1,
      cases: [
        {
          id: 'missing-route',
          query: 'Public AI artifacts',
          expected: { route: '/missing/' },
        },
        {
          id: 'missing-query',
          query: 'no matching vocabulary',
          expected: { route: '/ai/' },
        },
      ],
    })

    const first = await runAiEvaluation(site)
    const second = await runAiEvaluation(site)
    expect(first.summary).toEqual({ total: 2, passed: 0, failed: 2 })
    expect(first.cases[1]?.actual).toEqual([])
    expect(serializeAiEvalReport(first)).toBe(serializeAiEvalReport(second))
    expect(formatAiEvalReport(first)).toContain('2 failed')
  })

  it.each([
    [{ schemaVersion: 2, cases: [] }, 'schemaVersion'],
    [{ schemaVersion: 1, cases: [] }, 'cases'],
    [
      {
        schemaVersion: 1,
        cases: [
          { id: 'same', query: 'one', expected: { route: '/' } },
          { id: 'same', query: 'two', expected: { route: '/' } },
        ],
      },
      'cases.1.id',
    ],
    [
      {
        schemaVersion: 1,
        cases: [
          {
            id: 'unknown',
            query: 'query',
            expected: { route: '/' },
            typo: true,
          },
        ],
      },
      'cases.0',
    ],
  ])(
    'rejects invalid suite %# with a stable field path',
    async (suite, field) => {
      const site = await temporaryRoot()
      await writeIndex(site)
      await writeSuite(site, suite)
      await expect(runAiEvaluation(site)).rejects.toMatchObject({
        code: 'SUITE_SCHEMA',
        field,
      })
    },
  )

  it.each([
    [
      {
        schemaVersion: 1,
        topK: 0,
        cases: [{ id: 'case', query: 'query', expected: { route: '/' } }],
      },
      'topK',
    ],
    [
      {
        schemaVersion: 1,
        topK: 21,
        cases: [{ id: 'case', query: 'query', expected: { route: '/' } }],
      },
      'topK',
    ],
    [
      {
        schemaVersion: 1,
        cases: [{ id: 'case', query: '   ', expected: { route: '/' } }],
      },
      'cases.0.query',
    ],
    [
      {
        schemaVersion: 1,
        cases: [
          { id: 'case', query: 'query', expected: { route: 'relative' } },
        ],
      },
      'cases.0.expected.route',
    ],
    [
      {
        schemaVersion: 1,
        cases: [
          { id: 'case', query: 'query', expected: { route: '/../outside' } },
        ],
      },
      'cases.0.expected.route',
    ],
  ])('rejects bounded schema input %#', async (suite, field) => {
    const site = await temporaryRoot()
    await writeIndex(site)
    await writeSuite(site, suite)
    await expect(runAiEvaluation(site)).rejects.toMatchObject({
      code: 'SUITE_SCHEMA',
      field,
    })
  })

  it('does not call fetch or create cache files', async () => {
    const site = await temporaryRoot()
    await writeIndex(site)
    await writeSuite(site, {
      schemaVersion: 1,
      cases: [
        {
          id: 'offline',
          query: 'Public AI artifacts',
          expected: { route: '/ai/' },
        },
      ],
    })
    const fetch = vi.fn(() => {
      throw new Error('network used')
    })
    vi.stubGlobal('fetch', fetch)
    const before = await readFile(path.join(site, '.silen/ai-evals.json'))
    await runAiEvaluation(site)
    expect(fetch).not.toHaveBeenCalled()
    expect(await readFile(path.join(site, '.silen/ai-evals.json'))).toEqual(
      before,
    )
    await expect(lstat(path.join(site, '.silen/ai'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('rejects a symlinked suite without reading outside the root', async () => {
    const site = await temporaryRoot()
    const outsideRoot = await temporaryRoot()
    const outside = path.join(outsideRoot, 'outside.json')
    await writeFile(outside, '{"schemaVersion":1,"cases":[]}')
    await mkdir(path.join(site, '.silen'))
    await symlink(outside, path.join(site, '.silen/ai-evals.json'))
    await expect(runAiEvaluation(site)).rejects.toMatchObject({
      code: 'UNSAFE_PATH',
    })
  })

  it('distinguishes suite setup failures', async () => {
    const missing = await temporaryRoot()
    await expectSetupCode(missing, 'SUITE_MISSING')

    const malformed = await temporaryRoot()
    await mkdir(path.join(malformed, '.silen'))
    await writeFile(path.join(malformed, '.silen/ai-evals.json'), '{')
    await expectSetupCode(malformed, 'SUITE_JSON')

    const oversized = await temporaryRoot()
    await mkdir(path.join(oversized, '.silen'))
    const suite = path.join(oversized, '.silen/ai-evals.json')
    await writeFile(suite, '{}')
    await truncate(suite, 1024 * 1024 + 1)
    await expectSetupCode(oversized, 'SUITE_TOO_LARGE')
  })

  it('distinguishes production index setup failures', async () => {
    const validSuite = {
      schemaVersion: 1,
      cases: [{ id: 'case', query: 'query', expected: { route: '/' } }],
    }

    const missing = await temporaryRoot()
    await writeSuite(missing, validSuite)
    await expectSetupCode(missing, 'INDEX_MISSING')

    const malformed = await temporaryRoot()
    await writeSuite(malformed, validSuite)
    await mkdir(path.join(malformed, '.silen/dist'))
    await writeFile(path.join(malformed, '.silen/dist/search-index.json'), '{')
    await expectSetupCode(malformed, 'INDEX_JSON')

    const invalid = await temporaryRoot()
    await writeSuite(invalid, validSuite)
    await mkdir(path.join(invalid, '.silen/dist'))
    await writeFile(
      path.join(invalid, '.silen/dist/search-index.json'),
      '{"version":2,"index":[]}',
    )
    await expectSetupCode(invalid, 'INDEX_SCHEMA')

    const unsupported = await temporaryRoot()
    await writeSuite(unsupported, validSuite)
    await mkdir(path.join(unsupported, '.silen/dist'))
    await writeFile(
      path.join(unsupported, '.silen/dist/search-index.json'),
      '{"version":3,"index":{}}',
    )
    await expectSetupCode(unsupported, 'INDEX_VERSION')

    const oversized = await temporaryRoot()
    await writeSuite(oversized, validSuite)
    await mkdir(path.join(oversized, '.silen/dist'))
    const index = path.join(oversized, '.silen/dist/search-index.json')
    await writeFile(index, '{}')
    await truncate(index, 64 * 1024 * 1024 + 1)
    await expectSetupCode(oversized, 'INDEX_TOO_LARGE')
  })
})
