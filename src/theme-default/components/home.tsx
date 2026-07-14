import { useId, type ReactNode } from 'react'
import { ArrowRightIcon } from 'lucide-react'
import { Link, useData } from '../../client/index.js'
import type {
  ThemeHomeAction,
  ThemeHomeFeature,
  ThemeHomeHero,
  ThemeHomeImage,
  ThemeLinkTarget,
} from '../../shared/config.js'
import type { JsonObject, JsonValue } from '../../shared/page.js'
import { resolveThemeLink } from '../lib/navigation.js'
import { Button } from './ui/button.js'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './ui/card.js'

const linkTargets = new Set<ThemeLinkTarget>([
  '_blank',
  '_parent',
  '_self',
  '_top',
])

interface SafeDestination {
  readonly external: boolean
  readonly href: string
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0
    return code <= 0x1f || code === 0x7f
  })
}

function safeDestination(
  link: string,
  base: string,
): SafeDestination | undefined {
  const value = link.trim()
  if (!value || hasControlCharacter(value)) return undefined
  if (value.startsWith('//')) return { external: true, href: value }
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(value)?.[1]?.toLowerCase()
  if (scheme) {
    return ['http', 'https', 'mailto', 'tel'].includes(scheme)
      ? { external: true, href: value }
      : undefined
  }
  return { external: false, href: resolveThemeLink(value, base) }
}

function safeImageSource(src: string, base: string): string | undefined {
  const value = src.trim()
  if (!value || hasControlCharacter(value)) return undefined
  if (value.startsWith('//')) return value
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(value)?.[1]?.toLowerCase()
  if (scheme) {
    return scheme === 'http' ||
      scheme === 'https' ||
      scheme === 'blob' ||
      (scheme === 'data' && value.toLowerCase().startsWith('data:image/'))
      ? value
      : undefined
  }
  return resolveThemeLink(value, base)
}

function safeRel(
  rel: string | undefined,
  target: ThemeLinkTarget | undefined,
): string | undefined {
  const values = new Set((rel ?? '').split(/\s+/).filter(Boolean))
  if (target === '_blank') {
    values.add('noopener')
    values.add('noreferrer')
  }
  return values.size > 0 ? [...values].join(' ') : undefined
}

function HomeLink({
  children,
  className,
  destination,
  rel,
  target,
}: {
  readonly children: ReactNode
  readonly className?: string | undefined
  readonly destination: SafeDestination
  readonly rel?: string | undefined
  readonly target?: ThemeLinkTarget | undefined
}): React.JSX.Element {
  const resolvedTarget =
    target ??
    (destination.external && /^https?:|^\/\//i.test(destination.href)
      ? '_blank'
      : undefined)
  const resolvedRel = safeRel(rel, resolvedTarget)
  if (destination.external) {
    return (
      <a
        href={destination.href}
        className={className}
        target={resolvedTarget}
        rel={resolvedRel}
      >
        {children}
      </a>
    )
  }
  return (
    <Link
      href={destination.href}
      className={className}
      target={resolvedTarget}
      rel={resolvedRel}
    >
      {children}
    </Link>
  )
}

function HeroActions({
  actions,
  base,
}: {
  readonly actions: readonly ThemeHomeAction[]
  readonly base: string
}): React.JSX.Element | null {
  const safeActions = actions.flatMap((action) => {
    const destination = safeDestination(action.link, base)
    return destination ? [{ action, destination }] : []
  })
  if (safeActions.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-3">
      {safeActions.map(({ action, destination }) => (
        <li key={`${action.text}:${action.link}`}>
          <Button
            asChild
            size="lg"
            variant={action.theme === 'alt' ? 'outline' : 'default'}
          >
            <HomeLink
              destination={destination}
              target={action.target}
              rel={action.rel}
            >
              {action.text}
            </HomeLink>
          </Button>
        </li>
      ))}
    </ul>
  )
}

