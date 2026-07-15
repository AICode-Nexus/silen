import type { PropsWithChildren } from 'react'

export function wrapRoot({ children }: PropsWithChildren): React.JSX.Element {
  return <div data-plugin-client-root="">{children}</div>
}

export function setup(): () => void {
  document.documentElement.dataset.pluginClient = 'active'
  return () => {
    delete document.documentElement.dataset.pluginClient
  }
}
