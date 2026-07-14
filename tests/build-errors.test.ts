import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { build } from '../src/node/build'

const fixture = (name: string): string =>
  path.resolve('tests/fixtures', `build-${name}`)
const touched = new Set<string>()
const generatedRoots = new Set<string>()

async function snapshotTree(
  root: string,
  directory = root,
): Promise<Array<[string, string]>> {
  const snapshot: Array<[string, string]> = []
  for (const name of (await readdir(directory)).sort()) {
    const file = path.join(directory, name)
    const relative = path.relative(root, file)
    const stats = await lstat(file)
    if (stats.isDirectory()) {
      snapshot.push([`${relative}/`, 'directory'])
      snapshot.push(...(await snapshotTree(root, file)))
    } else if (stats.isSymbolicLink()) {
      snapshot.push([relative, `symlink:${await readlink(file)}`])
    } else {
      snapshot.push([relative, (await readFile(file)).toString('base64')])
    }
  }
  return snapshot
}

async function createSafetyFixture(
  name: string,
  outDir: string,
): Promise<{ configFile: string; root: string }> {
  const root = await mkdtemp(
    path.join(path.resolve('tests/fixtures'), `.silen-${name}-`),
  )
  const configFile = path.join(root, '.silen/config.ts')
  await mkdir(path.join(root, '.silen/.temp'), { recursive: true })
  await writeFile(
    configFile,
    `export default ${JSON.stringify({ title: name, outDir })}\n`,
  )
  await writeFile(path.join(root, 'index.mdx'), `# ${name}\n`)
  generatedRoots.add(root)
  return { configFile, root }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    [...generatedRoots].map((root) =>
      rm(root, { force: true, recursive: true }),
    ),
  )
  await Promise.all(
    [...touched].flatMap((root) => [
      rm(path.join(root, '.silen/dist'), { force: true, recursive: true }),
      rm(path.join(root, '.silen/.temp'), { force: true, recursive: true }),
      rm(path.join(root, 'custom-output'), { force: true, recursive: true }),
    ]),
  )
  generatedRoots.clear()
  touched.clear()
})

