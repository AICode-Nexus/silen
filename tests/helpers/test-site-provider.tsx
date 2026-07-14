import type { ReactNode } from 'react'
import {
  DataProvider,
  RouterProvider,
  type PagePublicData,
  type Router,
} from '../../src/client'
import type { Heading } from '../../src/shared/page'
import type { ThemeConfig } from '../../src/shared/config'

const defaultThemeConfig: ThemeConfig = {
  nav: [{ text: 'API', link: '/api/' }],
  sidebar: [
    {
      text: 'Documentation',
      items: [
        { text: 'Guide', link: '/guide/' },
        { text: 'Advanced', link: '/guide/advanced/' },
      ],
    },
  ],
}

interface TestSiteProviderProps {
  base?: string
  children: ReactNode
  headings?: readonly Heading[]
  path?: string
  siteTitle?: string
  themeConfig?: ThemeConfig
}

export function TestSiteProvider({
  base = '/',
  children,
  headings = [
    { depth: 2, title: 'Install', slug: 'install' },
    { depth: 3, title: 'Options', slug: 'options' },
  ],
  path = '/guide/',
  siteTitle = 'Silen Docs',
  themeConfig = defaultThemeConfig,
}: TestSiteProviderProps): React.JSX.Element {
  const router: Router = {
    path,
    base,
    go: () => Promise.resolve(),
    prefetch: () => Promise.resolve(),
  }
  const data: PagePublicData = {
    siteTitle,
    lang: 'en-US',
    base,
    route: path,
    headings,
    themeConfig,
  }

  return (
    <DataProvider value={data}>
      <RouterProvider value={router}>{children}</RouterProvider>
    </DataProvider>
  )
}
