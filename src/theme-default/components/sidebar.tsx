import { useRef, useState } from 'react'
import { ChevronDownIcon, MenuIcon } from 'lucide-react'
import { Link, useData, useRoute } from '../../client/index.js'
import type {
  ThemeNavItem,
  ThemeSidebarGroup,
  ThemeSidebarItem,
} from '../../shared/config.js'
import { cn } from '../lib/cn.js'
import { isActiveThemeLink, resolveThemeLink } from '../lib/navigation.js'
import { Button } from './ui/button.js'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible.js'
import { ScrollArea } from './ui/scroll-area.js'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from './ui/sheet.js'

interface NavigationLinkProps {
  readonly base: string
  readonly currentRoute: string
  readonly item: ThemeNavItem | ThemeSidebarItem
  readonly onNavigate?: (() => void) | undefined
}

function NavigationLink({
  base,
  currentRoute,
  item,
  onNavigate,
}: NavigationLinkProps): React.JSX.Element {
  const active = isActiveThemeLink(currentRoute, item.link, base)
  return (
    <Link
      href={resolveThemeLink(item.link, base)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2',
        active && 'bg-muted font-medium text-foreground',
      )}
      onClick={onNavigate}
    >
      {item.text}
    </Link>
  )
}

interface SidebarGroupProps {
  readonly base: string
  readonly currentRoute: string
  readonly group: ThemeSidebarGroup
  readonly onNavigate?: (() => void) | undefined
}

function SidebarGroup({
  base,
  currentRoute,
  group,
  onNavigate,
}: SidebarGroupProps): React.JSX.Element {
  const containsActiveLink = group.items.some((item) =>
    isActiveThemeLink(currentRoute, item.link, base),
  )
  return (
    <Collapsible
      key={`${group.text}:${containsActiveLink}`}
      defaultOpen={containsActiveLink || group.collapsed !== true}
      className="flex flex-col gap-1"
    >
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-between px-3 text-left"
        >
          {group.text}
          <ChevronDownIcon
            aria-hidden="true"
            className="transition-transform group-data-[state=closed]/button:-rotate-90 motion-reduce:transition-none"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex flex-col gap-0.5">
          {group.items.map((item) => (
            <li key={`${item.text}:${item.link}`}>
              <NavigationLink
                base={base}
                currentRoute={currentRoute}
                item={item}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

function SidebarNavigation({
  includeMainNavigation = false,
  onNavigate,
}: {
  readonly includeMainNavigation?: boolean
  readonly onNavigate?: (() => void) | undefined
}): React.JSX.Element {
  const { base, themeConfig } = useData()
  const currentRoute = useRoute()
  const nav = themeConfig?.nav ?? []
  const groups = themeConfig?.sidebar ?? []

  return (
    <div className="flex flex-col gap-5 p-4">
      {includeMainNavigation && nav.length > 0 ? (
        <section aria-labelledby="mobile-main-navigation">
          <h2
            id="mobile-main-navigation"
            className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Main
          </h2>
          <ul className="flex flex-col gap-0.5">
            {nav.map((item) => (
              <li key={`${item.text}:${item.link}`}>
                <NavigationLink
                  base={base}
                  currentRoute={currentRoute}
                  item={item}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {groups.map((group) => (
        <SidebarGroup
          key={group.text}
          base={base}
          currentRoute={currentRoute}
          group={group}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}

export function Sidebar(): React.JSX.Element {
  return (
    <aside className="sticky top-[var(--silen-nav-height)] hidden h-[calc(100svh-var(--silen-nav-height))] border-r min-[60rem]:block">
      <nav aria-label="Documentation sidebar" className="h-full">
        <ScrollArea className="h-full">
          <SidebarNavigation />
        </ScrollArea>
      </nav>
    </aside>
  )
}

export function MobileSidebar(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="min-[60rem]:hidden"
          aria-label="Open navigation"
        >
          <MenuIcon aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        ref={contentRef}
        side="left"
        className="w-[min(22rem,85vw)] p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          const target =
            contentRef.current?.querySelector<HTMLElement>(
              'a[aria-current="page"]',
            ) ??
            contentRef.current?.querySelector<HTMLElement>('a[href], button')
          target?.focus()
        }}
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle>Documentation navigation</SheetTitle>
          <SheetDescription>
            Browse the documentation sections.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <nav aria-label="Mobile documentation navigation">
            <SidebarNavigation
              includeMainNavigation
              onNavigate={() => setOpen(false)}
            />
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
