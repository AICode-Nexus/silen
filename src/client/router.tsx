import {
  createContext,
  useContext,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react'
import { navigateDocument } from './navigation.js'

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

export function useRoute(): string {
  return useRouter().path
}

function normalizedBase(base: string | undefined): string {
  if (!base || base === '/') return '/'
  const withLeadingSlash = base.startsWith('/') ? base : `/${base}`
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash
    : `${withLeadingSlash}/`
}

function isWithinBase(pathname: string, base: string | undefined): boolean {
  const normalized = normalizedBase(base)
  if (normalized === '/') return true
  return pathname === normalized.slice(0, -1) || pathname.startsWith(normalized)
}

/** @internal Shared by Link and the browser-backed App router. */
export function resolveInternalUrl(
  href: string,
  base: string | undefined,
): URL | undefined {
  if (typeof window === 'undefined') return undefined
  const candidate = href.trimStart()
  if (!candidate || candidate.startsWith('//')) return undefined

  let url: URL
  try {
    url = new URL(candidate, window.location.href)
  } catch {
    return undefined
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  if (url.origin !== window.location.origin) return undefined
  if (!isWithinBase(url.pathname, base)) return undefined
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
  const downloadValue =
    typeof download === 'string' || download === true ? download : undefined
  const canHandle = (): boolean =>
    target === undefined &&
    downloadValue === undefined &&
    resolveInternalUrl(href, router.base) !== undefined

  return (
    <a
      href={href}
      download={downloadValue}
      target={target}
      {...props}
      onFocus={(event) => {
        onFocus?.(event)
        if (!event.defaultPrevented && canHandle()) {
          void router.prefetch(href).catch(() => undefined)
        }
      }}
      onMouseEnter={(event) => {
        onMouseEnter?.(event)
        if (!event.defaultPrevented && canHandle()) {
          void router.prefetch(href).catch(() => undefined)
        }
      }}
      onClick={(event) => {
        onClick?.(event)
        const url = resolveInternalUrl(href, router.base)
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
        void router.go(href).catch(() => navigateDocument(url.href))
      }}
    />
  )
}
