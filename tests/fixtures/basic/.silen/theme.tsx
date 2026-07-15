import DefaultTheme, { defineTheme } from '@aicode-nexus/silen/theme'
import { Demo } from './demo'

export default defineTheme({
  extends: DefaultTheme,
  components: { Demo },
  wrapRoot({ children }) {
    return <div data-custom-root="">{children}</div>
  },
})
