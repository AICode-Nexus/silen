import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import DefaultTheme, {
  defineTheme,
  type ThemeDefinition,
} from '../../src/theme-default'

function CustomPage({ children }: React.PropsWithChildren): React.JSX.Element {
  return <article data-custom-page="">{children}</article>
}

function CustomPre({ children }: React.PropsWithChildren): React.JSX.Element {
  return <pre data-custom-pre="">{children}</pre>
}

function CustomNotFound(): React.JSX.Element {
  return <h1>Custom missing page</h1>
}

describe('theme extension contract', () => {
  it('merges inherited layouts and components while allowing explicit overrides', () => {
    const theme = defineTheme({
      extends: DefaultTheme,
      layouts: { page: CustomPage },
      components: { pre: CustomPre, Demo: CustomPage },
      NotFound: CustomNotFound,
    })

    expect(theme.Layout).toBe(DefaultTheme.Layout)
    expect(theme.layouts?.doc).toBe(DefaultTheme.layouts.doc)
    expect(theme.layouts?.home).toBe(DefaultTheme.layouts.home)
    expect(theme.layouts?.page).toBe(CustomPage)
    expect(theme.components?.CodeBlock).toBe(DefaultTheme.components.CodeBlock)
    expect(theme.components?.pre).toBe(CustomPre)
    expect(theme.components?.Demo).toBe(CustomPage)
    expect(theme.NotFound).toBe(CustomNotFound)
  })

  it('inherits NotFound and composes the extending root wrapper outside its base', () => {
    const base = defineTheme({
      Layout: DefaultTheme.Layout,
      NotFound: CustomNotFound,
      wrapRoot({ children }) {
        return <div data-base-root="">{children}</div>
      },
    })
    const theme = defineTheme({
      extends: base,
      wrapRoot({ children }) {
        return <section data-extension-root="">{children}</section>
      },
    })
    const WrapRoot = theme.wrapRoot

    expect(theme.NotFound).toBe(CustomNotFound)
    expect(WrapRoot).toBeTypeOf('function')
    expect(
      renderToStaticMarkup(
        WrapRoot ? (
          <WrapRoot>
            <p>Theme content</p>
          </WrapRoot>
        ) : null,
      ),
    ).toBe(
      '<section data-extension-root=""><div data-base-root=""><p>Theme content</p></div></section>',
    )
  })

  it('rejects a theme definition that recursively extends itself', () => {
    const cyclic: Record<string, unknown> = {
      Layout: DefaultTheme.Layout,
    }
    cyclic.extends = cyclic

    expect(() => defineTheme(cyclic as unknown as ThemeDefinition)).toThrow(
      /cannot extend itself/i,
    )
  })
})
