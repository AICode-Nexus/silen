import type { Plugin } from 'vite'
import type { ResolvedConfig } from '../shared/config.js'
import { scanRoutes } from './routes.js'
import {
  createVirtualModules,
  virtualModuleIds,
  type VirtualModules,
} from './virtual.js'

const resolvedPrefix = '\0'

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
  const modules = createVirtualModules({
    routes,
    config,
    publicConfigOnly: options.publicConfigOnly ?? false,
  })

  return [
    {
      name: 'silen:core',
      resolveId(id) {
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
