import { useEffect, useRef, useState } from 'react'
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { Button } from './ui/button'

export { appearanceScript } from '../appearance-script.js'

export type AppearancePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'silen-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

const preferenceLabels: Readonly<Record<AppearancePreference, string>> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

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

function nextPreference(
  preference: AppearancePreference,
): AppearancePreference {
  if (preference === 'system') return 'light'
  if (preference === 'light') return 'dark'
  return 'system'
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
  const [preference, setPreference] = useState<AppearancePreference>('system')
  const preferenceRef = useRef<AppearancePreference>('system')

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

  const selectNextPreference = (): void => {
    const next = nextPreference(preferenceRef.current)
    preferenceRef.current = next
    setPreference(next)
    writePreference(next)
    applyPreference(next)
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Appearance: ${preferenceLabels[preference]}`}
      title={`Appearance: ${preferenceLabels[preference]}`}
      onClick={selectNextPreference}
    >
      <PreferenceIcon preference={preference} />
    </Button>
  )
}
