import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  AnalyticsProvider,
  AnalyticsScript,
  ResolvedConfig,
  ThemeConfig,
} from '../shared/config.js'
import type { RouteRecord } from '../shared/page.js'

export const virtualModuleIds = {
  routes: 'virtual:silen/routes',
  config: 'virtual:silen/config',
  theme: 'virtual:silen/theme',
  askAi: 'virtual:silen/ask-ai',
  clientExtensions: 'virtual:silen/client-extensions',
} as const

export interface VirtualModules {
  routes: string
  config: string
  theme: string
  askAi: string
  clientExtensions: string
}

export interface VirtualModuleOptions {
  routes: readonly RouteRecord[]
  config: ResolvedConfig
  themeFile?: string
  publicConfigOnly?: boolean
  hmr?: boolean
  clientModules?: readonly string[]
}

function clientHmrFile(): string {
  const sourceExtension = path.extname(fileURLToPath(import.meta.url)) === '.ts'
  return fileURLToPath(
    new URL(`../client/hmr.${sourceExtension ? 'ts' : 'js'}`, import.meta.url),
  )
}

function routeHmrSource(routes: readonly RouteRecord[]): string[] {
  if (routes.length === 0) return []
  const files = routes.map((route) =>
    quoteModuleString(viteImportPath(route.file)),
  )
  const paths = routes.map((route) => quoteModuleString(route.path))
  return [
    `import { publishHotRouteUpdate } from ${quoteModuleString(viteImportPath(clientHmrFile()))}`,
    'if (import.meta.hot) {',
    `  const hotRoutePaths = [${paths.join(', ')}]`,
    `  import.meta.hot.accept([${files.join(', ')}], (modules) => {`,
    '    for (const [index, module] of modules.entries()) {',
    '      if (module) publishHotRouteUpdate({ module, path: hotRoutePaths[index] })',
    '    }',
    '  })',
    '}',
  ]
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

function clientExtensionSource(
  root: string,
  modules: readonly string[],
): string {
  const imports = modules.map((moduleId, index) => {
    const resolved =
      moduleId.startsWith('./') || moduleId.startsWith('../')
        ? path.resolve(root, moduleId)
        : moduleId
    return `import * as extension${index} from ${quoteModuleString(viteImportPath(resolved))}`
  })
  return [
    ...imports,
    `const clientExtensions = [${modules.map((_, index) => `extension${index}`).join(', ')}]`,
    'export { clientExtensions }',
    'export default clientExtensions',
  ].join('\n')
}

export function defaultThemeFile(): string {
  const sourceExtension = path.extname(fileURLToPath(import.meta.url)) === '.ts'
  return fileURLToPath(
    new URL(
      `../theme-default/index.${sourceExtension ? 'tsx' : 'js'}`,
      import.meta.url,
    ),
  )
}

function askAiDialogFile(): string {
  const sourceExtension = path.extname(fileURLToPath(import.meta.url)) === '.ts'
  return fileURLToPath(
    new URL(
      `../theme-default/components/ask-ai.${sourceExtension ? 'tsx' : 'js'}`,
      import.meta.url,
    ),
  )
}

function publicNav(
  nav: NonNullable<ThemeConfig['nav']>,
): NonNullable<ThemeConfig['nav']> {
  return nav.map(({ text, link }) => ({ text, link }))
}

function publicSidebar(
  sidebar: NonNullable<ThemeConfig['sidebar']>,
): NonNullable<ThemeConfig['sidebar']> {
  return sidebar.map(({ text, collapsed, items }) => ({
    text,
    ...(collapsed === undefined ? {} : { collapsed }),
    items: items.map(({ text: itemText, link }) => ({
      text: itemText,
      link,
    })),
  }))
}

function publicHome(
  home: NonNullable<ThemeConfig['home']>,
): NonNullable<ThemeConfig['home']> {
  return {
    hero: {
      name: home.hero.name,
      ...(home.hero.text === undefined ? {} : { text: home.hero.text }),
      ...(home.hero.tagline === undefined
        ? {}
        : { tagline: home.hero.tagline }),
      ...(home.hero.image === undefined
        ? {}
        : {
            image:
              typeof home.hero.image === 'string'
                ? home.hero.image
                : {
                    src: home.hero.image.src,
                    alt: home.hero.image.alt,
                  },
          }),
      ...(home.hero.actions === undefined
        ? {}
        : {
            actions: home.hero.actions.map((action) => ({
              text: action.text,
              link: action.link,
              ...(action.theme === undefined ? {} : { theme: action.theme }),
              ...(action.target === undefined ? {} : { target: action.target }),
              ...(action.rel === undefined ? {} : { rel: action.rel }),
            })),
          }),
    },
    ...(home.features === undefined
      ? {}
      : {
          features: home.features.map((feature) => ({
            ...(feature.icon === undefined ? {} : { icon: feature.icon }),
            title: feature.title,
            details: feature.details,
            ...(feature.link === undefined ? {} : { link: feature.link }),
            ...(feature.linkText === undefined
              ? {}
              : { linkText: feature.linkText }),
            ...(feature.target === undefined ? {} : { target: feature.target }),
            ...(feature.rel === undefined ? {} : { rel: feature.rel }),
          })),
        }),
  }
}

function publicThemeConfig(themeConfig: ThemeConfig): ThemeConfig {
  const askAiEndpoint = themeConfig.ai?.endpoint
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
          nav: publicNav(themeConfig.nav),
        }),
    ...(themeConfig.sidebar === undefined
      ? {}
      : {
          sidebar: publicSidebar(themeConfig.sidebar),
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
    ...(themeConfig.locales === undefined
      ? {}
      : {
          locales: themeConfig.locales.map(
            ({ lang, label, root, link, nav, sidebar, home }) => ({
              lang,
              label,
              ...(root === undefined ? {} : { root }),
              ...(link === undefined ? {} : { link }),
              ...(nav === undefined ? {} : { nav: publicNav(nav) }),
              ...(sidebar === undefined
                ? {}
                : { sidebar: publicSidebar(sidebar) }),
              ...(home === undefined ? {} : { home: publicHome(home) }),
            }),
          ),
        }),
    ...(themeConfig.search === undefined ? {} : { search: themeConfig.search }),
    ...(typeof askAiEndpoint === 'string' && askAiEndpoint.length > 0
      ? { ai: { endpoint: askAiEndpoint } }
      : {}),
    ...(themeConfig.home === undefined
      ? {}
      : {
          home: publicHome(themeConfig.home),
        }),
  }
}

