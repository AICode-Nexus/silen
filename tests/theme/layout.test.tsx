import { act } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Layout } from '../../src/theme-default/components/layout'
import type { ThemeConfig } from '../../src/shared/config'
import { TestSiteProvider } from '../helpers/test-site-provider'

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('default documentation layout', () => {
  it('renders the complete semantic shell and an exact active sidebar link', () => {
    render(
      <TestSiteProvider path="/guide/">
        <Layout>
          <h1>Guide</h1>
        </Layout>
      </TestSiteProvider>,
    )

    expect(
      screen
        .getByRole('link', { name: 'Skip to content' })
        .getAttribute('href'),
    ).toBe('#main-content')
    expect(
      screen.getByRole('navigation', { name: 'Main navigation' }),
    ).not.toBeNull()
    expect(
      screen.getByRole('navigation', { name: 'Documentation sidebar' }),
    ).not.toBeNull()
    expect(screen.getByRole('main').textContent).toContain('Guide')
    expect(screen.getByRole('main').id).toBe('main-content')
    expect(screen.getByRole('main').getAttribute('tabindex')).toBe('-1')
    expect(
      screen.getByRole('link', { name: 'Guide' }).getAttribute('aria-current'),
    ).toBe('page')
    expect(
      screen
        .getByRole('link', { name: 'Advanced' })
        .hasAttribute('aria-current'),
    ).toBe(false)
    expect(
      screen.getByRole('complementary', { name: 'On this page' }),
    ).not.toBeNull()
  })

  it('prefixes internal links with base and never prefix-matches active routes', () => {
    const themeConfig: ThemeConfig = {
      nav: [{ text: 'Overview', link: '/' }],
      sidebar: [
        {
          text: 'Guide',
          items: [
            { text: 'Guide index', link: '/guide/' },
            { text: 'Advanced guide', link: '/guide/advanced/' },
          ],
        },
      ],
    }

    render(
      <TestSiteProvider
        base="/project/"
        path="/project/guide/advanced/?source=test#details"
        themeConfig={themeConfig}
      >
        <Layout>Advanced</Layout>
      </TestSiteProvider>,
    )

    expect(
      screen.getByRole('link', { name: 'Silen Docs' }).getAttribute('href'),
    ).toBe('/project/')
    expect(
      screen.getByRole('link', { name: 'Overview' }).getAttribute('href'),
    ).toBe('/project/')
    expect(
      screen.getByRole('link', { name: 'Guide index' }).getAttribute('href'),
    ).toBe('/project/guide/')
    expect(
      screen
        .getByRole('link', { name: 'Advanced guide' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(
      screen
        .getByRole('link', { name: 'Guide index' })
        .hasAttribute('aria-current'),
    ).toBe(false)
  })

  it('switches languages to the matching current documentation route', async () => {
    const user = userEvent.setup()
    const themeConfig: ThemeConfig = {
      search: false,
      locales: [
        { lang: 'en-US', label: 'English', root: '/' },
        { lang: 'zh-CN', label: '中文', root: '/zh/' },
      ],
    }

    const { unmount } = render(
      <TestSiteProvider
        base="/project/"
        path="/project/guide/"
        themeConfig={themeConfig}
      >
        <Layout>Guide</Layout>
      </TestSiteProvider>,
    )

    await user.click(screen.getByRole('button', { name: 'Language: English' }))
    const englishMenu = screen.getByRole('menu', { name: 'Language: English' })
    expect(
      within(englishMenu)
        .getByRole('menuitem', { name: 'English' })
        .getAttribute('aria-current'),
    ).toBe('true')
    expect(
      within(englishMenu)
        .getByRole('menuitem', { name: '中文' })
        .getAttribute('href'),
    ).toBe('/project/zh/guide/')

    await user.keyboard('{Escape}')
    unmount()

    render(
      <TestSiteProvider
        base="/project/"
        path="/project/zh/ai/?view=full#copy"
        themeConfig={themeConfig}
      >
        <Layout>AI</Layout>
      </TestSiteProvider>,
    )

    await user.click(screen.getByRole('button', { name: '语言：中文' }))
    const chineseMenu = screen.getByRole('menu', { name: '语言：中文' })
    expect(
      within(chineseMenu)
        .getByRole('menuitem', { name: '中文' })
        .getAttribute('aria-current'),
    ).toBe('true')
    expect(
      within(chineseMenu)
        .getByRole('menuitem', { name: 'English' })
        .getAttribute('href'),
    ).toBe('/project/ai/?view=full#copy')
  })

  it('uses active locale navigation and sidebar labels', () => {
    const themeConfig: ThemeConfig = {
      search: false,
      nav: [{ text: 'Guide', link: '/guide/' }],
      sidebar: [
        {
          text: 'Docs',
          items: [{ text: 'Getting Started', link: '/guide/' }],
        },
      ],
      locales: [
        { lang: 'en-US', label: 'English', root: '/' },
        {
          lang: 'zh-CN',
          label: '中文',
          root: '/zh/',
          nav: [{ text: '指南', link: '/zh/guide/' }],
          sidebar: [
            {
              text: '中文文档',
              items: [{ text: '快速开始', link: '/zh/guide/' }],
            },
          ],
        },
      ],
    }

    render(
      <TestSiteProvider
        base="/project/"
        path="/project/zh/guide/"
        themeConfig={themeConfig}
      >
        <Layout>快速开始</Layout>
      </TestSiteProvider>,
    )

    const mainNavigation = screen.getByRole('navigation', {
      name: '主导航',
    })
    const sidebar = screen.getByRole('navigation', {
      name: '文档侧边栏',
    })

    expect(
      within(mainNavigation)
        .getByRole('link', { name: '指南' })
        .getAttribute('href'),
    ).toBe('/project/zh/guide/')
    expect(
      within(mainNavigation).queryByRole('link', { name: 'Guide' }),
    ).toBeNull()
    expect(
      within(sidebar).getByRole('button', { name: '中文文档' }),
    ).not.toBeNull()
    expect(
      within(sidebar)
        .getByRole('link', { name: '快速开始' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(
      within(sidebar).queryByRole('link', { name: 'Getting Started' }),
    ).toBeNull()
  })

  it('localizes every shell label and applies deep locale overrides', async () => {
    const user = userEvent.setup()
    const themeConfig: ThemeConfig = {
      locales: [
        { lang: 'en-US', label: 'English', root: '/' },
        {
          lang: 'zh-CN',
          label: '中文',
          root: '/zh/',
          messages: { navigation: { skipToContent: '直接阅读正文' } },
        },
      ],
    }

    render(
      <TestSiteProvider
        lang="zh-CN"
        path="/zh/guide/"
        themeConfig={themeConfig}
      >
        <Layout>指南</Layout>
      </TestSiteProvider>,
    )

    expect(screen.getByRole('link', { name: '直接阅读正文' })).not.toBeNull()
    expect(screen.getByRole('navigation', { name: '主导航' })).not.toBeNull()
    expect(
      screen.getByRole('navigation', { name: '文档侧边栏' }),
    ).not.toBeNull()
    expect(
      screen.getByRole('complementary', { name: '本页内容' }),
    ).not.toBeNull()
    expect(screen.getByRole('radiogroup', { name: '外观' })).not.toBeNull()
    expect(screen.getByRole('radio', { name: '外观：深色' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '语言：中文' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '打开导航' })).not.toBeNull()

    await user.click(screen.getByRole('button', { name: '搜索文档' }))
    expect(
      await screen.findByRole('dialog', { name: '搜索文档' }),
    ).not.toBeNull()
    expect(screen.getByText('输入内容以搜索文档。')).not.toBeNull()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: '打开导航' }))
    expect(screen.getByRole('dialog', { name: '文档导航' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '关闭' })).not.toBeNull()
  })

  it.each([
    ['root-relative', '/logo.svg', '/project/logo.svg'],
    ['local-relative', 'images/logo.svg', '/project/images/logo.svg'],
    ['base-aware', '/project/logo.svg', '/project/logo.svg'],
    [
      'HTTPS',
      'https://cdn.example.com/logo.svg',
      'https://cdn.example.com/logo.svg',
    ],
    [
      'HTTP',
      'http://cdn.example.com/logo.svg',
      'http://cdn.example.com/logo.svg',
    ],
    [
      'protocol-relative',
      '//cdn.example.com/logo.svg',
      '//cdn.example.com/logo.svg',
    ],
    ['data', 'data:image/svg+xml,%3Csvg/%3E', 'data:image/svg+xml,%3Csvg/%3E'],
    ['blob', 'blob:https://example.com/logo', 'blob:https://example.com/logo'],
    ['fragment', '#brand-logo', '#brand-logo'],
  ])('classifies and resolves %s logo URLs', (_, logo, expected) => {
    render(
      <TestSiteProvider base="/project/" themeConfig={{ logo }}>
        <Layout>Guide</Layout>
      </TestSiteProvider>,
    )

    const logoImage = document.querySelector('img')
    expect(logoImage?.getAttribute('src')).toBe(expected)
    expect(logoImage?.getAttribute('width')).toBe('28')
    expect(logoImage?.getAttribute('height')).toBe('28')
  })

  it('keeps the active group expanded and lets other groups collapse', async () => {
    const user = userEvent.setup()
    const themeConfig: ThemeConfig = {
      sidebar: [
        {
          text: 'Guide section',
          collapsed: true,
          items: [{ text: 'Guide', link: '/guide/' }],
        },
        {
          text: 'Reference section',
          items: [{ text: 'Configuration', link: '/reference/config/' }],
        },
      ],
    }

    render(
      <TestSiteProvider path="/guide/" themeConfig={themeConfig}>
        <Layout>Guide</Layout>
      </TestSiteProvider>,
    )

    expect(
      screen
        .getByRole('button', { name: 'Guide section' })
        .getAttribute('aria-expanded'),
    ).toBe('true')
    const reference = screen.getByRole('button', { name: 'Reference section' })
    expect(reference.getAttribute('aria-expanded')).toBe('true')

    await user.click(reference)
    expect(reference.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('link', { name: 'Configuration' })).toBeNull()
  })

  it('opens a titled mobile sheet, moves focus inside, and restores trigger focus', async () => {
    const user = userEvent.setup()
    render(
      <TestSiteProvider>
        <Layout>Guide</Layout>
      </TestSiteProvider>,
    )

    const trigger = screen.getByRole('button', { name: 'Open navigation' })
    await user.click(trigger)

    const sheet = screen.getByRole('dialog', {
      name: 'Documentation navigation',
    })
    const descriptionId = sheet.getAttribute('aria-describedby')
    expect(descriptionId).not.toBeNull()
    expect(document.getElementById(descriptionId!)?.textContent).toBe(
      'Browse the documentation sections.',
    )
    expect(sheet.contains(document.activeElement)).toBe(true)
    expect(within(sheet).getByRole('link', { name: 'Guide' })).toBe(
      document.activeElement,
    )

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('builds the outline from page headings without adding a redundant navigation landmark', () => {
    render(
      <TestSiteProvider
        headings={[
          { depth: 2, title: 'Install', slug: 'install' },
          { depth: 3, title: 'Options', slug: 'options' },
          { depth: 4, title: 'Ignored detail', slug: 'ignored' },
        ]}
      >
        <Layout>Guide</Layout>
      </TestSiteProvider>,
    )

    const outline = screen.getByRole('complementary', { name: 'On this page' })
    expect(
      within(outline)
        .getByRole('link', { name: 'Install' })
        .getAttribute('href'),
    ).toBe('#install')
    expect(
      within(outline)
        .getByRole('link', { name: 'Options' })
        .getAttribute('href'),
    ).toBe('#options')
    expect(within(outline).queryByText('Ignored detail')).toBeNull()
    expect(screen.getAllByRole('navigation')).toHaveLength(2)
  })

  it('shows the outline in the complete desktop grid from 960px upward', () => {
    render(
      <TestSiteProvider>
        <Layout>Guide</Layout>
      </TestSiteProvider>,
    )

    const outline = screen.getByRole('complementary', { name: 'On this page' })
    const grid = screen.getByRole('main').parentElement

    expect(outline.className).toContain('min-[60rem]:block')
    expect(outline.className).not.toContain('min-[75rem]:block')
    expect(grid?.className).toContain(
      'min-[60rem]:grid-cols-[var(--silen-sidebar-width)_minmax(0,1fr)_14rem]',
    )
    expect(grid?.className).not.toContain('min-[75rem]:grid-cols-')
  })

  it('keeps header controls touchable on mobile and compact on desktop', () => {
    const themeConfig: ThemeConfig = {
      locales: [
        { lang: 'en-US', label: 'English', root: '/' },
        { lang: 'zh-CN', label: '中文', root: '/zh/' },
      ],
    }
    render(
      <TestSiteProvider themeConfig={themeConfig}>
        <Layout>Guide</Layout>
      </TestSiteProvider>,
    )

    const mainNavigation = screen.getByRole('navigation', {
      name: 'Main navigation',
    })
    expect(mainNavigation.className).toContain('gap-1')
    expect(mainNavigation.className.split(/\s+/)).not.toContain('gap-4')

    for (const name of [
      'Search documentation',
      'Language: English',
      'Open navigation',
    ]) {
      const control = screen.getByRole('button', { name })
      expect(control.className).toContain('min-h-10')
      expect(control.className).toContain('min-w-10')
      if (name !== 'Open navigation') {
        expect(control.className).toContain('sm:min-h-9')
        expect(control.className).toContain('sm:min-w-9')
      }
    }
    const appearance = screen.getByRole('radiogroup', { name: 'Appearance' })
    expect(appearance.className).toContain('min-h-10')
    expect(appearance.className).toContain('sm:min-h-9')
    expect(appearance.className).toContain('sm:p-px')
    for (const control of within(appearance).getAllByRole('radio')) {
      expect(control.className).toContain('size-10')
      expect(control.className).toContain('sm:size-8')
    }
  })

  it('hydrates the complete server-rendered shell without recovering markup', async () => {
    const shell = (
      <TestSiteProvider path="/guide/">
        <Layout>
          <h1>Guide</h1>
        </Layout>
      </TestSiteProvider>
    )
    const container = document.createElement('div')
    container.innerHTML = renderToString(shell)
    document.body.append(container)
    const recoverableError = vi.fn()
    const root = hydrateRoot(container, shell, {
      onRecoverableError: recoverableError,
    })

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    expect(recoverableError).not.toHaveBeenCalled()

    act(() => root.unmount())
    container.remove()
  })
})
