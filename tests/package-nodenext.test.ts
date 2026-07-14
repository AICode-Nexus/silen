import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
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

    const build = await execa('pnpm', ['build'], {
      cwd: process.cwd(),
      reject: false,
      all: true,
    })
    expect(build.exitCode, build.all).toBe(0)

    const pack = await execa(
      'pnpm',
      ['pack', '--pack-destination', temporaryDirectory],
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
        dependencies: {
          react: '19.2.7',
          'react-dom': '19.2.7',
          silen: `file:${archivePath}`,
        },
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
import { createMcpServer, createWorkspace, WorkspaceError, type Workspace } from 'silen/ai'
import { Link, RouterProvider, useRoute, useRouter, type Router } from 'silen/client'
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
const router: Router = {
  path: '/guide',
  go: async () => {},
  prefetch: async () => {},
}
const clientExports = { Link, RouterProvider, useRoute, useRouter }
const aiExports: {
  createMcpServer: typeof createMcpServer
  createWorkspace: (root: string) => Promise<Workspace>
  WorkspaceError: typeof WorkspaceError
} = { createMcpServer, createWorkspace, WorkspaceError }
void config
void component
void metadata
void firstHeading
void firstLink
void virtualBase
void virtualPage
void virtualLayout
void router
void clientExports
void aiExports
`,
    )
    await writeFile(join(consumerDirectory, 'page.mdx'), '# Packed consumer')

    const install = await execa(
      'pnpm',
      ['install', '--offline', '--ignore-scripts'],
      { cwd: consumerDirectory, reject: false, all: true },
    )
    expect(install.exitCode, install.all).toBe(0)

    const typecheck = await execa(
      'pnpm',
      ['exec', 'tsc', '-p', join(consumerDirectory, 'tsconfig.json')],
      { cwd: process.cwd(), reject: false, all: true },
    )

    expect(typecheck.exitCode, typecheck.all).toBe(0)

    await writeFile(
      join(consumerDirectory, 'verify-ai.mjs'),
      `import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createMcpServer, createWorkspace, WorkspaceError } from 'silen/ai'

const root = join(process.cwd(), 'ai-workspace')
await mkdir(root, { recursive: true })
await writeFile(join(root, 'index.md'), '# Packed AI API\\n')
const workspace = await createWorkspace(root)
const listed = await workspace.list()
const server = createMcpServer({ workspace, allowWrite: false })
if (listed.files.length !== 1 || !(new WorkspaceError('PACKED', 'safe') instanceof Error)) process.exit(2)
await server.close()
console.log('packed-ai-ok')
`,
    )
    const packedAi = await execa('node', ['verify-ai.mjs'], {
      cwd: consumerDirectory,
      reject: false,
      all: true,
    })
    expect(packedAi.exitCode, packedAi.all).toBe(0)
    expect(packedAi.all).toContain('packed-ai-ok')

    const site = join(consumerDirectory, 'site')
    await mkdir(join(site, '.silen'), { recursive: true })
    await Promise.all([
      writeFile(
        join(site, '.silen/config.ts'),
        `import { defineConfig } from 'silen'
export default defineConfig({ title: 'Packed CLI', base: '/packed/' })
`,
      ),
      writeFile(join(site, 'index.mdx'), '# Built by the packed CLI\n'),
    ])
    const executable = join(consumerDirectory, 'node_modules/.bin/silen')
    const packedBuild = await execa(executable, ['build', site], {
      cwd: consumerDirectory,
      reject: false,
      all: true,
    })
    expect(packedBuild.exitCode, packedBuild.all).toBe(0)
    expect(
      await readFile(join(site, '.silen/dist/index.html'), 'utf8'),
    ).toContain('<h1>Built by the packed CLI</h1>')
  }, 120_000)
})
