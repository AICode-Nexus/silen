import { rm } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { z } from 'zod'
import type { ResolvedConfig, UserConfig } from '../shared/config.js'
import type { SilenPluginEntry } from '../shared/plugin.js'
import { hasExecutableUrlScheme } from '../shared/url.js'
import { attachPluginRunner, createPluginRunner } from './plugins.js'

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

const analyticsAttributeName = /^[A-Za-z_:][A-Za-z0-9:._-]*$/
const reservedAnalyticsAttributes = new Set(['src', 'async', 'defer'])

function safeScriptSource(value: string): boolean {
  return !hasExecutableUrlScheme(value)
}

const analyticsAttributesSchema = z
  .record(z.string(), z.union([z.string(), z.boolean()]))
  .superRefine((attributes, context) => {
    for (const name of Object.keys(attributes)) {
      if (!analyticsAttributeName.test(name)) {
        context.addIssue({
          code: 'custom',
          message: `invalid analytics script attribute name: ${name}`,
        })
      }
      if (reservedAnalyticsAttributes.has(name.toLowerCase())) {
        context.addIssue({
          code: 'custom',
          message: `analytics script attribute ${name} must use its typed field`,
        })
      }
    }
  })

const analyticsScriptSchema = z
  .object({
    src: z
      .string()
      .min(1)
      .refine(safeScriptSource, { message: 'unsafe analytics script URL' })
      .optional(),
    content: z.string().min(1).optional(),
    async: z.boolean().optional(),
    defer: z.boolean().optional(),
    attributes: analyticsAttributesSchema.optional(),
  })
  .refine(
    (script) => (script.src === undefined) !== (script.content === undefined),
    { message: 'analytics scripts require exactly one of src or content' },
  )

const analyticsProviderSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('google'),
    id: z.string().min(1),
    enabled: z.boolean().optional(),
  }),
  z.object({
    provider: z.literal('baidu'),
    id: z.string().min(1),
    enabled: z.boolean().optional(),
  }),
  z.object({
    provider: z.literal('custom'),
    name: z.string().min(1).optional(),
    scripts: z.array(analyticsScriptSchema).min(1),
    enabled: z.boolean().optional(),
  }),
])

const schema = z
  .object({
    title: z.string().default('Silen'),
    description: z.string().default(''),
    lang: z.string().default('en-US'),
    base: baseSchema,
    outDir: z.string().optional(),
    onBrokenLinks: z.enum(['error', 'warn', 'ignore']).default('error'),
    themeConfig: z.record(z.string(), z.json()).default({}),
    analytics: z.array(analyticsProviderSchema).default([]),
    ai: z
      .object({
        llmsTxt: z.boolean().default(true),
        llmsFullTxt: z.boolean().default(true),
        markdownRoutes: z.boolean().default(true),
        index: z.boolean().default(true),
      })
      .prefault({}),
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
  const parsed = schema.parse(configWithoutPlugins)

  const resolved: ResolvedConfig = {
    ...parsed,
    plugins: runner.plugins,
    command,
    root: absoluteRoot,
    configFile,
    base: parsed.base,
    outDir: path.resolve(absoluteRoot, parsed.outDir ?? '.silen/dist'),
  }
  attachPluginRunner(resolved, runner)
  await runner.runConfigResolved(resolved)
  return resolved
}
