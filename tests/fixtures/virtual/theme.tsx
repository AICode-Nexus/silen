import type { ReactNode } from 'react'

export function Layout({ children }: { children: ReactNode }): ReactNode {
  return children
}

function ContentLayout({
  children,
  name,
}: {
  children: ReactNode
  name: string
}): React.JSX.Element {
  return (
    <section data-testid="content-layout" data-layout={name}>
      {children}
    </section>
  )
}

export const layouts = {
  doc: ({ children }: { children: ReactNode }) => (
    <ContentLayout name="doc">{children}</ContentLayout>
  ),
  home: ({ children }: { children: ReactNode }) => (
    <ContentLayout name="home">{children}</ContentLayout>
  ),
  page: ({ children }: { children: ReactNode }) => (
    <ContentLayout name="page">{children}</ContentLayout>
  ),
}

export function NotFound(): React.JSX.Element {
  return <h1>Fixture theme not found</h1>
}

export const components = {}

export default { Layout, layouts, NotFound, components }
