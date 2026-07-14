import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  close: vi.fn(() => Promise.resolve()),
  connect: vi.fn<() => Promise<void>>(),
}))

vi.mock('../../src/ai/mcp/server.js', () => ({
  createMcpServer: () => ({ close: mocks.close, connect: mocks.connect }),
}))

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: class StdioServerTransport {},
}))

import { serveMcp } from '../../src/ai/mcp/stdio'

describe('MCP stdio lifecycle', () => {
  beforeEach(() => {
    mocks.close.mockClear()
    mocks.connect.mockReset()
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
    await serveMcp({ workspace: {} as never, allowWrite: false })
    expect(process.listenerCount('SIGINT')).toBe(sigint)
    expect(process.listenerCount('SIGTERM')).toBe(sigterm)
  })
})