describe('static build diagnostics and failure safety', () => {
  it('rejects .silen before deleting its config or writing build output', async () => {
    const { configFile, root } = await createSafetyFixture(
      'config-preservation',
      '.silen',
    )
    await writeFile(path.join(root, 'index.mdx'), '<Unclosed\n')
    const configBytes = await readFile(configFile)
    const before = await snapshotTree(root)

    await expect(build(root)).rejects.toThrow(
      `Refusing to replace output directory ${path.join(root, '.silen')} because it contains protected file ${configFile}`,
    )

    await expect(readFile(configFile)).resolves.toEqual(configBytes)
    expect(await snapshotTree(root)).toEqual(before)
  })

  it('rejects a route-containing directory before deleting route bytes or writing output', async () => {
    const { configFile, root } = await createSafetyFixture(
      'route-preservation',
      'docs',
    )
    const routeFile = path.join(root, 'docs/guide.mdx')
    await mkdir(path.dirname(routeFile), { recursive: true })
    await writeFile(routeFile, Buffer.from('<Unclosed\n'))
    const configBytes = await readFile(configFile)
    const routeBytes = await readFile(routeFile)
    const before = await snapshotTree(root)

    await expect(build(root)).rejects.toThrow(
      `Refusing to replace output directory ${path.join(root, 'docs')} because it contains protected file ${routeFile}`,
    )

    await expect(readFile(configFile)).resolves.toEqual(configBytes)
    await expect(readFile(routeFile)).resolves.toEqual(routeBytes)
    expect(await snapshotTree(root)).toEqual(before)
  })

  it('rejects a not-yet-created output beneath a symlinked parent containing a route', async () => {
    const { root } = await createSafetyFixture(
      'symlink-parent-preservation',
      'site/output',
    )
    const routeFile = path.join(root, 'docs/output/guide.mdx')
    const outParent = path.join(root, 'site')
    const outDir = path.join(outParent, 'output')
    await mkdir(path.dirname(routeFile), { recursive: true })
    await writeFile(routeFile, '<Unclosed\n')
    try {
      await symlink(path.join(root, 'docs'), outParent, 'dir')
    } catch (error) {
      if (
        ['EPERM', 'EACCES', 'ENOSYS'].includes(
          (error as NodeJS.ErrnoException).code ?? '',
        )
      ) {
        return
      }
      throw error
    }
    const routeBytes = await readFile(routeFile)
    const before = await snapshotTree(root)

    await expect(build(root)).rejects.toThrow(
      `Refusing to replace output directory ${outDir} because it contains protected file ${routeFile}`,
    )

    await expect(readFile(routeFile)).resolves.toEqual(routeBytes)
    expect(await snapshotTree(root)).toEqual(before)
  })

  it('rejects a symlink output alias to a route-containing directory', async () => {
    const { root } = await createSafetyFixture('symlink-preservation', 'site')
    const routeFile = path.join(root, 'docs/guide.mdx')
    const outDir = path.join(root, 'site')
    await mkdir(path.dirname(routeFile), { recursive: true })
    await writeFile(routeFile, '# Symlink guide\n')
    try {
      await symlink(path.dirname(routeFile), outDir, 'dir')
    } catch (error) {
      if (
        ['EPERM', 'EACCES', 'ENOSYS'].includes(
          (error as NodeJS.ErrnoException).code ?? '',
        )
      ) {
        return
      }
      throw error
    }
    const routeBytes = await readFile(routeFile)
    const before = await snapshotTree(root)

    await expect(build(root)).rejects.toThrow(
      `Refusing to replace output directory ${outDir} because it contains protected file ${routeFile}`,
    )

    await expect(readFile(routeFile)).resolves.toEqual(routeBytes)
    expect(await snapshotTree(root)).toEqual(before)
  })

  it('allows default and not-yet-created safe output directories', async () => {
    const defaultFixture = await createSafetyFixture(
      'safe-default',
      '.silen/dist',
    )
    const customFixture = await createSafetyFixture(
      'safe-custom',
      'generated/site',
    )

    const [defaultResult, customResult] = await Promise.all([
      build(defaultFixture.root),
      build(customFixture.root),
    ])

    expect(defaultResult.outDir).toBe(
      path.join(defaultFixture.root, '.silen/dist'),
    )
    expect(customResult.outDir).toBe(
      path.join(customFixture.root, 'generated/site'),
    )
    await expect(
      readFile(path.join(defaultResult.outDir, 'index.html'), 'utf8'),
    ).resolves.toContain('<h1>safe-default</h1>')
    await expect(
      readFile(path.join(customResult.outDir, 'index.html'), 'utf8'),
    ).resolves.toContain('<h1>safe-custom</h1>')
  })

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

  it('rejects route aliases targeting the same normalized custom output before replacing it', async () => {
    const root = fixture('output-collision')
    const outDir = path.join(root, 'custom-output/site')
    const sentinel = path.join(outDir, 'sentinel.txt')
    touched.add(root)
    await mkdir(outDir, { recursive: true })
    await writeFile(sentinel, 'preserve me', 'utf8')

    let error: unknown
    try {
      await build(root)
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(Error)
    const message = error instanceof Error ? error.message : String(error)
    expect(message).toContain(
      `Static output collision at ${path.join(outDir, 'foo/index.html')}`,
    )
    expect(message).toContain(`route /foo (${path.join(root, 'foo.mdx')})`)
    expect(message).toContain(
      `route /foo/ (${path.join(root, 'foo/index.mdx')})`,
    )
    await expect(readFile(sentinel, 'utf8')).resolves.toBe('preserve me')
    await expect(readdir(path.join(root, '.silen/.temp'))).resolves.toEqual([])
    expect(
      (await readdir(path.join(root, 'custom-output'))).filter((name) =>
        name.includes('silen-stage'),
      ),
    ).toEqual([])
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
