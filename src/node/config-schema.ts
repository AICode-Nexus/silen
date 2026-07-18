import { z } from 'zod'
import { normalizeLocaleRoot, type UserConfig } from '../shared/config.js'
import { hasExecutableUrlScheme, pathnameIdentity } from '../shared/url.js'

function invalidBase(reason: string): Error {
  return new Error(`base must be a normalized absolute pathname: ${reason}`)
}

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0
    return code <= 0x1f || code === 0x7f
  })
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

const titleSchema = z
  .string()
  .min(1)
  .max(500)
  .default('Silen')
  .describe('Human-readable site title.')
const descriptionSchema = z
  .string()
  .max(2000)
  .default('')
  .describe('Short site description used by generated metadata.')
const langSchema = z
  .string()
  .min(1)
  .max(100)
  .default('en-US')
  .describe('Default BCP 47 language tag for the site.')
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
  .describe('Normalized absolute URL pathname where the site is mounted.')
const siteUrlError =
  'siteUrl must be an absolute http:// or https:// origin without credentials, a deployment path, query, or fragment; configure the deployment path with base'

function isAuthoredSiteOrigin(value: string): boolean {
  const authority = /^https?:\/\/([^\s/?#]+)\/?$/i.exec(value)?.[1]
  if (
    authority === undefined ||
    authority.includes('@') ||
    authority.includes('\\')
  ) {
    return false
  }

  if (authority.startsWith('[')) {
    const closingBracket = authority.indexOf(']')
    if (closingBracket === -1) return false
    const port = authority.slice(closingBracket + 1)
    return port === '' || /^:\d+$/.test(port)
  }

  const portDelimiter = authority.lastIndexOf(':')
  if (portDelimiter === -1) return true
  return (
    authority.indexOf(':') === portDelimiter &&
    /^\d+$/.test(authority.slice(portDelimiter + 1))
  )
}

const siteUrlSchema = z
  .string()
  .transform((value, context) => {
    if (!isAuthoredSiteOrigin(value)) {
      context.addIssue({ code: 'custom', message: siteUrlError })
      return z.NEVER
    }

    let parsed: URL
    try {
      parsed = new URL(value)
    } catch {
      context.addIssue({ code: 'custom', message: siteUrlError })
      return z.NEVER
    }

    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.pathname !== '/' ||
      value.includes('?') ||
      value.includes('#')
    ) {
      context.addIssue({ code: 'custom', message: siteUrlError })
      return z.NEVER
    }
    return parsed.origin
  })
  .optional()
  .describe(
    'Optional canonical HTTP(S) origin used for absolute discovery metadata.',
  )
const outDirSchema = z
  .string()
  .default('.silen/dist')
  .describe('Build output directory, resolved relative to the site root.')
const brokenLinksSchema = z
  .enum(['error', 'warn', 'ignore'])
  .default('error')
  .describe('Policy applied when a documentation link cannot be resolved.')
const themeConfigSchema = z
  .record(z.string(), z.json())
  .superRefine((themeConfig, context) => {
    const locales = themeConfig.locales
    if (!Array.isArray(locales)) return

    const owners = new Map<string, number>()
    for (const [index, locale] of locales.entries()) {
      if (
        typeof locale !== 'object' ||
        locale === null ||
        Array.isArray(locale) ||
        !('root' in locale) ||
        typeof locale.root !== 'string'
      ) {
        continue
      }
      const root = normalizeLocaleRoot(locale.root)
      const identity = pathnameIdentity(root)
      const previous = owners.get(identity)
      if (previous !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['locales', index, 'root'],
          message: `duplicate normalized locale root ${identity}; it is already used by locales.${previous}.root`,
        })
        continue
      }
      owners.set(identity, index)
    }
  })
  .default({})
  .describe('JSON-compatible configuration consumed by the active theme.')

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

const analyticsSchema = z
  .array(analyticsProviderSchema)
  .default([])
  .describe('Ordered analytics providers rendered by the site runtime.')

function safePublicRelativePath(value: string): boolean {
  if (
    value.startsWith('/') ||
    value.startsWith('\\\\') ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) ||
    value.includes('\\') ||
    /[?#]/.test(value) ||
    containsControlCharacter(value) ||
    /%(?:2f|5c)/i.test(value)
  ) {
    return false
  }

  let decoded: string
  try {
    decoded = decodeURIComponent(value).normalize('NFC')
  } catch {
    return false
  }
  const segments = decoded.split('/')
  return (
    segments.length > 0 &&
    segments.every(
      (segment) => segment.length > 0 && segment !== '.' && segment !== '..',
    )
  )
}

const publicRelativePathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(safePublicRelativePath, {
    message:
      'Expected a normalized relative path inside the documentation root',
  })

