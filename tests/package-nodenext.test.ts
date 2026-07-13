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
    const packageDirectory = join(consumerDirectory, 'node_modules', 'silen')
    await mkdir(packageDirectory, { recursive: true })
    await execa(
      'tar',
      [
        '-xzf',
        join(temporaryDirectory, archive!),
        '-C',
        packageDirectory,
        '--strip-components=1',
      ],
      { reject: true },
    )

    await writeFile(
      join(consumerDirectory, 'package.json'),
      JSON.stringify({ private: true, type: 'module' }),
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
        include: ['index.ts'],
      }),
    )
    await writeFile(
      join(consumerDirectory, 'index.ts'),
      `import { defineConfig, type UserConfig } from 'silen'

const config: UserConfig = defineConfig({ title: 'Docs' })
void config
`,
    )

    const typecheck = await execa(
      'corepack',
      ['pnpm', 'exec', 'tsc', '-p', join(consumerDirectory, 'tsconfig.json')],
      { cwd: process.cwd(), reject: false, all: true },
    )

    expect(typecheck.exitCode, typecheck.all).toBe(0)
  })
})
