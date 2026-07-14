import { Link, useData, useRoute } from '../../client/index.js'
import { cn } from '../lib/cn.js'
import { isActiveThemeLink, resolveThemeLink } from '../lib/navigation.js'
import { AppearanceSwitch } from './appearance.js'
import { MobileSidebar } from './sidebar.js'

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
        <AppearanceSwitch />
        <MobileSidebar />
      </nav>
    </header>
  )
}
