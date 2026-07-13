import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { build } from '../src/node/build'

const fixture = (name: string): string =>
  path.resolve('tests/fixtures', `build-${name}`)
const touched = new Set<string>()

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    [...touched].flatMap((root) => [
      rm(path.join(root, '.silen/dist'), { force: true, recursive: true }),
      rm(path.join(root, '.silen/.temp'), { force: true, recursive: true }),
    ]),
  )
  touched.clear()
})

describe('static build diagnostics and failure safety', () => {
  it('fails broken links before replacing an existing final output', async () => {
    const root = fixture('broken')
    const outDir = path.join(root, '.silen/dist')
    touched.add(root)
    await mkdir(outDir, { recursive: true })
    await writeFile(path.join(outDir, 'sentinel.txt'), 'preserve me', 'utf8')

    await expect(build(root)).rejects.toThrow(
      `${path.join(root, 'index.mdx')} (route /): Broken internal link /missing`,
    )
    await expect(
      readFile(path.join(outDir, 'sentinel.txt'), 'utf8'),
    ).resolves.toBe('preserve me')
  })

  it('warns and completes when onBrokenLinks is warn', async () => {
    const root = fixture('warn')
    touched.add(root)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = await build(root)

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain('index.mdx (route /)')
    await expect(
      readFile(path.join(result.outDir, 'index.html'), 'utf8'),
    ).resolves.toContain('<h1>Warning fixture</h1>')
  })

  it('continues silently when onBrokenLinks is ignore', async () => {
    const root = fixture('ignore')
    touched.add(root)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = await build(root)

    expect(warn).not.toHaveBeenCalled()
    await expect(
      readFile(path.join(result.outDir, 'index.html'), 'utf8'),
    ).resolves.toContain('<h1>Ignored fixture</h1>')
  })

  it('names the canonical route and source file for MDX build failures', async () => {
    const root = fixture('invalid-mdx')
    touched.add(root)

    await expect(build(root)).rejects.toThrow(/route \/broken.*broken\.mdx/s)
  })

  it('names the canonical route and source file for SSR render failures', async () => {
    const root = fixture('ssr-error')
    const outDir = path.join(root, '.silen/dist')
    touched.add(root)
    await mkdir(outDir, { recursive: true })
    await writeFile(path.join(outDir, 'sentinel.txt'), 'preserve me', 'utf8')

    await expect(build(root)).rejects.toThrow(
      /route \/explode.*explode\.mdx.*fixture SSR explosion/s,
    )
    await expect(
      readFile(path.join(outDir, 'sentinel.txt'), 'utf8'),
    ).resolves.toBe('preserve me')
    await expect(readdir(path.join(root, '.silen/.temp'))).resolves.toEqual([])
    expect(
      (await readdir(path.join(root, '.silen'))).filter((name) =>
        name.includes('silen-stage'),
      ),
    ).toEqual([])
  })
})
