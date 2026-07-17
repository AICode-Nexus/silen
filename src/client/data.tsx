import { createContext, useContext, type ReactNode } from 'react'
import type {
  AiArtifactConfig,
  AnalyticsProvider,
  ThemeConfig,
} from '../shared/config.js'
import type { Heading, JsonObject } from '../shared/page.js'

export interface PagePublicData {
  readonly siteTitle: string
  readonly lang: string
  readonly base: string
  readonly route: string
  readonly ai?: AiArtifactConfig
  readonly analytics?: readonly AnalyticsProvider[]
  readonly frontmatter?: JsonObject
  readonly headings?: readonly Heading[]
  readonly links?: readonly string[]
  readonly data?: JsonObject
  readonly themeConfig?: ThemeConfig
}

export interface DataProviderProps {
  readonly value: PagePublicData
  readonly children: ReactNode
}

const DataContext = createContext<PagePublicData | null>(null)

export function DataProvider({
  value,
  children,
}: DataProviderProps): React.JSX.Element {
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): PagePublicData {
  const data = useContext(DataContext)
  if (!data) throw new Error('useData must be used within DataProvider')
  return data
}

export function useOptionalData(): PagePublicData | undefined {
  return useContext(DataContext) ?? undefined
}
