declare module 'virtual:silen/routes' {
  import type { ComponentType } from 'react'

  type JsonPrimitive = string | number | boolean | null
  type JsonValue =
    JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[]
  type JsonObject = { readonly [key: string]: JsonValue }

  interface Heading {
    depth: number
    title: string
    slug: string
  }

  export interface PageModule {
    default: ComponentType
    frontmatter: JsonObject
    headings: readonly Heading[]
    links: readonly string[]
  }

  export type RouteLoader = () => Promise<PageModule>
  const routes: Readonly<Record<string, RouteLoader>>
  export { routes }
  export default routes
}

declare module 'virtual:silen/config' {
  export interface VirtualConfig {
    title: string
    description: string
    lang: string
    base: string
    outDir: string
    onBrokenLinks: 'error' | 'warn' | 'ignore'
    command: 'serve' | 'build'
    root: string
    configFile: string
  }

  const config: VirtualConfig
  export { config }
  export default config
}

declare module 'virtual:silen/theme' {
  import type { ComponentType, ReactNode } from 'react'

  export type LayoutComponent = ComponentType<{ children: ReactNode }>

  export interface Theme {
    Layout: LayoutComponent
  }

  export const Layout: LayoutComponent
  const theme: Theme
  export default theme
}
