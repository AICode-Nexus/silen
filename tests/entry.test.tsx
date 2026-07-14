import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const entryMocks = vi.hoisted(() => ({
  hydrateRoot: vi.fn(),
  navigateDocument: vi.fn(),
  resolveRoute: vi.fn(),
}))

vi.mock('react-dom/client', () => ({
  hydrateRoot: entryMocks.hydrateRoot,
}))

vi.mock('../src/client/app', () => ({
  App: () => null,
  resolveRoute: entryMocks.resolveRoute,
}))

vi.mock('../src/client/navigation', () => ({
  navigateDocument: entryMocks.navigateDocument,
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  document.body.innerHTML = '<div id="app">Server page</div>'
  window.history.replaceState(null, '', '/project/guide')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('contains an automatic hydration load rejection', async () => {
  const failure = new Error('initial route failed')
  const rejections: unknown[] = []
  const handleRejection = (reason: unknown): void => {
    rejections.push(reason)
  }
  entryMocks.resolveRoute.mockRejectedValueOnce(failure)
  process.on('unhandledRejection', handleRejection)

  try {
    await import('../src/client/entry')
    await new Promise((resolve) => window.setTimeout(resolve, 0))
  } finally {
    process.off('unhandledRejection', handleRejection)
  }

  expect(entryMocks.resolveRoute).toHaveBeenCalledWith('/project/guide')
  expect(entryMocks.hydrateRoot).not.toHaveBeenCalled()
  expect(entryMocks.navigateDocument).toHaveBeenCalledWith(
    `${window.location.origin}/project/guide`,
  )
  expect(rejections).toEqual([])
})
