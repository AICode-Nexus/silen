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
  interface AiArtifactConfig {
    readonly llmsTxt: boolean
    readonly llmsFullTxt: boolean
    readonly markdownRoutes: boolean
    readonly index: boolean
  }

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

  interface ThemeLocaleItem {
    readonly lang: string
    readonly label: string
    readonly root?: string
    readonly link?: string
    readonly nav?: readonly ThemeNavItem[]
    readonly sidebar?: readonly ThemeSidebarGroup[]
    readonly home?: ThemeHomeConfig
  }

  interface ThemeAiConfig {
    readonly endpoint: string
  }

  interface ThemeConfig {
    readonly logo?: string | ThemeLogo
    readonly nav?: readonly ThemeNavItem[]
    readonly sidebar?: readonly ThemeSidebarGroup[]
    readonly socialLinks?: readonly ThemeSocialLink[]
    readonly locales?: readonly ThemeLocaleItem[]
    readonly search?: boolean
    readonly ai?: ThemeAiConfig
    readonly home?: ThemeHomeConfig
  }

  export interface VirtualConfig {
    title: string
    description: string
    lang: string
    base: string
    ai: AiArtifactConfig
    themeConfig: ThemeConfig
  }

  const config: VirtualConfig
  export { config }
  export default config
}

declare module 'virtual:silen/theme' {
  import type { ComponentType, ElementType, ReactNode } from 'react'

  export type LayoutComponent = ComponentType<{ children: ReactNode }>
  export type ContentLayoutName = 'doc' | 'home' | 'page'
  export type ThemeMdxComponents = Readonly<Record<string, ElementType>>

  export interface Theme {
    Layout: LayoutComponent
    layouts?: Readonly<Record<ContentLayoutName, LayoutComponent>>
    NotFound?: ComponentType
    components?: ThemeMdxComponents
    wrapRoot?: LayoutComponent
  }

  export const Layout: LayoutComponent
  const theme: Theme
  export default theme
}

declare module 'virtual:silen/ask-ai' {
  import type { ComponentType } from 'react'

  export interface EndpointAskAiDialogProps {
    readonly endpoint: string
    readonly open: boolean
    readonly onOpenChange: (open: boolean) => void
  }

  export type AskAiDialogLoader = () => Promise<{
    default: ComponentType<EndpointAskAiDialogProps>
  }>

  export const loadAskAiDialog: AskAiDialogLoader | undefined
}
