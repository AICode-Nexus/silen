import { createHighlighter, type Highlighter } from 'shiki'

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

function normalizedLanguage(instance: Highlighter, language: string): string {
  const requested = language.trim().toLowerCase()
  return instance.getLoadedLanguages().includes(requested) ? requested : 'text'
}

export async function highlightCode(
  code: string,
  language: string,
): Promise<string> {
  const instance = await loadHighlighter()
  return instance.codeToHtml(code, {
    lang: normalizedLanguage(instance, language),
    themes,
  })
}

export async function highlightCodeToHast(
  code: string,
  language: string,
): Promise<HighlightedRoot> {
  const instance = await loadHighlighter()
  return instance.codeToHast(code, {
    lang: normalizedLanguage(instance, language),
    themes,
  })
}
