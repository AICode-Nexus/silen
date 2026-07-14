import { describe, expect, it, vi } from 'vitest'
import {
  createEndpointAskAiAdapter,
  type AskAiEvent,
} from '../../src/client/ai'

const request = {
  route: '/guide/',
  selectedText: 'public selection',
  messages: [{ role: 'user' as const, content: 'How do I install Silen?' }],
}

function ndjsonResponse(...chunks: string[]): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
    {
      headers: { 'content-type': 'application/x-ndjson' },
      status: 200,
    },
  )
}

function byteResponse(...chunks: Uint8Array[]): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk)
        controller.close()
      },
    }),
    {
      headers: { 'content-type': 'application/x-ndjson' },
      status: 200,
    },
  )
}

function openNdjsonResponse(
  body: string,
  cancel?: () => void | Promise<void>,
): Response {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        if (body) controller.enqueue(encoder.encode(body))
      },
      ...(cancel ? { cancel } : {}),
    }),
    {
      headers: { 'content-type': 'application/x-ndjson' },
      status: 200,
    },
  )
}

function trackReaderCancellation(response: Response): {
  response: Response
  cancel: ReturnType<typeof vi.fn<(reason?: unknown) => Promise<void>>>
} {
  const body = response.body as unknown as {
    getReader(): ReadableStreamDefaultReader<Uint8Array>
  }
  const getReader = body.getReader.bind(body)
  const cancel = vi.fn<(reason?: unknown) => Promise<void>>()
  body.getReader = () => {
    const reader = getReader()
    const readerCancel = reader.cancel.bind(reader)
    cancel.mockImplementation((reason) => readerCancel(reason))
    reader.cancel = cancel
    return reader
  }
  return { response, cancel }
}

async function collect(
  iterable: AsyncIterable<AskAiEvent>,
): Promise<AskAiEvent[]> {
  const events: AskAiEvent[] = []
  for await (const event of iterable) events.push(event)
  return events
}

