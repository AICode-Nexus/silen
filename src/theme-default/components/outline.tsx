import { useData } from '../../client/index.js'

export function Outline(): React.JSX.Element {
  const headings = (useData().headings ?? []).filter(
    (heading) => heading.depth === 2 || heading.depth === 3,
  )
  return (
    <aside
      aria-label="On this page"
      className="sticky top-[var(--silen-nav-height)] hidden h-[calc(100svh-var(--silen-nav-height))] px-6 py-10 min-[60rem]:block"
    >
      <h2 className="mb-3 text-sm font-semibold">On this page</h2>
      <ul className="flex flex-col gap-2 border-l pl-4">
        {headings.map((heading) => (
          <li key={`${heading.slug}:${heading.depth}`}>
            <a
              href={`#${encodeURIComponent(heading.slug)}`}
              className={
                heading.depth === 3
                  ? 'block pl-3 text-sm text-muted-foreground hover:text-foreground'
                  : 'block text-sm text-muted-foreground hover:text-foreground'
              }
            >
              {heading.title}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  )
}
