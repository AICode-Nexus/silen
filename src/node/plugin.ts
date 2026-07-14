import path from 'node:path'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'
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

export interface SilenPluginOptions {
  publicConfigOnly?: boolean
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
  })
  modules.theme = [
    `import ${JSON.stringify(viteImportPath(defaultThemeStylesheet()))}`,
    modules.theme,
  ].join('\n')

  return [
    ...tailwindcss(),
    {
      name: 'silen:core',
      enforce: 'pre',
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
