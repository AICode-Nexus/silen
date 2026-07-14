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
  interface ThemeNavItem {
    readonly text: string
    readonly link: string
  }

  interface ThemeSidebarItem {
    readonly text: string
    readonly link: string
  }

  interface ThemeSidebarGroup {
    readonly text: string
    readonly collapsed?: boolean
    readonly items: readonly ThemeSidebarItem[]
  }

  interface ThemeLogo {
    readonly src: string
    readonly alt?: string
  }

  interface ThemeConfig {
    readonly logo?: string | ThemeLogo
    readonly nav?: readonly ThemeNavItem[]
    readonly sidebar?: readonly ThemeSidebarGroup[]
    readonly search?: boolean
  }

  export interface VirtualConfig {
    title: string
    description: string
    lang: string
    base: string
    themeConfig: ThemeConfig
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
