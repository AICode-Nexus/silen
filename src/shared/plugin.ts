import type { ComponentType, PropsWithChildren } from 'react'
import type { ProcessorOptions as MdxOptions } from '@mdx-js/mdx'
import type { PluginOption } from 'vite'
import type { ResolvedConfig, UserConfig } from './config.js'
import type { Heading, JsonObject, RouteRecord } from './page.js'

export type Awaitable<Value> = Value | PromiseLike<Value>

export interface SilenPluginFactoryContext {
  readonly command: 'serve' | 'build'
  readonly root: string
  readonly configFile: string
}

export type SilenConfigPatch = Omit<Partial<UserConfig>, 'plugins'> & {
  readonly plugins?: never
}

export interface SilenMdxExtensions {
  readonly remarkPlugins?: MdxOptions['remarkPlugins']
  readonly rehypePlugins?: MdxOptions['rehypePlugins']
}

export type SilenVitePluginOption = PluginOption

export interface SilenPageData {
  readonly title: string
  readonly description: string
  readonly frontmatter: JsonObject
  readonly headings: readonly Heading[]
  readonly links: readonly string[]
  readonly data: JsonObject
}

export type SilenPageDataPatch = Partial<SilenPageData>

export interface SilenPageContext {
  readonly command: 'serve' | 'build'
  readonly route: string
  readonly file: string
  readonly source: string
}

export type SilenHeadAttribute = string | boolean

export interface SilenHeadEntry {
  readonly tag: string
  readonly attributes?: Readonly<Record<string, SilenHeadAttribute>>
  readonly children?: string
}

export interface SilenClientContext {
  readonly base: string
}

export interface SilenClientExtension {
  readonly wrapRoot?: ComponentType<PropsWithChildren>
  readonly setup?: (context: SilenClientContext) => void | (() => void)
}

export interface SilenBuildEndContext {
  readonly config: Readonly<ResolvedConfig>
  readonly routes: readonly RouteRecord[]
  readonly pages: readonly SilenPageData[]
  readonly outDir: string
}

export interface SilenPlugin {
  readonly name: string
  readonly id?: string
  readonly config?: (
    config: Readonly<UserConfig>,
    context: SilenPluginFactoryContext,
  ) => Awaitable<SilenConfigPatch | void>
  readonly configResolved?: (
    config: Readonly<ResolvedConfig>,
  ) => Awaitable<void>
  readonly extendMdx?: () => Awaitable<SilenMdxExtensions | void>
  readonly vite?: () => Awaitable<SilenVitePluginOption>
  readonly clientModules?: () => Awaitable<string | readonly string[] | void>
  readonly transformPageData?: (
    page: Readonly<SilenPageData>,
    context: SilenPageContext,
  ) => Awaitable<SilenPageDataPatch | void>
  readonly transformHead?: (
    page: Readonly<SilenPageData>,
    context: SilenPageContext,
  ) => Awaitable<readonly SilenHeadEntry[] | void>
  readonly buildEnd?: (context: SilenBuildEndContext) => Awaitable<void>
}

export type SilenPluginFactory<Options = undefined> = (
  context: SilenPluginFactoryContext,
  options: Options,
) => Awaitable<SilenPlugin>

type AnySilenPluginFactory = SilenPluginFactory<never>

export type SilenPluginEntry =
  | AnySilenPluginFactory
  | readonly [AnySilenPluginFactory, unknown]
  | false
  | null
  | undefined

export interface ResolvedSilenPlugin extends SilenPlugin {
  readonly id: string
  readonly identity: string
}
