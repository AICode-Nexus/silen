import GithubSlugger from 'github-slugger'
import { visit } from 'unist-util-visit'
import type { Heading } from '../shared/page.js'

interface PageDataNode {
  type: string
  children?: PageDataNode[]
  data?: {
    hProperties?: Record<string, unknown>
  }
  depth?: unknown
  url?: unknown
  value?: unknown
}

interface PageDataFile {
  data: Record<string, unknown>
}

function isPageDataNode(value: unknown): value is PageDataNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  )
}

function isPageDataFile(value: unknown): value is PageDataFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    typeof value.data === 'object' &&
    value.data !== null
  )
}

function nodeText(node: PageDataNode): string {
  if (typeof node.value === 'string') return node.value
  return node.children?.map(nodeText).join('') ?? ''
}

export interface ExtractedPageData {
  readonly title: string | undefined
  readonly headings: Heading[]
  readonly links: string[]
}

export function extractPageData(tree: unknown): ExtractedPageData {
  if (!isPageDataNode(tree)) {
    return { title: undefined, headings: [], links: [] }
  }

  const slugger = new GithubSlugger()
  const headings: Heading[] = []
  const links: string[] = []
  let title: string | undefined

  visit(tree, (node) => {
    if (node.type === 'heading' && typeof node.depth === 'number') {
      const headingTitle = nodeText(node)
      if (node.depth === 1 && title === undefined) title = headingTitle
      if (node.depth >= 2 && node.depth <= 6) {
        const slug = slugger.slug(headingTitle)
        headings.push({ depth: node.depth, title: headingTitle, slug })
        node.data = {
          ...node.data,
          hProperties: {
            ...node.data?.hProperties,
            id: node.data?.hProperties?.id ?? slug,
          },
        }
      }
    }

    if (node.type === 'link' && typeof node.url === 'string') {
      links.push(node.url)
    }
  })

  return { title, headings, links }
}

export function remarkPageData() {
  return (tree: unknown, file: unknown): void => {
    if (!isPageDataFile(file)) return

    const { headings, links } = extractPageData(tree)
    file.data.headings = headings
    file.data.links = links
  }
}
