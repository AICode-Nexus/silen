import './styles/index.css'
import type { ComponentType, ElementType, ReactNode } from 'react'
import { Layout } from './components/layout.js'
import { CodeBlock } from './components/code-copy.js'
import { DocLayout, PageLayout } from './components/doc.js'
import { HomeLayout } from './components/home.js'
import { NotFound } from './components/not-found.js'
import { Table } from './components/table.js'
import { Link } from '../client/router.js'

export { CodeBlock, type CodeBlockProps } from './components/code-copy.js'
export { DocLayout, PageLayout } from './components/doc.js'
export { HomeLayout, type HomeLayoutProps } from './components/home.js'
export { NotFound } from './components/not-found.js'
export { Table, type TableProps } from './components/table.js'

export { Layout } from './components/layout.js'
export {
  AppearanceSwitch,
  type AppearancePreference,
} from './components/appearance.js'
export { appearanceScript } from './appearance-script.js'

export type LayoutComponent = ComponentType<{ readonly children: ReactNode }>
export type ContentLayoutName = 'doc' | 'home' | 'page'
export type ThemeMdxComponents = Readonly<Record<string, ElementType>>
export type ThemeRoot = ComponentType<{ readonly children: ReactNode }>

export interface Theme {
  readonly Layout: LayoutComponent
  readonly layouts?: Readonly<
    Partial<Record<ContentLayoutName, LayoutComponent>>
  >
  readonly NotFound?: ComponentType
  readonly components?: ThemeMdxComponents
  readonly wrapRoot?: ThemeRoot
}

interface ThemeOverrides {
  readonly Layout?: LayoutComponent
  readonly layouts?: Readonly<
    Partial<Record<ContentLayoutName, LayoutComponent>>
  >
  readonly NotFound?: ComponentType
  readonly components?: ThemeMdxComponents
  readonly wrapRoot?: ThemeRoot
}

export type ThemeDefinition = ThemeOverrides &
  (
    | { readonly extends: Theme }
    | { readonly extends?: never; readonly Layout: LayoutComponent }
  )

function assertNoExtensionCycle(definition: ThemeDefinition): void {
  const seen = new Set<object>([definition])
  let candidate: unknown = definition.extends

  while (typeof candidate === 'object' && candidate !== null) {
    if (seen.has(candidate)) {
      throw new TypeError('A Silen theme cannot extend itself recursively')
    }
    seen.add(candidate)
    candidate = (candidate as { readonly extends?: unknown }).extends
  }
}

function composedRoot(
  inherited: ThemeRoot | undefined,
  extension: ThemeRoot | undefined,
): ThemeRoot | undefined {
  if (!inherited) return extension
  if (!extension) return inherited
  const BaseRoot = inherited
  const ExtensionRoot = extension

  function ComposedThemeRoot({
    children,
  }: {
    readonly children: ReactNode
  }): React.JSX.Element {
    return (
      <ExtensionRoot>
        <BaseRoot>{children}</BaseRoot>
      </ExtensionRoot>
    )
  }

  return ComposedThemeRoot
}

export function defineTheme(definition: ThemeDefinition): Theme {
  assertNoExtensionCycle(definition)
  const inherited = definition.extends
  const Layout = definition.Layout ?? inherited?.Layout
  if (!Layout) {
    throw new TypeError('A Silen theme requires a Layout or extends theme')
  }

  const mergedLayouts = {
    ...inherited?.layouts,
    ...definition.layouts,
  }
  const mergedComponents = {
    ...inherited?.components,
    ...definition.components,
  }
  const NotFound = definition.NotFound ?? inherited?.NotFound
  const wrapRoot = composedRoot(inherited?.wrapRoot, definition.wrapRoot)

  return {
    Layout,
    ...(Object.keys(mergedLayouts).length === 0
      ? {}
      : { layouts: mergedLayouts }),
    ...(NotFound === undefined ? {} : { NotFound }),
    ...(Object.keys(mergedComponents).length === 0
      ? {}
      : { components: mergedComponents }),
    ...(wrapRoot === undefined ? {} : { wrapRoot }),
  }
}

export const layouts = {
  doc: DocLayout,
  home: HomeLayout,
  page: PageLayout,
} as const

export const components = {
  a: Link,
  pre: CodeBlock,
  table: Table,
  CodeBlock,
}

export const DefaultTheme = {
  Layout,
  layouts,
  NotFound,
  components,
} satisfies Theme

export default DefaultTheme
