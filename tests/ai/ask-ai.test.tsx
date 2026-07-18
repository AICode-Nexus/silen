import { act, useState } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AskAiAdapter, AskAiEvent, AskAiRequest } from '../../src/client'
import { createEndpointAskAiAdapter } from '../../src/client'
import { Nav } from '../../src/theme-default/components/nav'
import { AskAiDialog } from '../../src/theme-default/components/ask-ai'
import { TestSiteProvider } from '../helpers/test-site-provider'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function DialogHarness({ adapter }: { adapter: AskAiAdapter }) {
  const [open, setOpen] = useState(false)
  return (
    <TestSiteProvider path="/guide/">
      <button type="button" onClick={() => setOpen(true)}>
        Open Ask AI
      </button>
      <AskAiDialog adapter={adapter} open={open} onOpenChange={setOpen} />
    </TestSiteProvider>
  )
}

function deferred(): {
  promise: Promise<void>
  resolve: () => void
} {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('Ask AI launcher', () => {
  it('does not render Ask AI when no endpoint is configured', () => {
    render(
      <TestSiteProvider themeConfig={{ search: false }}>
        <Nav />
      </TestSiteProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Ask AI' })).toBeNull()
  })

  it('loads the dialog on demand for a public endpoint and restores focus', async () => {
    const user = userEvent.setup()
    render(
      <TestSiteProvider
        themeConfig={{ search: false, ai: { endpoint: '/api/ask' } }}
      >
        <Nav />
      </TestSiteProvider>,
    )

    const trigger = screen.getByRole('button', { name: 'Ask AI' })
    await user.click(trigger)
    expect(await screen.findByRole('dialog', { name: 'Ask AI' })).not.toBeNull()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })
})

describe('AskAiDialog', () => {
  it('localizes dialog, close, form, and live status labels', () => {
    const adapter: AskAiAdapter = {
      async *ask() {
        yield await Promise.resolve({ type: 'text' as const, value: '回答' })
      },
    }
    render(
      <TestSiteProvider lang="zh-CN">
        <AskAiDialog adapter={adapter} open onOpenChange={() => undefined} />
      </TestSiteProvider>,
    )

    expect(screen.getByRole('dialog', { name: '询问 AI' })).not.toBeNull()
    expect(screen.getByRole('textbox', { name: '问题' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '提问' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '关闭' })).not.toBeNull()
    expect(screen.getByRole('status').textContent).toBe('回答已就绪。')
  })

  it('streams text, errors, and only link-safe citations with live status', async () => {
    const user = userEvent.setup()
    const continueStream = deferred()
    let seenRequest: AskAiRequest | undefined
    const adapter: AskAiAdapter = {
      async *ask(request) {
        seenRequest = request
        yield { type: 'text', value: 'Install ' }
        await continueStream.promise
        yield { type: 'text', value: 'with pnpm.' }
        yield { type: 'citation', title: 'Guide', url: '/guide/' }
        yield {
          type: 'citation',
          title: 'Reference',
          url: 'HTTPS://DOCS.Example.COM:443/a/../reference',
        }
        yield { type: 'citation', title: 'Script', url: 'javascript:alert(1)' }
        yield {
          type: 'citation',
          title: 'Inline data',
          url: 'data:text/html,x',
        }
        yield {
          type: 'citation',
          title: 'Protocol relative',
          url: '//docs.example.com/reference',
        }
        yield {
          type: 'citation',
          title: 'Tabbed URL',
          url: 'https://docs.example.com/\treference',
        }
        yield {
          type: 'citation',
          title: 'Newline URL',
          url: 'https://docs.example.com/\nreference',
        }
        yield {
          type: 'citation',
          title: 'DEL URL',
          url: 'https://docs.example.com/\u007freference',
        }
        yield {
          type: 'error',
          message: 'raw response https://provider.invalid sk-secret',
        }
      },
    }
    render(<DialogHarness adapter={adapter} />)

    await user.click(screen.getByRole('button', { name: 'Open Ask AI' }))
    const input = screen.getByRole('textbox', { name: 'Question' })
    await waitFor(() => expect(document.activeElement).toBe(input))
    await user.type(input, 'How do I install it?{Enter}')
    expect(await screen.findByText('Install')).not.toBeNull()
    expect(seenRequest).toEqual({
      route: '/guide/',
      messages: [{ role: 'user', content: 'How do I install it?' }],
    })
    expect(screen.getByRole('status').textContent).toContain(
      'Generating answer',
    )

    act(() => continueStream.resolve())

    expect(await screen.findByText('with pnpm.')).not.toBeNull()
    expect(
      screen.getByRole('link', { name: 'Guide' }).getAttribute('href'),
    ).toBe('/guide/')
    expect(
      screen.getByRole('link', { name: 'Reference' }).getAttribute('href'),
    ).toBe('https://docs.example.com/reference')
    expect(
      screen.getByRole('link', { name: 'Reference' }).getAttribute('rel'),
    ).toBe('noreferrer')
    expect(screen.queryByRole('link', { name: 'Script' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Inline data' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Protocol relative' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Tabbed URL' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Newline URL' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'DEL URL' })).toBeNull()
    expect(screen.getByText('Script')).not.toBeNull()
    expect(screen.getByText('Inline data')).not.toBeNull()
    expect(screen.getByRole('alert').textContent).toContain(
      'The AI provider could not complete this request.',
    )
    expect(screen.queryByText(/provider\.invalid|sk-secret/)).toBeNull()
    expect(screen.getByRole('log').getAttribute('aria-live')).toBe('polite')
  })

  it('aborts superseded requests and ignores stale events', async () => {
    const user = userEvent.setup()
    const pending = new Map<string, ReturnType<typeof deferred>>()
    const signals = new Map<string, AbortSignal>()
    const adapter: AskAiAdapter = {
      async *ask(request, signal) {
        const question = request.messages.at(-1)?.content ?? ''
        signals.set(question, signal)
        const gate = deferred()
        pending.set(question, gate)
        await gate.promise
        yield { type: 'text', value: `${question} answer` }
      },
    }
    render(<DialogHarness adapter={adapter} />)

    await user.click(screen.getByRole('button', { name: 'Open Ask AI' }))
    const input = screen.getByRole('textbox', { name: 'Question' })
    await user.type(input, 'first{Enter}')
    await waitFor(() => expect(pending.has('first')).toBe(true))
    await user.type(input, 'second{Enter}')
    await waitFor(() => expect(pending.has('second')).toBe(true))
    expect(signals.get('first')?.aborted).toBe(true)

    act(() => pending.get('second')?.resolve())
    expect(await screen.findByText('second answer')).not.toBeNull()
    act(() => pending.get('first')?.resolve())
    await waitFor(() => expect(screen.queryByText('first answer')).toBeNull())
  })

  it('cancels endpoint streams once when superseded and when closed', async () => {
    const user = userEvent.setup()
    const cancellations: Array<ReturnType<typeof vi.fn>> = []
    const adapter = createEndpointAskAiAdapter('/api/ask', {
      fetch: () => {
        const cancel = vi.fn()
        cancellations.push(cancel)
        return Promise.resolve(
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    '{"type":"text","value":"streaming"}\n',
                  ),
                )
              },
              cancel,
            }),
            { headers: { 'content-type': 'application/x-ndjson' } },
          ),
        )
      },
    })
    render(<DialogHarness adapter={adapter} />)

    await user.click(screen.getByRole('button', { name: 'Open Ask AI' }))
    const input = screen.getByRole('textbox', { name: 'Question' })
    await user.type(input, 'first{Enter}')
    expect(await screen.findByText('streaming')).not.toBeNull()

    await user.type(input, 'second{Enter}')
    await waitFor(() => expect(cancellations).toHaveLength(2))
    expect(cancellations[0]).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(cancellations[1]).toHaveBeenCalledOnce())
  })

  it('aborts on close and unmount and hides thrown provider details', async () => {
    const user = userEvent.setup()
    const requests: Array<{
      request: AskAiRequest
      signal: AbortSignal
      gate: ReturnType<typeof deferred>
    }> = []
    const adapter: AskAiAdapter = {
      async *ask(request, signal) {
        const gate = deferred()
        requests.push({ request, signal, gate })
        await gate.promise
        yield await Promise.reject(
          new Error('raw endpoint https://provider.invalid sk-secret'),
        )
      },
    }
    const view = render(<DialogHarness adapter={adapter} />)

    await user.click(screen.getByRole('button', { name: 'Open Ask AI' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Question' }),
      'close me{Enter}',
    )
    await waitFor(() => expect(requests).toHaveLength(1))
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(requests[0]?.signal.aborted).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Open Ask AI' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Question' }),
      'unmount me{Enter}',
    )
    await waitFor(() => expect(requests).toHaveLength(2))
    view.unmount()
    expect(requests[1]?.signal.aborted).toBe(true)

    const failureAdapter: AskAiAdapter = {
      async *ask(): AsyncGenerator<AskAiEvent> {
        yield await Promise.reject(
          new Error('raw endpoint https://provider.invalid sk-secret'),
        )
      },
    }
    render(<DialogHarness adapter={failureAdapter} />)
    await user.click(screen.getByRole('button', { name: 'Open Ask AI' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Question' }),
      'fail{Enter}',
    )
    expect((await screen.findByRole('alert')).textContent).toContain(
      'The AI provider could not complete this request.',
    )
    expect(screen.queryByText(/provider\.invalid|sk-secret/)).toBeNull()
  })
})