describe('endpoint Ask AI adapter', () => {
  it('parses partial NDJSON chunks and sends only public protocol headers', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        ndjsonResponse(
          '{"type":"text","value":"Install',
          ' with pnpm."}\n{"type":"citation","title":"Guide",',
          '"url":"/guide/"}\n',
        ),
      ),
    )
    const controller = new AbortController()
    const adapter = createEndpointAskAiAdapter(
      'https://docs.example.com/api/ask',
      { fetch: fetchMock },
    )

    await expect(
      collect(adapter.ask(request, controller.signal)),
    ).resolves.toEqual([
      { type: 'text', value: 'Install with pnpm.' },
      { type: 'citation', title: 'Guide', url: '/guide/' },
    ])
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('https://docs.example.com/api/ask', {
      method: 'POST',
      headers: {
        accept: 'application/x-ndjson',
        'content-type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
  })

  it('sanitizes non-2xx bodies and provider error events', async () => {
    const rejected = createEndpointAskAiAdapter(
      'https://private-provider.example/v1/models/secret',
      {
        fetch: () =>
          Promise.resolve(
            new Response('raw upstream trace: sk-secret', { status: 502 }),
          ),
      },
    )

    await expect(
      collect(rejected.ask(request, new AbortController().signal)),
    ).rejects.toThrow('Ask AI is temporarily unavailable.')
    await expect(
      collect(rejected.ask(request, new AbortController().signal)),
    ).rejects.not.toThrow(/502|sk-secret|private-provider/)

    const streamedError = createEndpointAskAiAdapter('/api/ask', {
      fetch: () =>
        Promise.resolve(
          ndjsonResponse(
            '{"type":"error","message":"OpenAI raw response sk-secret"}\n',
          ),
        ),
    })
    await expect(
      collect(streamedError.ask(request, new AbortController().signal)),
    ).resolves.toEqual([
      {
        type: 'error',
        message: 'The AI provider could not complete this request.',
      },
    ])
  })

  it('rejects malformed, unsupported, and oversized stream records safely', async () => {
    const cases = [
      '{not-json}\n',
      '{"type":"tool_call","name":"shell"}\n',
      `${JSON.stringify({ type: 'text', value: 'x'.repeat(65_537) })}\n`,
    ]

    for (const body of cases) {
      const adapter = createEndpointAskAiAdapter('/api/ask', {
        fetch: () => Promise.resolve(ndjsonResponse(body)),
      })
      await expect(
        collect(adapter.ask(request, new AbortController().signal)),
      ).rejects.toThrow('The Ask AI response was invalid.')
    }
  })

  it('rejects invalid UTF-8 without accepting replacement characters', async () => {
    const encoder = new TextEncoder()
    const cases = [
      [
        encoder.encode('{"type":"text","value":"'),
        new Uint8Array([0x80]),
        encoder.encode('"}\n'),
      ],
      [
        new Uint8Array([...encoder.encode('{"type":"text","value":"'), 0xe2]),
        encoder.encode('"}\n'),
      ],
      [new Uint8Array([...encoder.encode('{"type":"text","value":"'), 0xe2])],
    ]

    for (const chunks of cases) {
      const adapter = createEndpointAskAiAdapter('/api/ask', {
        fetch: () => Promise.resolve(byteResponse(...chunks)),
      })
      await expect(
        collect(adapter.ask(request, new AbortController().signal)),
      ).rejects.toThrow('The Ask AI response was invalid.')
    }
  })

  it('cancels unfinished readers exactly once but not readers at normal EOF', async () => {
    const normalStream = trackReaderCancellation(
      ndjsonResponse('{"type":"text","value":"ok"}\n'),
    )
    const normal = createEndpointAskAiAdapter('/api/ask', {
      fetch: () => Promise.resolve(normalStream.response),
    })
    await collect(normal.ask(request, new AbortController().signal))
    expect(normalStream.cancel).not.toHaveBeenCalled()

    const malformedStream = trackReaderCancellation(
      openNdjsonResponse('{not-json}\n'),
    )
    const malformed = createEndpointAskAiAdapter('/api/ask', {
      fetch: () => Promise.resolve(malformedStream.response),
    })
    await expect(
      collect(malformed.ask(request, new AbortController().signal)),
    ).rejects.toThrow('The Ask AI response was invalid.')
    expect(malformedStream.cancel).toHaveBeenCalledOnce()

    const earlyReturnStream = trackReaderCancellation(
      openNdjsonResponse('{"type":"text","value":"first"}\n'),
    )
    const earlyReturn = createEndpointAskAiAdapter('/api/ask', {
      fetch: () => Promise.resolve(earlyReturnStream.response),
    })
    for await (const event of earlyReturn.ask(
      request,
      new AbortController().signal,
    )) {
      expect(event).toEqual({ type: 'text', value: 'first' })
      break
    }
    expect(earlyReturnStream.cancel).toHaveBeenCalledOnce()
  })

  it('cancels exactly once for line, total-response, and event limits', async () => {
    const cases = [
      'x'.repeat(64 * 1024 + 1),
      ' \n'.repeat(512 * 1024 + 1),
      `${'{"type":"text","value":"x"}\n'.repeat(513)}`,
    ]

    for (const body of cases) {
      const stream = trackReaderCancellation(openNdjsonResponse(body))
      const adapter = createEndpointAskAiAdapter('/api/ask', {
        fetch: () => Promise.resolve(stream.response),
      })
      await expect(
        collect(adapter.ask(request, new AbortController().signal)),
      ).rejects.toThrow('The Ask AI response was invalid.')
      expect(stream.cancel).toHaveBeenCalledOnce()
    }
  })

  it('awaits one cancellation on abort without exposing cancellation failures', async () => {
    const cancelFailure = vi.fn(() =>
      Promise.reject(new Error('raw cancellation failure sk-secret')),
    )
    const stream = trackReaderCancellation(
      openNdjsonResponse('{"type":"text","value":"first"}\n', cancelFailure),
    )
    const controller = new AbortController()
    const adapter = createEndpointAskAiAdapter('/api/ask', {
      fetch: () => Promise.resolve(stream.response),
    })
    const iterable = adapter.ask(request, controller.signal)
    const iterator = iterable[Symbol.asyncIterator]()

    await expect(iterator.next()).resolves.toMatchObject({ done: false })
    const pendingRead = iterator.next()
    controller.abort()

    await expect(pendingRead).rejects.toMatchObject({ name: 'AbortError' })
    expect(stream.cancel).toHaveBeenCalledOnce()
    expect(cancelFailure).toHaveBeenCalledOnce()
  })

  it('does not let cancellation failures replace invalid-response errors', async () => {
    const stream = trackReaderCancellation(
      openNdjsonResponse('{not-json}\n', () =>
        Promise.reject(new Error('raw cancellation failure sk-secret')),
      ),
    )
    const adapter = createEndpointAskAiAdapter('/api/ask', {
      fetch: () => Promise.resolve(stream.response),
    })

    await expect(
      collect(adapter.ask(request, new AbortController().signal)),
    ).rejects.toThrow('The Ask AI response was invalid.')
    expect(stream.cancel).toHaveBeenCalledOnce()
  })

  it('forwards AbortSignal and preserves AbortError semantics', async () => {
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          )
        }),
    )
    const controller = new AbortController()
    const adapter = createEndpointAskAiAdapter('/api/ask', {
      fetch: fetchMock,
    })
    const result = collect(adapter.ask(request, controller.signal))

    controller.abort()

    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal)
  })
})
