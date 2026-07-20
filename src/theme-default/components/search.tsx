import { useEffect, useRef, useState } from 'react'
import { useData, useRouter } from '../../client/index.js'
import { resolveThemeLink } from '../lib/navigation.js'
import { useThemeLocale, useThemeMessages } from '../lib/theme-config.js'
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
  options: Required<Pick<SearchOptions, 'base' | 'signal' | 'lang'>>,
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

function searchResultLocation(
  result: SearchResult,
  homeLabel: string,
): {
  path: string
  context?: string
} {
  const [pathname = '', hash] = result.route.split('#', 2)
  const path = pathname.replace(/^\/+/, '').replace(/\/+$/, '') || homeLabel
  const context = result.heading ?? hash
  return {
    path,
    ...(context === undefined ? {} : { context }),
  }
}

function searchResultLabel(result: SearchResult, homeLabel: string): string {
  const location = searchResultLocation(result, homeLabel)
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
  const messages = useThemeMessages()
  const currentLocale = useThemeLocale()
  const { themeConfig } = useData()
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
      lang: currentLocale.lang,
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
  }, [base, currentLocale.lang, open, query, searchClient])

  const currentResults = results.filter(
    (result) => result.lang === undefined || result.lang === currentLocale.lang,
  )
  const otherResults = results.filter(
    (result) => result.lang !== undefined && result.lang !== currentLocale.lang,
  )
  const localeLabel = (lang: string | undefined): string | undefined =>
    lang === undefined
      ? undefined
      : (themeConfig?.locales?.find((locale) => locale.lang === lang)?.label ??
        lang)

  const resultItems = (
    items: readonly SearchResult[],
    showLocale: boolean,
  ): React.JSX.Element[] =>
    items.map((result) => {
      const location = searchResultLocation(result, messages.search.home)
      const resultLocale = showLocale ? localeLabel(result.lang) : undefined
      return (
        <CommandItem
          key={result.id}
          value={result.id}
          aria-label={searchResultLabel(result, messages.search.home)}
          onSelect={() => void selectResult(result)}
          className="cursor-pointer items-start gap-3 border-b border-border/60 bg-transparent px-3 py-2.5 text-left transition-colors duration-150 in-data-[slot=dialog-content]:rounded-none! last:border-b-0 hover:bg-accent data-[selected=true]:bg-accent data-[selected=true]:text-foreground [&>svg:last-child]:hidden"
        >
          <span className="grid min-w-0 flex-1 gap-1">
            <span className="flex min-w-0 items-start gap-3">
              <span className="truncate text-sm font-semibold leading-5 text-foreground group-data-[selected=true]/command-item:text-primary">
                {result.title}
              </span>
              <span className="ml-auto flex max-w-[45%] shrink-0 flex-wrap justify-end gap-x-1.5 gap-y-0.5 text-right text-[0.72rem] font-medium leading-4 text-muted-foreground">
                {resultLocale ? <span>{resultLocale}</span> : null}
                <span className="truncate">{location.path}</span>
                {location.context ? (
                  <span className="truncate">{location.context}</span>
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
    })

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
          <DialogTitle>{messages.search.dialogTitle}</DialogTitle>
          <DialogDescription>
            {messages.search.dialogDescription}
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} label={messages.search.dialogTitle}>
          <CommandInput
            value={query}
            onValueChange={handleQueryChange}
            placeholder={messages.search.placeholder}
            aria-label={messages.search.dialogTitle}
          />
          <CommandList
            aria-busy={status === 'loading'}
            className="max-h-[min(62vh,28rem)] scroll-py-2 px-2 pb-2"
          >
            {status === 'idle' ? (
              <CommandEmpty>{messages.search.prompt}</CommandEmpty>
            ) : null}
            {status === 'loading' ? (
              <CommandEmpty>{messages.search.searching}</CommandEmpty>
            ) : null}
            {status === 'empty' ? (
              <CommandEmpty>{messages.search.noResults}</CommandEmpty>
            ) : null}
            {status === 'error' ? (
              <CommandEmpty>{messages.search.unavailable}</CommandEmpty>
            ) : null}
            {navigationError ? (
              <p role="status" className="px-3 py-2 text-sm text-destructive">
                {messages.search.unableToOpen}
              </p>
            ) : null}
            {currentResults.length ? (
              <CommandGroup
                heading={messages.search.documentation}
                className="p-0! pt-2! **:[[cmdk-group-heading]]:px-1 **:[[cmdk-group-heading]]:pb-2 **:[[cmdk-group-heading]]:pt-0 **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wide"
              >
                {resultItems(currentResults, false)}
              </CommandGroup>
            ) : null}
            {otherResults.length ? (
              <CommandGroup
                heading={messages.search.otherLanguages}
                className="p-0! pt-2! **:[[cmdk-group-heading]]:px-1 **:[[cmdk-group-heading]]:pb-2 **:[[cmdk-group-heading]]:pt-0 **:[[cmdk-group-heading]]:font-semibold **:[[cmdk-group-heading]]:uppercase **:[[cmdk-group-heading]]:tracking-wide"
              >
                {resultItems(otherResults, true)}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