function publicAnalyticsScript(script: AnalyticsScript): AnalyticsScript {
  return {
    ...(script.src === undefined ? {} : { src: script.src }),
    ...(script.content === undefined ? {} : { content: script.content }),
    ...(script.async === undefined ? {} : { async: script.async }),
    ...(script.defer === undefined ? {} : { defer: script.defer }),
    ...(script.attributes === undefined
      ? {}
      : { attributes: { ...script.attributes } }),
  }
}

function publicAnalyticsConfig(
  analytics: readonly AnalyticsProvider[],
): AnalyticsProvider[] {
  return analytics
    .filter((provider) => provider.enabled !== false)
    .map((provider) => {
      switch (provider.provider) {
        case 'google':
        case 'baidu':
          return { provider: provider.provider, id: provider.id }
        case 'custom':
          return {
            provider: 'custom',
            ...(provider.name === undefined ? {} : { name: provider.name }),
            scripts: provider.scripts.map(publicAnalyticsScript),
          }
      }
    })
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
        ai: config.ai,
        analytics:
          config.command === 'build'
            ? publicAnalyticsConfig(config.analytics)
            : [],
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
  hmr = false,
  clientModules = [],
}: VirtualModuleOptions): VirtualModules {
  const sortedRoutes = [...routes].sort(
    (left, right) =>
      compareStrings(left.path, right.path) ||
      compareStrings(left.relativeFile, right.relativeFile),
  )
  const routeEntries = sortedRoutes.map(
    (route) =>
      `  ${quoteModuleString(route.path)}: () => import(${quoteModuleString(viteImportPath(route.file))})`,
  )
  const askAiEndpoint = config.themeConfig.ai?.endpoint

  return {
    routes: [
      'const routes = {',
      routeEntries.join(',\n'),
      '}',
      'export { routes }',
      'export default routes',
      ...(hmr ? routeHmrSource(sortedRoutes) : []),
    ].join('\n'),
    config: serializeConfig(config, publicConfigOnly),
    theme: hmr
      ? [
          `import hotTheme from ${quoteModuleString(viteImportPath(themeFile))}`,
          `import { publishHotThemeUpdate } from ${quoteModuleString(viteImportPath(clientHmrFile()))}`,
          'export { hotTheme as default }',
          `export * from ${quoteModuleString(viteImportPath(themeFile))}`,
          'if (import.meta.hot) {',
          `  import.meta.hot.accept(${quoteModuleString(viteImportPath(themeFile))}, (module) => {`,
          '    if (module) publishHotThemeUpdate(module.default)',
          '  })',
          '}',
        ].join('\n')
      : [
          `export { default } from ${quoteModuleString(viteImportPath(themeFile))}`,
          `export * from ${quoteModuleString(viteImportPath(themeFile))}`,
        ].join('\n'),
    askAi:
      typeof askAiEndpoint !== 'string' || askAiEndpoint.length === 0
        ? [
            'const loadAskAiDialog = undefined',
            'export { loadAskAiDialog }',
          ].join('\n')
        : [
            `const loadAskAiDialog = () => import(${quoteModuleString(viteImportPath(askAiDialogFile()))}).then((module) => ({ default: module.EndpointAskAiDialog }))`,
            'export { loadAskAiDialog }',
          ].join('\n'),
    clientExtensions: clientExtensionSource(config.root, clientModules),
  }
}
