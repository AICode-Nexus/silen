import type { ReactNode } from 'react'
import { useData } from '../../client/index.js'
import { useThemeMessages } from '../lib/theme-config.js'
import { Nav } from './nav.js'
import { Outline } from './outline.js'
import { Sidebar } from './sidebar.js'

export function Layout({
  children,
}: {
  children: ReactNode
}): React.JSX.Element {
  const { frontmatter } = useData()
  const messages = useThemeMessages()
  const home = frontmatter?.layout === 'home'
  return (
    <div className="min-h-svh bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-3 focus:text-foreground focus:shadow-lg focus:not-sr-only"
      >
        {messages.navigation.skipToContent}
      </a>
      <Nav />
      {home ? (
        <main id="main-content" tabIndex={-1} className="min-w-0">
          {children}
        </main>
      ) : (
        <div className="mx-auto grid max-w-[var(--silen-layout-width)] min-[60rem]:grid-cols-[var(--silen-sidebar-width)_minmax(0,1fr)_14rem]">
          <Sidebar />
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full min-w-0 max-w-[var(--silen-content-width)] px-6 py-10 min-[60rem]:px-10"
          >
            {children}
          </main>
          <Outline />
        </div>
      )}
    </div>
  )
}
