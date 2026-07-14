import type { ReactNode } from 'react'

export function Demo({
  children,
}: {
  readonly children?: ReactNode
}): React.JSX.Element {
  return (
    <section data-demo="" data-theme-version="original">
      {children}
    </section>
  )
}
