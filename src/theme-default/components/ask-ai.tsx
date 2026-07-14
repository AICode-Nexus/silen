import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  createEndpointAskAiAdapter,
  type AskAiAdapter,
  type AskAiEvent,
} from '../../client/ai.js'
import { useRoute } from '../../client/router.js'
import { Alert, AlertDescription, AlertTitle } from './ui/alert.js'
import { Button } from './ui/button.js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from './ui/input-group.js'
import { ScrollArea } from './ui/scroll-area.js'
import { Skeleton } from './ui/skeleton.js'

export interface AskAiDialogProps {
  readonly adapter: AskAiAdapter
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

export interface EndpointAskAiDialogProps {
  readonly endpoint: string
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

const PROVIDER_FAILURE = 'The AI provider could not complete this request.'

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    if (codePoint < 0x20 || codePoint === 0x7f) return true
  }
  return false
}

function citationUrl(value: string): string | undefined {
  if (hasControlCharacter(value)) return undefined

  if (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
  ) {
    return value
  }

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.href
      : undefined
  } catch {
    return undefined
  }
}

function AskAiEventView({ event }: { readonly event: AskAiEvent }) {
  if (event.type === 'citation') {
    const safeUrl = citationUrl(event.url)
    return safeUrl ? (
      <a href={safeUrl} rel="noreferrer" target="_blank">
        {event.title}
      </a>
    ) : (
      <span>{event.title}</span>
    )
  }
  if (event.type === 'error') {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to answer</AlertTitle>
        <AlertDescription>{PROVIDER_FAILURE}</AlertDescription>
      </Alert>
    )
  }
  return <p>{event.value}</p>
}

function AskAiInput({
  onSubmit,
}: {
  readonly onSubmit: (value: string) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const inputId = useId()

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const question = value.trim()
    if (!question) return
    setValue('')
    void onSubmit(question)
  }

  return (
    <form onSubmit={submit}>
      <label className="sr-only" htmlFor={inputId}>
        Question
      </label>
      <InputGroup>
        <InputGroupInput
          id={inputId}
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <Button type="submit" size="sm" disabled={!value.trim()}>
            Ask
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}

export function AskAiDialog({
  adapter,
  open,
  onOpenChange,
}: AskAiDialogProps): React.JSX.Element {
  const route = useRoute()
  const [events, setEvents] = useState<AskAiEvent[]>([])
  const [pending, setPending] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const requestSequence = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      requestSequence.current += 1
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (open) return
    requestSequence.current += 1
    abortRef.current?.abort()
  }, [open])

  async function submit(question: string): Promise<void> {
    requestSequence.current += 1
    const sequence = requestSequence.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setEvents([])
    setPending(true)

    try {
      for await (const event of adapter.ask(
        {
          route,
          messages: [{ role: 'user', content: question }],
        },
        controller.signal,
      )) {
        if (
          !mounted.current ||
          controller.signal.aborted ||
          sequence !== requestSequence.current
        ) {
          return
        }
        setEvents((current) => [...current, event])
      }
    } catch (error) {
      if (
        !mounted.current ||
        controller.signal.aborted ||
        sequence !== requestSequence.current ||
        (error as { name?: unknown })?.name === 'AbortError'
      ) {
        return
      }
      setEvents([{ type: 'error', message: PROVIDER_FAILURE }])
    } finally {
      if (mounted.current && sequence === requestSequence.current) {
        setPending(false)
      }
    }
  }

  const changeOpen = (nextOpen: boolean): void => {
    if (!nextOpen) {
      requestSequence.current += 1
      abortRef.current?.abort()
      setPending(false)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ask AI</DialogTitle>
          <DialogDescription>
            Answers use the current documentation and include source links.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          className="h-72"
        >
          <div className="flex flex-col gap-3 pr-4">
            {events.map((event, index) => (
              <AskAiEventView key={index} event={event} />
            ))}
            {pending ? (
              <Skeleton className="h-16 w-full" aria-hidden="true" />
            ) : null}
          </div>
        </ScrollArea>
        <span role="status" className="sr-only">
          {pending ? 'Generating answer…' : 'Answer ready.'}
        </span>
        <AskAiInput onSubmit={submit} />
      </DialogContent>
    </Dialog>
  )
}

export function EndpointAskAiDialog({
  endpoint,
  open,
  onOpenChange,
}: EndpointAskAiDialogProps): React.JSX.Element {
  const adapter = useMemo(
    () => createEndpointAskAiAdapter(endpoint),
    [endpoint],
  )
  return (
    <AskAiDialog adapter={adapter} open={open} onOpenChange={onOpenChange} />
  )
}
