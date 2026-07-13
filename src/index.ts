// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./virtual-modules.ts" preserve="true" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./mdx-types.ts" preserve="true" />

import type { UserConfig } from './shared/config.js'

export function defineConfig<const T extends UserConfig>(config: T): T {
  return config
}

export type { UserConfig } from './shared/config.js'
