import path from 'node:path'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin, ViteDevServer } from 'vite'
import type { ResolvedConfig } from '../shared/config.js'
import { scanRoutes } from './routes.js'
import {
  createVirtualModules,
  defaultThemeFile,
  virtualModuleIds,
  type VirtualModules,
} from './virtual.js'

const resolvedPrefix = '\0'

function defaultThemeStylesheet(): string {
  const sourceExtension = path.extname(fileURLToPath(import.meta.url)) === '.ts'
  return fileURLToPath(
    new URL(
      sourceExtension
        ? '../theme-default/styles/index.css'
        : '../theme-default/index.css',
      import.meta.url,
    ),
  )
}

function viteImportPath(file: string): string {
  const normalized = file.replaceAll('\\', '/')
  return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//')
    ? `/@fs/${normalized}`
    : normalized
}

async function projectThemeFile(root: string): Promise<string | undefined> {
  const file = path.join(root, '.silen/theme.tsx')
  try {
    return (await stat(file)).isFile() ? file : undefined
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return undefined
    throw error
  }
}

function comparableViteId(id: string): string {
  const clean = id.split('?', 1)[0] ?? id
  const file = clean.startsWith('/@fs/') ? clean.slice('/@fs'.length) : clean
  return path.resolve(file)
}

function moduleName(id: string): keyof VirtualModules | undefined {
  const publicId = id.startsWith(resolvedPrefix) ? id.slice(1) : id

  for (const [name, virtualId] of Object.entries(virtualModuleIds)) {
    if (publicId === virtualId) return name as keyof VirtualModules
  }

  return undefined
}

function containsPath(directory: string, target: string): boolean {
  const relative = path.relative(directory, target)
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  )
}

function routeSourceFile(config: ResolvedConfig, file: string): boolean {
  const resolved = path.resolve(file)
  if (
    !containsPath(config.root, resolved) ||
    containsPath(config.outDir, resolved)
  )
    return false
  const relative = path.relative(config.root, resolved)
  const segments = relative.split(path.sep)
  return (
    /\.mdx?$/i.test(relative) &&
    !segments.includes('.silen') &&
    !segments.includes('node_modules')
  )
}

export interface SilenPluginOptions {
  publicConfigOnly?: boolean
  hmr?: boolean
}

export async function silenPlugin(
  config: ResolvedConfig,
  options: SilenPluginOptions = {},
): Promise<Plugin[]> {
  const routes = await scanRoutes(config.root)
  const themeFile = await projectThemeFile(config.root)
  const modules = createVirtualModules({
    routes,
    config,
    ...(themeFile === undefined ? {} : { themeFile }),
    publicConfigOnly: options.publicConfigOnly ?? false,
    hmr: options.hmr ?? false,
  })
  modules.theme = [
    `import ${JSON.stringify(viteImportPath(defaultThemeStylesheet()))}`,
    modules.theme,
  ].join('\n')

  async function refreshRoutes(
    server: ViteDevServer,
    changedFile: string,
  ): Promise<void> {
    const nextRoutes = (await scanRoutes(config.root)).filter(
      (route) => !containsPath(config.outDir, route.file),
    )
    modules.routes = createVirtualModules({
      routes: nextRoutes,
      config,
      ...(themeFile === undefined ? {} : { themeFile }),
      publicConfigOnly: options.publicConfigOnly ?? false,
      hmr: options.hmr ?? false,
    }).routes
    await server.restart()
    server.ws.send({
      type: 'full-reload',
      path: '*',
      triggeredBy: changedFile,
    })
  }

  return [
    ...tailwindcss(),
    {
      name: 'silen:core',
      enforce: 'pre',
      configureServer(server) {
        const requireConfigRestart = (file: string): void => {
          if (path.resolve(file) !== path.resolve(config.configFile)) return
          server.config.logger.warn(
            `${path.relative(config.root, config.configFile)} changed; restart silen dev to apply configuration`,
          )
        }
        const cleanup = (): void => {
          server.watcher.off('change', requireConfigRestart)
        }

        server.watcher.add(config.configFile)
        server.watcher.on('change', requireConfigRestart)
        server.httpServer?.once('close', cleanup)
      },
      async hotUpdate({ type, file, server }) {
        if (
          (type !== 'create' && type !== 'delete') ||
          !routeSourceFile(config, file)
        ) {
          return
        }
        if (this.environment.name === 'client') {
          await refreshRoutes(server, file)
        }
        return []
      },
      resolveId(id, importer) {
        if (
          id === 'silen/theme' &&
          themeFile !== undefined &&
          importer !== undefined &&
          !importer.startsWith(resolvedPrefix) &&
          comparableViteId(importer) === comparableViteId(themeFile)
        ) {
          return defaultThemeFile()
        }
        return id.startsWith(resolvedPrefix) || moduleName(id) === undefined
          ? undefined
          : `${resolvedPrefix}${id}`
      },
      load(id) {
        const name = id.startsWith(resolvedPrefix) ? moduleName(id) : undefined
        return name === undefined ? undefined : modules[name]
      },
    },
  ]
}
