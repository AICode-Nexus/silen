import { serveStdio } from '@modelcontextprotocol/server/stdio'
import type { Workspace } from '../workspace.js'
import { createMcpServer } from './server.js'

export interface CreateMcpOptions {
  workspace: Workspace
  allowWrite: boolean
}

export async function serveMcp(options: CreateMcpOptions): Promise<void> {
  let resolveStopped!: () => void
  let rejectStopped!: (error: unknown) => void
  const stopped = new Promise<void>((resolve, reject) => {
    resolveStopped = resolve
    rejectStopped = reject
  })

  const handle = serveStdio(() => createMcpServer(options), {
    legacy: 'serve',
    onerror: rejectStopped,
  })

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
