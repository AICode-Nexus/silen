import type { UserConfig } from './shared/config.js'

export function defineConfig<const T extends UserConfig>(config: T): T {
  return config
}

export type { UserConfig } from './shared/config.js'
