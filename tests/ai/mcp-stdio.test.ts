import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'
import { execa } from 'execa'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SILEN_VERSION } from '../../src/shared/version'

const mocks = vi.hoisted(() => ({
  close: vi.fn(() => Promise.resolve()),
  connect: vi.fn<(transport: { onclose?: () => void }) => Promise<void>>(),
  transport: undefined as { onclose?: () => void } | undefined,
}))

vi.mock('../../src/ai/mcp/server.js', () => ({
  createMcpServer: () => ({ close: mocks.close, connect: mocks.connect }),
}))

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class StdioServerTransport {
    onclose?: () => void

    constructor() {
      mocks.transport = this
    }
  },
}))

import { serveMcp } from '../../src/ai/mcp/stdio'

async function nextProtocolLine(
  lines: AsyncIterator<string>,
): Promise<Record<string, unknown>> {
  let timeout: NodeJS.Timeout | undefined
  try {
    const next = await Promise.race([
      lines.next(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Timed out waiting for MCP stdout')),
          10_000,
        )
      }),
    ])
    if (next.done) throw new Error('MCP stdout closed before a response')
    const parsed: unknown = JSON.parse(next.value)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new TypeError('Expected an MCP protocol object')
    }
    return parsed as Record<string, unknown>
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

describe('MCP stdio lifecycle', () => {
  beforeEach(() => {
    mocks.close.mockReset()
    mocks.close.mockResolvedValue()
    mocks.connect.mockReset()
    mocks.transport = undefined
  })

  it('removes signal listeners when connect fails', async () => {
    const sigint = process.listenerCount('SIGINT')
    const sigterm = process.listenerCount('SIGTERM')
    mocks.connect.mockRejectedValueOnce(new Error('connect failed'))
    await expect(
      serveMcp({ workspace: {} as never, allowWrite: false }),
    ).rejects.toThrow('connect failed')
    expect(process.listenerCount('SIGINT')).toBe(sigint)
    expect(process.listenerCount('SIGTERM')).toBe(sigterm)
  })

  it('removes signal listeners when the transport session ends', async () => {
    const sigint = process.listenerCount('SIGINT')
    const sigterm = process.listenerCount('SIGTERM')
    mocks.connect.mockResolvedValueOnce()
    let resolved = false
    const serving = serveMcp({
      workspace: {} as never,
      allowWrite: false,
    }).then(() => {
      resolved = true
    })
    await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalledOnce())
    expect(resolved).toBe(false)
    expect(process.listenerCount('SIGINT')).toBe(sigint + 1)
    expect(process.listenerCount('SIGTERM')).toBe(sigterm + 1)

    mocks.transport?.onclose?.()
    await serving
    expect(process.listenerCount('SIGINT')).toBe(sigint)
    expect(process.listenerCount('SIGTERM')).toBe(sigterm)
  })

  it('does not miss a transport close that happens before connect resolves', async () => {
    const sigint = process.listenerCount('SIGINT')
    const sigterm = process.listenerCount('SIGTERM')
    mocks.connect.mockImplementationOnce((transport) => {
      transport.onclose?.()
      return Promise.resolve()
    })

    await expect(
      serveMcp({ workspace: {} as never, allowWrite: false }),
    ).resolves.toBeUndefined()
    expect(process.listenerCount('SIGINT')).toBe(sigint)
    expect(process.listenerCount('SIGTERM')).toBe(sigterm)
  })

  it('closes the server once when both shutdown signals arrive', async () => {
    mocks.connect.mockResolvedValueOnce()
    let finishClose!: () => void
    mocks.close.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishClose = () => {
            mocks.transport?.onclose?.()
            resolve()
          }
        }),
    )
    const serving = serveMcp({ workspace: {} as never, allowWrite: false })
    await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalledOnce())

    process.emit('SIGTERM', 'SIGTERM')
    process.emit('SIGINT', 'SIGINT')
    await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledOnce())
    finishClose()
    await serving

    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it.each(['SIGTERM', 'SIGINT'] as const)(
    'keeps handling repeated %s signals while shutdown is in progress',
    async (signal) => {
      const sigint = process.listenerCount('SIGINT')
      const sigterm = process.listenerCount('SIGTERM')
      mocks.connect.mockResolvedValueOnce()
      let finishClose!: () => void
      mocks.close.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishClose = () => {
              mocks.transport?.onclose?.()
              resolve()
            }
          }),
      )
      const serving = serveMcp({ workspace: {} as never, allowWrite: false })
      await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalledOnce())

      expect(process.emit(signal, signal)).toBe(true)
      await vi.waitFor(() => expect(mocks.close).toHaveBeenCalledOnce())
      expect(process.emit(signal, signal)).toBe(true)
      expect(mocks.close).toHaveBeenCalledOnce()

      finishClose()
      await serving
      expect(process.listenerCount('SIGINT')).toBe(sigint)
      expect(process.listenerCount('SIGTERM')).toBe(sigterm)
    },
  )

  it.each(['SIGTERM', 'SIGINT'] as const)(
    'closes a real CLI session and exits normally on %s with protocol-clean stdout',
    async (signal) => {
      const child = execa(
        path.resolve('node_modules/.bin/jiti'),
        [
          path.resolve('src/node/cli.ts'),
          'mcp',
          path.resolve('tests/fixtures/ai-workspace'),
        ],
        { reject: false, stderr: 'pipe', stdout: 'pipe' },
      )
      let stdout = ''
      child.stdout?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk
      })
      const output = createInterface({ input: child.stdout })
      const lines = output[Symbol.asyncIterator]()
      let exited = false

      try {
        child.stdin?.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: LATEST_PROTOCOL_VERSION,
              capabilities: {},
              clientInfo: { name: 'silen-signal-test', version: '1.0.0' },
            },
          })}\n`,
        )
        expect(await nextProtocolLine(lines)).toMatchObject({
          jsonrpc: '2.0',
          id: 1,
          result: {
            serverInfo: { name: 'silen', version: SILEN_VERSION },
          },
        })

        child.stdin?.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
          })}\n`,
        )
        child.stdin?.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/list',
            params: {},
          })}\n`,
        )
        const toolsResponse = await nextProtocolLine(lines)
        expect(toolsResponse).toMatchObject({
          jsonrpc: '2.0',
          id: 2,
        })
        expect(
          (toolsResponse.result as { tools: Array<{ name: string }> }).tools,
        ).toEqual(
          expect.arrayContaining([expect.objectContaining({ name: 'guide' })]),
        )

        child.kill(signal)
        const result = await child
        exited = true
        expect(result.exitCode, result.stderr).toBe(0)
        expect(result.signal).toBeUndefined()
        for (const line of stdout.trim().split('\n')) {
          expect(JSON.parse(line)).toMatchObject({ jsonrpc: '2.0' })
        }
      } finally {
        output.close()
        if (!exited) {
          child.kill('SIGKILL')
          await child
        }
      }
    },
    30_000,
  )
})
