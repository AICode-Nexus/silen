import { act, useState } from 'react'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataProvider, RouterProvider, type Router } from '../../src/client'
import { Nav } from '../../src/theme-default/components/nav'
import {
  SearchDialog,
  type SearchClient,
} from '../../src/theme-default/components/search'
import type { SearchResult } from '../../src/theme-default/search'

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  Element.prototype,
  'scrollIntoView',
)

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalScrollIntoView === undefined) {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  } else {
    Object.defineProperty(
      Element.prototype,
      'scrollIntoView',
      originalScrollIntoView,
    )
  }
})

function Providers({
  children,
  go = vi.fn(() => Promise.resolve()),
  search = true,
}: {
  children: React.ReactNode
  go?: Router['go']
  search?: boolean
}): React.JSX.Element {
  return (
    <DataProvider
      value={{
        siteTitle: 'Silen Docs',
        lang: 'en-US',
        base: '/knowledge/',
        route: '/guide/',
        themeConfig: { search },
      }}
    >
      <RouterProvider
        value={{
          path: '/knowledge/guide/',
          base: '/knowledge/',
          go,
          prefetch: () => Promise.resolve(),
        }}
      >
        {children}
      </RouterProvider>
    </DataProvider>
  )
}

function Harness({
  searchClient,
  go,
}: {
  searchClient: SearchClient
  go?: Router['go']
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Providers {...(go === undefined ? {} : { go })}>
      <button onClick={() => setOpen(true)}>Open search</button>
      <SearchDialog
        open={open}
        onOpenChange={setOpen}
        searchClient={searchClient}
      />
    </Providers>
  )
}

const guideResult: SearchResult = {
  id: '/guide',
  title: 'Configuration guide',
  route: '/guide#options',
  heading: 'Site options',
  snippet: 'Choose <mark>site options</mark> safely.',
}

describe('SearchDialog', () => {
  it('is titled and described, supports keyboard selection, and restores focus', async () => {
    const user = userEvent.setup()
    const go = vi.fn(() => Promise.resolve())
    const searchClient: SearchClient = vi.fn(() =>
      Promise.resolve([guideResult]),
    )
    render(<Harness searchClient={searchClient} go={go} />)

    const trigger = screen.getByRole('button', { name: 'Open search' })
    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Search documentation' })
    expect(dialog.getAttribute('aria-describedby')).toBe(
      screen.getByText('Search all public documentation pages.').id,
    )

    await user.type(
      screen.getByRole('combobox', { name: 'Search documentation' }),
      'site options',
    )
    const option = await screen.findByRole('option', {
      name: /Configuration guide/,
    })
    expect(option.innerHTML).toContain('<mark>site options</mark>')
    await user.keyboard('{Enter}')

    await waitFor(() =>
      expect(go).toHaveBeenCalledWith('/knowledge/guide#options'),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('shows loading, empty, and recoverable failure states', async () => {
    const user = userEvent.setup()
    let rejectSearch: ((reason: Error) => void) | undefined
    const searchClient: SearchClient = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<SearchResult[]>((_, reject) => {
            rejectSearch = reject
          }),
      )
      .mockResolvedValueOnce([])
    render(<Harness searchClient={searchClient} />)

    await user.click(screen.getByRole('button', { name: 'Open search' }))
    const input = screen.getByRole('combobox', {
      name: 'Search documentation',
    })
    fireEvent.change(input, { target: { value: 'broken' } })
    expect(await screen.findByText('Searching documentation…')).not.toBeNull()

    act(() => rejectSearch?.(new Error('offline')))
    expect(
      await screen.findByText('Search is temporarily unavailable.'),
    ).not.toBeNull()

    fireEvent.change(input, { target: { value: 'missing' } })
    expect(await screen.findByText('No results found.')).not.toBeNull()
  })

  it('aborts superseded queries and ignores stale results', async () => {
    const user = userEvent.setup()
    const pending = new Map<
      string,
      { resolve: (results: SearchResult[]) => void; signal: AbortSignal }
    >()
    const searchClient: SearchClient = vi.fn(
      (query: string, { signal }: { signal: AbortSignal }) =>
        new Promise<SearchResult[]>((resolve) => {
          pending.set(query, { resolve, signal })
        }),
    )
    render(<Harness searchClient={searchClient} />)

    await user.click(screen.getByRole('button', { name: 'Open search' }))
    const input = screen.getByRole('combobox', {
      name: 'Search documentation',
    })
    fireEvent.change(input, { target: { value: 'first' } })
    await waitFor(() => expect(pending.has('first')).toBe(true))
    fireEvent.change(input, { target: { value: 'second' } })
    await waitFor(() => expect(pending.has('second')).toBe(true))

    expect(pending.get('first')?.signal.aborted).toBe(true)
    act(() => {
      pending.get('second')?.resolve([guideResult])
    })
    expect(await screen.findByText('Configuration guide')).not.toBeNull()

    act(() => {
      pending
        .get('first')
        ?.resolve([{ ...guideResult, id: '/stale', title: 'Stale result' }])
    })
    expect(screen.queryByText('Stale result')).toBeNull()
  })

  it('keeps the dialog open and reports rejected router navigation', async () => {
    const user = userEvent.setup()
    const go = vi.fn(() => Promise.reject(new Error('navigation failed')))
    render(
      <Harness searchClient={() => Promise.resolve([guideResult])} go={go} />,
    )

    await user.click(screen.getByRole('button', { name: 'Open search' }))
    await user.type(
      screen.getByRole('combobox', { name: 'Search documentation' }),
      'configuration',
    )
    await user.click(
      await screen.findByRole('option', { name: /Configuration guide/ }),
    )

    expect(
      await screen.findByText('Unable to open this result.'),
    ).not.toBeNull()
    expect(screen.getByRole('dialog')).not.toBeNull()
  })
})

describe('lazy search launcher', () => {
  it('opens from the button and shortcut, restores focus, and installs one listener', async () => {
    const user = userEvent.setup()
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const view = render(
      <Providers>
        <Nav />
      </Providers>,
    )

    const searchAdds = add.mock.calls.filter(([name]) => name === 'keydown')
    expect(searchAdds).toHaveLength(1)

    const trigger = screen.getByRole('button', { name: 'Search documentation' })
    await user.click(trigger)
    expect(
      await screen.findByRole('dialog', { name: 'Search documentation' }),
    ).not.toBeNull()
    await user.keyboard('{Escape}')
    expect(document.activeElement).toBe(trigger)

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(
      await screen.findByRole('dialog', { name: 'Search documentation' }),
    ).not.toBeNull()
    await user.keyboard('{Escape}')

    view.unmount()
    expect(
      remove.mock.calls.filter(([name]) => name === 'keydown'),
    ).toHaveLength(1)
  })

  it('ignores editable targets, default-prevented shortcuts, and disabled search', () => {
    const view = render(
      <Providers>
        <input aria-label="Page editor" />
        <Nav />
      </Providers>,
    )

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Page editor' }), {
      key: 'k',
      ctrlKey: true,
    })
    expect(screen.queryByRole('dialog')).toBeNull()

    const prevented = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: 'k',
    })
    prevented.preventDefault()
    window.dispatchEvent(prevented)
    expect(screen.queryByRole('dialog')).toBeNull()
    view.unmount()

    render(
      <Providers search={false}>
        <Nav />
      </Providers>,
    )
    expect(
      screen.queryByRole('button', { name: 'Search documentation' }),
    ).toBeNull()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
