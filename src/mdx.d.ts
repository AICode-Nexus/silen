declare module '*.mdx' {
  import type { ComponentType } from 'react'

  interface Heading {
    depth: number
    title: string
    slug: string
  }

  export const frontmatter: Readonly<Record<string, unknown>>
  export const headings: readonly Heading[]
  export const links: readonly string[]

  const MDXContent: ComponentType
  export default MDXContent
}
