import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
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

    const packageBuild = await execa('corepack', ['pnpm', 'build'], {
      cwd: packageSource,
      reject: false,
      all: true,
    })
    expect(packageBuild.exitCode, packageBuild.all).toBe(0)

    const pack = await execa(
      'corepack',
      ['pnpm', 'pack', '--pack-destination', temporaryDirectory],
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
      publishConfig?: Record<string, string>
      repository?: { type?: string; url?: string }
    }

    expect(files).toContain('package/README.md')
    expect(files).toContain('package/LICENSE')
    expect(files).toContain('package/dist/node/cli.js')
    expect(files).toContain('package/dist/index.d.ts')
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
    expect(packedManifest).toMatchObject({
      bin: { silen: './dist/node/cli.js' },
      engines: { node: '^20.19.0 || >=22.12.0' },
      license: 'MIT',
      publishConfig: { access: 'public' },
      repository: {
        type: 'git',
        url: 'git+https://github.com/AICode-Nexus/silen.git',
      },
    })
    expect(
      (await execa('tar', ['-xOzf', archivePath, 'package/dist/node/cli.js']))
        .stdout,
    ).toMatch(/^#!\/usr\/bin\/env node/)

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
              silen: `file:${archivePath}`,
            },
          },
          null,
          2,
        )}\n`,
      ),
      writeFile(
        path.join(consumer, 'docs', '.silen', 'config.ts'),
        `import { defineConfig } from 'silen'

export default defineConfig({
  title: 'External package smoke',
  description: 'Built only from the installed tarball',
  base: '/handbook/',
  outDir: 'site',
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

[Read the guide](./guide/)
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
      'corepack',
      ['pnpm', 'install', '--ignore-scripts', '--frozen-lockfile=false'],
      { cwd: consumer, reject: false, all: true },
    )
    expect(install.exitCode, install.all).toBe(0)

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
    expect(version.all).toContain('silen/0.1.0-alpha.0')

    const built = await execa(executable, ['build', 'docs'], {
      cwd: consumer,
      reject: false,
      all: true,
    })
    expect(built.exitCode, built.all).toBe(0)
    expect(built.all).toContain('Silen built 2 routes')

    const output = path.join(consumer, 'docs', 'site')
    const [home, guide, staticAsset, outputFiles] = await Promise.all([
      readFile(path.join(output, 'index.html'), 'utf8'),
      readFile(path.join(output, 'guide', 'index.html'), 'utf8'),
      readFile(path.join(output, 'brand.txt'), 'utf8'),
      readdir(path.join(output, 'assets')),
    ])
    expect(home).toContain('<!doctype html>')
    expect(home).toContain('<title>Package home</title>')
    expect(home).toContain('<h1>Installed package</h1>')
    expect(home).toMatch(/src="\/handbook\/assets\/.+\.js"/)
    expect(home).toContain('</html>')
    expect(guide).toContain('<h1>External guide</h1>')
    expect(staticAsset).toBe('external-static-asset\n')
    expect(outputFiles.some((file) => file.endsWith('.js'))).toBe(true)
    expect((await stat(executable)).isFile()).toBe(true)
  }, 120_000)
})
