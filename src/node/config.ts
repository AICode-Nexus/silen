import { rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import type { ResolvedConfig, UserConfig } from '../shared/config.js'
import type { SilenPluginEntry } from '../shared/plugin.js'
import { userConfigSchema } from './config-schema.js'
import { attachPluginRunner, createPluginRunner } from './plugins.js'

let configLoadId = 0

export async function resolveConfig(
  root: string,
  command: 'serve' | 'build',
): Promise<ResolvedConfig> {
  const absoluteRoot = path.resolve(root)
  const configFile = path.join(absoluteRoot, '.silen/config.ts')
  const loadId = configLoadId++
  const bundled = path.join(
    absoluteRoot,
    `.silen/.temp/config-${process.pid}-${loadId}.mjs`,
  )

  let loadedModule: unknown
  try {
    await build({
      entryPoints: [configFile],
      outfile: bundled,
      bundle: true,
      packages: 'external',
      platform: 'node',
      format: 'esm',
    })

    loadedModule = await import(`${pathToFileURL(bundled).href}?load=${loadId}`)
  } finally {
    await rm(bundled, { force: true })
  }
  const loaded = (loadedModule as { default: unknown }).default
  if (typeof loaded !== 'object' || loaded === null || Array.isArray(loaded)) {
    throw new TypeError('Silen config must default export an object')
  }
  const rawConfig = loaded as UserConfig
  if (rawConfig.plugins !== undefined && !Array.isArray(rawConfig.plugins)) {
    throw new TypeError('Silen config plugins must be an array')
  }
  const runner = await createPluginRunner(
    (rawConfig.plugins ?? []) as readonly SilenPluginEntry[],
    { command, root: absoluteRoot, configFile },
  )
  const configured = await runner.runConfig(rawConfig)
  const configWithoutPlugins: UserConfig = { ...configured }
  delete configWithoutPlugins.plugins
  const parsed = userConfigSchema.parse(configWithoutPlugins)

  const resolved: ResolvedConfig = {
    ...parsed,
    plugins: runner.plugins,
    command,
    root: absoluteRoot,
    configFile,
    base: parsed.base,
    outDir: path.resolve(absoluteRoot, parsed.outDir),
  }
  attachPluginRunner(resolved, runner)
  await runner.runConfigResolved(resolved)
  return resolved
}
