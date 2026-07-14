export interface AiChunk {
  id: string
  route: string
  title: string
  headingPath: string[]
  text: string
  code: Array<{ language: string; value: string }>
  links: string[]
  order: number
}

export interface AiPage {
  route: string
  title: string
  markdown: string
  description?: string
  draft?: boolean
  ai?: boolean
}
