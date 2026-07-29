import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  runSiteAiCheck,
  writeSiteAiReport,
  type SiteAiCheckDependencies,
  type SiteAiCheckStage,
  type SiteAiCheckStageResult,
} from '../../tooling/site-ai-check'

const roots: string[] = []
const report = '{"schemaVersion":3,"ok":true}\n'

function result(
  exitCode: number | undefined,
  stdout = '',
  overrides: Partial<SiteAiCheckStageResult> = {},
): SiteAiCheckStageResult {
  return {
    exitCode,
    stdout,
    isMaxBuffer: false,
    shortMessage: '',
    ...overrides,
  }
}

function harness(results: SiteAiCheckStageResult[]) {
  const stages: string[] = []
  const events: string[] = []
  const saved: string[] = []
  const stdout: string[] = []
  const stderr: string[] = []
  const queue = [...results]
  const dependencies: SiteAiCheckDependencies = {
    clearReport: vi.fn(() => {
      events.push('clear')
      return Promise.resolve()
    }),
    execute: vi.fn((stage: SiteAiCheckStage) => {
      stages.push(stage.id)
      events.push(stage.id)
      const next = queue.shift()
      if (next === undefined) throw new Error('Missing staged result')
      return Promise.resolve(next)
    }),
    saveReport: vi.fn((source: string) => {
      saved.push(source)
      return Promise.resolve()
    }),
    writeStdout: vi.fn((source: string) => {
      stdout.push(source)
    }),
    writeStderr: vi.fn((source: string) => {
      stderr.push(source)
    }),
  }
  return { dependencies, events, saved, stages, stderr, stdout }
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('official site AI check runner', () => {
  it('clears stale evidence and runs the four fixed stages in order', async () => {
    const fixture = harness([
      result(0),
      result(0),
      result(0, report),
      result(0),
    ])

    await expect(runSiteAiCheck(fixture.dependencies)).resolves.toBe(0)
    expect(fixture.events).toEqual([
      'clear',
      'build',
      'audit',
      'eval',
      'no-maps',
    ])
    expect(fixture.saved).toEqual([report])
    expect(fixture.stdout).toEqual([report])
    expect(fixture.stderr).toEqual([])
  })

  it.each([1, 2])(
    'saves valid evaluation JSON and preserves exit %s',
    async (exitCode) => {
      const source = '{"schemaVersion":3,"ok":false}\n'
      const fixture = harness([result(0), result(0), result(exitCode, source)])

      await expect(runSiteAiCheck(fixture.dependencies)).resolves.toBe(exitCode)
      expect(fixture.stages).toEqual(['build', 'audit', 'eval'])
      expect(fixture.saved).toEqual([source])
      expect(fixture.stdout).toEqual([source])
    },
  )

  it.each([
    ['build', [result(7)], ['build']],
    ['audit', [result(0), result(6)], ['build', 'audit']],
  ] as const)(
    'stops after a %s failure without saving a report',
    async (_name, results, expectedStages) => {
      const fixture = harness([...results])
      await expect(runSiteAiCheck(fixture.dependencies)).resolves.toBe(
        results.at(-1)?.exitCode,
      )
      expect(fixture.stages).toEqual(expectedStages)
      expect(fixture.saved).toEqual([])
    },
  )

  it.each([
    ['empty', result(0, '')],
    ['array', result(0, '[]\n')],
    ['missing fields', result(0, '{}\n')],
    ['unexpected exit', result(3, report)],
    ['oversized', result(undefined, '', { isMaxBuffer: true })],
    [
      'signal',
      result(undefined, '', {
        signal: 'SIGTERM',
        shortMessage: 'Command was terminated',
      }),
    ],
  ] as const)(
    'returns setup exit 2 and saves nothing for %s evaluation output',
    async (_name, evaluation) => {
      const fixture = harness([result(0), result(0), evaluation])
      await expect(runSiteAiCheck(fixture.dependencies)).resolves.toBe(2)
      expect(fixture.saved).toEqual([])
      expect(fixture.stderr.join('')).toContain('Silen site AI check')
    },
  )

  it('keeps the report when the final source-map guard fails', async () => {
    const fixture = harness([
      result(0),
      result(0),
      result(0, report),
      result(9),
    ])

    await expect(runSiteAiCheck(fixture.dependencies)).resolves.toBe(9)
    expect(fixture.saved).toEqual([report])
  })

  it('turns dependency failures into focused setup failures', async () => {
    const clearFixture = harness([])
    const clearDependencies: SiteAiCheckDependencies = {
      ...clearFixture.dependencies,
      clearReport: vi.fn(() => Promise.reject(new Error('clear failed'))),
    }
    await expect(runSiteAiCheck(clearDependencies)).resolves.toBe(2)
    expect(clearFixture.stages).toEqual([])

    const executeFixture = harness([])
    const executeDependencies: SiteAiCheckDependencies = {
      ...executeFixture.dependencies,
      execute: vi.fn(() => Promise.reject(new Error('spawn failed'))),
    }
    await expect(runSiteAiCheck(executeDependencies)).resolves.toBe(2)

    const saveFixture = harness([result(0), result(0), result(0, report)])
    const saveDependencies: SiteAiCheckDependencies = {
      ...saveFixture.dependencies,
      saveReport: vi.fn(() => Promise.reject(new Error('write failed'))),
    }
    await expect(runSiteAiCheck(saveDependencies)).resolves.toBe(2)
    expect(saveFixture.stages).toEqual(['build', 'audit', 'eval'])
    for (const fixture of [clearFixture, executeFixture, saveFixture]) {
      expect(fixture.stderr.join('')).toContain('Silen site AI check')
    }
  })

  it('writes a report atomically and removes its temporary sibling', async () => {
    await mkdir(path.resolve('.silen/.temp/tests'), { recursive: true })
    const root = await mkdtemp(
      path.resolve('.silen/.temp/tests/site-ai-report-'),
    )
    roots.push(root)
    const destination = path.join(root, 'artifacts/ai-eval/report.json')

    await writeSiteAiReport(destination, report)

    expect(await readFile(destination, 'utf8')).toBe(report)
    expect(await readdir(path.dirname(destination))).toEqual(['report.json'])
  })
})
