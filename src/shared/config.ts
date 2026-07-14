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

export interface ThemeConfig {
  readonly logo?: string | ThemeLogo
  readonly nav?: readonly ThemeNavItem[]
  readonly sidebar?: readonly ThemeSidebarGroup[]
  readonly search?: boolean
}

export interface UserConfig {
  title?: string
  description?: string
  lang?: string
  base?: string
  outDir?: string
  onBrokenLinks?: 'error' | 'warn' | 'ignore'
  themeConfig?: ThemeConfig
}

export interface ResolvedConfig extends Required<UserConfig> {
  command: 'serve' | 'build'
  root: string
  configFile: string
}
