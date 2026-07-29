import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

export const SITE_AI_REPORT_PATH = path.resolve(
  'artifacts/ai-eval/site-ai-eval.json',
)
export const SITE_AI_REPORT_MAXIMUM_BYTES = 16 * 1024 * 1024

export interface SiteAiCheckStage {
  readonly id: 'build' | 'audit' | 'eval' | 'no-maps'
  readonly command: string
  readonly args: readonly string[]
  readonly captureStdout: boolean
}

export interface SiteAiCheckStageResult {
  readonly exitCode: number | undefined
  readonly stdout: string
  readonly isMaxBuffer: boolean
  readonly shortMessage: string
  readonly signal?: string
}

export interface SiteAiCheckDependencies {
  readonly clearReport: () => Promise<void>
  readonly execute: (stage: SiteAiCheckStage) => Promise<SiteAiCheckStageResult>
  readonly saveReport: (source: string) => Promise<void>
  readonly writeStdout: (source: string) => void
  readonly writeStderr: (source: string) => void
}

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

export const SITE_AI_STAGES: readonly SiteAiCheckStage[] = [
  {
    id: 'build',
    command: pnpmCommand,
    args: ['site:build'],
    captureStdout: false,
  },
  {
    id: 'audit',
    command: process.execPath,
    args: ['dist/node/cli.js', 'ai', 'audit', 'website'],
    captureStdout: false,
  },
  {
    id: 'eval',
    command: process.execPath,
    args: ['dist/node/cli.js', 'ai', 'eval', 'website', '--json'],
    captureStdout: true,
  },
  {
    id: 'no-maps',
    command: pnpmCommand,
    args: ['check:no-maps', 'dist', 'website/.silen/dist'],
    captureStdout: false,
  },
]

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function assertReportDocument(source: string): void {
  if (Buffer.byteLength(source, 'utf8') > SITE_AI_REPORT_MAXIMUM_BYTES) {
    throw new TypeError('AI evaluation JSON exceeds 16 MiB')
  }
  const value: unknown = JSON.parse(source)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('AI evaluation output must be one JSON object')
  }
  const document = value as Record<string, unknown>
  if (
    typeof document.schemaVersion !== 'number' ||
    !Number.isInteger(document.schemaVersion) ||
    document.schemaVersion <= 0 ||
    typeof document.ok !== 'boolean'
  ) {
    throw new TypeError(
      'AI evaluation JSON requires positive schemaVersion and boolean ok',
    )
  }
}

export async function writeSiteAiReport(
  destination: string,
  source: string,
): Promise<void> {
  const directory = path.dirname(destination)
  const temporary = path.join(
    directory,
    `.${path.basename(destination)}.${randomUUID()}.tmp`,
  )
  await mkdir(directory, { recursive: true })
  try {
    await writeFile(temporary, source, 'utf8')
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
}

async function executeStage(
  stage: SiteAiCheckStage,
): Promise<SiteAiCheckStageResult> {
  const completed = await execa(stage.command, [...stage.args], {
    encoding: 'utf8',
    maxBuffer: SITE_AI_REPORT_MAXIMUM_BYTES,
    reject: false,
    shell: false,
    stdin: 'inherit',
    stdout: stage.captureStdout ? 'pipe' : 'inherit',
    stderr: 'inherit',
    stripFinalNewline: false,
  })
  return {
    exitCode: completed.exitCode,
    stdout: typeof completed.stdout === 'string' ? completed.stdout : '',
    isMaxBuffer: completed.isMaxBuffer === true,
    shortMessage: completed.shortMessage ?? '',
    ...(completed.signal === undefined ? {} : { signal: completed.signal }),
  }
}

const defaultDependencies: SiteAiCheckDependencies = {
  clearReport: async () => rm(SITE_AI_REPORT_PATH, { force: true }),
  execute: executeStage,
  saveReport: async (source) => writeSiteAiReport(SITE_AI_REPORT_PATH, source),
  writeStdout: (source) => process.stdout.write(source),
  writeStderr: (source) => process.stderr.write(source),
}

function runnerFailure(
  dependencies: SiteAiCheckDependencies,
  message: string,
): 2 {
  dependencies.writeStderr(`Silen site AI check: ${message}\n`)
  return 2
}

export async function runSiteAiCheck(
  dependencies: SiteAiCheckDependencies = defaultDependencies,
): Promise<number> {
  try {
    await dependencies.clearReport()
  } catch (error) {
    return runnerFailure(
      dependencies,
      `unable to clear the previous report: ${errorDetail(error)}`,
    )
  }

  for (const stage of SITE_AI_STAGES) {
    let completed: SiteAiCheckStageResult
    try {
      completed = await dependencies.execute(stage)
    } catch (error) {
      return runnerFailure(
        dependencies,
        `${stage.id} could not start: ${errorDetail(error)}`,
      )
    }

    if (!stage.captureStdout) {
      if (completed.exitCode === 0) continue
      if (completed.exitCode !== undefined) return completed.exitCode
      return runnerFailure(
        dependencies,
        `${stage.id} did not return an exit code: ${
          completed.shortMessage || completed.signal || 'unknown failure'
        }`,
      )
    }

    if (completed.stdout) dependencies.writeStdout(completed.stdout)
    if (completed.isMaxBuffer) {
      return runnerFailure(
        dependencies,
        'evaluation output exceeded the 16 MiB report limit',
      )
    }
    if (
      completed.exitCode !== 0 &&
      completed.exitCode !== 1 &&
      completed.exitCode !== 2
    ) {
      return runnerFailure(
        dependencies,
        `evaluation returned an unexpected result: ${
          completed.shortMessage ||
          completed.signal ||
          String(completed.exitCode)
        }`,
      )
    }

    try {
      assertReportDocument(completed.stdout)
      await dependencies.saveReport(completed.stdout)
    } catch (error) {
      return runnerFailure(
        dependencies,
        `evaluation report was not persisted: ${errorDetail(error)}`,
      )
    }
    if (completed.exitCode !== 0) return completed.exitCode
  }

  return 0
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await runSiteAiCheck()
}
