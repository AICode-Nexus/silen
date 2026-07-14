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

  interface ThemeSocialLink {
    readonly icon: string
    readonly link: string
    readonly ariaLabel?: string
  }

  type ThemeLinkTarget = '_blank' | '_parent' | '_self' | '_top'

  interface ThemeHomeAction {
    readonly text: string
    readonly link: string
    readonly theme?: 'brand' | 'alt'
    readonly target?: ThemeLinkTarget
    readonly rel?: string
  }

  interface ThemeHomeImage {
    readonly src: string
    readonly alt: string
  }

  interface ThemeHomeHero {
    readonly name: string
    readonly text?: string
    readonly tagline?: string
    readonly image?: string | ThemeHomeImage
    readonly actions?: readonly ThemeHomeAction[]
  }

  interface ThemeHomeFeature {
    readonly icon?: string
    readonly title: string
    readonly details: string
    readonly link?: string
    readonly linkText?: string
    readonly target?: ThemeLinkTarget
    readonly rel?: string
  }

  interface ThemeHomeConfig {
    readonly hero: ThemeHomeHero
    readonly features?: readonly ThemeHomeFeature[]
  }

  interface ThemeConfig {
    readonly logo?: string | ThemeLogo
    readonly nav?: readonly ThemeNavItem[]
    readonly sidebar?: readonly ThemeSidebarGroup[]
    readonly socialLinks?: readonly ThemeSocialLink[]
    readonly search?: boolean
    readonly home?: ThemeHomeConfig
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
  export type ContentLayoutName = 'doc' | 'home' | 'page'
  export type ThemeMdxComponent =
    ComponentType<never> | keyof React.JSX.IntrinsicElements
  export type ThemeMdxComponents = Readonly<Record<string, ThemeMdxComponent>>

  export interface Theme {
    Layout: LayoutComponent
    layouts?: Readonly<Record<ContentLayoutName, LayoutComponent>>
    NotFound?: ComponentType
    components?: ThemeMdxComponents
  }

  export const Layout: LayoutComponent
  const theme: Theme
  export default theme
}
