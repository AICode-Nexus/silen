import { z } from 'zod'
import type {
  SilenApiContract,
  SilenConfigApiField,
  SilenJsonValue,
} from '../../shared/ai-contract.js'
import {
  configApiFieldSources,
  publicConfigApiCoverage,
  type ConfigApiFieldSource,
} from '../../node/config-schema.js'

function publicJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(z.toJSONSchema(schema, { io: 'input' })),
  ) as Record<string, unknown>
}

function jsonSchemaType(schema: Readonly<Record<string, unknown>>): string {
  if (typeof schema.type === 'string') return schema.type
  if (Array.isArray(schema.type)) {
    return schema.type.filter((value) => typeof value === 'string').join(' | ')
  }
  if (Array.isArray(schema.anyOf)) {
    const variants = schema.anyOf
      .filter(
        (value): value is Record<string, unknown> =>
          typeof value === 'object' && value !== null && !Array.isArray(value),
      )
      .map(jsonSchemaType)
      .filter((value) => value !== 'unknown')
    if (variants.length > 0) return [...new Set(variants)].join(' | ')
  }
  return 'unknown'
}

function schemaConstraints(
  schema: Readonly<Record<string, unknown>>,
): readonly string[] {
  const constraints: string[] = []
  if (Array.isArray(schema.enum)) {
    constraints.push(`one of: ${schema.enum.map(String).join(', ')}`)
  }
  const labels = {
    minLength: 'minimum length',
    maxLength: 'maximum length',
    minimum: 'minimum',
    maximum: 'maximum',
    minItems: 'minimum items',
    maxItems: 'maximum items',
    pattern: 'pattern',
    format: 'format',
  } as const
  for (const [key, label] of Object.entries(labels)) {
    const value = schema[key]
    if (typeof value === 'string' || typeof value === 'number') {
      constraints.push(`${label}: ${value}`)
    }
  }
  return constraints
}

function jsonLiteral(value: unknown): SilenJsonValue {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) {
    throw new TypeError('Config API defaults must be JSON-compatible literals')
  }
  return JSON.parse(serialized) as SilenJsonValue
}

function fieldFromSource(source: ConfigApiFieldSource): SilenConfigApiField {
  const schema = source.schema ? publicJsonSchema(source.schema) : undefined
  const parsedDefault = source.schema?.safeParse(undefined)
  const defaultValue =
    parsedDefault?.success === true && parsedDefault.data !== undefined
      ? parsedDefault.data
      : source.default
  const description =
    source.description ??
    (typeof schema?.description === 'string' ? schema.description : undefined)
  if (description === undefined) {
    throw new TypeError(`Config API field ${source.path} needs a description`)
  }
  const constraints = [
    ...(schema === undefined ? [] : schemaConstraints(schema)),
    ...(source.constraints ?? []),
  ]

  return {
    path: source.path,
    type:
      source.type ??
      (schema === undefined ? 'unknown' : jsonSchemaType(schema)),
    required: source.schema?.safeParse(undefined).success === false,
    ...(defaultValue === undefined
      ? {}
      : { default: jsonLiteral(defaultValue) }),
    ...(constraints.length === 0
      ? {}
      : { constraints: [...new Set(constraints)] }),
    description,
    introduced: 1,
  }
}

function assertCoverage(fields: readonly SilenConfigApiField[]): void {
  const paths = fields.map((field) => field.path)
  if (new Set(paths).size !== paths.length) {
    throw new TypeError('Config API field paths must be unique')
  }
  const coveredPaths = Object.values(publicConfigApiCoverage).flat()
  if (
    coveredPaths.length !== paths.length ||
    coveredPaths.some((path) => !paths.includes(path))
  ) {
    throw new TypeError(
      'Config API coverage does not match public config fields',
    )
  }
}

export function createConfigApiContract(): SilenApiContract['config'] {
  const fields = configApiFieldSources.map(fieldFromSource)
  assertCoverage(fields)
  return { fields }
}
