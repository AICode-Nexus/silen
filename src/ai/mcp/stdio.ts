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
  let closing = false
  let closePromise: Promise<void> | undefined
  const close = (): void => {
    if (closing) return
    closing = true
    closePromise = Promise.resolve().then(() => server.close())
    void closePromise.catch(rejectClosed)
  }
  process.on('SIGINT', close)
  process.on('SIGTERM', close)
  try {
    await server.connect(transport)
    await closed
    if (closePromise) await closePromise
  } finally {
    process.off('SIGINT', close)
    process.off('SIGTERM', close)
  }
}
