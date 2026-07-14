import { useEffect, useRef, useState } from 'react'
import { useData, useRouter } from '../../client/index.js'
import { resolveThemeLink } from '../lib/navigation.js'
import { search, type SearchOptions, type SearchResult } from '../search.js'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './ui/command.js'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js'

export type SearchClient = (
  query: string,
  options: Required<Pick<SearchOptions, 'base' | 'signal'>>,
) => Promise<SearchResult[]>

export interface SearchDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly searchClient?: SearchClient
}

type SearchStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error'

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function SearchDialog({
  open,
  onOpenChange,
  searchClient = search,
}: SearchDialogProps): React.JSX.Element {
  const { base } = useData()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [navigationError, setNavigationError] = useState(false)
  const requestSequence = useRef(0)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const normalizedQuery = query.trim()
    const sequence = ++requestSequence.current
    if (!open || !normalizedQuery) return undefined

    const controller = new AbortController()
    void searchClient(normalizedQuery, {
      base,
      signal: controller.signal,
    }).then(
      (nextResults) => {
        if (controller.signal.aborted || sequence !== requestSequence.current) {
          return
        }
        setResults(nextResults)
        setStatus(nextResults.length ? 'ready' : 'empty')
      },
      (error: unknown) => {
        if (
          controller.signal.aborted ||
          sequence !== requestSequence.current ||
          isAbortError(error)
        ) {
          return
        }
        setResults([])
        setStatus('error')
      },
    )
    return () => controller.abort()
  }, [base, open, query, searchClient])

  const handleQueryChange = (nextQuery: string): void => {
    setQuery(nextQuery)
    setResults([])
    setStatus(nextQuery.trim() ? 'loading' : 'idle')
    setNavigationError(false)
  }

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      requestSequence.current += 1
      setQuery('')
      setResults([])
      setStatus('idle')
      setNavigationError(false)
      window.setTimeout(() => returnFocus.current?.focus(), 0)
    }
    onOpenChange(nextOpen)
  }

  const selectResult = async (result: SearchResult): Promise<void> => {
    setNavigationError(false)
    try {
      await router.go(resolveThemeLink(result.route, base))
      handleOpenChange(false)
    } catch {
      setNavigationError(true)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="top-1/3 translate-y-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton={false}
        onOpenAutoFocus={() => {
          returnFocus.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null
        }}
        onCloseAutoFocus={(event) => {
          if (!returnFocus.current) return
          event.preventDefault()
          returnFocus.current.focus()
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Search documentation</DialogTitle>
          <DialogDescription>
            Search all public documentation pages.
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} label="Search documentation">
          <CommandInput
            value={query}
            onValueChange={handleQueryChange}
            placeholder="Search documentation"
            aria-label="Search documentation"
          />
          <CommandList aria-busy={status === 'loading'}>
            {status === 'idle' ? (
              <CommandEmpty>Type to search documentation.</CommandEmpty>
            ) : null}
            {status === 'loading' ? (
              <CommandEmpty>Searching documentation…</CommandEmpty>
            ) : null}
            {status === 'empty' ? (
              <CommandEmpty>No results found.</CommandEmpty>
            ) : null}
            {status === 'error' ? (
              <CommandEmpty>Search is temporarily unavailable.</CommandEmpty>
            ) : null}
            {navigationError ? (
              <p role="status" className="px-3 py-2 text-sm text-destructive">
                Unable to open this result.
              </p>
            ) : null}
            {results.length ? (
              <CommandGroup heading="Documentation">
                {results.map((result) => (
                  <CommandItem
                    key={result.id}
                    value={result.id}
                    onSelect={() => void selectResult(result)}
                    className="items-start"
                  >
                    <span className="min-w-0 space-y-1">
                      <span className="block font-medium">{result.title}</span>
                      {result.heading ? (
                        <span className="block text-xs text-muted-foreground">
                          {result.heading}
                        </span>
                      ) : null}
                      <span
                        className="line-clamp-2 block text-xs text-muted-foreground [&_mark]:rounded-sm [&_mark]:bg-accent [&_mark]:px-0.5 [&_mark]:text-accent-foreground"
                        dangerouslySetInnerHTML={{ __html: result.snippet }}
                      />
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
