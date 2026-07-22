import MiniSearch, {
  type AsPlainObject,
  type Options,
  type SearchResult as MiniSearchResult,
} from 'minisearch'
import { createProcessor } from '@mdx-js/mdx'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import type { CompiledPage } from './mdx.js'
import { resolveCurrentLocale, type ThemeLocaleItem } from '../shared/config.js'

export interface SearchDocument {
  readonly id: string
  readonly lang: string
  readonly title: string
  readonly route: string
  readonly description?: string
  readonly text: string
  readonly headings?: string | readonly string[]
  readonly heading?: string
}

export interface SearchResult {
  readonly id: string
  readonly title: string
  readonly route: string
  readonly snippet: string
  readonly heading?: string
  readonly lang?: string
}

export interface RankedSearchResult extends SearchResult {
  readonly score: number
}

interface IndexedSearchDocument {
  id: string
  lang: string
  title: string
  route: string
  description?: string
  text: string
  headings: string[]
  heading?: string
}

export interface LegacySerializedSearchIndex {
  readonly version: 1
  readonly index: AsPlainObject
}

export interface SerializedSearchIndex {
  readonly version: 2
  readonly index: AsPlainObject
}

export type ReadableSearchIndex =
  LegacySerializedSearchIndex | SerializedSearchIndex

export interface SearchOptions {
  readonly lang?: string
}

const SEARCH_OPTIONS: Options<IndexedSearchDocument> = {
  fields: ['title', 'description', 'headings', 'text'],
  storeFields: [
    'title',
    'route',
    'description',
    'text',
    'headings',
    'heading',
    'lang',
  ],
  searchOptions: {
    boost: { title: 4, description: 3, headings: 2 },
    prefix: true,
    fuzzy: 0.2,
  },
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizedHeadings(headings: SearchDocument['headings']): string[] {
  const values = typeof headings === 'string' ? [headings] : (headings ?? [])
  return values.map(normalizedText).filter(Boolean)
}

function normalizedDocument(document: SearchDocument): IndexedSearchDocument {
  const heading = document.heading && normalizedText(document.heading)
  const description =
    document.description && normalizedText(document.description)
  return {
    id: document.id,
    lang: document.lang,
    title: normalizedText(document.title),
    route: document.route,
    ...(description ? { description } : {}),
    text: normalizedText(document.text),
    headings: normalizedHeadings(document.headings),
    ...(heading ? { heading } : {}),
  }
}

export function createSearchIndex(
  documents: readonly SearchDocument[],
): SerializedSearchIndex {
  const ordered = documents
    .map(normalizedDocument)
    .sort(
      (left, right) =>
        compareStrings(left.id, right.id) ||
        compareStrings(left.route, right.route) ||
        compareStrings(left.title, right.title),
    )
  const miniSearch = new MiniSearch<IndexedSearchDocument>(SEARCH_OPTIONS)
  miniSearch.addAll(ordered)
  return { version: 2, index: miniSearch.toJSON() }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      default:
        return '&#39;'
    }
  })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightSnippet(text: string, terms: readonly string[]): string {
  const normalized = normalizedText(text)
  if (!normalized) return ''
  const usefulTerms = [
    ...new Set(terms.map(normalizedText).filter(Boolean)),
  ].sort(
    (left, right) => right.length - left.length || compareStrings(left, right),
  )
  const matcher = usefulTerms.length
    ? new RegExp(usefulTerms.map(escapeRegExp).join('|'), 'gi')
    : undefined
  const firstMatch = matcher?.exec(normalized)
  const matchIndex = firstMatch?.index ?? 0
  const maxLength = 180
  let start = Math.max(0, matchIndex - 70)
  let end = Math.min(normalized.length, start + maxLength)

  if (start > 0) {
    const wordBoundary = normalized.indexOf(' ', start)
    if (wordBoundary >= start && wordBoundary < matchIndex)
      start = wordBoundary + 1
  }
  if (end < normalized.length) {
    const wordBoundary = normalized.lastIndexOf(' ', end)
    if (wordBoundary > matchIndex) end = wordBoundary
  }

  const excerpt = normalized.slice(start, end)
  let highlighted = escapeHtml(excerpt)
  if (usefulTerms.length) {
    const excerptMatcher = new RegExp(
      usefulTerms.map(escapeRegExp).join('|'),
      'gi',
    )
    let cursor = 0
    const pieces: string[] = []
    for (const match of excerpt.matchAll(excerptMatcher)) {
      const index = match.index
      const value = match[0]
      pieces.push(escapeHtml(excerpt.slice(cursor, index)))
      pieces.push(`<mark>${escapeHtml(value)}</mark>`)
      cursor = index + value.length
    }
    pieces.push(escapeHtml(excerpt.slice(cursor)))
    highlighted = pieces.join('')
  }
  return `${start > 0 ? '…' : ''}${highlighted}${end < normalized.length ? '…' : ''}`
}

