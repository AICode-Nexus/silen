import {
  createContext,
  useContext,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react'
import { navigateDocument } from './navigation.js'
import { isSitePathWithinBase, resolveSiteLink } from '../shared/url.js'

export interface Router {
  path: string
  base?: string
  go: (href: string) => Promise<void>
  prefetch: (href: string) => Promise<void>
}

export interface RouterProviderProps {
  value: Router
  children: ReactNode
}

export interface LinkProps extends Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  'download'
> {
  download?: boolean | string
}

const RouterContext = createContext<Router | null>(null)

export function RouterProvider({
  value,
  children,
}: RouterProviderProps): React.JSX.Element {
  return (
    <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
  )
}

export function useRouter(): Router {
  const router = useContext(RouterContext)
  if (!router) {
    throw new Error('useRouter must be used within RouterProvider')
  }
  return router
}

export function useOptionalRouter(): Router | undefined {
  return useContext(RouterContext) ?? undefined
}

export function useRoute(): string {
  return useRouter().path
}

/** @internal Shared by Link and the browser-backed App router. */
export function resolveInternalUrl(
  href: string | undefined,
  base: string | undefined,
  currentUrl?: string,
): URL | undefined {
  if (typeof window === 'undefined' || href === undefined) return undefined
  const resolutionBase = currentUrl ?? window.location.href
  const candidate = resolveSiteLink(href.trimStart(), base, resolutionBase)
  if (!candidate || candidate.startsWith('//')) return undefined

  let url: URL
  try {
    url = new URL(candidate, new URL(resolutionBase, window.location.origin))
  } catch {
    return undefined
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  if (url.origin !== window.location.origin) return undefined
  if (!isSitePathWithinBase(url.pathname, base)) return undefined
  return url
}

function hasModifiedClick(event: React.MouseEvent<HTMLAnchorElement>): boolean {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey
}

export function Link({
  href = '',
  download,
  target,
  onClick,
  onFocus,
  onMouseEnter,
  ...props
}: LinkProps): React.JSX.Element {
  const router = useRouter()
  const resolvedHref = resolveSiteLink(href, router.base, router.path)
  const downloadValue =
    typeof download === 'string' || download === true ? download : undefined
  const canHandle = (): boolean =>
    target === undefined &&
    downloadValue === undefined &&
    resolveInternalUrl(resolvedHref, router.base, router.path) !== undefined

  return (
    <a
      href={resolvedHref}
      download={downloadValue}
      target={target}
      {...props}
      onFocus={(event) => {
        onFocus?.(event)
        if (
          resolvedHref !== undefined &&
          !event.defaultPrevented &&
          canHandle()
        ) {
          void router.prefetch(resolvedHref).catch(() => undefined)
        }
      }}
      onMouseEnter={(event) => {
        onMouseEnter?.(event)
        if (
          resolvedHref !== undefined &&
          !event.defaultPrevented &&
          canHandle()
        ) {
          void router.prefetch(resolvedHref).catch(() => undefined)
        }
      }}
      onClick={(event) => {
        onClick?.(event)
        const url = resolveInternalUrl(resolvedHref, router.base, router.path)
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          hasModifiedClick(event) ||
          target !== undefined ||
          downloadValue !== undefined ||
          !url
        ) {
          return
        }
        event.preventDefault()
        if (resolvedHref !== undefined) {
          void router.go(resolvedHref).catch(() => navigateDocument(url.href))
        }
      }}
    />
  )
}
