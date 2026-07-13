import { rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { z } from 'zod'
import type { ResolvedConfig, UserConfig } from '../shared/config.js'

let configLoadId = 0

function invalidBase(reason: string): Error {
  return new Error(`base must be a normalized absolute pathname: ${reason}`)
}

function canonicalBase(value: string): string {
  if (!value.startsWith('/')) throw new Error('base must start with /')
  if (value.includes('?') || value.includes('#')) {
    throw invalidBase('query or hash')
  }
  if (value.includes('\\')) throw invalidBase('backslashes')
  if (value.includes('\0')) throw invalidBase('null bytes')
  if (value.startsWith('//')) throw invalidBase('empty path segments')
  if (value === '/') return value

  const withoutTrailingSlash = value.endsWith('/') ? value.slice(0, -1) : value
  const segments = withoutTrailingSlash.slice(1).split('/')
  if (segments.some((segment) => segment.length === 0)) {
    throw invalidBase('empty path segments')
  }

  const canonicalSegments = segments.map((segment) => {
    let decoded: string
    try {
      decoded = decodeURIComponent(segment).normalize('NFC')
    } catch {
      throw invalidBase('malformed percent-encoding')
    }
    if (decoded === '.' || decoded === '..') {
      throw invalidBase('dot segments')
    }
    if (decoded.includes('/') || decoded.includes('\\')) {
      throw invalidBase('encoded path separators')
    }
    if (decoded.includes('\0')) throw invalidBase('null bytes')

    try {
      void encodeURIComponent(decoded)
    } catch {
      throw invalidBase('invalid Unicode')
    }
    return decoded.replaceAll('%', '%25')
  })

  const canonical = new URL('https://silen.local')
  canonical.pathname = `/${canonicalSegments.join('/')}/`
  return canonical.pathname
}

const baseSchema = z
  .string()
  .default('/')
  .transform((value, context) => {
    try {
      return canonicalBase(value)
    } catch (error) {
      context.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : String(error),
      })
      return z.NEVER
    }
  })

const schema = z
  .object({
    title: z.string().default('Silen'),
    description: z.string().default(''),
    lang: z.string().default('en-US'),
    base: baseSchema,
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

  return {
    ...parsed,
    command,
    root: absoluteRoot,
    configFile,
    base: parsed.base,
    outDir: path.resolve(absoluteRoot, parsed.outDir ?? '.silen/dist'),
  }
}
