import { useRef, useState } from 'react'
import { cn } from '../lib/cn.js'
import { Button } from './ui/button.js'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip.js'

export interface AiPageActionsProps {
  readonly title: string
  readonly markdownUrl: string
  readonly canonicalUrl: string
}

type CopyKind = 'markdown' | 'ai'
type CopyStatus =
  | { readonly phase: 'idle' }
  | { readonly phase: 'loading'; readonly kind: CopyKind }
  | { readonly phase: 'copied'; readonly kind: CopyKind }
  | { readonly phase: 'error'; readonly kind: 'fetch' | 'clipboard' }

function normalizeMarkdown(markdown: string): string {
  return `${markdown.replace(/\r\n?/g, '\n').trimEnd()}\n`
}

function canonicalSource(value: string): string {
  const url = new URL(value, window.location.href)
  url.search = ''
  url.hash = ''
  return url.href
}

function feedback(status: CopyStatus): string {
  if (status.phase === 'loading') {
    return status.kind === 'ai' ? 'Preparing AI context' : 'Copying Markdown'
  }
  if (status.phase === 'copied') {
    return status.kind === 'ai' ? 'AI context copied' : 'Markdown copied'
  }
  if (status.phase === 'error') {
    return status.kind === 'fetch'
      ? 'Could not fetch page Markdown. Please try again.'
      : 'Could not access the clipboard. Please try again.'
  }
  return ''
}

export function AiPageActions({
  title,
  markdownUrl,
  canonicalUrl,
}: AiPageActionsProps): React.JSX.Element {
  const [status, setStatus] = useState<CopyStatus>({ phase: 'idle' })
  const inFlight = useRef(false)
  const loading = status.phase === 'loading'

  async function copy(kind: CopyKind): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    setStatus({ phase: 'loading', kind })

    let markdown: string
    try {
      const response = await fetch(markdownUrl)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      markdown = normalizeMarkdown(await response.text())
    } catch {
      setStatus({ phase: 'error', kind: 'fetch' })
      inFlight.current = false
      return
    }

    const value =
      kind === 'ai'
        ? `# ${title}\n\nSource: ${canonicalSource(canonicalUrl)}\n\n${markdown}`
        : markdown
    try {
      await navigator.clipboard.writeText(value)
      setStatus({ phase: 'copied', kind })
    } catch {
      setStatus({ phase: 'error', kind: 'clipboard' })
    } finally {
      inFlight.current = false
    }
  }

  const message = feedback(status)
  return (
    <div
      role="group"
      aria-label="Page copy actions"
      className="not-prose mt-8 flex flex-wrap items-center gap-2"
    >
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              aria-busy={
                status.phase === 'loading' && status.kind === 'markdown'
              }
              onClick={() => void copy('markdown')}
            >
              Copy Markdown
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy clean page Markdown</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              aria-busy={status.phase === 'loading' && status.kind === 'ai'}
              onClick={() => void copy('ai')}
            >
              Copy for AI
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Copy page context with source attribution
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {message ? (
        <span
          role={status.phase === 'error' ? 'alert' : 'status'}
          className={cn(
            'basis-full text-xs text-muted-foreground sm:basis-auto',
            status.phase === 'error' && 'text-destructive',
          )}
        >
          {message}
        </span>
      ) : null}
    </div>
  )
}
