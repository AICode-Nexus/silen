import { useEffect, useRef, useState } from 'react'
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import { formatThemeMessage, useThemeMessages } from '../lib/theme-config.js'

export { appearanceScript } from '../appearance-script.js'

export type AppearancePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'silen-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

const preferenceOptions = ['dark', 'system', 'light'] as const

function isAppearancePreference(value: unknown): value is AppearancePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

function readPreference(): AppearancePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isAppearancePreference(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

function writePreference(preference: AppearancePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // Storage can be unavailable in private or embedded browsing contexts.
  }
}

function darkMediaQuery(): MediaQueryList | undefined {
  try {
    return typeof matchMedia === 'function' ? matchMedia(DARK_QUERY) : undefined
  } catch {
    return undefined
  }
}

function applyPreference(
  preference: AppearancePreference,
  media = darkMediaQuery(),
): void {
  const dark =
    preference === 'dark' ||
    (preference === 'system' && media?.matches === true)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

function PreferenceIcon({
  preference,
}: {
  preference: AppearancePreference
}): React.JSX.Element {
  if (preference === 'light') return <SunIcon aria-hidden="true" />
  if (preference === 'dark') return <MoonIcon aria-hidden="true" />
  return <MonitorIcon aria-hidden="true" />
}

export function AppearanceSwitch(): React.JSX.Element {
  const messages = useThemeMessages()
  const [preference, setPreference] = useState<AppearancePreference>('system')
  const preferenceRef = useRef<AppearancePreference>('system')
  const buttonRefs = useRef(new Map<AppearancePreference, HTMLButtonElement>())

  useEffect(() => {
    const media = darkMediaQuery()
    const stored = readPreference()
    preferenceRef.current = stored
    applyPreference(stored, media)
    const preferenceTimer = window.setTimeout(() => {
      if (preferenceRef.current === stored) setPreference(stored)
    }, 0)

    const handleMediaChange = (): void => {
      if (preferenceRef.current === 'system') applyPreference('system', media)
    }
    const handleStorage = (event: StorageEvent): void => {
      if (event.key !== STORAGE_KEY) return
      const next = isAppearancePreference(event.newValue)
        ? event.newValue
        : 'system'
      preferenceRef.current = next
      setPreference(next)
      applyPreference(next, media)
    }

    let removeMediaListener = (): void => undefined
    if (media) {
      try {
        media.addEventListener('change', handleMediaChange)
        removeMediaListener = () => {
          try {
            media.removeEventListener('change', handleMediaChange)
          } catch {
            // The query may belong to a browser context that is shutting down.
          }
        }
      } catch {
        try {
          media.addListener(handleMediaChange)
          removeMediaListener = () => {
            try {
              media.removeListener(handleMediaChange)
            } catch {
              // Legacy media query listeners can disappear with their context.
            }
          }
        } catch {
          // Appearance still works as a fixed light/dark preference.
        }
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => {
      window.clearTimeout(preferenceTimer)
      removeMediaListener()
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const selectPreference = (
    next: AppearancePreference,
    focusSelected = false,
  ): void => {
    preferenceRef.current = next
    setPreference(next)
    writePreference(next)
    applyPreference(next)
    if (focusSelected) {
      window.setTimeout(() => buttonRefs.current.get(next)?.focus(), 0)
    }
  }

  const selectRelativePreference = (step: -1 | 1): void => {
    const index = preferenceOptions.indexOf(preferenceRef.current)
    const nextIndex =
      (index + step + preferenceOptions.length) % preferenceOptions.length
    const next = preferenceOptions[nextIndex]
    if (next) selectPreference(next, true)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      selectRelativePreference(-1)
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      selectRelativePreference(1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      selectPreference(preferenceOptions[0], true)
    } else if (event.key === 'End') {
      event.preventDefault()
      selectPreference('light', true)
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={messages.appearance.label}
      className="inline-flex min-h-10 items-center rounded-full border border-border bg-muted/70 p-0.5 text-muted-foreground shadow-sm transition-colors dark:bg-muted/40"
    >
      {preferenceOptions.map((option) => {
        const selected = preference === option
        const optionLabel = formatThemeMessage(messages.appearance.option, {
          label: messages.appearance[option],
        })
        return (
          <button
            key={option}
            ref={(node) => {
              if (node) {
                buttonRefs.current.set(option, node)
              } else {
                buttonRefs.current.delete(option)
              }
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={optionLabel}
            title={optionLabel}
            tabIndex={selected ? 0 : -1}
            className={cn(
              'inline-flex size-10 cursor-pointer items-center justify-center rounded-full transition-all duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 [&_svg]:size-3.5',
              selected
                ? 'bg-background text-foreground shadow-sm dark:bg-input/70'
                : 'text-muted-foreground',
            )}
            onClick={() => selectPreference(option)}
            onKeyDown={handleKeyDown}
          >
            <PreferenceIcon preference={option} />
          </button>
        )
      })}
    </div>
  )
}
