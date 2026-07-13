import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { z } from 'zod'
import type { ResolvedConfig, UserConfig } from '../shared/config.js'

const schema = z
  .object({
    title: z.string().default('Silen'),
    description: z.string().default(''),
    lang: z.string().default('en-US'),
    base: z
      .string()
      .default('/')
      .refine((value) => value.startsWith('/'), 'base must start with /'),
    outDir: z.string().optional(),
    onBrokenLinks: z.enum(['error', 'warn', 'ignore']).default('error'),
  })
  .passthrough()

export async function resolveConfig(
  root: string,
  command: 'serve' | 'build',
): Promise<ResolvedConfig> {
  const absoluteRoot = path.resolve(root)
  const configFile = path.join(absoluteRoot, '.silen/config.ts')
  const bundled = path.join(absoluteRoot, '.silen/.temp/config.mjs')

  await build({
    entryPoints: [configFile],
    outfile: bundled,
    bundle: true,
    platform: 'node',
    format: 'esm',
  })

  const loadedModule: unknown = await import(
    `${pathToFileURL(bundled).href}?t=${Date.now()}`
  )
  const loaded = (loadedModule as { default: UserConfig }).default
  const parsed = schema.parse(loaded)
  const base = parsed.base.endsWith('/') ? parsed.base : `${parsed.base}/`

  return {
    ...parsed,
    command,
    root: absoluteRoot,
    configFile,
    base,
    outDir: path.resolve(absoluteRoot, parsed.outDir ?? '.silen/dist'),
  }
}
