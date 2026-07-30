import { execa } from 'execa'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SILEN_VERSION } from '../../src/shared/version'

const LEGACY_PROTOCOL_VERSION = '2025-11-25'

const mocks = vi.hoisted(() => ({
  close: vi.fn(() => Promise.resolve()),
  factory: undefined as (() => unknown) | undefined,
  options: undefined as
    | { legacy?: 'serve' | 'reject'; onerror?: (error: Error) => void }
    | undefined,
  loadSkill: vi.fn(),
  skillBundle: {
    name: 'silen-docs-readonly',
    files: { 'SKILL.md': 'fixture\n' },
  },
  serverOptions: [] as unknown[],
}))

vi.mock('../../src/ai/contract/package-assets.js', () => ({
  loadPackagedReadOnlyAgentSkill: mocks.loadSkill,
}))

vi.mock('../../src/ai/mcp/server.js', () => ({
  createMcpServer: vi.fn((options: unknown) => {
    mocks.serverOptions.push(options)
    return {}
  }),
}))

vi.mock('@modelcontextprotocol/server/stdio', () => ({
  serveStdio: vi.fn(
    (
      factory: () => unknown,
      options: {
        legacy?: 'serve' | 'reject'
        onerror?: (error: Error) => void
      },
    ) => {
      mocks.factory = factory
      mocks.options = options
      return { close: mocks.close }
    },
  ),
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
    mocks.factory = undefined
    mocks.options = undefined
    mocks.loadSkill.mockReset()
    mocks.loadSkill.mockResolvedValue(mocks.skillBundle)
    mocks.serverOptions.length = 0
  })

  it('uses the dual-era entry and removes listeners when it reports an error', async () => {
    const sigint = process.listenerCount('SIGINT')
    const sigterm = process.listenerCount('SIGTERM')
    const serving = serveMcp({ workspace: {} as never, allowWrite: false })
    await vi.waitFor(() => expect(mocks.factory).toBeTypeOf('function'))
    expect(mocks.loadSkill).not.toHaveBeenCalled()
    expect(mocks.options?.legacy).toBe('serve')
    expect(mocks.options?.onerror).toBeTypeOf('function')
    expect(process.listenerCount('SIGINT')).toBe(sigint + 1)
    expect(process.listenerCount('SIGTERM')).toBe(sigterm + 1)

    const failure = new Error('stdio failed')
    mocks.options?.onerror?.(failure)
    await expect(serving).rejects.toThrow('stdio failed')
    expect(mocks.close).toHaveBeenCalledOnce()
    expect(process.listenerCount('SIGINT')).toBe(sigint)
    expect(process.listenerCount('SIGTERM')).toBe(sigterm)
  })

  it('loads the experimental packaged Skill once before creating stdio servers', async () => {
    mocks.loadSkill.mockResolvedValue(mocks.skillBundle)
    const serving = serveMcp({
      workspace: {} as never,
      allowWrite: false,
      experimentalSkillsOverMcp: true,
    })

    await vi.waitFor(() => expect(mocks.factory).toBeTypeOf('function'))
    expect(mocks.loadSkill).toHaveBeenCalledOnce()
    mocks.factory?.()
    mocks.factory?.()
    expect(mocks.loadSkill).toHaveBeenCalledOnce()
    expect(mocks.serverOptions).toEqual([
      expect.objectContaining({ readOnlyAgentSkill: mocks.skillBundle }),
      expect.objectContaining({ readOnlyAgentSkill: mocks.skillBundle }),
    ])

    process.emit('SIGTERM', 'SIGTERM')
    await serving
    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it('closes the stdio handle once when both shutdown signals arrive', async () => {
    const serving = serveMcp({ workspace: {} as never, allowWrite: false })
    await vi.waitFor(() => expect(mocks.factory).toBeTypeOf('function'))

    process.emit('SIGTERM', 'SIGTERM')
    process.emit('SIGINT', 'SIGINT')
    await serving

    expect(mocks.close).toHaveBeenCalledOnce()
  })

  it.each(['SIGTERM', 'SIGINT'] as const)(
    'keeps handling repeated %s signals while shutdown is in progress',
    async (signal) => {
      const sigint = process.listenerCount('SIGINT')
      const sigterm = process.listenerCount('SIGTERM')
      let finishClose!: () => void
      mocks.close.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishClose = resolve
          }),
      )
      const serving = serveMcp({ workspace: {} as never, allowWrite: false })
      await vi.waitFor(() => expect(mocks.factory).toBeTypeOf('function'))

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
              protocolVersion: LEGACY_PROTOCOL_VERSION,
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
