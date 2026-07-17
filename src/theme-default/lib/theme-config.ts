import {
  useData,
  useOptionalData,
  useOptionalRouter,
  useRoute,
} from '../../client/index.js'
import type {
  ThemeConfig,
  ThemeHomeConfig,
  ThemeMessages,
  ThemeMessagesOverrides,
  ThemeNavItem,
  ThemeSidebarGroup,
} from '../../shared/config.js'
import { resolveCurrentLocale } from '../../shared/config.js'

const englishMessages: ThemeMessages = {
  navigation: {
    skipToContent: 'Skip to content',
    mainNavigation: 'Main navigation',
    language: 'Language',
    languageCurrent: 'Language: {label}',
    close: 'Close',
    features: 'Features',
    featureLink: 'Learn more about {title}',
  },
  search: {
    button: 'Search',
    commandPalette: 'Command Palette',
    commandDescription: 'Search for a command to run...',
    dialogTitle: 'Search documentation',
    dialogDescription: 'Search all public documentation pages.',
    placeholder: 'Search documentation',
    prompt: 'Type to search documentation.',
    searching: 'Searching documentation…',
    noResults: 'No results found.',
    unavailable: 'Search is temporarily unavailable.',
    unableToOpen: 'Unable to open this result.',
    documentation: 'Documentation',
    otherLanguages: 'Other languages',
    home: 'Home',
  },
  appearance: {
    label: 'Appearance',
    option: 'Appearance: {label}',
    system: 'System',
    light: 'Light',
    dark: 'Dark',
  },
  sidebar: {
    main: 'Main',
    documentation: 'Documentation sidebar',
    openNavigation: 'Open navigation',
    dialogTitle: 'Documentation navigation',
    dialogDescription: 'Browse the documentation sections.',
    mobileNavigation: 'Mobile documentation navigation',
  },
  outline: { onThisPage: 'On this page' },
  pagination: {
    navigation: 'Page navigation',
    previous: 'Previous',
    next: 'Next',
    linkLabel: '{direction}: {title}',
    pageLabel: '{direction} page: {title}',
  },
  copy: {
    group: 'Page copy actions',
    copy: 'Copy',
    copyThisPage: 'Copy this page',
    copyMarkdown: 'Copy Markdown',
    copyForAi: 'Copy for AI',
    preparingAi: 'Preparing AI context',
    copyingMarkdown: 'Copying Markdown',
    aiCopied: 'AI context copied',
    markdownCopied: 'Markdown copied',
    fetchError: 'Could not fetch page Markdown. Please try again.',
    clipboardError: 'Could not access the clipboard. Please try again.',
    copyCode: 'Copy code',
    codeCopied: 'Code copied',
    copied: 'Copied',
    copyFailed: 'Copy failed',
  },
  notFound: {
    title: 'Page not found',
    description: 'The page you requested does not exist or has moved.',
    returnHome: 'Return home',
  },
  askAi: {
    button: 'Ask AI',
    loading: 'Loading Ask AI…',
    title: 'Ask AI',
    description:
      'Answers use the current documentation and include source links.',
    question: 'Question',
    submit: 'Ask',
    unableToAnswer: 'Unable to answer',
    providerFailure: 'The AI provider could not complete this request.',
    generating: 'Generating answer…',
    ready: 'Answer ready.',
  },
}

const chineseMessages: ThemeMessages = {
  navigation: {
    skipToContent: '跳到正文',
    mainNavigation: '主导航',
    language: '语言',
    languageCurrent: '语言：{label}',
    close: '关闭',
    features: '特性',
    featureLink: '进一步了解{title}',
  },
  search: {
    button: '搜索',
    commandPalette: '命令面板',
    commandDescription: '搜索要运行的命令。',
    dialogTitle: '搜索文档',
    dialogDescription: '搜索所有公开文档页面。',
    placeholder: '搜索文档',
    prompt: '输入内容以搜索文档。',
    searching: '正在搜索文档…',
    noResults: '未找到结果。',
    unavailable: '搜索暂时不可用。',
    unableToOpen: '无法打开此结果。',
    documentation: '文档',
    otherLanguages: '其他语言',
    home: '首页',
  },
  appearance: {
    label: '外观',
    option: '外观：{label}',
    system: '跟随系统',
    light: '浅色',
    dark: '深色',
  },
  sidebar: {
    main: '主导航',
    documentation: '文档侧边栏',
    openNavigation: '打开导航',
    dialogTitle: '文档导航',
    dialogDescription: '浏览文档章节。',
    mobileNavigation: '移动端文档导航',
  },
  outline: { onThisPage: '本页内容' },
  pagination: {
    navigation: '页面导航',
    previous: '上一页',
    next: '下一页',
    linkLabel: '{direction}：{title}',
    pageLabel: '{direction}页面：{title}',
  },
  copy: {
    group: '页面复制操作',
    copy: '复制',
    copyThisPage: '复制此页面',
    copyMarkdown: '复制 Markdown',
    copyForAi: '复制给 AI',
    preparingAi: '正在准备 AI 上下文',
    copyingMarkdown: '正在复制 Markdown',
    aiCopied: '已复制 AI 上下文',
    markdownCopied: '已复制 Markdown',
    fetchError: '无法获取页面 Markdown，请重试。',
    clipboardError: '无法访问剪贴板，请重试。',
    copyCode: '复制代码',
    codeCopied: '代码已复制',
    copied: '已复制',
    copyFailed: '复制失败',
  },
  notFound: {
    title: '页面未找到',
    description: '你请求的页面不存在或已被移动。',
    returnHome: '返回首页',
  },
  askAi: {
    button: '询问 AI',
    loading: '正在加载 AI 问答…',
    title: '询问 AI',
    description: '回答基于当前文档，并包含来源链接。',
    question: '问题',
    submit: '提问',
    unableToAnswer: '无法回答',
    providerFailure: 'AI 服务无法完成此请求。',
    generating: '正在生成回答…',
    ready: '回答已就绪。',
  },
}

const messageGroups = [
  'navigation',
  'search',
  'appearance',
  'sidebar',
  'outline',
  'pagination',
  'copy',
  'notFound',
  'askAi',
] as const

export function resolveThemeMessages(
  lang: string,
  overrides: ThemeMessagesOverrides = {},
): ThemeMessages {
  const catalog =
    lang.split('-')[0]?.toLocaleLowerCase() === 'zh'
      ? chineseMessages
      : englishMessages
  return Object.fromEntries(
    messageGroups.map((group) => [
      group,
      { ...catalog[group], ...overrides[group] },
    ]),
  ) as unknown as ThemeMessages
}

export function formatThemeMessage(
  message: string,
  values: Readonly<Record<string, string>>,
): string {
  return message.replace(/\{([^}]+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? values[key]! : placeholder,
  )
}

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
      : resolveCurrentLocale(
          themeConfig.locales,
          currentRoute,
          base,
          themeConfig.locales[0]?.lang ?? 'en-US',
        ).locale
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

export function useThemeMessages(): ThemeMessages {
  const data = useOptionalData()
  const router = useOptionalRouter()
  if (data === undefined) return resolveThemeMessages('en-US')
  const { base, lang, themeConfig } = data
  const currentRoute = router?.path ?? data.route
  const locale = resolveCurrentLocale(
    themeConfig?.locales,
    currentRoute,
    base,
    lang,
  )
  return resolveThemeMessages(locale.lang, locale.locale?.messages)
}

export function useThemeLocale() {
  const { base, lang, themeConfig } = useData()
  const currentRoute = useRoute()
  return resolveCurrentLocale(themeConfig?.locales, currentRoute, base, lang)
}