function includesTerm(value: string, terms: readonly string[]): boolean {
  const normalized = value.toLocaleLowerCase()
  return terms.some((term) => normalized.includes(term.toLocaleLowerCase()))
}

function snippetSource({
  title,
  description,
  text,
  terms,
}: {
  title: string
  description: string
  text: string
  terms: readonly string[]
}): string {
  if (
    description &&
    (includesTerm(title, terms) || includesTerm(description, terms))
  ) {
    return description
  }
  return text || description || title
}

function storedStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function matchingHeading(
  result: MiniSearchResult,
  terms: readonly string[],
): string | undefined {
  if (typeof result.heading === 'string' && result.heading) {
    return result.heading
  }
  const headings = storedStrings(result.headings)
  const loweredTerms = terms.map((term) => term.toLocaleLowerCase())
  return headings.find((heading) => {
    const lowered = heading.toLocaleLowerCase()
    return loweredTerms.some((term) => lowered.includes(term))
  })
}

function compareSearchResults(
  left: MiniSearchResult,
  right: MiniSearchResult,
  lang: string | undefined,
): number {
  return (
    (lang === undefined
      ? 0
      : Number(right.lang === lang) - Number(left.lang === lang)) ||
    right.score - left.score ||
    compareStrings(String(left.title ?? ''), String(right.title ?? '')) ||
    compareStrings(String(left.route ?? ''), String(right.route ?? '')) ||
    compareStrings(String(left.id), String(right.id))
  )
}

export function queryRankedSearchIndex(
  serialized: ReadableSearchIndex,
  query: string,
  options: SearchOptions = {},
): RankedSearchResult[] {
  const normalizedQuery = normalizedText(query)
  if (!normalizedQuery) return []
  if (serialized.version !== 1 && serialized.version !== 2) {
    throw new TypeError(
      `Unsupported Silen search index version ${String((serialized as { readonly version: unknown }).version)}`,
    )
  }

  const miniSearch = MiniSearch.loadJSON<IndexedSearchDocument>(
    JSON.stringify(serialized.index),
    SEARCH_OPTIONS,
  )
  return miniSearch
    .search(normalizedQuery)
    .sort((left, right) =>
      compareSearchResults(
        left,
        right,
        serialized.version === 2 ? options.lang : undefined,
      ),
    )
    .map((result): RankedSearchResult => {
      const terms = [...result.terms, ...result.queryTerms]
      const title = typeof result.title === 'string' ? result.title : ''
      const route = typeof result.route === 'string' ? result.route : ''
      const description =
        typeof result.description === 'string' ? result.description : ''
      const text = typeof result.text === 'string' ? result.text : title
      const heading = matchingHeading(result, terms)
      const lang =
        serialized.version === 2 && typeof result.lang === 'string'
          ? result.lang
          : undefined
      return {
        id: String(result.id),
        title,
        route,
        snippet: highlightSnippet(
          snippetSource({ title, description, text, terms }),
          terms,
        ),
        score: Number(result.score.toFixed(6)),
        ...(lang === undefined ? {} : { lang }),
        ...(heading === undefined ? {} : { heading }),
      }
    })
}

export function querySearchIndex(
  serialized: ReadableSearchIndex,
  query: string,
  options: SearchOptions = {},
): SearchResult[] {
  return queryRankedSearchIndex(serialized, query, options).map(
    ({ score, ...result }) => {
      void score
      return result
    },
  )
}

