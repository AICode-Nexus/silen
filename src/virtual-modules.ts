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
    title: string
    description: string
    data: JsonObject
  }

  export type RouteLoader = () => Promise<PageModule>
  const routes: Readonly<Record<string, RouteLoader>>
  export { routes }
  export default routes
}

declare module 'virtual:silen/client-extensions' {
  import type { ComponentType, PropsWithChildren } from 'react'

  export interface ClientExtension {
    readonly wrapRoot?: ComponentType<PropsWithChildren>
    readonly setup?: (context: { readonly base: string }) => void | (() => void)
  }

  export const clientExtensions: readonly ClientExtension[]
  export default clientExtensions
}

declare module 'virtual:silen/config' {
  interface AiArtifactConfig {
    readonly llmsTxt: boolean
    readonly llmsFullTxt: boolean
    readonly markdownRoutes: boolean
    readonly index: boolean
  }

  interface AnalyticsScript {
    readonly src?: string
    readonly content?: string
    readonly async?: boolean
    readonly defer?: boolean
    readonly attributes?: Readonly<Record<string, string | boolean>>
  }

  interface GoogleAnalyticsProvider {
    readonly provider: 'google'
    readonly id: string
  }

  interface BaiduAnalyticsProvider {
    readonly provider: 'baidu'
    readonly id: string
  }

  interface CustomAnalyticsProvider {
    readonly provider: 'custom'
    readonly name?: string
    readonly scripts: readonly AnalyticsScript[]
  }

  type AnalyticsProvider =
    GoogleAnalyticsProvider | BaiduAnalyticsProvider | CustomAnalyticsProvider

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
    readonly darkSrc?: string
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

  interface ThemeNavigationMessages {
    readonly skipToContent: string
    readonly mainNavigation: string
    readonly language: string
    readonly languageCurrent: string
    readonly close: string
    readonly features: string
    readonly featureLink: string
  }

  interface ThemeSearchMessages {
    readonly button: string
    readonly commandPalette: string
    readonly commandDescription: string
    readonly dialogTitle: string
    readonly dialogDescription: string
    readonly placeholder: string
    readonly prompt: string
    readonly searching: string
    readonly noResults: string
    readonly unavailable: string
    readonly unableToOpen: string
    readonly documentation: string
    readonly otherLanguages: string
    readonly home: string
  }

  interface ThemeAppearanceMessages {
    readonly label: string
    readonly option: string
    readonly system: string
    readonly light: string
    readonly dark: string
  }

  interface ThemeSidebarMessages {
    readonly main: string
    readonly documentation: string
    readonly openNavigation: string
    readonly dialogTitle: string
    readonly dialogDescription: string
    readonly mobileNavigation: string
  }

  interface ThemeOutlineMessages {
    readonly onThisPage: string
  }

  interface ThemePaginationMessages {
    readonly navigation: string
    readonly previous: string
    readonly next: string
    readonly linkLabel: string
    readonly pageLabel: string
  }

  interface ThemeCopyMessages {
    readonly group: string
    readonly copy: string
    readonly copyThisPage: string
    readonly copyMarkdown: string
    readonly copyForAi: string
    readonly preparingAi: string
    readonly copyingMarkdown: string
    readonly aiCopied: string
    readonly markdownCopied: string
    readonly fetchError: string
    readonly clipboardError: string
    readonly copyCode: string
    readonly codeCopied: string
    readonly copied: string
    readonly copyFailed: string
  }

  interface ThemeNotFoundMessages {
    readonly title: string
    readonly description: string
    readonly returnHome: string
  }

  interface ThemeAskAiMessages {
    readonly button: string
    readonly loading: string
    readonly title: string
    readonly description: string
    readonly question: string
    readonly submit: string
    readonly unableToAnswer: string
    readonly providerFailure: string
    readonly generating: string
    readonly ready: string
  }

  interface ThemeMessagesOverrides {
    readonly navigation?: Partial<ThemeNavigationMessages>
    readonly search?: Partial<ThemeSearchMessages>
    readonly appearance?: Partial<ThemeAppearanceMessages>
    readonly sidebar?: Partial<ThemeSidebarMessages>
    readonly outline?: Partial<ThemeOutlineMessages>
    readonly pagination?: Partial<ThemePaginationMessages>
    readonly copy?: Partial<ThemeCopyMessages>
    readonly notFound?: Partial<ThemeNotFoundMessages>
    readonly askAi?: Partial<ThemeAskAiMessages>
  }

  interface ThemeLocaleItem {
    readonly lang: string
    readonly label: string
    readonly root?: string
    readonly link?: string
    readonly messages?: ThemeMessagesOverrides
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
    siteUrl?: string
    ai: AiArtifactConfig
    analytics: readonly AnalyticsProvider[]
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
