import { SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useData, useRoute } from '../../client/index.js'
import { cn } from '../lib/cn.js'
import { isActiveThemeLink, resolveThemeLink } from '../lib/navigation.js'
import { AppearanceSwitch } from './appearance.js'
import { Button } from './ui/button.js'
import { MobileSidebar } from './sidebar.js'

type SearchDialogComponent = (typeof import('./search.js'))['SearchDialog']

let searchDialogModule: Promise<SearchDialogComponent> | undefined

function loadSearchDialog(): Promise<SearchDialogComponent> {
  searchDialogModule ??= import('./search.js')
    .then((module) => module.SearchDialog)
    .catch((error: unknown) => {
      searchDialogModule = undefined
      throw error
    })
  return searchDialogModule
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return (
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
    ) !== null
  )
}

function SearchLauncher(): React.JSX.Element {
  const [SearchDialog, setSearchDialog] =
    useState<SearchDialogComponent | null>(null)
  const [open, setOpen] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const mounted = useRef(true)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    return () => {
      mounted.current = false
    }
  }, [])

  const openSearch = useCallback((): void => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setLoadFailed(false)
    void loadSearchDialog().then(
      (Dialog) => {
        if (!mounted.current) return
        setSearchDialog(() => Dialog)
        setOpen(true)
      },
      () => {
        if (mounted.current) setLoadFailed(true)
      },
    )
  }, [])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        event.key.toLocaleLowerCase() !== 'k' ||
        (!event.metaKey && !event.ctrlKey) ||
        isEditableTarget(event.target)
      ) {
        return
      }
      event.preventDefault()
      openSearch()
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [openSearch])

  const handleOpenChange = (nextOpen: boolean): void => {
    setOpen(nextOpen)
    if (!nextOpen) {
      window.setTimeout(() => returnFocus.current?.focus(), 0)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Search documentation"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openSearch}
      >
        <SearchIcon data-icon="inline-start" />
        <span className="hidden sm:inline">Search</span>
        <kbd className="hidden text-[0.65rem] text-muted-foreground lg:inline">
          ⌘K
        </kbd>
      </Button>
      {loadFailed ? (
        <span role="status" className="sr-only">
          Search is temporarily unavailable.
        </span>
      ) : null}
      {SearchDialog ? (
        <SearchDialog open={open} onOpenChange={handleOpenChange} />
      ) : null}
    </>
  )
}

export function Nav(): React.JSX.Element {
  const { base, siteTitle, themeConfig } = useData()
  const currentRoute = useRoute()
  const logo = themeConfig?.logo
  const logoSource = typeof logo === 'string' ? logo : logo?.src
  return (
    <header className="sticky top-0 z-40 h-[var(--silen-nav-height)] border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-full max-w-[var(--silen-layout-width)] items-center gap-4 px-4 sm:px-6"
      >
        <Link
          href={resolveThemeLink('/', base)}
          className="mr-auto flex min-w-0 items-center gap-2 rounded-md font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {logoSource ? (
            <img
              src={resolveThemeLink(logoSource, base)}
              alt=""
              aria-hidden="true"
              className="size-7 object-contain"
            />
          ) : null}
          <span className="truncate">{siteTitle}</span>
        </Link>
        <ul className="hidden items-center gap-1 md:flex">
          {(themeConfig?.nav ?? []).map((item) => {
            const active = isActiveThemeLink(currentRoute, item.link, base)
            return (
              <li key={`${item.text}:${item.link}`}>
                <Link
                  href={resolveThemeLink(item.link, base)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2',
                    active && 'font-medium text-foreground',
                  )}
                >
                  {item.text}
                </Link>
              </li>
            )
          })}
        </ul>
        {themeConfig?.search === false ? null : <SearchLauncher />}
        <AppearanceSwitch />
        <MobileSidebar />
      </nav>
    </header>
  )
}