export function serializeSearchIndex(index: SerializedSearchIndex): string {
  return JSON.stringify(index)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}

interface SearchAstNode {
  readonly type: string
  readonly alt?: unknown
  readonly children?: readonly unknown[]
  readonly depth?: unknown
  readonly name?: unknown
  readonly value?: unknown
}

interface ExtractedSearchHeading {
  readonly depth: number
  readonly title: string
}

interface ExtractedSearchContent {
  readonly text: string
  readonly headings: readonly ExtractedSearchHeading[]
}

const searchTextParser = createProcessor({
  remarkPlugins: [remarkGfm, [remarkFrontmatter, ['yaml', 'toml']]],
})

function isSearchAstNode(value: unknown): value is SearchAstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  )
}

function isPrivateJsxElement(node: SearchAstNode): boolean {
  return (
    (node.type === 'mdxJsxTextElement' || node.type === 'mdxJsxFlowElement') &&
    typeof node.name === 'string' &&
    /^(?:script|style)$/i.test(node.name)
  )
}

function childText(node: SearchAstNode, separator: string): string {
  return (node.children ?? [])
    .filter(isSearchAstNode)
    .map(publicSearchText)
    .filter(Boolean)
    .join(separator)
}

function publicSearchText(node: SearchAstNode): string {
  if (isPrivateJsxElement(node)) return ''

  switch (node.type) {
    case 'text':
      return typeof node.value === 'string' ? node.value : ''
    case 'inlineCode':
    case 'code':
      // Code is rendered public content and intentionally remains searchable.
      return typeof node.value === 'string' ? node.value : ''
    case 'image':
    case 'imageReference':
      return typeof node.alt === 'string' ? node.alt : ''
    case 'break':
      return '\n'
    case 'emphasis':
    case 'strong':
    case 'delete':
    case 'link':
    case 'linkReference':
    case 'paragraph':
    case 'heading':
    case 'mdxJsxTextElement':
      return childText(node, '')
    case 'mdxJsxFlowElement':
      return childText(node, '\n')
    case 'root':
    case 'blockquote':
    case 'list':
    case 'listItem':
    case 'table':
    case 'tableRow':
    case 'tableCell':
      return childText(node, '\n')
    default:
      // ESM, frontmatter, expressions, HTML and other metadata are private.
      return ''
  }
}

function collectPublicHeadings(
  node: SearchAstNode,
  headings: ExtractedSearchHeading[],
): void {
  if (isPrivateJsxElement(node)) return

  if (node.type === 'heading' && typeof node.depth === 'number') {
    const title = normalizedText(publicSearchText(node))
    if (title) headings.push({ depth: node.depth, title })
    return
  }
  if (
    !['root', 'blockquote', 'list', 'listItem', 'mdxJsxFlowElement'].includes(
      node.type,
    )
  ) {
    return
  }
  for (const child of node.children ?? []) {
    if (isSearchAstNode(child)) collectPublicHeadings(child, headings)
  }
}

function extractSearchContent(source: string): ExtractedSearchContent {
  const tree = searchTextParser.parse(source)
  const headings: ExtractedSearchHeading[] = []
  collectPublicHeadings(tree, headings)
  return { text: normalizedText(publicSearchText(tree)), headings }
}

export function markdownToSearchText(source: string): string {
  return extractSearchContent(source).text
}

export function createPageSearchDocuments(
  pages: readonly CompiledPage[],
  options: {
    readonly lang: string
    readonly locales?: readonly ThemeLocaleItem[]
  } = { lang: 'en-US' },
): SearchDocument[] {
  return pages.map((page) => {
    const content = extractSearchContent(page.source)
    const lang = resolveCurrentLocale(
      options.locales,
      page.route,
      '/',
      options.lang,
    ).lang
    return {
      id: page.route,
      lang,
      title: page.title,
      route: page.route,
      ...(page.description ? { description: page.description } : {}),
      headings: content.headings
        .filter((heading) => heading.depth >= 2)
        .map((heading) => heading.title),
      text: content.text,
    }
  })
}
