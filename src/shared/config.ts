export interface UserConfig {
  title?: string
  description?: string
  lang?: string
  base?: string
  outDir?: string
  onBrokenLinks?: 'error' | 'warn' | 'ignore'
}

export interface ResolvedConfig extends Required<UserConfig> {
  command: 'serve' | 'build'
  root: string
  configFile: string
}
