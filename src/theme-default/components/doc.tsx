import type { ReactNode } from 'react'
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react'
import { Link, useData, useRoute } from '../../client/index.js'
import type { ThemeSidebarItem } from '../../shared/config.js'
import { isActiveThemeLink, resolveThemeLink } from '../lib/navigation.js'
import { AiPageActions } from './ai-actions.js'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card.js'

function PagerLink({
  base,
  direction,
  item,
}: {
  readonly base: string
  readonly direction: 'Previous' | 'Next'
  readonly item: ThemeSidebarItem
}): React.JSX.Element {
  const next = direction === 'Next'
  return (
    <Card className={next ? 'sm:col-start-2' : undefined}>
      <CardHeader>
        <CardDescription>{direction}</CardDescription>
        <CardTitle>
          <Link
            href={resolveThemeLink(item.link, base)}
            aria-label={`${direction}: ${item.text}`}
            className="flex items-center gap-2 rounded-sm text-base focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            {!next ? <ArrowLeftIcon aria-hidden="true" /> : null}
            <span>{item.text}</span>
            {next ? <ArrowRightIcon aria-hidden="true" /> : null}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="sr-only">
        {direction} page: {item.text}
      </CardContent>
    </Card>
  )
}

export function DocLayout({
  children,
}: {
  readonly children: ReactNode
}): React.JSX.Element {
  const { base, frontmatter, route, siteTitle, themeConfig } = useData()
  const currentRoute = useRoute()
  const pages = (themeConfig?.sidebar ?? []).flatMap((group) => group.items)
  const currentIndex = pages.findIndex((item) =>
    isActiveThemeLink(currentRoute, item.link, base),
  )
  const previous = currentIndex > 0 ? pages[currentIndex - 1] : undefined
  const next = currentIndex >= 0 ? pages[currentIndex + 1] : undefined
  const title =
    typeof frontmatter?.title === 'string' ? frontmatter.title : siteTitle
  const markdownPath =
    route === '/'
      ? '/index.md'
      : route.endsWith('/')
        ? `${route}index.md`
        : `${route}.md`

  return (
    <article className="silen-doc">
      {children}
      <AiPageActions
        title={title}
        markdownUrl={resolveThemeLink(markdownPath, base)}
        canonicalUrl={resolveThemeLink(route, base)}
      />
      {previous || next ? (
        <nav aria-label="Page navigation" className="silen-pager">
          {previous ? (
            <PagerLink base={base} direction="Previous" item={previous} />
          ) : null}
          {next ? <PagerLink base={base} direction="Next" item={next} /> : null}
        </nav>
      ) : null}
    </article>
  )
}

export function PageLayout({
  children,
}: {
  readonly children: ReactNode
}): React.JSX.Element {
  return <article className="silen-page">{children}</article>
}
