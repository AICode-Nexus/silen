import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
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

describe('published package smoke test', () => {
  it('installs the archive in a clean project and builds a complete site', async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(tmpdir(), 'silen-package-smoke-'),
    )
    temporaryDirectories.push(temporaryDirectory)

    const packageSource = path.join(temporaryDirectory, 'package-source')
    await mkdir(packageSource)
    await Promise.all([
      cp(path.resolve('src'), path.join(packageSource, 'src'), {
        recursive: true,
      }),
      ...[
        'LICENSE',
        'README.md',
        'package.json',
        'tsconfig.build.json',
        'tsconfig.json',
        'tsup.config.ts',
      ].map((file) => cp(path.resolve(file), path.join(packageSource, file))),
      symlink(
        path.resolve('node_modules'),
        path.join(packageSource, 'node_modules'),
        process.platform === 'win32' ? 'junction' : 'dir',
      ),
    ])

    const packageBuild = await execa('pnpm', ['build'], {
      cwd: packageSource,
      reject: false,
      all: true,
      env: {
        ...process.env,
        SILEN_PACK_SCAN_SECRET: 'silen-env-value-must-not-ship',
      },
    })
    expect(packageBuild.exitCode, packageBuild.all).toBe(0)

    const pack = await execa(
      'pnpm',
      ['pack', '--pack-destination', temporaryDirectory],
      { cwd: packageSource, reject: false, all: true },
    )
    expect(pack.exitCode, pack.all).toBe(0)

    const archive = (await readdir(temporaryDirectory)).find((file) =>
      file.endsWith('.tgz'),
    )
    expect(archive).toBeDefined()
    const archivePath = path.join(temporaryDirectory, archive!)
    const archiveList = await execa('tar', ['-tzf', archivePath])
    const files = archiveList.stdout.split('\n').filter(Boolean)
    const packedManifest = JSON.parse(
      (await execa('tar', ['-xOzf', archivePath, 'package/package.json']))
        .stdout,
    ) as {
      bin?: Record<string, string>
      engines?: Record<string, string>
      license?: string
      name?: string
      publishConfig?: Record<string, string>
      repository?: { type?: string; url?: string }
      version?: string
    }
    const pluginDeclaration = (
      await execa('tar', [
        '-xOzf',
        archivePath,
        'package/dist/shared/plugin.d.ts',
      ])
    ).stdout

    expect(files).toContain('package/README.md')
    expect(files).toContain('package/LICENSE')
    expect(files).toContain('package/dist/node/cli.js')
    expect(files).toContain('package/dist/index.d.ts')
    expect(files).toContain('package/dist/client/hmr.js')
    expect(files).toContain('package/dist/client/hmr.d.ts')
    expect(files).toContain('package/dist/theme-default/index.css')
    expect(files.some((file) => file.endsWith('.d.ts'))).toBe(true)
    expect(
      files.filter(
        (file) =>
          !/^(?:package\/(?:LICENSE|README\.md|package\.json)|package\/dist\/)/.test(
            file,
          ),
      ),
    ).toEqual([])
    expect(
      files.some((file) =>
        /(?:^|\/)(?:src|tests|tooling|\.github)(?:\/|$)/.test(file),
      ),
    ).toBe(false)
    expect(
      files.some((file) =>
        /(?:^|\/)(?:tsconfig(?:\.[^/]*)?|tsup\.config|vitest\.config|eslint\.config|pnpm-lock|pnpm-workspace)\.(?:json|ts|yaml)$/.test(
          file,
        ),
      ),
    ).toBe(false)
    expect(files.some((file) => file.includes('/.vite/'))).toBe(false)
    expect(files.some((file) => file.includes('/.silen/ai/'))).toBe(false)
    expect(packedManifest).toMatchObject({
      bin: { silen: './dist/node/cli.js' },
      engines: { node: '^20.19.0 || >=22.12.0' },
      license: 'MIT',
      name: '@aicode-nexus/silen',
      publishConfig: {
        access: 'public',
        registry: 'https://registry.npmjs.org/',
      },
      repository: {
        type: 'git',
        url: 'git+https://github.com/AICode-Nexus/silen.git',
      },
      version: '0.1.0-alpha.3',
    })
    expect(pluginDeclaration).toContain(
      "import type { ProcessorOptions as MdxOptions } from '@mdx-js/mdx'",
    )
    expect(pluginDeclaration).toContain(
      "import type { PluginOption } from 'vite'",
    )
    expect(pluginDeclaration).toContain('SilenVitePluginOption = PluginOption')
    expect(pluginDeclaration).not.toContain('SilenVitePluginOption = unknown')
    expect(
      (await execa('tar', ['-xOzf', archivePath, 'package/dist/node/cli.js']))
        .stdout,
    ).toMatch(/^#!\/usr\/bin\/env node/)
    const packedContent = (
      await execa('tar', ['-xOzf', archivePath], {
        maxBuffer: 20 * 1024 * 1024,
      })
    ).stdout
    for (const forbidden of [
      packageSource,
      path.resolve('tests/fixtures'),
      'tests/fixtures',
      'silen-env-value-must-not-ship',
      'do-not-bundle-ask-ai-key',
      'do-not-bundle-disabled-ai-key',
    ]) {
      expect(packedContent).not.toContain(forbidden)
    }

    const consumer = path.join(temporaryDirectory, 'consumer')
    await mkdir(path.join(consumer, 'docs', '.silen'), { recursive: true })
    await mkdir(path.join(consumer, 'docs', 'guide'), { recursive: true })
    await mkdir(path.join(consumer, 'docs', 'public'), { recursive: true })
    await Promise.all([
      writeFile(
        path.join(consumer, 'package.json'),
        `${JSON.stringify(
          {
            private: true,
            type: 'module',
            dependencies: {
              react: '19.2.7',
              'react-dom': '19.2.7',
              '@aicode-nexus/silen': `file:${archivePath}`,
            },
            devDependencies: {
              '@types/react': '19.2.17',
            },
          },
          null,
          2,
        )}\n`,
      ),
      writeFile(
        path.join(consumer, 'docs', '.silen', 'config.ts'),
        `import { defineConfig, definePlugin } from '@aicode-nexus/silen'

const packedPlugin = definePlugin((_context, options: { label: string }) => ({
  name: 'packed-plugin',
  transformPageData(page) {
    return { data: { ...page.data, packedPlugin: options.label } }
  },
  transformHead() {
    return [{
      tag: 'meta',
      attributes: { name: 'packed-plugin', content: options.label },
    }]
  },
}))

export default defineConfig({
  title: 'External package smoke',
  description: 'Built only from the installed tarball',
  base: '/handbook/',
  outDir: 'site',
  plugins: [[packedPlugin, { label: 'installed-archive' }]],
})
`,
      ),
      writeFile(
        path.join(consumer, 'docs', '.silen', 'theme.tsx'),
        `import type { ReactNode } from 'react'
import { useData } from '@aicode-nexus/silen/client'
import DefaultTheme, { defineTheme } from '@aicode-nexus/silen/theme'

function Demo({ children }: { readonly children?: ReactNode }) {
  const { base } = useData()
  return <aside data-packed-demo="" data-packed-base={base}>{children}</aside>
}

export default defineTheme({
  extends: DefaultTheme,
  components: { Demo },
  wrapRoot({ children }) {
    return <div data-packed-root="">{children}</div>
  },
})
`,
      ),
      writeFile(
        path.join(consumer, 'docs', 'index.mdx'),
        `---
title: Package home
---

# Installed package

This page is rendered from a clean external project.

<Demo>Installed theme extension</Demo>

[Read the guide](./guide/)

<div className="bg-background text-foreground">Semantic theme</div>
`,
      ),
      writeFile(
        path.join(consumer, 'docs', 'guide', 'index.mdx'),
        `# External guide

The nested route was generated.
`,
      ),
      writeFile(
        path.join(consumer, 'docs', 'public', 'brand.txt'),
        'external-static-asset\n',
      ),
    ])

    const install = await execa(
      'pnpm',
      ['install', '--ignore-scripts', '--frozen-lockfile=false'],
      { cwd: consumer, reject: false, all: true },
    )
    expect(install.exitCode, install.all).toBe(0)

    const themeTypecheck = await execa(
      path.resolve('node_modules/.bin/tsc'),
      [
        '--noEmit',
        '--strict',
        '--jsx',
        'react-jsx',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--skipLibCheck',
        'docs/.silen/theme.tsx',
        'docs/.silen/config.ts',
      ],
      { cwd: consumer, reject: false, all: true },
    )
    expect(themeTypecheck.exitCode, themeTypecheck.all).toBe(0)

    const executable = path.join(consumer, 'node_modules/.bin/silen')
    const [help, version] = await Promise.all([
      execa(executable, ['--help'], {
        cwd: consumer,
        reject: false,
        all: true,
      }),
      execa(executable, ['--version'], {
        cwd: consumer,
        reject: false,
        all: true,
      }),
    ])
    expect(help.exitCode, help.all).toBe(0)
    expect(help.all).toContain('build [root]')
    expect(version.exitCode, version.all).toBe(0)
    expect(version.all).toContain('silen/0.1.0-alpha.3')

    const built = await execa(executable, ['build', 'docs'], {
      cwd: consumer,
      reject: false,
      all: true,
    })
    expect(built.exitCode, built.all).toBe(0)
    expect(built.all).toContain('Silen built 2 routes')

    const output = path.join(consumer, 'docs', 'site')
    const [home, guide, staticAsset, favicon, outputFiles] = await Promise.all([
      readFile(path.join(output, 'index.html'), 'utf8'),
      readFile(path.join(output, 'guide', 'index.html'), 'utf8'),
      readFile(path.join(output, 'brand.txt'), 'utf8'),
      readFile(path.join(output, 'favicon.svg'), 'utf8'),
      readdir(path.join(output, 'assets')),
    ])
    expect(home).toContain('<!doctype html>')
    expect(home).toContain('<title>Package home</title>')
    expect(home).toContain('<h1>Installed package</h1>')
    expect(home).toContain('data-packed-root=""')
    expect(home).toContain('data-packed-demo=""')
    expect(home).toContain('data-packed-base="/handbook/"')
    expect(home).toContain('Installed theme extension')
    expect(home).toContain(
      '<meta content="installed-archive" name="packed-plugin">',
    )
    expect(home).toContain('packedPlugin')
    expect(home).toMatch(/src="\/handbook\/assets\/.+\.js"/)
    expect(home).toContain(
      '<link rel="icon" type="image/svg+xml" href="/handbook/favicon.svg">',
    )
    expect(home).toContain('</html>')
    expect(guide).toContain('<h1>External guide</h1>')
    expect(staticAsset).toBe('external-static-asset\n')
    expect(favicon).toContain('aria-label="Silen"')
    expect(outputFiles.some((file) => file.endsWith('.js'))).toBe(true)
    const themeCss = (
      await Promise.all(
        outputFiles
          .filter((file) => file.endsWith('.css'))
          .map((file) => readFile(path.join(output, 'assets', file), 'utf8')),
      )
    ).join('\n')
    expect(themeCss).toContain('--silen-background:')
    expect(themeCss).toContain('.bg-background')
    expect(themeCss).toContain('.sr-only')
    expect(themeCss).toContain('.size-7')
    expect(themeCss).toContain('.sticky')
    expect(themeCss).toContain('.silen-home-hero-image')
    expect(themeCss).not.toContain(packageSource)
    expect(themeCss).not.toContain('src/theme-default/styles')
    expect((await stat(executable)).isFile()).toBe(true)

    const developmentPage = path.join(consumer, 'docs', 'index.mdx')
    const development = execa(
      executable,
      ['dev', 'docs', '--host', '127.0.0.1', '--port', '0'],
      {
        cwd: consumer,
        reject: false,
        all: true,
      },
    )
    let developmentOutput = ''
    let developmentUrl: URL | undefined

    try {
      developmentUrl = await new Promise<URL>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new Error(
              `Timed out waiting for the packed dev server:\n${developmentOutput}`,
            ),
          )
        }, 15_000)
        development.all?.on('data', (chunk) => {
          developmentOutput += String(chunk)
          const match = developmentOutput.match(
            /Silen dev server running at (https?:\/\/\S+)/,
          )
          if (!match?.[1]) return
          clearTimeout(timeout)
          resolve(new URL(match[1]))
        })
        void development.then((result) => {
          clearTimeout(timeout)
          reject(
            new Error(
              `Packed dev server exited before listening:\n${result.all}`,
            ),
          )
        }, reject)
      })
      const packedHmrRuntime = await realpath(
        path.join(
          consumer,
          'node_modules',
          '@aicode-nexus',
          'silen',
          'dist',
          'client',
          'hmr.js',
        ),
      )
      const [developmentHome, viteHmrClient, silenHmrRuntime] =
        await Promise.all([
          fetch(developmentUrl),
          fetch(new URL('@vite/client', developmentUrl)),
          fetch(new URL(`@fs${packedHmrRuntime}`, developmentUrl)),
        ])
      const [developmentHtml, viteHmrSource, silenHmrSource] =
        await Promise.all([
          developmentHome.text(),
          viteHmrClient.text(),
          silenHmrRuntime.text(),
        ])

      expect(developmentHome.status, developmentHtml).toBe(200)
      expect(developmentHtml).toContain('<h1>Installed package</h1>')
      expect(developmentHtml).toContain('data-packed-root=""')
      expect(developmentHtml).toContain('data-packed-demo=""')
      expect(developmentHtml).toContain('data-packed-base="/handbook/"')
      expect(developmentHtml).toContain(
        '<meta content="installed-archive" name="packed-plugin">',
      )
      expect(developmentHtml).toContain(
        '<link rel="icon" type="image/svg+xml" href="/handbook/favicon.svg">',
      )
      expect(developmentHtml).toContain('/handbook/@vite/client')
      expect(viteHmrClient.status, viteHmrSource).toBe(200)
      expect(viteHmrSource).toContain('vite-hmr')
      expect(silenHmrRuntime.status, silenHmrSource).toBe(200)
      expect(silenHmrSource).toContain('publishHotRouteUpdate')
      expect(silenHmrSource).toContain('subscribeToHotThemeUpdates')

      await writeFile(
        developmentPage,
        (await readFile(developmentPage, 'utf8')).replace(
          '# Installed package',
          '# Installed package updated',
        ),
      )
      const updateDeadline = Date.now() + 10_000
      let updatedHtml = ''
      let updatedStatus = 0
      do {
        await new Promise((resolve) => setTimeout(resolve, 50))
        const updated = await fetch(developmentUrl)
        updatedStatus = updated.status
        updatedHtml = await updated.text()
      } while (
        !updatedHtml.includes('<h1>Installed package updated</h1>') &&
        Date.now() < updateDeadline
      )
      expect(updatedStatus, updatedHtml).toBe(200)
      expect(updatedHtml).toContain('<h1>Installed package updated</h1>')
    } finally {
      development.kill('SIGTERM')
      const stopped = await development
      expect(stopped.exitCode, stopped.all).toBe(0)
      if (developmentUrl) {
        await expect(fetch(developmentUrl)).rejects.toThrow()
      }
    }
  }, 120_000)
})
