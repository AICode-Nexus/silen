import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileToRoute, scanRoutes } from '../src/node/routes'

describe('file routes', () => {
  it.each([
    ['index.mdx', '/'],
    ['guide/index.mdx', '/guide/'],
    ['guide/getting-started.mdx', '/guide/getting-started'],
    ['about.md', '/about'],
    ['guide\\index.mdx', '/guide/'],
    ['guide\\getting-started.md', '/guide/getting-started'],
  ])('maps %s to %s', (file, route) => {
    expect(fileToRoute(file)).toBe(route)
  })

  it('scans supported files in deterministic relative-file order', async () => {
    const root = path.resolve('tests/fixtures/routes')

    await expect(scanRoutes(root)).resolves.toEqual([
      {
        path: '/about',
        relativeFile: 'about.md',
        file: path.join(root, 'about.md'),
      },
      {
        path: '/guide/getting-started',
        relativeFile: 'guide/getting-started.mdx',
        file: path.join(root, 'guide/getting-started.mdx'),
      },
      {
        path: '/guide/',
        relativeFile: 'guide/index.md',
        file: path.join(root, 'guide/index.md'),
      },
      {
        path: '/',
        relativeFile: 'index.mdx',
        file: path.join(root, 'index.mdx'),
      },
    ])
  })

  it('rejects duplicate normalized paths with both source files', async () => {
    await expect(scanRoutes('tests/fixtures/routes-conflict')).rejects.toThrow(
      'Duplicate route /guide/: guide/index.md, guide/index.mdx',
    )
  })
})
