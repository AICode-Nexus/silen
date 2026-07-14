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
