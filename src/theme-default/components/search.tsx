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

function searchResultLocation(result: SearchResult): {
  path: string
  context?: string
} {
  const [pathname = '', hash] = result.route.split('#', 2)
  const path = pathname.replace(/^\/+/, '').replace(/\/+$/, '') || 'Home'
  const context = result.heading ?? hash
  return {
    path,
    ...(context === undefined ? {} : { context }),
  }
}

function searchResultLabel(result: SearchResult): string {
  const location = searchResultLocation(result)
  return [result.title, location.context, location.path]
    .filter(Boolean)
    .join(', ')
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
        className="top-[12vh] max-h-[80vh] translate-y-0 overflow-hidden p-0 sm:max-w-2xl"
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
          <CommandList
            aria-busy={status === 'loading'}
            className="max-h-[min(62vh,28rem)] scroll-py-2 px-2 pb-2"
          >
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
              <CommandGroup
                heading="Documentation"
                className="p-0! pt-2 **:[[cmdk-group-heading]]:px-1 **:[[cmdk-group-heading]]:pb-2 **:[[cmdk-group-heading]]:pt-0 **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wide"
              >
                {results.map((result) => {
                  const location = searchResultLocation(result)
                  return (
                    <CommandItem
                      key={result.id}
                      value={result.id}
                      aria-label={searchResultLabel(result)}
                      onSelect={() => void selectResult(result)}
                      className="cursor-pointer items-start gap-3 border-b border-border/60 bg-transparent px-3 py-2.5 text-left transition-colors duration-150 in-data-[slot=dialog-content]:rounded-none! last:border-b-0 hover:bg-accent/60 data-selected:bg-accent data-selected:text-accent-foreground [&>svg:last-child]:hidden"
                    >
                      <span className="grid min-w-0 flex-1 gap-1">
                        <span className="flex min-w-0 items-start gap-3">
                          <span className="truncate text-sm font-semibold leading-5 text-foreground">
                            {result.title}
                          </span>
                          <span className="ml-auto flex max-w-[45%] shrink-0 flex-wrap justify-end gap-x-1.5 gap-y-0.5 text-right text-[0.72rem] font-medium leading-4 text-muted-foreground">
                            <span className="truncate">{location.path}</span>
                            {location.context ? (
                              <span className="truncate">
                                {location.context}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span
                          className="line-clamp-2 block text-[0.8rem] leading-5 text-muted-foreground [&_mark]:rounded-sm [&_mark]:bg-primary/12 [&_mark]:px-0.5 [&_mark]:font-medium [&_mark]:text-primary"
                          dangerouslySetInnerHTML={{ __html: result.snippet }}
                        />
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
