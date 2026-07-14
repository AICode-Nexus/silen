export interface AskAiMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export interface AskAiRequest {
  readonly route: string
  readonly selectedText?: string
  readonly messages: readonly AskAiMessage[]
}

export type AskAiEvent =
  | { readonly type: 'text'; readonly value: string }
  | {
      readonly type: 'citation'
      readonly title: string
      readonly url: string
    }
  | { readonly type: 'error'; readonly message: string }

export interface AskAiAdapter {
  ask(request: AskAiRequest, signal: AbortSignal): AsyncIterable<AskAiEvent>
}

export interface EndpointAskAiAdapterOptions {
  readonly fetch?: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>
}

const MAX_LINE_BYTES = 64 * 1024
const MAX_RESPONSE_BYTES = 1024 * 1024
const MAX_EVENTS = 512
const MAX_MESSAGES = 32
const MAX_MESSAGE_BYTES = 32 * 1024
const MAX_REQUEST_BYTES = 128 * 1024

class SafeAskAiError extends Error {}

function invalidResponse(): SafeAskAiError {
  return new SafeAskAiError('The Ask AI response was invalid.')
}

function unavailable(): SafeAskAiError {
  return new SafeAskAiError('Ask AI is temporarily unavailable.')
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    if ((character.codePointAt(0) ?? 0) < 0x20) return true
  }
  return false
}

function publicEndpoint(endpoint: string): string {
  if (
    endpoint.startsWith('/') &&
    !endpoint.startsWith('//') &&
    !endpoint.includes('\\') &&
    !hasControlCharacter(endpoint)
  ) {
    return endpoint
  }

  let parsed: URL
  try {
    parsed = new URL(endpoint)
  } catch {
    throw new TypeError(
      'Ask AI endpoint must be an HTTP(S) or site-relative URL',
    )
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    parsed.username !== '' ||
    parsed.password !== ''
  ) {
    throw new TypeError(
      'Ask AI endpoint must be an HTTP(S) or site-relative URL',
    )
  }
  return endpoint
}

function publicRequest(request: AskAiRequest): AskAiRequest {
  if (
    typeof request.route !== 'string' ||
    request.route.length === 0 ||
    request.messages.length === 0 ||
    request.messages.length > MAX_MESSAGES ||
    (request.selectedText !== undefined &&
      typeof request.selectedText !== 'string')
  ) {
    throw new TypeError('Ask AI request is invalid')
  }

  const messages = request.messages.map((message) => {
    if (
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string' ||
      byteLength(message.content) > MAX_MESSAGE_BYTES
    ) {
      throw new TypeError('Ask AI request is invalid')
    }
    return { role: message.role, content: message.content }
  })
  const safeRequest: AskAiRequest = {
    route: request.route,
    ...(request.selectedText === undefined
      ? {}
      : { selectedText: request.selectedText }),
    messages,
  }
  if (byteLength(JSON.stringify(safeRequest)) > MAX_REQUEST_BYTES) {
    throw new TypeError('Ask AI request is invalid')
  }
  return safeRequest
}

function eventFromLine(line: string): AskAiEvent {
  if (byteLength(line) > MAX_LINE_BYTES) throw invalidResponse()

  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    throw invalidResponse()
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidResponse()
  }
  const record = value as Record<string, unknown>
  if (record.type === 'text' && typeof record.value === 'string') {
    return { type: 'text', value: record.value }
  }
  if (
    record.type === 'citation' &&
    typeof record.title === 'string' &&
    typeof record.url === 'string'
  ) {
    return { type: 'citation', title: record.title, url: record.url }
  }
  if (record.type === 'error') {
    return {
      type: 'error',
      message: 'The AI provider could not complete this request.',
    }
  }
  throw invalidResponse()
}

async function* readNdjson(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<AskAiEvent> {
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]
  if (
    contentType !== 'application/x-ndjson' &&
    contentType !== 'application/ndjson'
  ) {
    throw invalidResponse()
  }
  if (!response.body) throw invalidResponse()

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let totalBytes = 0
  let eventCount = 0
  const cancel = (): void => {
    void reader.cancel().catch(() => undefined)
  }
  signal.addEventListener('abort', cancel, { once: true })

  const parseLine = (line: string): AskAiEvent | undefined => {
    const normalized = line.endsWith('\r') ? line.slice(0, -1) : line
    if (normalized.trim().length === 0) return undefined
    eventCount += 1
    if (eventCount > MAX_EVENTS) throw invalidResponse()
    return eventFromLine(normalized)
  }

  try {
    for (;;) {
      if (signal.aborted) throw abortError()
      const chunk = await reader.read()
      if (signal.aborted) throw abortError()
      if (chunk.done) break
      totalBytes += chunk.value.byteLength
      if (totalBytes > MAX_RESPONSE_BYTES) throw invalidResponse()
      buffer += decoder.decode(chunk.value, { stream: true })

      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const event = parseLine(buffer.slice(0, newline))
        buffer = buffer.slice(newline + 1)
        if (event) yield event
        newline = buffer.indexOf('\n')
      }
      if (byteLength(buffer) > MAX_LINE_BYTES) throw invalidResponse()
    }

    buffer += decoder.decode()
    const event = parseLine(buffer)
    if (event) yield event
  } finally {
    signal.removeEventListener('abort', cancel)
    reader.releaseLock()
  }
}

export function createEndpointAskAiAdapter(
  endpoint: string,
  options: EndpointAskAiAdapterOptions = {},
): AskAiAdapter {
  const url = publicEndpoint(endpoint)
  const requestFetch = options.fetch ?? globalThis.fetch

  return {
    async *ask(request, signal) {
      if (signal.aborted) throw abortError()
      const body = JSON.stringify(publicRequest(request))
      try {
        const response = await requestFetch(url, {
          method: 'POST',
          headers: {
            accept: 'application/x-ndjson',
            'content-type': 'application/json',
          },
          body,
          signal,
        })
        if (signal.aborted) throw abortError()
        if (!response.ok) throw unavailable()
        yield* readNdjson(response, signal)
      } catch (error) {
        if (
          signal.aborted ||
          (error as { name?: unknown })?.name === 'AbortError'
        ) {
          throw abortError()
        }
        if (error instanceof SafeAskAiError) throw error
        throw unavailable()
      }
    },
  }
}
