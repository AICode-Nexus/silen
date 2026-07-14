import MiniSearch, {
  type AsPlainObject,
  type Options,
  type SearchResult as MiniSearchResult,
} from 'minisearch'
import matter from 'gray-matter'
import type { CompiledPage } from './mdx.js'

export interface SearchDocument {
  readonly id: string
  readonly title: string
  readonly route: string
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
}

interface IndexedSearchDocument {
  id: string
  title: string
  route: string
  text: string
  headings: string[]
  heading?: string
}

export interface SerializedSearchIndex {
  readonly version: 1
  readonly index: AsPlainObject
}

const SEARCH_OPTIONS: Options<IndexedSearchDocument> = {
  fields: ['title', 'headings', 'text'],
  storeFields: ['title', 'route', 'text', 'headings', 'heading'],
  searchOptions: {
    boost: { title: 4, headings: 2 },
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
  return {
    id: document.id,
    title: normalizedText(document.title),
    route: document.route,
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
  return { version: 1, index: miniSearch.toJSON() }
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
): number {
  return (
    right.score - left.score ||
    compareStrings(String(left.title ?? ''), String(right.title ?? '')) ||
    compareStrings(String(left.route ?? ''), String(right.route ?? '')) ||
    compareStrings(String(left.id), String(right.id))
  )
}

export function querySearchIndex(
  serialized: SerializedSearchIndex,
  query: string,
): SearchResult[] {
  const normalizedQuery = normalizedText(query)
  if (!normalizedQuery) return []
  if (serialized.version !== 1) {
    throw new TypeError(
      `Unsupported Silen search index version ${String(serialized.version)}`,
    )
  }

  const miniSearch = MiniSearch.loadJSON<IndexedSearchDocument>(
    JSON.stringify(serialized.index),
    SEARCH_OPTIONS,
  )
  return miniSearch
    .search(normalizedQuery)
    .sort(compareSearchResults)
    .map((result): SearchResult => {
      const terms = [...result.terms, ...result.queryTerms]
      const title = typeof result.title === 'string' ? result.title : ''
      const route = typeof result.route === 'string' ? result.route : ''
      const text = typeof result.text === 'string' ? result.text : title
      const heading = matchingHeading(result, terms)
      return {
        id: String(result.id),
        title,
        route,
        snippet: highlightSnippet(text, terms),
        ...(heading === undefined ? {} : { heading }),
      }
    })
}

export function serializeSearchIndex(index: SerializedSearchIndex): string {
  return JSON.stringify(index)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}

function stripMdxEsm(content: string): string {
  const output: string[] = []
  let fence: string | undefined
  let skippingEsm = false

  for (const line of content.split(/\r?\n/)) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line)?.[1]
    if (fenceMatch) {
      if (fence === undefined) fence = fenceMatch[0]
      else if (fenceMatch[0] === fence) fence = undefined
      output.push(line)
      continue
    }
    if (fence !== undefined) {
      output.push(line)
      continue
    }

    if (skippingEsm) {
      if (line.trim() === '') {
        skippingEsm = false
        output.push('')
      }
      continue
    }
    if (/^\s*(?:import|export)\b/.test(line)) {
      skippingEsm = !/[;}]\s*$/.test(line)
      continue
    }
    output.push(line)
  }
  return output.join('\n')
}

function decodePlainTextEntities(value: string): string {
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
}

export function markdownToSearchText(source: string): string {
  const content = stripMdxEsm(matter(source).content)
  return normalizedText(
    decodePlainTextEntities(
      content
        .replace(/<!--[^]*?-->/g, ' ')
        .replace(/^\s*(```+|~~~+).*$/gm, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\{[^{}]*}/g, ' ')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/^\s{0,3}>\s?/gm, '')
        .replace(/^\s*[-+*]\s+/gm, '')
        .replace(/^\s*\d+[.)]\s+/gm, '')
        .replace(/[|*_~]+/g, ' '),
    ),
  )
}

export function createPageSearchDocuments(
  pages: readonly CompiledPage[],
): SearchDocument[] {
  return pages.map((page) => ({
    id: page.route,
    title: page.title,
    route: page.route,
    headings: page.headings.map((heading) => heading.title),
    text: markdownToSearchText(page.source),
  }))
}
