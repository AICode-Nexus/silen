import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { loadPackagedReadOnlyAgentSkill } from '../contract/package-assets.js'
import type { Workspace } from '../workspace.js'
import { createMcpServer } from './server.js'

export interface CreateMcpOptions {
  workspace: Workspace
  allowWrite: boolean
  experimentalSkillsOverMcp?: boolean
}

export async function serveMcp(options: CreateMcpOptions): Promise<void> {
  const readOnlyAgentSkill = options.experimentalSkillsOverMcp
    ? await loadPackagedReadOnlyAgentSkill()
    : undefined
  let resolveStopped!: () => void
  let rejectStopped!: (error: unknown) => void
  const stopped = new Promise<void>((resolve, reject) => {
    resolveStopped = resolve
    rejectStopped = reject
  })

  const handle = serveStdio(
    () =>
      createMcpServer({
        workspace: options.workspace,
        allowWrite: options.allowWrite,
        ...(readOnlyAgentSkill === undefined ? {} : { readOnlyAgentSkill }),
      }),
    {
      legacy: 'serve',
      onerror: rejectStopped,
    },
  )

  let closePromise: Promise<void> | undefined
  const close = (): void => {
    closePromise ??= handle.close()
    void closePromise.then(resolveStopped, rejectStopped)
  }

  process.on('SIGINT', close)
  process.on('SIGTERM', close)
  process.stdin.once('end', close)
  try {
    await stopped
  } finally {
    process.off('SIGINT', close)
    process.off('SIGTERM', close)
    process.stdin.off('end', close)
    await (closePromise ?? handle.close())
  }
}
