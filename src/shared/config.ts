import type { ResolvedSilenPlugin, SilenPluginEntry } from './plugin.js'

export interface ThemeNavItem {
  readonly text: string
  readonly link: string
}

export interface ThemeSidebarItem {
  readonly text: string
  readonly link: string
}

export interface ThemeSidebarGroup {
  readonly text: string
  readonly collapsed?: boolean
  readonly items: readonly ThemeSidebarItem[]
}

export interface ThemeLogo {
  readonly src: string
  readonly alt?: string
}

export interface ThemeSocialLink {
  readonly icon: string
  readonly link: string
  readonly ariaLabel?: string
}

export type ThemeLinkTarget = '_blank' | '_parent' | '_self' | '_top'

export interface ThemeHomeAction {
  readonly text: string
  readonly link: string
  readonly theme?: 'brand' | 'alt'
  readonly target?: ThemeLinkTarget
  readonly rel?: string
}

export interface ThemeHomeImage {
  readonly src: string
  readonly alt: string
}

export interface ThemeHomeHero {
  readonly name: string
  readonly text?: string
  readonly tagline?: string
  readonly image?: string | ThemeHomeImage
  readonly actions?: readonly ThemeHomeAction[]
}

export interface ThemeHomeFeature {
  readonly icon?: string
  readonly title: string
  readonly details: string
  readonly link?: string
  readonly linkText?: string
  readonly target?: ThemeLinkTarget
  readonly rel?: string
}

export interface ThemeHomeConfig {
  readonly hero: ThemeHomeHero
  readonly features?: readonly ThemeHomeFeature[]
}

export interface ThemeLocaleItem {
  readonly lang: string
  readonly label: string
  readonly root?: string
  readonly link?: string
  readonly nav?: readonly ThemeNavItem[]
  readonly sidebar?: readonly ThemeSidebarGroup[]
  readonly home?: ThemeHomeConfig
}

export interface ThemeAiConfig {
  readonly endpoint: string
}

export interface ThemeConfig {
  readonly logo?: string | ThemeLogo
  readonly nav?: readonly ThemeNavItem[]
  readonly sidebar?: readonly ThemeSidebarGroup[]
  readonly socialLinks?: readonly ThemeSocialLink[]
  readonly locales?: readonly ThemeLocaleItem[]
  readonly search?: boolean
  readonly ai?: ThemeAiConfig
  readonly home?: ThemeHomeConfig
}

export interface AiArtifactConfig {
  readonly llmsTxt: boolean
  readonly llmsFullTxt: boolean
  readonly markdownRoutes: boolean
  readonly index: boolean
}

export interface AiContractConfig {
  readonly enabled?: boolean
  readonly instructions?: string
  readonly tasksDir?: string
}

export interface UserAiConfig extends Partial<AiArtifactConfig> {
  readonly contract?: AiContractConfig
}

export interface ResolvedAiContractConfig {
  readonly enabled: boolean
  readonly instructions?: string | undefined
  readonly tasksDir?: string | undefined
}

export interface ResolvedAiConfig extends AiArtifactConfig {
  readonly contract: ResolvedAiContractConfig
}

export interface AnalyticsScript {
  readonly src?: string | undefined
  readonly content?: string | undefined
  readonly async?: boolean | undefined
  readonly defer?: boolean | undefined
  readonly attributes?: Readonly<Record<string, string | boolean>> | undefined
}

interface AnalyticsProviderBase {
  readonly enabled?: boolean | undefined
}

export interface GoogleAnalyticsProvider extends AnalyticsProviderBase {
  readonly provider: 'google'
  readonly id: string
}

export interface BaiduAnalyticsProvider extends AnalyticsProviderBase {
  readonly provider: 'baidu'
  readonly id: string
}

export interface CustomAnalyticsProvider extends AnalyticsProviderBase {
  readonly provider: 'custom'
  readonly name?: string | undefined
  readonly scripts: readonly AnalyticsScript[]
}

export type AnalyticsProvider =
  GoogleAnalyticsProvider | BaiduAnalyticsProvider | CustomAnalyticsProvider

export interface UserConfig {
  title?: string
  description?: string
  lang?: string
  base?: string
  outDir?: string
  onBrokenLinks?: 'error' | 'warn' | 'ignore'
  themeConfig?: ThemeConfig
  analytics?: readonly AnalyticsProvider[]
  plugins?: readonly SilenPluginEntry[]
  ai?: UserAiConfig
}

export interface ResolvedConfig extends Required<
  Omit<UserConfig, 'ai' | 'plugins'>
> {
  ai: ResolvedAiConfig
  plugins?: readonly ResolvedSilenPlugin[]
  command: 'serve' | 'build'
  root: string
  configFile: string
}
