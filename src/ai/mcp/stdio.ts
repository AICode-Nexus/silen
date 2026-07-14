import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Workspace } from '../workspace.js'
import { createMcpServer } from './server.js'

export interface CreateMcpOptions {
  workspace: Workspace
  allowWrite: boolean
}

export async function serveMcp(options: CreateMcpOptions): Promise<void> {
  const server = createMcpServer(options)
  const transport = new StdioServerTransport()
  let resolveClosed!: () => void
  let rejectClosed!: (error: unknown) => void
  const closed = new Promise<void>((resolve, reject) => {
    resolveClosed = resolve
    rejectClosed = reject
  })
  const previousOnClose = transport.onclose
  transport.onclose = () => {
    previousOnClose?.()
    resolveClosed()
  }
  let closePromise: Promise<void> | undefined
  const closeServer = (): Promise<void> => {
    closePromise ??= Promise.resolve().then(() => server.close())
    return closePromise
  }
  const close = (): void => {
    void closeServer().catch(rejectClosed)
  }
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
  try {
    await server.connect(transport)
    await closed
    if (closePromise) await closePromise
  } finally {
    process.off('SIGINT', close)
    process.off('SIGTERM', close)
  }
}
