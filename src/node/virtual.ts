import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ResolvedConfig, ThemeConfig } from '../shared/config.js'
import type { RouteRecord } from '../shared/page.js'

export const virtualModuleIds = {
  routes: 'virtual:silen/routes',
  config: 'virtual:silen/config',
  theme: 'virtual:silen/theme',
} as const

export interface VirtualModules {
  routes: string
  config: string
  theme: string
}

export interface VirtualModuleOptions {
  routes: readonly RouteRecord[]
  config: ResolvedConfig
  themeFile?: string
  publicConfigOnly?: boolean
}

function quoteModuleString(value: string): string {
  const jsonBody = JSON.stringify(value)
    .slice(1, -1)
    .replaceAll("'", "\\'")
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
  return `'${jsonBody}'`
}

function viteImportPath(file: string): string {
  const normalized = file.replaceAll('\\', '/')
  if (/^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//')) {
    return `/@fs/${normalized}`
  }
  return normalized
}

function defaultThemeFile(): string {
  const sourceExtension = path.extname(fileURLToPath(import.meta.url)) === '.ts'
  return fileURLToPath(
    new URL(
      `../theme-default/index.${sourceExtension ? 'tsx' : 'js'}`,
      import.meta.url,
    ),
  )
}

function publicThemeConfig(themeConfig: ThemeConfig): ThemeConfig {
  return {
    ...(themeConfig.logo === undefined
      ? {}
      : {
          logo:
            typeof themeConfig.logo === 'string'
              ? themeConfig.logo
              : {
                  src: themeConfig.logo.src,
                  ...(themeConfig.logo.alt === undefined
                    ? {}
                    : { alt: themeConfig.logo.alt }),
                },
        }),
    ...(themeConfig.nav === undefined
      ? {}
      : {
          nav: themeConfig.nav.map(({ text, link }) => ({ text, link })),
        }),
    ...(themeConfig.sidebar === undefined
      ? {}
      : {
          sidebar: themeConfig.sidebar.map(({ text, collapsed, items }) => ({
            text,
            ...(collapsed === undefined ? {} : { collapsed }),
            items: items.map(({ text: itemText, link }) => ({
              text: itemText,
              link,
            })),
          })),
        }),
    ...(themeConfig.socialLinks === undefined
      ? {}
      : {
          socialLinks: themeConfig.socialLinks.map(
            ({ icon, link, ariaLabel }) => ({
              icon,
              link,
              ...(ariaLabel === undefined ? {} : { ariaLabel }),
            }),
          ),
        }),
    ...(themeConfig.search === undefined ? {} : { search: themeConfig.search }),
  }
}

function serializeConfig(
  config: ResolvedConfig,
  publicConfigOnly: boolean,
): string {
  const value = publicConfigOnly
    ? {
        title: config.title,
        description: config.description,
        lang: config.lang,
        base: config.base,
        themeConfig: publicThemeConfig(config.themeConfig),
      }
    : config
  const serialized = JSON.stringify(value)
  if (serialized === undefined) {
    throw new TypeError('Failed to serialize the resolved config')
  }

  return [
    `const config = JSON.parse(${quoteModuleString(serialized)})`,
    'export { config }',
    'export default config',
  ].join('\n')
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

export function createVirtualModules({
  routes,
  config,
  themeFile = defaultThemeFile(),
  publicConfigOnly = false,
}: VirtualModuleOptions): VirtualModules {
  const routeEntries = [...routes]
    .sort(
      (left, right) =>
        compareStrings(left.path, right.path) ||
        compareStrings(left.relativeFile, right.relativeFile),
    )
    .map(
      (route) =>
        `  ${quoteModuleString(route.path)}: () => import(${quoteModuleString(viteImportPath(route.file))})`,
    )

  return {
    routes: [
      'const routes = {',
      routeEntries.join(',\n'),
      '}',
      'export { routes }',
      'export default routes',
    ].join('\n'),
    config: serializeConfig(config, publicConfigOnly),
    theme: [
      `export { default } from ${quoteModuleString(viteImportPath(themeFile))}`,
      `export * from ${quoteModuleString(viteImportPath(themeFile))}`,
    ].join('\n'),
  }
}
