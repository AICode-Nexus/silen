import { act } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ThemeConfig } from '../../src/shared/config'
import DefaultTheme, {
  CodeBlock,
  DocLayout,
  HomeLayout,
  NotFound,
} from '../../src/theme-default'
import { TestSiteProvider } from '../helpers/test-site-provider'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('default content layouts', () => {
  it('exposes doc, home, page, and 404 layouts with a valid MDX map', () => {
    expect(Object.keys(DefaultTheme.layouts)).toEqual(['doc', 'home', 'page'])
    expect(DefaultTheme.layouts.doc).toBe(DocLayout)
    expect(DefaultTheme.layouts.home).toBe(HomeLayout)
    expect(DefaultTheme.NotFound).toBe(NotFound)
    expect(DefaultTheme.components.pre).toBe(CodeBlock)
  })

  it('renders a semantic, base-aware hero and complete feature cards', () => {
    const { container } = render(
      <TestSiteProvider base="/project/">
        <HomeLayout
          hero={{
            name: 'Build calmer docs',
            tagline: 'React, Vite, and MDX without the weight.',
            image: { src: '/hero.svg', alt: 'Silen documentation preview' },
            actions: [
              { text: 'Get started', link: '/guide/' },
              {
                text: 'Source',
                link: 'https://github.com/AICode-Nexus/silen',
                theme: 'alt',
              },
              { text: 'Unsafe', link: 'javascript:alert(1)' },
            ],
          }}
          features={[
            {
              icon: 'blocks',
              title: 'Fast by default',
              details: 'Server-rendered pages with focused client behavior.',
              link: '/guide/performance',
              linkText: 'Performance guide',
            },
            {
              icon: 'custom-mark',
              title: 'Typed configuration',
              details: 'Small, explicit contracts.',
            },
          ]}
        >
          <section aria-label="Additional home content">
            Additional home content
          </section>
        </HomeLayout>
      </TestSiteProvider>,
    )

    expect(container.querySelector('.silen-home')).not.toBeNull()
    expect(container.querySelector('.silen-home-hero')).not.toBeNull()
    expect(container.querySelector('.silen-home-visual')).not.toBeNull()
    expect(container.querySelector('.silen-home-features')).not.toBeNull()
    expect(container.querySelector('.silen-home-content')).not.toBeNull()
    expect(container.querySelector('svg.lucide-blocks')).not.toBeNull()
    expect(screen.getByText('custom-mark')).not.toBeNull()

    const hero = screen.getByRole('region', { name: 'Build calmer docs' })
    expect(within(hero).getByRole('heading', { level: 1 }).textContent).toBe(
      'Build calmer docs',
    )
    expect(
      within(hero)
        .getByRole('link', { name: 'Get started' })
        .getAttribute('href'),
    ).toBe('/project/guide/')
    const external = within(hero).getByRole('link', { name: 'Source' })
    expect(external.getAttribute('href')).toBe(
      'https://github.com/AICode-Nexus/silen',
    )
    expect(external.getAttribute('target')).toBe('_blank')
    expect(external.getAttribute('rel')?.split(/\s+/).sort()).toEqual([
      'noopener',
      'noreferrer',
    ])
    expect(within(hero).queryByRole('link', { name: 'Unsafe' })).toBeNull()
    expect(
      within(hero)
        .getByRole('img', { name: 'Silen documentation preview' })
        .getAttribute('src'),
    ).toBe('/project/hero.svg')

    const features = screen.getByRole('region', { name: 'Features' })
    const featureHeading = within(features).getByRole('heading', {
      name: 'Fast by default',
    })
    expect(featureHeading.closest('[data-slot="card"]')).not.toBeNull()
    expect(
      within(features)
        .getByRole('link', { name: 'Performance guide' })
        .getAttribute('href'),
    ).toBe('/project/guide/performance')
    expect(screen.getByText('Additional home content')).not.toBeNull()
  })

  it.each([
    ['forward slash', '//cdn.example.com/home.svg'],
    ['backslash', '\\\\cdn.example.com/home.svg'],
    ['forward slash and backslash', '/\\cdn.example.com/home.svg'],
    ['backslash and forward slash', '\\/cdn.example.com/home.svg'],
  ])(
    'treats %s network paths as external actions and images',
    (_, networkPath) => {
      render(
        <TestSiteProvider base="/project/">
          <HomeLayout
            hero={{
              name: 'Network paths',
              image: { src: networkPath, alt: 'Network image' },
              actions: [{ text: 'Network action', link: networkPath }],
            }}
            features={[
              {
                title: 'Network feature',
                details: 'Uses a browser network-path URL.',
                link: networkPath,
                linkText: 'Network feature action',
              },
            ]}
          >
            Home body
          </HomeLayout>
        </TestSiteProvider>,
      )

      const action = screen.getByRole<HTMLAnchorElement>('link', {
        name: 'Network action',
      })
      const feature = screen.getByRole<HTMLAnchorElement>('link', {
        name: 'Network feature action',
      })
      for (const link of [action, feature]) {
        expect(link.getAttribute('href')).toBe(networkPath)
        expect(link.getAttribute('target')).toBe('_blank')
        expect(link.getAttribute('rel')?.split(/\s+/).sort()).toEqual([
          'noopener',
          'noreferrer',
        ])
        expect(link.href).toBe('http://cdn.example.com/home.svg')
      }

      const image = screen.getByRole<HTMLImageElement>('img', {
        name: 'Network image',
      })
      expect(image.getAttribute('src')).toBe(networkPath)
      expect(image.src).toBe('http://cdn.example.com/home.svg')
    },
  )

  it.each([
    ['forward slash', '//cdn.example.com/action', '_self'],
    ['forward slash', '//cdn.example.com/action', '_parent'],
    ['forward slash', '//cdn.example.com/action', '_top'],
    ['slash and backslash', '/\\cdn.example.com/action', '_self'],
    ['slash and backslash', '/\\cdn.example.com/action', '_parent'],
    ['slash and backslash', '/\\cdn.example.com/action', '_top'],
  ] as const)(
    'forces %s network-path actions at %s configured with %s into a safe context',
    (_, networkPath, configuredTarget) => {
      render(
        <TestSiteProvider base="/project/">
          <HomeLayout
            hero={{
              name: 'Explicit network targets',
              actions: [
                {
                  text: 'Network hero action',
                  link: networkPath,
                  target: configuredTarget,
                  rel: 'external opener nofollow NOFOLLOW',
                },
              ],
            }}
            features={[
              {
                title: 'Network target feature',
                details: 'Cannot weaken network-path isolation.',
                link: networkPath,
                linkText: 'Network feature action',
                target: configuredTarget,
                rel: 'author opener help HELP',
              },
            ]}
          >
            Home body
          </HomeLayout>
        </TestSiteProvider>,
      )

      const heroAction = screen.getByRole('link', {
        name: 'Network hero action',
      })
      const featureAction = screen.getByRole('link', {
        name: 'Network feature action',
      })
      expect(heroAction.getAttribute('target')).toBe('_blank')
      expect(heroAction.getAttribute('rel')?.split(/\s+/).sort()).toEqual([
        'external',
        'nofollow',
        'noopener',
        'noreferrer',
      ])
      expect(featureAction.getAttribute('target')).toBe('_blank')
      expect(featureAction.getAttribute('rel')?.split(/\s+/).sort()).toEqual([
        'author',
        'help',
        'noopener',
        'noreferrer',
      ])
    },
  )

  it('preserves configured targets for ordinary local and HTTP actions', () => {
    render(
      <TestSiteProvider base="/project/">
        <HomeLayout
          hero={{
            name: 'Ordinary targets',
            actions: [
              {
                text: 'Local parent action',
                link: '/guide/',
                target: '_parent',
                rel: 'bookmark',
              },
            ],
          }}
          features={[
            {
              title: 'HTTP target feature',
              details: 'Keeps its configured browsing context.',
              link: 'https://example.com/reference',
              linkText: 'HTTP top action',
              target: '_top',
              rel: 'external',
            },
          ]}
        >
          Home body
        </HomeLayout>
      </TestSiteProvider>,
    )

    const local = screen.getByRole('link', { name: 'Local parent action' })
    expect(local.getAttribute('href')).toBe('/project/guide/')
    expect(local.getAttribute('target')).toBe('_parent')
    expect(local.getAttribute('rel')).toBe('bookmark')

    const http = screen.getByRole('link', { name: 'HTTP top action' })
    expect(http.getAttribute('href')).toBe('https://example.com/reference')
    expect(http.getAttribute('target')).toBe('_top')
    expect(http.getAttribute('rel')).toBe('external')
  })

  it('continues resolving normal local home destinations against base', () => {
    render(
      <TestSiteProvider base="/project/">
        <HomeLayout
          hero={{
            name: 'Local paths',
            image: { src: '/home.svg', alt: 'Local image' },
            actions: [{ text: 'Local action', link: '/guide/' }],
          }}
          features={[
            {
              title: 'Local feature',
              details: 'Uses a local URL.',
              link: 'reference/',
              linkText: 'Local feature action',
            },
          ]}
        >
          Home body
        </HomeLayout>
      </TestSiteProvider>,
    )

    const action = screen.getByRole('link', { name: 'Local action' })
    expect(action.getAttribute('href')).toBe('/project/guide/')
    expect(action.hasAttribute('target')).toBe(false)
    expect(action.hasAttribute('rel')).toBe(false)

    const feature = screen.getByRole('link', {
      name: 'Local feature action',
    })
    expect(feature.getAttribute('href')).toBe('/project/reference/')
    expect(feature.hasAttribute('target')).toBe(false)
    expect(feature.hasAttribute('rel')).toBe(false)

    expect(
      screen.getByRole('img', { name: 'Local image' }).getAttribute('src'),
    ).toBe('/project/home.svg')
  })

  it('reads typed home content from public page data', () => {
    const themeConfig: ThemeConfig = {
      home: {
        hero: {
          name: 'Configured home',
          tagline: 'Public fields only.',
        },
        features: [
          { title: 'Configured feature', details: 'Typed and serialized.' },
        ],
      },
    }

    render(
      <TestSiteProvider themeConfig={themeConfig}>
        <HomeLayout>Home body</HomeLayout>
      </TestSiteProvider>,
    )

    expect(
      screen.getByRole('heading', { name: 'Configured home' }),
    ).not.toBeNull()
    expect(screen.getByText('Configured feature')).not.toBeNull()
  })

  it('uses active locale home content before global home defaults', () => {
    const themeConfig: ThemeConfig = {
      home: {
        hero: {
          name: 'English home',
          text: 'Documentation without the noise.',
        },
        features: [{ title: 'React-first', details: 'English feature copy.' }],
      },
      locales: [
        { lang: 'en-US', label: 'English', root: '/' },
        {
          lang: 'zh-CN',
          label: '中文',
          root: '/zh/',
          home: {
            hero: {
              name: 'Silen',
              text: '去掉噪音的文档体验。',
              actions: [
                { text: '快速开始', link: '/zh/guide/', theme: 'brand' },
              ],
            },
            features: [
              {
                title: 'React 优先',
                details: '使用 TypeScript、React 组件和可信的 MDX。',
              },
            ],
          },
        },
      ],
    }

    render(
      <TestSiteProvider
        base="/project/"
        path="/project/zh/"
        themeConfig={themeConfig}
      >
        <HomeLayout>中文正文</HomeLayout>
      </TestSiteProvider>,
    )

    expect(screen.getByRole('heading', { name: 'Silen' })).not.toBeNull()
    expect(screen.getByText('去掉噪音的文档体验。')).not.toBeNull()
    expect(
      screen.getByRole('link', { name: '快速开始' }).getAttribute('href'),
    ).toBe('/project/zh/guide/')
    expect(screen.getByText('React 优先')).not.toBeNull()
    expect(screen.queryByText('Documentation without the noise.')).toBeNull()
    expect(screen.queryByText('React-first')).toBeNull()
  })

  it('renders document typography and base-aware previous/next pager cards', () => {
    const themeConfig: ThemeConfig = {
      sidebar: [
        {
          text: 'Guide',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Install', link: '/guide/install' },
            { text: 'API', link: '/reference/api' },
          ],
        },
      ],
    }

    render(
      <TestSiteProvider
        base="/project/"
        path="/project/guide/install?source=pager#usage"
        themeConfig={themeConfig}
      >
        <DocLayout>
          <h1>Install</h1>
          <p>Install Silen with your package manager.</p>
        </DocLayout>
      </TestSiteProvider>,
    )

    const article = screen.getByRole('article')
    expect(article.className).toContain('silen-doc')
    const pager = screen.getByRole('navigation', { name: 'Page navigation' })
    const previous = within(pager).getByRole('link', {
      name: /Previous.*Introduction/,
    })
    const next = within(pager).getByRole('link', { name: /Next.*API/ })
    expect(previous.getAttribute('href')).toBe('/project/guide/')
    expect(next.getAttribute('href')).toBe('/project/reference/api')
    expect(previous.closest('[data-slot="card"]')).not.toBeNull()
    expect(next.closest('[data-slot="card"]')).not.toBeNull()
  })

  it('renders a complete, base-aware not-found screen', () => {
    render(
      <TestSiteProvider base="/project/">
        <NotFound />
      </TestSiteProvider>,
    )

    expect(screen.getByRole('heading', { name: '404' })).not.toBeNull()
    expect(screen.getByText('Page not found')).not.toBeNull()
    expect(
      screen.getByRole('link', { name: 'Return home' }).getAttribute('href'),
    ).toBe('/project/')
  })
})