function FeatureCard({
  base,
  feature,
}: {
  readonly base: string
  readonly feature: ThemeHomeFeature
}): React.JSX.Element {
  const destination = feature.link
    ? safeDestination(feature.link, base)
    : undefined
  return (
    <Card>
      <CardHeader>
        {feature.icon ? (
          <span aria-hidden="true" className="mb-2 text-2xl">
            {feature.icon}
          </span>
        ) : null}
        <CardTitle>
          <h3>{feature.title}</h3>
        </CardTitle>
        <CardDescription>{feature.details}</CardDescription>
      </CardHeader>
      {destination ? (
        <CardFooter>
          <Button asChild variant="link" className="px-0">
            <HomeLink
              destination={destination}
              target={feature.target}
              rel={feature.rel}
            >
              {feature.linkText ?? `Learn more about ${feature.title}`}
              <ArrowRightIcon aria-hidden="true" />
            </HomeLink>
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}

function record(
  value: JsonValue | undefined,
): Readonly<Record<string, JsonValue>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, JsonValue>>)
    : undefined
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function targetValue(
  value: JsonValue | undefined,
): ThemeLinkTarget | undefined {
  return typeof value === 'string' && linkTargets.has(value as ThemeLinkTarget)
    ? (value as ThemeLinkTarget)
    : undefined
}

function homeImage(
  value: JsonValue | undefined,
): string | ThemeHomeImage | undefined {
  if (typeof value === 'string') return value
  const image = record(value)
  const src = stringValue(image?.src)
  const alt = stringValue(image?.alt)
  return src && alt !== undefined ? { src, alt } : undefined
}

function homeActions(
  value: JsonValue | undefined,
): readonly ThemeHomeAction[] | undefined {
  if (!Array.isArray(value)) return undefined
  const entries = value as readonly JsonValue[]
  return entries.flatMap((entry) => {
    const action = record(entry)
    const text = stringValue(action?.text)
    const link = stringValue(action?.link)
    if (!text || !link) return []
    const theme =
      action?.theme === 'brand' || action?.theme === 'alt'
        ? action.theme
        : undefined
    const target = targetValue(action?.target)
    const rel = stringValue(action?.rel)
    return [
      {
        text,
        link,
        ...(theme ? { theme } : {}),
        ...(target ? { target } : {}),
        ...(rel ? { rel } : {}),
      },
    ]
  })
}

function homeHero(
  frontmatter: JsonObject | undefined,
): ThemeHomeHero | undefined {
  const hero = record(frontmatter?.hero)
  const name = stringValue(hero?.name)
  if (!name) return undefined
  const text = stringValue(hero?.text)
  const tagline = stringValue(hero?.tagline)
  const image = homeImage(hero?.image)
  const actions = homeActions(hero?.actions)
  return {
    name,
    ...(text ? { text } : {}),
    ...(tagline ? { tagline } : {}),
    ...(image ? { image } : {}),
    ...(actions ? { actions } : {}),
  }
}

function homeFeatures(
  frontmatter: JsonObject | undefined,
): readonly ThemeHomeFeature[] | undefined {
  const value = frontmatter?.features
  if (!Array.isArray(value)) return undefined
  const entries = value as readonly JsonValue[]
  return entries.flatMap((entry) => {
    const feature = record(entry)
    const title = stringValue(feature?.title)
    const details = stringValue(feature?.details)
    if (!title || !details) return []
    const icon = stringValue(feature?.icon)
    const link = stringValue(feature?.link)
    const linkText = stringValue(feature?.linkText)
    const target = targetValue(feature?.target)
    const rel = stringValue(feature?.rel)
    return [
      {
        title,
        details,
        ...(icon ? { icon } : {}),
        ...(link ? { link } : {}),
        ...(linkText ? { linkText } : {}),
        ...(target ? { target } : {}),
        ...(rel ? { rel } : {}),
      },
    ]
  })
}

export interface HomeLayoutProps {
  readonly hero?: ThemeHomeHero
  readonly features?: readonly ThemeHomeFeature[]
  readonly children: ReactNode
}

export function HomeLayout({
  children,
  features: featureProps,
  hero: heroProps,
}: HomeLayoutProps): React.JSX.Element {
  const { base, frontmatter, themeConfig } = useData()
  const hero = heroProps ?? homeHero(frontmatter) ?? themeConfig?.home?.hero
  const features =
    featureProps ??
    homeFeatures(frontmatter) ??
    themeConfig?.home?.features ??
    []
  const heroTitleId = useId()
  const featuresTitleId = useId()
  const image = hero?.image
  const imageData = typeof image === 'string' ? { src: image, alt: '' } : image
  const imageSource = imageData
    ? safeImageSource(imageData.src, base)
    : undefined

  return (
    <div className="mx-auto flex max-w-[var(--silen-layout-width)] flex-col gap-16 px-6 py-16 sm:py-20 lg:px-10">
      {hero ? (
        <section
          aria-labelledby={heroTitleId}
          className="grid items-center gap-12 lg:grid-cols-2"
        >
          <div className="flex flex-col gap-6">
            <h1
              id={heroTitleId}
              className="text-balance text-5xl font-semibold tracking-tight sm:text-6xl"
            >
              {hero.name}
            </h1>
            {hero.text ? (
              <p className="text-2xl font-medium">{hero.text}</p>
            ) : null}
            {hero.tagline ? (
              <p className="max-w-2xl text-xl text-muted-foreground">
                {hero.tagline}
              </p>
            ) : null}
            <HeroActions actions={hero.actions ?? []} base={base} />
          </div>
          {imageSource && imageData ? (
            <img
              src={imageSource}
              alt={imageData.alt}
              className="mx-auto max-h-96 w-full object-contain"
            />
          ) : null}
        </section>
      ) : null}
      {features.length > 0 ? (
        <section aria-labelledby={featuresTitleId}>
          <h2 id={featuresTitleId} className="sr-only">
            Features
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <FeatureCard
                key={`${feature.title}:${feature.link ?? ''}`}
                feature={feature}
                base={base}
              />
            ))}
          </div>
        </section>
      ) : null}
      {children}
    </div>
  )
}