const publicInstructionsSchema = publicRelativePathSchema
  .refine((value) => /\.md$/i.test(value), {
    message: 'Public Agent instructions must be a Markdown file',
  })
  .optional()
  .describe('Relative path to an explicitly public Agent instruction file.')

const publicTasksDirectorySchema = publicRelativePathSchema
  .optional()
  .describe('Relative path to a directory of explicitly public Agent tasks.')

const aiContractShape = {
  enabled: z
    .boolean()
    .default(true)
    .describe('Emit the versioned Silen Agent Contract.'),
  instructions: publicInstructionsSchema,
  tasksDir: publicTasksDirectorySchema,
} as const

const aiContractSchema = z.object(aiContractShape).prefault({})

const aiArtifactBoolean = (description: string) =>
  z.boolean().default(true).describe(description)

const userAiConfigShape = {
  llmsTxt: aiArtifactBoolean('Emit the concise llms.txt discovery file.'),
  llmsFullTxt: aiArtifactBoolean(
    'Emit the complete llms-full.txt documentation artifact.',
  ),
  markdownRoutes: aiArtifactBoolean(
    'Emit plain Markdown variants for documentation routes.',
  ),
  index: aiArtifactBoolean('Emit the deterministic local AI search index.'),
  contract: aiContractSchema,
} as const

export const userAiConfigSchema = z.object(userAiConfigShape).prefault({})

export const userConfigSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema,
    lang: langSchema,
    base: baseSchema,
    siteUrl: siteUrlSchema,
    outDir: outDirSchema,
    onBrokenLinks: brokenLinksSchema,
    themeConfig: themeConfigSchema,
    analytics: analyticsSchema,
    ai: userAiConfigSchema,
  })
  .passthrough()

export interface ConfigApiFieldSource {
  readonly path: string
  readonly schema?: z.ZodType
  readonly type?: string
  readonly default?: unknown
  readonly description?: string
  readonly constraints?: readonly string[]
}

export const configApiFieldSources: readonly ConfigApiFieldSource[] = [
  { path: 'title', schema: titleSchema },
  { path: 'description', schema: descriptionSchema },
  { path: 'lang', schema: langSchema, constraints: ['BCP 47 language tag'] },
  {
    path: 'base',
    schema: baseSchema,
    constraints: ['normalized absolute URL pathname', 'no query or hash'],
  },
  {
    path: 'siteUrl',
    schema: siteUrlSchema,
    constraints: [
      'absolute HTTP(S) origin',
      'no credentials, deployment path, query, or fragment',
    ],
  },
  { path: 'outDir', schema: outDirSchema },
  { path: 'onBrokenLinks', schema: brokenLinksSchema },
  { path: 'themeConfig', schema: themeConfigSchema },
  {
    path: 'analytics',
    schema: analyticsSchema,
    constraints: ['provider-specific validated entries'],
  },
  {
    path: 'plugins',
    type: 'SilenPluginEntry[] (runtime-only)',
    default: [],
    description:
      'Executable plugin entries loaded at runtime; instances are never serialized into the Agent Contract.',
    constraints: ['must be an array of trusted runtime plugin entries'],
  },
  { path: 'ai.llmsTxt', schema: userAiConfigShape.llmsTxt },
  { path: 'ai.llmsFullTxt', schema: userAiConfigShape.llmsFullTxt },
  {
    path: 'ai.markdownRoutes',
    schema: userAiConfigShape.markdownRoutes,
  },
  { path: 'ai.index', schema: userAiConfigShape.index },
  { path: 'ai.contract.enabled', schema: aiContractShape.enabled },
  {
    path: 'ai.contract.instructions',
    schema: aiContractShape.instructions,
    constraints: [
      'non-empty relative Markdown path',
      'must remain inside the documentation root',
    ],
  },
  {
    path: 'ai.contract.tasksDir',
    schema: aiContractShape.tasksDir,
    constraints: [
      'non-empty relative directory path',
      'must remain inside the documentation root',
    ],
  },
]

export const publicConfigApiCoverage = {
  title: ['title'],
  description: ['description'],
  lang: ['lang'],
  base: ['base'],
  siteUrl: ['siteUrl'],
  outDir: ['outDir'],
  onBrokenLinks: ['onBrokenLinks'],
  themeConfig: ['themeConfig'],
  analytics: ['analytics'],
  plugins: ['plugins'],
  ai: [
    'ai.llmsTxt',
    'ai.llmsFullTxt',
    'ai.markdownRoutes',
    'ai.index',
    'ai.contract.enabled',
    'ai.contract.instructions',
    'ai.contract.tasksDir',
  ],
} as const satisfies Record<keyof UserConfig, readonly string[]>
