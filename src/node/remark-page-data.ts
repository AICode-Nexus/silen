import GithubSlugger from 'github-slugger'
import { visit } from 'unist-util-visit'
import type { Heading } from '../shared/page.js'

interface PageDataNode {
  type: string
  children?: PageDataNode[]
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

export function remarkPageData() {
  return (tree: unknown, file: unknown): void => {
    if (!isPageDataNode(tree) || !isPageDataFile(file)) return

    const slugger = new GithubSlugger()
    const headings: Heading[] = []
    const links: string[] = []

    visit(tree, (node) => {
      if (
        node.type === 'heading' &&
        typeof node.depth === 'number' &&
        node.depth >= 2
      ) {
        const title = nodeText(node)
        headings.push({
          depth: node.depth,
          title,
          slug: slugger.slug(title),
        })
      }

      if (node.type === 'link' && typeof node.url === 'string') {
        links.push(node.url)
      }
    })

    file.data.headings = headings
    file.data.links = links
  }
}
