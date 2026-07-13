import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { execa } from 'execa'

const temporaryDirectories: string[] = []

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  )
})

describe('packed package declarations', () => {
  it('type-check in a NodeNext consumer', async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'silen-nodenext-'))
    temporaryDirectories.push(temporaryDirectory)

    const build = await execa('corepack', ['pnpm', 'build'], {
      cwd: process.cwd(),
      reject: false,
      all: true,
    })
    expect(build.exitCode, build.all).toBe(0)

    const pack = await execa(
      'corepack',
      ['pnpm', 'pack', '--pack-destination', temporaryDirectory],
      { cwd: process.cwd(), reject: false, all: true },
    )
    expect(pack.exitCode, pack.all).toBe(0)

    const archive = (await readdir(temporaryDirectory)).find((file) =>
      file.endsWith('.tgz'),
    )
    expect(archive).toBeDefined()

    const consumerDirectory = join(temporaryDirectory, 'consumer')
    await mkdir(consumerDirectory, { recursive: true })
    const archivePath = join(temporaryDirectory, archive!)

    await writeFile(
      join(consumerDirectory, 'package.json'),
      JSON.stringify({
        private: true,
        type: 'module',
        dependencies: { silen: `file:${archivePath}` },
        devDependencies: { '@types/react': '19.2.17' },
      }),
    )
    await writeFile(
      join(consumerDirectory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          noEmit: true,
          strict: true,
          target: 'ES2023',
        },
        include: ['index.ts', 'page.mdx'],
      }),
    )
    await writeFile(
      join(consumerDirectory, 'index.ts'),
      `import type { ComponentType } from 'react'
import { defineConfig, type UserConfig } from 'silen'
import type { VirtualConfig } from 'virtual:silen/config'
import type { PageModule } from 'virtual:silen/routes'
import type { Theme } from 'virtual:silen/theme'
import Page, { frontmatter, headings, links } from './page.mdx'

const config: UserConfig = defineConfig({ title: 'Docs' })
const component: ComponentType = Page
const metadata: Readonly<Record<string, unknown>> = frontmatter
const firstHeading: { depth: number; title: string; slug: string } | undefined = headings[0]
const firstLink: string | undefined = links[0]
declare const virtualConfig: VirtualConfig
declare const pageModule: PageModule
declare const theme: Theme
const virtualBase: string = virtualConfig.base
const virtualPage: ComponentType = pageModule.default
const virtualLayout: Theme['Layout'] = theme.Layout
void config
void component
void metadata
void firstHeading
void firstLink
void virtualBase
void virtualPage
void virtualLayout
`,
    )
    await writeFile(join(consumerDirectory, 'page.mdx'), '# Packed consumer')

    const install = await execa(
      'corepack',
      ['pnpm', 'install', '--offline', '--ignore-scripts'],
      { cwd: consumerDirectory, reject: false, all: true },
    )
    expect(install.exitCode, install.all).toBe(0)

    const typecheck = await execa(
      'corepack',
      ['pnpm', 'exec', 'tsc', '-p', join(consumerDirectory, 'tsconfig.json')],
      { cwd: process.cwd(), reject: false, all: true },
    )

    expect(typecheck.exitCode, typecheck.all).toBe(0)
  })
})
