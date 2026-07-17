import type { ReactNode } from 'react'
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react'
import { Link, useData, useRoute } from '../../client/index.js'
import type { ThemeSidebarItem } from '../../shared/config.js'
import { joinBaseRoute } from '../../shared/url.js'
import { isActiveThemeLink, resolveThemeLink } from '../lib/navigation.js'
import {
  formatThemeMessage,
  resolveThemeConfig,
  useThemeMessages,
} from '../lib/theme-config.js'
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
  messages,
}: {
  readonly base: string
  readonly direction: 'previous' | 'next'
  readonly item: ThemeSidebarItem
  readonly messages: ReturnType<typeof useThemeMessages>['pagination']
}): React.JSX.Element {
  const next = direction === 'next'
  const directionLabel = next ? messages.next : messages.previous
  return (
    <Card className={next ? 'sm:col-start-2' : undefined}>
      <CardHeader>
        <CardDescription>{directionLabel}</CardDescription>
        <CardTitle>
          <Link
            href={resolveThemeLink(item.link, base)}
            aria-label={formatThemeMessage(messages.linkLabel, {
              direction: directionLabel,
              title: item.text,
            })}
            className="flex items-center gap-2 rounded-sm text-base focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            {!next ? <ArrowLeftIcon aria-hidden="true" /> : null}
            <span>{item.text}</span>
            {next ? <ArrowRightIcon aria-hidden="true" /> : null}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="sr-only">
        {formatThemeMessage(messages.pageLabel, {
          direction: directionLabel,
          title: item.text,
        })}
      </CardContent>
    </Card>
  )
}

export function DocLayout({
  children,
}: {
  readonly children: ReactNode
}): React.JSX.Element {
  const {
    ai,
    base,
    frontmatter,
    route,
    siteTitle,
    themeConfig: rawThemeConfig,
  } = useData()
  const currentRoute = useRoute()
  const messages = useThemeMessages()
  const themeConfig = resolveThemeConfig(rawThemeConfig, currentRoute, base)
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
  const hasPublicMarkdown =
    ai?.markdownRoutes !== false &&
    frontmatter?.draft !== true &&
    frontmatter?.ai !== false

  return (
    <article className="silen-doc">
      {children}
      {hasPublicMarkdown ? (
        <AiPageActions
          title={title}
          markdownUrl={joinBaseRoute(base, markdownPath)}
          canonicalUrl={joinBaseRoute(base, route)}
        />
      ) : null}
      {previous || next ? (
        <nav
          aria-label={messages.pagination.navigation}
          className="silen-pager"
        >
          {previous ? (
            <PagerLink
              base={base}
              direction="previous"
              item={previous}
              messages={messages.pagination}
            />
          ) : null}
          {next ? (
            <PagerLink
              base={base}
              direction="next"
              item={next}
              messages={messages.pagination}
            />
          ) : null}
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
