import { useData, useRoute } from '../../client/index.js'
import type {
  ThemeConfig,
  ThemeHomeConfig,
  ThemeNavItem,
  ThemeSidebarGroup,
} from '../../shared/config.js'
import { resolveThemeLocaleLinks } from './navigation.js'

interface LocaleThemeOverrides {
  readonly nav?: readonly ThemeNavItem[]
  readonly sidebar?: readonly ThemeSidebarGroup[]
  readonly home?: ThemeHomeConfig
}

function hasLocaleThemeOverrides(
  locale: LocaleThemeOverrides | undefined,
): locale is LocaleThemeOverrides {
  return (
    locale?.nav !== undefined ||
    locale?.sidebar !== undefined ||
    locale?.home !== undefined
  )
}

export function resolveThemeConfig(
  themeConfig: ThemeConfig | undefined,
  currentRoute: string,
  base: string,
): ThemeConfig | undefined {
  if (themeConfig === undefined) return undefined
  const activeLocale =
    themeConfig.locales === undefined
      ? undefined
      : resolveThemeLocaleLinks(themeConfig.locales, currentRoute, base).find(
          (item) => item.active,
        )?.locale
  if (!hasLocaleThemeOverrides(activeLocale)) return themeConfig

  return {
    ...themeConfig,
    ...(activeLocale.nav === undefined ? {} : { nav: activeLocale.nav }),
    ...(activeLocale.sidebar === undefined
      ? {}
      : { sidebar: activeLocale.sidebar }),
    ...(activeLocale.home === undefined ? {} : { home: activeLocale.home }),
  }
}

export function useThemeConfig(): ThemeConfig | undefined {
  const { base, themeConfig } = useData()
  const currentRoute = useRoute()
  return resolveThemeConfig(themeConfig, currentRoute, base)
}
