import MiniSearch, {
  type AsPlainObject,
  type Options,
  type SearchResult as MiniSearchResult,
} from 'minisearch'

export interface SearchResult {
  readonly id: string
  readonly title: string
  readonly route: string
  readonly snippet: string
  readonly heading?: string
  readonly lang?: string
}

export interface SearchOptions {
  readonly base?: string
  readonly signal?: AbortSignal
  readonly lang?: string
}

interface IndexedSearchDocument {
  id: string
  lang?: string
  title: string
  route: string
  description?: string
  text: string
  headings: string[]
  heading?: string
}

interface SerializedSearchIndex {
  version: 1 | 2
  index: AsPlainObject
}

interface LoadedSearchIndex {
  miniSearch: MiniSearch<IndexedSearchDocument>
  version: 1 | 2
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

const indexCache = new Map<string, Promise<LoadedSearchIndex>>()

function normalizedBase(base: string | undefined): string {
  if (!base || base === '/') return '/'
  const leading = base.startsWith('/') ? base : `/${base}`
  return leading.endsWith('/') ? leading : `${leading}/`
}

export function searchIndexUrl(base: string | undefined): string {
  return `${normalizedBase(base)}search-index.json`
}

function isSerializedSearchIndex(
  value: unknown,
): value is SerializedSearchIndex {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'version' in value &&
    (value.version === 1 || value.version === 2) &&
    'index' in value &&
    typeof value.index === 'object' &&
    value.index !== null &&
    !Array.isArray(value.index)
  )
}

async function fetchSearchIndex(url: string): Promise<LoadedSearchIndex> {
  const response = await fetch(url, {
    cache: 'no-cache',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(
      `Unable to load the Silen search index (${response.status})`,
    )
  }
  const value: unknown = JSON.parse(await response.text())
  if (!isSerializedSearchIndex(value)) {
    throw new TypeError('Invalid Silen search index')
  }
  return {
    version: value.version,
    miniSearch: MiniSearch.loadJSON<IndexedSearchDocument>(
      JSON.stringify(value.index),
      SEARCH_OPTIONS,
    ),
  }
}

function loadSearchIndex(url: string): Promise<LoadedSearchIndex> {
  const cached = indexCache.get(url)
  if (cached) return cached
  const loading = fetchSearchIndex(url).catch((error: unknown) => {
    indexCache.delete(url)
    throw error
  })
  indexCache.set(url, loading)
  return loading
}

function abortError(): DOMException {
  return new DOMException('Search request was aborted', 'AbortError')
}

function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortError())
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(abortError())
    signal.addEventListener('abort', abort, { once: true })
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
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

function highlightedSnippet(text: string, terms: readonly string[]): string {
  const normalized = normalizedText(text)
  if (!normalized) return ''
  const usefulTerms = [
    ...new Set(terms.map(normalizedText).filter(Boolean)),
  ].sort(
    (left, right) => right.length - left.length || compareStrings(left, right),
  )
  const finder = usefulTerms.length
    ? new RegExp(usefulTerms.map(escapeRegExp).join('|'), 'i')
    : undefined
  const matchIndex = finder?.exec(normalized)?.index ?? 0
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
  if (!usefulTerms.length) return escapeHtml(excerpt)
  const matcher = new RegExp(usefulTerms.map(escapeRegExp).join('|'), 'gi')
  let cursor = 0
  const pieces: string[] = []
  for (const match of excerpt.matchAll(matcher)) {
    const index = match.index
    const value = match[0]
    pieces.push(escapeHtml(excerpt.slice(cursor, index)))
    pieces.push(`<mark>${escapeHtml(value)}</mark>`)
    cursor = index + value.length
  }
  pieces.push(escapeHtml(excerpt.slice(cursor)))
  return `${start > 0 ? '…' : ''}${pieces.join('')}${end < normalized.length ? '…' : ''}`
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

function resultHeading(
  result: MiniSearchResult,
  terms: readonly string[],
): string | undefined {
  if (typeof result.heading === 'string' && result.heading)
    return result.heading
  if (!Array.isArray(result.headings)) return undefined
  const loweredTerms = terms.map((term) => term.toLocaleLowerCase())
  return result.headings
    .filter((heading): heading is string => typeof heading === 'string')
    .find((heading) => {
      const lowered = heading.toLocaleLowerCase()
      return loweredTerms.some((term) => lowered.includes(term))
    })
}

function mapResult(
  result: MiniSearchResult,
  includeLanguage: boolean,
): SearchResult {
  const title = typeof result.title === 'string' ? result.title : ''
  const route = typeof result.route === 'string' ? result.route : ''
  const description =
    typeof result.description === 'string' ? result.description : ''
  const text = typeof result.text === 'string' ? result.text : title
  const terms = [...result.terms, ...result.queryTerms]
  const heading = resultHeading(result, terms)
  const lang =
    includeLanguage && typeof result.lang === 'string' ? result.lang : undefined
  return {
    id: String(result.id),
    title,
    route,
    snippet: highlightedSnippet(
      snippetSource({ title, description, text, terms }),
      terms,
    ),
    ...(heading === undefined ? {} : { heading }),
    ...(lang === undefined ? {} : { lang }),
  }
}

export async function search(
  query: string,
  options: SearchOptions = {},
): Promise<SearchResult[]> {
  const normalizedQuery = normalizedText(query)
  if (!normalizedQuery) return []
  const loaded = await abortable(
    loadSearchIndex(searchIndexUrl(options.base)),
    options.signal,
  )
  if (options.signal?.aborted) throw abortError()
  return loaded.miniSearch
    .search(normalizedQuery)
    .sort(
      (left, right) =>
        (loaded.version === 2 && options.lang !== undefined
          ? Number(right.lang === options.lang) -
            Number(left.lang === options.lang)
          : 0) ||
        right.score - left.score ||
        compareStrings(String(left.title ?? ''), String(right.title ?? '')) ||
        compareStrings(String(left.route ?? ''), String(right.route ?? '')) ||
        compareStrings(String(left.id), String(right.id)),
    )
    .map((result) => mapResult(result, loaded.version === 2))
}
