export interface RouteRecord {
  path: string
  file: string
  relativeFile: string
}

export type JsonPrimitive = string | number | boolean | null

export type JsonValue =
  JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[]

export type JsonObject = { readonly [key: string]: JsonValue }

export interface Heading {
  depth: number
  title: string
  slug: string
}