describe('delegated code copy', () => {
  function clipboard(writeText: (value: string) => Promise<void>): void {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
  }

  it('uses one document listener for multiple keyboard-accessible blocks', async () => {
    const writeText = vi.fn<(value: string) => Promise<void>>(() =>
      Promise.resolve(),
    )
    clipboard(writeText)
    const add = vi.spyOn(document, 'addEventListener')

    render(
      <>
        <CodeBlock code="pnpm add @aicode-nexus/silen" language="sh" />
        <CodeBlock code="pnpm test" language="sh" />
      </>,
    )

    expect(add.mock.calls.filter(([event]) => event === 'click')).toHaveLength(
      1,
    )
    const buttons = screen.getAllByRole('button', { name: 'Copy code' })
    expect(buttons[0]?.getAttribute('type')).toBe('button')

    await act(async () => {
      fireEvent.click(buttons[1]!)
      await Promise.resolve()
    })

    expect(writeText).toHaveBeenCalledWith('pnpm test')
    expect(buttons[1]?.getAttribute('aria-label')).toBe('Code copied')
    expect(buttons[1]?.textContent).toBe('Copied')
  })

  it('contains clipboard failure and resets its accessible state', async () => {
    vi.useFakeTimers()
    clipboard(() => Promise.reject(new Error('clipboard blocked')))
    render(<CodeBlock code="pnpm build" language="sh" />)
    const button = screen.getByRole('button', { name: 'Copy code' })

    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(button.getAttribute('aria-label')).toBe('Copy failed')
    expect(button.textContent).toBe('Copy failed')

    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(button.getAttribute('aria-label')).toBe('Copy code')
    expect(button.textContent).toBe('Copy')
  })

  it('removes the shared listener and pending resets after the last block unmounts', () => {
    vi.useFakeTimers()
    clipboard(() => Promise.resolve())
    const remove = vi.spyOn(document, 'removeEventListener')
    const rendered = render(
      <>
        <CodeBlock code="one" language="text" />
        <CodeBlock code="two" language="text" />
      </>,
    )

    rendered.unmount()

    expect(
      remove.mock.calls.filter(([event]) => event === 'click'),
    ).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('escapes code and hydrates without recovering server markup', async () => {
    clipboard(() => Promise.resolve())
    const tree = (
      <CodeBlock code={'<script>alert("unsafe")</script>'} language="html" />
    )
    const container = document.createElement('div')
    container.innerHTML = renderToString(tree)
    expect(container.innerHTML).not.toContain('<script>')
    document.body.append(container)
    const recoverableError = vi.fn()
    const root = hydrateRoot(container, tree, {
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
