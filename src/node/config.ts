import { rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { z } from 'zod'
import type { ResolvedConfig, UserConfig } from '../shared/config.js'

let configLoadId = 0

function isNormalizedAbsoluteBase(value: string): boolean {
  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#') ||
    value.includes('\0')
  ) {
    return false
  }
  if (value === '/') return true

  const segments = value.split('/').slice(1)
  if (segments.at(-1) === '') segments.pop()
  if (segments.some((segment) => segment.length === 0)) return false

  return segments.every((segment) => {
    try {
      const decoded = decodeURIComponent(segment)
      return (
        decoded !== '.' &&
        decoded !== '..' &&
        !decoded.includes('/') &&
        !decoded.includes('\\') &&
        !decoded.includes('\0')
      )
    } catch {
      return false
    }
  })
}

const schema = z
  .object({
    title: z.string().default('Silen'),
    description: z.string().default(''),
    lang: z.string().default('en-US'),
    base: z
      .string()
      .default('/')
      .refine((value) => value.startsWith('/'), 'base must start with /')
      .refine(
        isNormalizedAbsoluteBase,
        'base must be a normalized absolute pathname',
      ),
    outDir: z.string().optional(),
    onBrokenLinks: z.enum(['error', 'warn', 'ignore']).default('error'),
    themeConfig: z.record(z.string(), z.json()).default({}),
  })
  .passthrough()

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
      platform: 'node',
      format: 'esm',
    })

    loadedModule = await import(`${pathToFileURL(bundled).href}?load=${loadId}`)
  } finally {
    await rm(bundled, { force: true })
  }
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
