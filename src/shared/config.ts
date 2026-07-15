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

export interface UserConfig {
  title?: string
  description?: string
  lang?: string
  base?: string
  outDir?: string
  onBrokenLinks?: 'error' | 'warn' | 'ignore'
  themeConfig?: ThemeConfig
  ai?: Partial<AiArtifactConfig>
}

export interface ResolvedConfig extends Required<Omit<UserConfig, 'ai'>> {
  ai: AiArtifactConfig
  command: 'serve' | 'build'
  root: string
  configFile: string
}
