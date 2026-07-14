declare module '*.mdx' {
  import type { ComponentType } from 'react'

  interface Heading {
    depth: number
    title: string
    slug: string
  }

  type JsonPrimitive = string | number | boolean | null
  type JsonValue =
    JsonPrimitive | { readonly [key: string]: JsonValue } | readonly JsonValue[]
  type JsonObject = { readonly [key: string]: JsonValue }

  export const frontmatter: JsonObject
  export const headings: readonly Heading[]
  export const links: readonly string[]

  const MDXContent: ComponentType
  export default MDXContent
}
