import { createHash } from 'node:crypto'
import MiniSearch from 'minisearch'

export interface WorkspaceSearchDocument {
  id: string
  path: string
  route: string
  title: string
  text: string
}

export interface WorkspaceSearchResult {
  path: string
  route: string
  title: string
  score: number
  excerpt: string
}

export interface SerializedWorkspaceIndex {
  version: 1
  fingerprint: string
  documents: WorkspaceSearchDocument[]
}

export function fingerprintDocuments(
  documents: readonly WorkspaceSearchDocument[],
): string {
  const hash = createHash('sha256')
  for (const document of documents) {
    hash.update(document.path)
    hash.update('\0')
    hash.update(document.title)
    hash.update('\0')
    hash.update(document.text)
    hash.update('\0')
  }
  return hash.digest('hex')
}

function excerpt(text: string, terms: readonly string[]): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const lowered = normalized.toLowerCase()
  const firstMatch = terms
    .map((term) => lowered.indexOf(term.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0]
  const start = Math.max(0, (firstMatch ?? 0) - 80)
  return normalized.slice(start, start + 320)
}

export function createWorkspaceSearch(documents: WorkspaceSearchDocument[]) {
  const index = new MiniSearch<WorkspaceSearchDocument>({
    fields: ['title', 'text'],
    storeFields: ['path', 'route', 'title', 'text'],
    searchOptions: { combineWith: 'AND', prefix: true },
  })
  index.addAll(documents)

  return {
    search(query: string, limit: number): WorkspaceSearchResult[] {
      const terms = query.trim().split(/\s+/)
      return index
        .search(query)
        .sort(
          (left, right) =>
            right.score - left.score ||
            String(left.path).localeCompare(String(right.path)),
        )
        .slice(0, limit)
        .map((result) => ({
          path: String(result.path),
          route: String(result.route),
          title: String(result.title),
          score: Number(result.score.toFixed(6)),
          excerpt: excerpt(String(result.text), terms),
        }))
    },
  }
}
