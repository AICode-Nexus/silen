import type { PropsWithChildren } from 'react'

export function wrapRoot({ children }: PropsWithChildren): React.JSX.Element {
  return <div data-example-analytics-root="">{children}</div>
}

export function setup(): () => void {
  const track = (): void => {
    document.dispatchEvent(new CustomEvent('example:pageview'))
  }
  window.addEventListener('popstate', track)
  return () => window.removeEventListener('popstate', track)
}
