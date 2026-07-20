import {
  bundledLanguages,
  createHighlighter,
  type BundledLanguage,
  type Highlighter,
} from 'shiki'

const themes = {
  light: 'github-light',
  dark: 'github-dark',
} as const

const languages = [
  'bash',
  'css',
  'html',
  'javascript',
  'json',
  'jsx',
  'markdown',
  'tsx',
  'typescript',
] as const

const languageAliases: Readonly<Record<string, BundledLanguage>> = {
  ndjson: 'jsonl',
}

export interface HighlightedNode {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HighlightedNode[]
}

export interface HighlightedRoot extends HighlightedNode {
  type: 'root'
  children: HighlightedNode[]
}

let cachedHighlighter: Promise<Highlighter> | undefined
const languageLoads = new Map<BundledLanguage, Promise<void>>()

function loadHighlighter(): Promise<Highlighter> {
  if (!cachedHighlighter) {
    cachedHighlighter = createHighlighter({
      themes: Object.values(themes),
      langs: [...languages],
    })
    void cachedHighlighter.catch(() => {
      cachedHighlighter = undefined
    })
  }
  return cachedHighlighter
}

async function normalizedLanguage(
  instance: Highlighter,
  language: string,
): Promise<string> {
  const requested = language.trim().toLowerCase()
  const resolved = languageAliases[requested] ?? requested
  if (!(resolved in bundledLanguages)) return 'text'

  const bundled = resolved as BundledLanguage
  if (!instance.getLoadedLanguages().includes(bundled)) {
    let loading = languageLoads.get(bundled)
    if (!loading) {
      loading = instance.loadLanguage(bundled).catch((error: unknown) => {
        languageLoads.delete(bundled)
        throw error
      })
      languageLoads.set(bundled, loading)
    }
    await loading
  }
  return bundled
}

export async function highlightCode(
  code: string,
  language: string,
): Promise<string> {
  const instance = await loadHighlighter()
  return instance.codeToHtml(code, {
    lang: await normalizedLanguage(instance, language),
    themes,
  })
}

export async function highlightCodeToHast(
  code: string,
  language: string,
): Promise<HighlightedRoot> {
  const instance = await loadHighlighter()
  return instance.codeToHast(code, {
    lang: await normalizedLanguage(instance, language),
    themes,
  })
}
