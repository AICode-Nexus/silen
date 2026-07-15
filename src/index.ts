// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./virtual-modules.ts" preserve="true" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./mdx-types.ts" preserve="true" />

import type { UserConfig } from './shared/config.js'
import type { SilenPluginFactory } from './shared/plugin.js'

export function defineConfig<const T extends UserConfig>(config: T): T {
  return config
}

export function definePlugin<Options = undefined>(
  plugin: SilenPluginFactory<Options>,
): SilenPluginFactory<Options> {
  return plugin
}

export type {
  AiArtifactConfig,
  AnalyticsProvider,
  AnalyticsScript,
  BaiduAnalyticsProvider,
  CustomAnalyticsProvider,
  GoogleAnalyticsProvider,
  UserConfig,
} from './shared/config.js'
export type {
  ThemeConfig,
  ThemeAiConfig,
  ThemeHomeAction,
  ThemeHomeConfig,
  ThemeHomeFeature,
  ThemeHomeHero,
  ThemeHomeImage,
  ThemeLinkTarget,
  ThemeLogo,
  ThemeLocaleItem,
  ThemeNavItem,
  ThemeSidebarGroup,
  ThemeSidebarItem,
  ThemeSocialLink,
} from './shared/config.js'
export type { Heading } from './shared/page.js'
export type {
  Awaitable,
  ResolvedSilenPlugin,
  SilenBuildEndContext,
  SilenClientContext,
  SilenClientExtension,
  SilenConfigPatch,
  SilenHeadAttribute,
  SilenHeadEntry,
  SilenMdxExtensions,
  SilenPageContext,
  SilenPageData,
  SilenPageDataPatch,
  SilenPlugin,
  SilenPluginEntry,
  SilenPluginFactory,
  SilenPluginFactoryContext,
  SilenVitePluginOption,
} from './shared/plugin.js'
