import { act } from 'react'
import { runInNewContext } from 'node:vm'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderedPage } from '../../src/client/app'
import { renderDocument } from '../../src/node/render'
import {
  AppearanceSwitch,
  appearanceScript,
} from '../../src/theme-default/components/appearance'

type MediaListener = (event: MediaQueryListEvent) => void

function installMatchMedia(initialMatches: boolean): {
  emit: (matches: boolean) => void
  removeEventListener: ReturnType<typeof vi.fn>
} {
  let matches = initialMatches
  const listeners = new Set<MediaListener>()
  const removeEventListener = vi.fn((_type: string, listener: MediaListener) =>
    listeners.delete(listener),
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return matches
      },
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addEventListener: (_type: string, listener: MediaListener) =>
        listeners.add(listener),
      removeEventListener,
      addListener: (listener: MediaListener) => listeners.add(listener),
      removeListener: (listener: MediaListener) => listeners.delete(listener),
      dispatchEvent: () => true,
    })),
  )
  return {
    emit(nextMatches) {
      matches = nextMatches
      for (const listener of listeners) {
        listener({ matches: nextMatches } as MediaQueryListEvent)
      }
    },
    removeEventListener,
  }
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  document.documentElement.removeAttribute('data-silen-appearance')
  document.documentElement.style.colorScheme = ''
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('dark')
  document.documentElement.removeAttribute('data-silen-appearance')
  document.documentElement.style.colorScheme = ''
})

describe('appearance preference', () => {
  it('selects system, light, and dark while saving and applying each preference', async () => {
    const user = userEvent.setup()
    const media = installMatchMedia(true)
    render(<AppearanceSwitch />)

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
    const appearance = screen.getByRole('radiogroup', { name: 'Appearance' })
    const system = within(appearance).getByRole('radio', {
      name: 'Appearance: System',
    })
    const light = within(appearance).getByRole('radio', {
      name: 'Appearance: Light',
    })
    const dark = within(appearance).getByRole('radio', {
      name: 'Appearance: Dark',
    })

    expect(system.getAttribute('aria-checked')).toBe('true')

    await user.click(light)
    expect(light.getAttribute('aria-checked')).toBe('true')
    expect(localStorage.getItem('silen-theme')).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    await user.click(dark)
    expect(dark.getAttribute('aria-checked')).toBe('true')
    expect(localStorage.getItem('silen-theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    await user.click(system)
    expect(system.getAttribute('aria-checked')).toBe('true')
    expect(localStorage.getItem('silen-theme')).toBe('system')

    act(() => media.emit(false))
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('loads saved preference, follows storage events, and removes listeners', async () => {
    localStorage.setItem('silen-theme', 'dark')
    const media = installMatchMedia(false)
    const { unmount } = render(<AppearanceSwitch />)
    const dark = screen.getByRole('radio', { name: 'Appearance: Dark' })

    await waitFor(() => expect(dark.getAttribute('aria-checked')).toBe('true'))
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'silen-theme',
          newValue: 'system',
        }),
      )
    })
    expect(
      screen
        .getByRole('radio', { name: 'Appearance: System' })
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    unmount()
    expect(media.removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function),
    )
  })

  it('continues to work when storage access is blocked', async () => {
    installMatchMedia(true)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })
    const user = userEvent.setup()

    render(<AppearanceSwitch />)
    await waitFor(() =>
      expect(document.documentElement.classList.contains('dark')).toBe(true),
    )
    await user.click(screen.getByRole('radio', { name: 'Appearance: Light' }))

    expect(
      screen
        .getByRole('radio', { name: 'Appearance: Light' })
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('keeps server and first client markup stable before reading browser preference', async () => {
    localStorage.setItem('silen-theme', 'dark')
    installMatchMedia(false)
    const markup = renderToString(<AppearanceSwitch />)
    expect(markup).toContain('Appearance: System')
    expect(markup).toContain('data-silen-appearance-switch')
    expect(markup).toContain('data-silen-appearance-option="dark"')
    const container = document.createElement('div')
    container.innerHTML = markup
    document.body.append(container)
    const recoverableError = vi.fn()
    const root = hydrateRoot(container, <AppearanceSwitch />, {
      onRecoverableError: recoverableError,
    })

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    expect(recoverableError).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(
        screen
          .getByRole('radio', { name: 'Appearance: Dark' })
          .getAttribute('aria-checked'),
      ).toBe('true'),
    )

    act(() => root.unmount())
    container.remove()
  })

  it('injects a static, resilient before-paint script in the document head', () => {
    const page: RenderedPage = {
      appHtml: '<main>Documentation</main>',
      status: 200,
      title: 'Docs',
      description: '',
      publicData: {
        siteTitle: 'Docs',
        lang: 'en-US',
        base: '/',
        route: '/',
      },
    }
    const html = renderDocument(page, {
      base: '/',
      clientEntry: 'assets/client.js',
      stylesheets: ['assets/theme.css'],
    })

    expect(appearanceScript.toLowerCase()).not.toContain('</script')
    expect(html).toContain(`<script>${appearanceScript}</script>`)
    expect(html.indexOf(appearanceScript)).toBeLessThan(
      html.indexOf('rel="stylesheet"'),
    )

    expect(() => {
      void runInNewContext(appearanceScript, {
        document,
        localStorage: {
          getItem() {
            throw new DOMException('Blocked', 'SecurityError')
          },
        },
        matchMedia: () => ({ matches: true }),
      })
    }).not.toThrow()
    expect(document.documentElement.dataset.silenAppearance).toBe('system')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')

    document.documentElement.classList.remove('dark')
    document.documentElement.removeAttribute('data-silen-appearance')
    document.documentElement.style.colorScheme = ''
    expect(() => {
      void runInNewContext(appearanceScript, {
        document,
        localStorage: { getItem: () => 'dark' },
        matchMedia: () => ({ matches: false }),
      })
    }).not.toThrow()
    expect(document.documentElement.dataset.silenAppearance).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })
})
