import './styles/index.css'
import { Layout } from './components/layout.js'
import { CodeBlock } from './components/code-copy.js'
import { DocLayout, PageLayout } from './components/doc.js'
import { HomeLayout } from './components/home.js'
import { NotFound } from './components/not-found.js'

export { CodeBlock, type CodeBlockProps } from './components/code-copy.js'
export { DocLayout, PageLayout } from './components/doc.js'
export { HomeLayout, type HomeLayoutProps } from './components/home.js'
export { NotFound } from './components/not-found.js'

export { Layout } from './components/layout.js'
export {
  AppearanceSwitch,
  type AppearancePreference,
} from './components/appearance.js'
export { appearanceScript } from './appearance-script.js'

export const layouts = {
  doc: DocLayout,
  home: HomeLayout,
  page: PageLayout,
} as const

export const components = {
  pre: CodeBlock,
  CodeBlock,
}

const DefaultTheme = { Layout, layouts, NotFound, components }

export default DefaultTheme
