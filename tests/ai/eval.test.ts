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

async function writeRankedIndex(site: string): Promise<void> {
  await mkdir(path.join(site, '.silen/dist'), { recursive: true })
  const index = createSearchIndex([
    {
      id: '/first',
      lang: 'en-US',
      title: 'Shared answer',
      route: '/first/',
      headings: ['Primary'],
      text: 'primary documentation',
    },
    {
      id: '/second',
      lang: 'en-US',
      title: 'Secondary',
      route: '/second/',
      headings: ['Secondary'],
      text: 'shared answer',
    },
  ])
  await writeFile(
    path.join(site, '.silen/dist/search-index.json'),
    serializeSearchIndex(index),
  )
}

async function writeTargetIndex(site: string): Promise<void> {
  await mkdir(path.join(site, '.silen/dist'), { recursive: true })
  const index = createSearchIndex([
    {
      id: '/first',
      lang: 'en-US',
      title: 'Shared answer',
      route: '/first/',
      headings: ['Primary'],
      text: 'primary documentation',
    },
    {
      id: '/second',
      lang: 'en-US',
      title: 'Secondary',
      route: '/second/',
      headings: ['Secondary'],
      text: 'shared answer',
    },
    {
      id: '/forbidden',
      lang: 'en-US',
      title: 'Forbidden',
      route: '/forbidden/',
      headings: ['Blocked'],
      text: 'shared answer',
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

  it('keeps the version 1 JSON report byte-identical', async () => {
    const site = await temporaryRoot()
    await writeIndex(site)
    await writeSuite(site, {
      schemaVersion: 1,
      topK: 1,
      cases: [
        {
          id: 'public-artifacts',
          query: 'Public AI artifacts',
          lang: 'en-US',
          expected: {
            route: '/ai/',
            heading: 'Public AI artifacts',
          },
        },
      ],
    })

    const report = await runAiEvaluation(site)
    expect(serializeAiEvalReport(report)).toBe(`{
  "schemaVersion": 1,
  "ok": true,
  "suite": ".silen/ai-evals.json",
  "index": ".silen/dist/search-index.json",
  "topK": 1,
  "summary": {
    "total": 1,
    "passed": 1,
    "failed": 0
  },
  "cases": [
    {
      "id": "public-artifacts",
      "ok": true,
      "query": "Public AI artifacts",
      "lang": "en-US",
      "expected": {
        "route": "/ai/",
        "heading": "Public AI artifacts"
      },
      "actual": [
        {
          "rank": 1,
          "route": "/ai/",
          "title": "AI-ready documentation",
          "score": 25.930289,
          "heading": "Public AI artifacts",
          "lang": "en-US"
        }
      ]
    }
  ]
}
`)
    expect(formatAiEvalReport(report)).toBe('Silen AI eval: 1/1 passed\n')
  })

  it('keeps the version 2 JSON report byte-identical', async () => {
    const site = await temporaryRoot()
    await writeRankedIndex(site)
    await writeSuite(site, {
      schemaVersion: 2,
      topK: 2,
      cases: [
        {
          id: 'at-bound',
          query: 'shared answer',
          lang: 'en-US',
          expected: { route: '/second/', maxRank: 2 },
        },
      ],
    })

    const report = await runAiEvaluation(site)
    expect(serializeAiEvalReport(report)).toBe(`{
  "schemaVersion": 2,
  "ok": true,
  "suite": ".silen/ai-evals.json",
  "index": ".silen/dist/search-index.json",
  "topK": 2,
  "summary": {
    "total": 1,
    "passed": 1,
    "failed": 0
  },
  "cases": [
    {
      "id": "at-bound",
      "ok": true,
      "query": "shared answer",
      "lang": "en-US",
      "expected": {
        "route": "/second/",
        "maxRank": 2
      },
      "matchedRank": 2,
      "actual": [
        {
          "rank": 1,
          "route": "/first/",
          "title": "Shared answer",
          "score": 15.383395,
          "lang": "en-US"
        },
        {
          "rank": 2,
          "route": "/second/",
          "title": "Secondary",
          "score": 4.158883,
          "lang": "en-US"
        }
      ]
    }
  ]
}
`)
    expect(formatAiEvalReport(report)).toBe('Silen AI eval: 1/1 passed\n')
  })

  it('applies explicit and default version 2 rank bounds', async () => {
    const site = await temporaryRoot()
    await writeRankedIndex(site)
    await writeSuite(site, {
      schemaVersion: 2,
      topK: 2,
      cases: [
        {
          id: 'at-bound',
          query: 'shared answer',
          lang: 'en-US',
          expected: { route: '/second/', maxRank: 2 },
        },
        {
          id: 'below-bound',
          query: 'shared answer',
          lang: 'en-US',
          expected: { route: '/second/', maxRank: 1 },
        },
        {
          id: 'default-bound',
          query: 'shared answer',
          lang: 'en-US',
          expected: { route: '/second/' },
        },
        {
          id: 'missing',
          query: 'shared answer',
          lang: 'en-US',
          expected: { route: '/missing/', maxRank: 1 },
        },
      ],
    })

    const first = await runAiEvaluation(site)
    const second = await runAiEvaluation(site)
    expect(first).toMatchObject({
      schemaVersion: 2,
      ok: false,
      topK: 2,
      summary: { total: 4, passed: 2, failed: 2 },
      cases: [
        {
          id: 'at-bound',
          ok: true,
          expected: { route: '/second/', maxRank: 2 },
          matchedRank: 2,
        },
        {
          id: 'below-bound',
          ok: false,
          expected: { route: '/second/', maxRank: 1 },
          matchedRank: 2,
        },
        {
          id: 'default-bound',
          ok: true,
          expected: { route: '/second/', maxRank: 2 },
          matchedRank: 2,
        },
        {
          id: 'missing',
          ok: false,
          expected: { route: '/missing/', maxRank: 1 },
          matchedRank: null,
        },
      ],
    })
    expect(first.cases.every(({ actual }) => actual.length === 2)).toBe(true)
    expect(serializeAiEvalReport(first)).toBe(serializeAiEvalReport(second))

    const human = formatAiEvalReport(first)
    expect(human).toContain('Matched at rank 2; required rank 1 or better.')
    expect(human).toContain(
      'No complete match in Top 2; required rank 1 or better.',
    )
  })

  it('evaluates version 3 acceptable and forbidden targets in rank order', async () => {
    const site = await temporaryRoot()
    await writeTargetIndex(site)
    await writeSuite(site, {
      schemaVersion: 3,
      topK: 3,
      cases: [
        {
          id: 'multiple-acceptable',
          query: 'shared answer',
          lang: 'en-US',
          expected: {
            acceptable: [{ route: '/second/' }, { route: '/first/' }],
            forbidden: [],
            maxRank: 3,
          },
        },
        {
          id: 'at-bound',
          query: 'shared answer',
          lang: 'en-US',
          expected: {
            acceptable: [{ route: '/second/' }],
            forbidden: [],
            maxRank: 3,
          },
        },
        {
          id: 'rank-and-forbidden-failure',
          query: 'shared answer',
          lang: 'en-US',
          expected: {
            acceptable: [{ route: '/second/' }],
            forbidden: [{ route: '/forbidden/' }],
            maxRank: 2,
          },
        },
        {
          id: 'negative-only',
          query: 'no matching vocabulary',
          expected: {
            acceptable: [],
            forbidden: [{ route: '/forbidden/' }],
            maxRank: 3,
          },
        },
        {
          id: 'positive-only-failure',
          query: 'shared answer',
          expected: {
            acceptable: [{ route: '/missing/' }],
            forbidden: [],
            maxRank: 3,
          },
        },
      ],
    })

    const first = await runAiEvaluation(site)
    const second = await runAiEvaluation(site)
    expect(first).toMatchObject({
      schemaVersion: 3,
      ok: false,
      summary: { total: 5, passed: 3, failed: 2 },
      cases: [
        {
          id: 'multiple-acceptable',
          ok: true,
          matchedTarget: { route: '/first/' },
          matchedRank: 1,
          forbiddenMatches: [],
        },
        {
          id: 'at-bound',
          ok: true,
          matchedTarget: { route: '/second/' },
          matchedRank: 3,
          forbiddenMatches: [],
        },
        {
          id: 'rank-and-forbidden-failure',
          ok: false,
          matchedTarget: { route: '/second/' },
          matchedRank: 3,
          forbiddenMatches: [{ target: { route: '/forbidden/' }, rank: 2 }],
        },
        {
          id: 'negative-only',
          ok: true,
          matchedTarget: null,
          matchedRank: null,
          forbiddenMatches: [],
          actual: [],
        },
        {
          id: 'positive-only-failure',
          ok: false,
          matchedTarget: null,
          matchedRank: null,
          forbiddenMatches: [],
        },
      ],
    })
    expect(serializeAiEvalReport(first)).toBe(serializeAiEvalReport(second))

    const human = formatAiEvalReport(first)
    expect(human).toContain('Matched at rank 3; required rank 2 or better.')
    expect(human).toContain('Forbidden: /forbidden/ at rank 2.')
    expect(human).toContain(
      'No complete match in Top 3; required rank 3 or better.',
    )
  })

  it('orders version 3 forbidden evidence by actual rank', async () => {
    const site = await temporaryRoot()
    await writeTargetIndex(site)
    await writeSuite(site, {
      schemaVersion: 3,
      topK: 3,
      cases: [
        {
          id: 'ordered-forbidden',
          query: 'shared answer',
          lang: 'en-US',
          expected: {
            acceptable: [{ route: '/first/' }],
            forbidden: [{ route: '/second/' }, { route: '/forbidden/' }],
            maxRank: 1,
          },
        },
      ],
    })

    const report = await runAiEvaluation(site)
    const result = report.cases[0]
    expect(report).toMatchObject({
      schemaVersion: 3,
      ok: false,
      cases: [
        {
          matchedTarget: { route: '/first/' },
          matchedRank: 1,
          forbiddenMatches: [
            { target: { route: '/forbidden/' }, rank: 2 },
            { target: { route: '/second/' }, rank: 3 },
          ],
        },
      ],
    })
    expect(Object.keys(report)).toEqual([
      'schemaVersion',
      'ok',
      'suite',
      'index',
      'topK',
      'summary',
      'cases',
    ])
    expect(Object.keys(result!)).toEqual([
      'id',
      'ok',
      'query',
      'lang',
      'expected',
      'matchedTarget',
      'matchedRank',
      'forbiddenMatches',
      'actual',
    ])
    expect(Object.keys(result!.expected)).toEqual([
      'acceptable',
      'forbidden',
      'maxRank',
    ])
    expect(serializeAiEvalReport(report)).toBe(
      serializeAiEvalReport(await runAiEvaluation(site)),
    )

    const human = formatAiEvalReport(report)
    expect(human).not.toContain('  Rank:')
    const firstForbidden = human.indexOf('Forbidden: /forbidden/ at rank 2.')
    const secondForbidden = human.indexOf('Forbidden: /second/ at rank 3.')
    expect(firstForbidden).toBeGreaterThanOrEqual(0)
    expect(secondForbidden).toBeGreaterThan(firstForbidden)
  })

  it('normalizes version 3 acceptable and forbidden targets', async () => {
    const site = await temporaryRoot()
    await writeIndex(site)
    const normalizedTarget = {
      route: '/ai',
      heading: ' public   AI ARTIFACTS ',
    }
    await writeSuite(site, {
      schemaVersion: 3,
      topK: 5,
      cases: [
        {
          id: 'acceptable-normalization',
          query: 'Public AI artifacts',
          expected: {
            acceptable: [normalizedTarget],
            forbidden: [],
            maxRank: 1,
          },
        },
        {
          id: 'forbidden-normalization',
          query: 'Public AI artifacts',
          expected: {
            acceptable: [],
            forbidden: [normalizedTarget],
            maxRank: 5,
          },
        },
      ],
    })

    await expect(runAiEvaluation(site)).resolves.toMatchObject({
      schemaVersion: 3,
      ok: false,
      summary: { total: 2, passed: 1, failed: 1 },
      cases: [
        {
          ok: true,
          matchedTarget: {
            route: '/ai',
            heading: 'public AI ARTIFACTS',
          },
          matchedRank: 1,
        },
        {
          ok: false,
          matchedTarget: null,
          matchedRank: null,
          forbiddenMatches: [
            {
              target: {
                route: '/ai',
                heading: 'public AI ARTIFACTS',
              },
              rank: 1,
            },
          ],
        },
      ],
    })
  })

  it.each([
    [0, 2],
    [21, 20],
    [1.5, 2],
    [3, 2],
  ])('rejects version 2 maxRank %s with topK %s', async (maxRank, topK) => {
    const site = await temporaryRoot()
    await writeRankedIndex(site)
    await writeSuite(site, {
      schemaVersion: 2,
      topK,
      cases: [
        {
          id: 'invalid-rank',
          query: 'shared answer',
          expected: { route: '/second/', maxRank },
        },
      ],
    })
    await expect(runAiEvaluation(site)).rejects.toMatchObject({
      code: 'SUITE_SCHEMA',
      field: 'cases.0.expected.maxRank',
    })
  })

  it('keeps maxRank invalid in a strict version 1 suite', async () => {
    const site = await temporaryRoot()
    await writeRankedIndex(site)
    await writeSuite(site, {
      schemaVersion: 1,
      topK: 2,
      cases: [
        {
          id: 'v1-extra-field',
          query: 'shared answer',
          expected: { route: '/second/', maxRank: 1 },
        },
      ],
    })
    await expect(runAiEvaluation(site)).rejects.toMatchObject({
      code: 'SUITE_SCHEMA',
      field: 'cases.0.expected',
    })
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
    [
      {
        schemaVersion: 3,
        topK: 2,
        cases: [
          {
            id: 'missing-acceptable',
            query: 'query',
            expected: {
              forbidden: [{ route: '/blocked/' }],
              maxRank: 2,
            },
          },
        ],
      },
      'cases.0.expected.acceptable',
    ],
    [
      {
        schemaVersion: 3,
        topK: 2,
        cases: [
          {
            id: 'missing-forbidden',
            query: 'query',
            expected: {
              acceptable: [{ route: '/' }],
              maxRank: 2,
            },
          },
        ],
      },
      'cases.0.expected.forbidden',
    ],
    [
      {
        schemaVersion: 3,
        topK: 2,
        cases: [
          {
            id: 'missing-max-rank',
            query: 'query',
            expected: {
              acceptable: [{ route: '/' }],
              forbidden: [],
            },
          },
        ],
      },
      'cases.0.expected.maxRank',
    ],
    [
      {
        schemaVersion: 3,
        topK: 2,
        cases: [
          {
            id: 'too-many-targets',
            query: 'query',
            expected: {
              acceptable: Array.from({ length: 21 }, (_, index) => ({
                route: `/target-${index}/`,
              })),
              forbidden: [],
              maxRank: 2,
            },
          },
        ],
      },
      'cases.0.expected.acceptable',
    ],
    [
      {
        schemaVersion: 3,
        topK: 2,
        cases: [
          {
            id: 'unknown-field',
            query: 'query',
            expected: {
              acceptable: [{ route: '/' }],
              forbidden: [],
              maxRank: 2,
              typo: true,
            },
          },
        ],
      },
      'cases.0.expected',
    ],
    [
      {
        schemaVersion: 3,
        topK: 2,
        cases: [
          {
            id: 'empty',
            query: 'query',
            expected: { acceptable: [], forbidden: [], maxRank: 2 },
          },
        ],
      },
      'cases.0.expected.acceptable',
    ],
    [
      {
        schemaVersion: 3,
        topK: 2,
        cases: [
          {
            id: 'negative-bound',
            query: 'query',
            expected: {
              acceptable: [],
              forbidden: [{ route: '/blocked/' }],
              maxRank: 1,
            },
          },
        ],
      },
      'cases.0.expected.maxRank',
    ],
    [
      {
        schemaVersion: 3,
        topK: 2,
        cases: [
          {
            id: 'above-top-k',
            query: 'query',
            expected: {
              acceptable: [{ route: '/' }],
              forbidden: [],
              maxRank: 3,
            },
          },
        ],
      },
      'cases.0.expected.maxRank',
    ],
    [
      {
        schemaVersion: 3,
        topK: 2,
        cases: [
          {
            id: 'overlapping-acceptable',
            query: 'query',
            expected: {
              acceptable: [
                { route: '/guide/' },
                { route: '/guide/', heading: 'Install' },
              ],
              forbidden: [],
              maxRank: 2,
            },
          },
        ],
      },
      'cases.0.expected.acceptable.1',
    ],
    [
      {
        schemaVersion: 3,
        topK: 2,
        cases: [
          {
            id: 'overlapping-forbidden',
            query: 'query',
            expected: {
              acceptable: [],
              forbidden: [
                { route: '/guide/', heading: 'Install' },
                { route: '/guide/' },
              ],
              maxRank: 2,
            },
          },
        ],
      },
      'cases.0.expected.forbidden.1',
    ],
    [
      {
        schemaVersion: 3,
        topK: 2,
        cases: [
          {
            id: 'cross-list-overlap',
            query: 'query',
            expected: {
              acceptable: [{ route: '/guide/', heading: 'Install' }],
              forbidden: [{ route: '/guide/' }],
              maxRank: 2,
            },
          },
        ],
      },
      'cases.0.expected.forbidden.0',
    ],
  ])('rejects invalid version 3 target policy %#', async (suite, field) => {
    const site = await temporaryRoot()
    await writeIndex(site)
    await writeSuite(site, suite)
    await expect(runAiEvaluation(site)).rejects.toMatchObject({
      code: 'SUITE_SCHEMA',
      field,
    })
  })

  it.each([1, 2])(
    'keeps version 3 target arrays invalid in version %s',
    async (schemaVersion) => {
      const site = await temporaryRoot()
      await writeIndex(site)
      await writeSuite(site, {
        schemaVersion,
        topK: 1,
        cases: [
          {
            id: 'v3-fields-in-old-suite',
            query: 'query',
            expected: {
              route: '/',
              acceptable: [{ route: '/' }],
              forbidden: [],
              maxRank: 1,
            },
          },
        ],
      })
      await expect(runAiEvaluation(site)).rejects.toMatchObject({
        code: 'SUITE_SCHEMA',
        field: 'cases.0.expected',
      })
    },
  )

  it.each([
    [{ schemaVersion: 4, cases: [] }, 'schemaVersion'],
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
