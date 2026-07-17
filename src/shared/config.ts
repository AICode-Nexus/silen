import type { ResolvedSilenPlugin, SilenPluginEntry } from './plugin.js'

export interface ResolvedThemeLocale {
  readonly lang: string
  readonly label: string
  readonly root: string
  readonly locale?: ThemeLocaleItem
}

function normalizedLocaleBase(base: string): string {
  if (!base || base === '/') return '/'
  const leading = base.startsWith('/') ? base : `/${base}`
  return leading.endsWith('/') ? leading : `${leading}/`
}

function localePathname(value: string): string | undefined {
  try {
    return new URL(value, 'https://silen.local').pathname
  } catch {
    return undefined
  }
}

function normalizedLocaleRoot(root: string): string {
  const parsed = localePathname(root) ?? '/'
  if (parsed === '/') return '/'
  return parsed.endsWith('/') ? parsed : `${parsed}/`
}

function routeWithoutBase(route: string, base: string): string {
  const pathname = localePathname(route) ?? '/'
  const normalizedBase = normalizedLocaleBase(base)
  if (normalizedBase === '/') return pathname
  const baseWithoutSlash = normalizedBase.slice(0, -1)
  if (pathname === baseWithoutSlash) return '/'
  return pathname.startsWith(normalizedBase)
    ? `/${pathname.slice(normalizedBase.length)}`
    : pathname
}

function routeWithinRoot(route: string, root: string): boolean {
  return root === '/' || route === root.slice(0, -1) || route.startsWith(root)
}

export function resolveCurrentLocale(
  locales: readonly ThemeLocaleItem[] | undefined,
  currentRoute: string,
  base: string,
  fallbackLang: string,
): ResolvedThemeLocale {
  const route = routeWithoutBase(currentRoute, base)
  const rooted = (locales ?? [])
    .flatMap((locale) =>
      locale.root === undefined
        ? []
        : [{ locale, root: normalizedLocaleRoot(locale.root) }],
    )
    .filter(({ root }) => routeWithinRoot(route, root))
    .sort((left, right) => right.root.length - left.root.length)[0]
  if (rooted) {
    return {
      lang: rooted.locale.lang,
      label: rooted.locale.label,
      root: rooted.root,
      locale: rooted.locale,
    }
  }

  const linked = (locales ?? []).find((locale) => {
    if (locale.link === undefined) return false
    const target = localePathname(locale.link)
    if (target === undefined) return false
    const normalizedTarget =
      target === '/' || !target.endsWith('/') ? target : target.slice(0, -1)
    const normalizedRoute =
      route === '/' || !route.endsWith('/') ? route : route.slice(0, -1)
    return normalizedTarget === normalizedRoute
  })
  if (linked) {
    return {
      lang: linked.lang,
      label: linked.label,
      root: normalizedLocaleRoot(linked.link ?? '/'),
      locale: linked,
    }
  }

  return { lang: fallbackLang, label: fallbackLang, root: '/' }
}

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

export interface ThemeNavigationMessages {
  readonly skipToContent: string
  readonly mainNavigation: string
  readonly language: string
  readonly languageCurrent: string
  readonly close: string
  readonly features: string
}

export interface ThemeSearchMessages {
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

export interface ThemeAppearanceMessages {
  readonly label: string
  readonly option: string
  readonly system: string
  readonly light: string
  readonly dark: string
}

export interface ThemeSidebarMessages {
  readonly main: string
  readonly documentation: string
  readonly openNavigation: string
  readonly dialogTitle: string
  readonly dialogDescription: string
  readonly mobileNavigation: string
}

export interface ThemeOutlineMessages {
  readonly onThisPage: string
}

export interface ThemePaginationMessages {
  readonly navigation: string
  readonly previous: string
  readonly next: string
  readonly linkLabel: string
  readonly pageLabel: string
}

export interface ThemeCopyMessages {
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

export interface ThemeNotFoundMessages {
  readonly title: string
  readonly description: string
  readonly returnHome: string
}

export interface ThemeAskAiMessages {
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

export interface ThemeMessages {
  readonly navigation: ThemeNavigationMessages
  readonly search: ThemeSearchMessages
  readonly appearance: ThemeAppearanceMessages
  readonly sidebar: ThemeSidebarMessages
  readonly outline: ThemeOutlineMessages
  readonly pagination: ThemePaginationMessages
  readonly copy: ThemeCopyMessages
  readonly notFound: ThemeNotFoundMessages
  readonly askAi: ThemeAskAiMessages
}

export interface ThemeMessagesOverrides {
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

export interface ThemeLocaleItem {
  readonly lang: string
  readonly label: string
  readonly root?: string
  readonly link?: string
  readonly messages?: ThemeMessagesOverrides
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
  siteUrl?: string
  outDir?: string
  onBrokenLinks?: 'error' | 'warn' | 'ignore'
  themeConfig?: ThemeConfig
  analytics?: readonly AnalyticsProvider[]
  plugins?: readonly SilenPluginEntry[]
  ai?: UserAiConfig
}

export interface ResolvedConfig extends Required<
  Omit<UserConfig, 'ai' | 'plugins' | 'siteUrl'>
> {
  siteUrl?: string
  ai: ResolvedAiConfig
  plugins?: readonly ResolvedSilenPlugin[]
  command: 'serve' | 'build'
  root: string
  configFile: string
}
