import type { ReactNode } from 'react'
import DefaultTheme, { defineTheme } from 'silen/theme'

function Demo({
  children,
}: {
  readonly children?: ReactNode
}): React.JSX.Element {
  return <section data-demo="">{children}</section>
}

export default defineTheme({
  extends: DefaultTheme,
  components: { Demo },
  wrapRoot({ children }) {
    return <div data-custom-root="">{children}</div>
  },
})
