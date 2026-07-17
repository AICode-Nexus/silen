import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises'
import type { Stats } from 'node:fs'
import path from 'node:path'

const configSource = `import { defineConfig } from '@aicode-nexus/silen'

export default defineConfig({
  title: 'My Silen Site',
  description: 'A knowledge base for people and AI.',
  themeConfig: {
    nav: [{ text: 'Home', link: '/' }],
    sidebar: [
      {
        text: 'Start here',
        items: [{ text: 'Home', link: '/' }],
      },
    ],
    search: true,
    home: {
      hero: {
        name: 'My Silen Site',
        text: 'A useful home for your knowledge.',
        tagline: 'Write in MDX and publish for people and AI from one source.',
        actions: [{ text: 'Start writing', link: '/', theme: 'brand' }],
      },
      features: [
        {
          title: 'React-powered MDX',
          details: 'Use familiar Markdown and add React components when they help.',
        },
        {
          title: 'Local search',
          details: 'Give readers fast search without a hosted search dependency.',
        },
        {
          title: 'AI-ready output',
          details: 'Generate Markdown routes, llms.txt, and a deterministic AI index.',
        },
      ],
    },
  },
  ai: {
    llmsTxt: true,
    llmsFullTxt: true,
    markdownRoutes: true,
    index: true,
    contract: { enabled: true },
  },
})
`

const homepageSource = `---
layout: home
title: My Silen Site
description: A knowledge base for people and AI.
---

## Start writing

Replace this page with your project overview, then add more \`.md\` or \`.mdx\`
files beside it. Silen will turn the same content into a searchable static site
and AI-readable artifacts.

## Next steps

1. Describe what this knowledge base is for.
2. Add a guide for the first task readers should complete.
3. Run \`pnpm silen dev .\` while you write.
`

const scaffoldFiles = [
  { relativePath: '.silen/config.ts', source: configSource },
  { relativePath: 'index.mdx', source: homepageSource },
] as const

export interface InitResult {
  readonly root: string
  readonly createdPaths: readonly string[]
}

export interface InitSiteOptions {
  readonly writeStagedFile?: (file: string, source: string) => Promise<void>
  readonly promoteFile?: (
    stagedFile: string,
    targetFile: string,
  ) => Promise<void>
}

interface PromotedFile {
  readonly target: string
  readonly device: number
  readonly inode: number
}

function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined
}

async function optionalStat(file: string): Promise<Stats | undefined> {
  try {
    return await lstat(file)
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return undefined
    throw error
  }
}

function collisionError(collisions: readonly string[]): Error {
  return new Error(
    [
      'Silen init found existing target paths:',
      ...collisions.map((file) => `- ${file}`),
    ].join('\n'),
  )
}

async function scaffoldCollisions(root: string): Promise<string[]> {
  const rootStat = await optionalStat(root)
  if (rootStat?.isSymbolicLink()) {
    throw new Error(`Silen init root must not be a symlink: ${root}`)
  }
  if (rootStat && !rootStat.isDirectory()) {
    throw new Error(`Silen init root must be a directory: ${root}`)
  }

  const configDirectory = path.join(root, '.silen')
  const configDirectoryStat = await optionalStat(configDirectory)
  const blockedConfigDirectory =
    configDirectoryStat !== undefined &&
    (configDirectoryStat.isSymbolicLink() || !configDirectoryStat.isDirectory())
  const collisions: string[] = []

  for (const file of scaffoldFiles) {
    const target = path.join(root, file.relativePath)
    if (
      (file.relativePath === '.silen/config.ts' && blockedConfigDirectory) ||
      (await optionalStat(target)) !== undefined
    ) {
      collisions.push(target)
    }
  }
  return collisions
}

async function ensureDirectory(
  directory: string,
  createdDirectories: string[],
): Promise<void> {
  try {
    await mkdir(directory)
    createdDirectories.push(directory)
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error
    const stat = await lstat(directory)
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw error
  }
}

async function rollback(
  promotedFiles: readonly PromotedFile[],
  createdDirectories: readonly string[],
): Promise<void> {
  for (const file of [...promotedFiles].reverse()) {
    const current = await optionalStat(file.target)
    if (current?.dev === file.device && current.ino === file.inode) {
      await rm(file.target, { force: true })
    }
  }
  for (const directory of [...createdDirectories].reverse()) {
    try {
      await rmdir(directory)
    } catch (error) {
      if (errorCode(error) !== 'ENOENT' && errorCode(error) !== 'ENOTEMPTY') {
        throw error
      }
    }
  }
}

export async function initializeSite(
  inputRoot: string,
  options: InitSiteOptions = {},
): Promise<InitResult> {
  const root = path.resolve(inputRoot)
  const stagingRoot = await mkdtemp(
    path.join(path.dirname(root), `.${path.basename(root)}.silen-init-`),
  )
  const createdPaths: string[] = []
  const promotedFiles: PromotedFile[] = []
  const createdDirectories: string[] = []

  try {
    await mkdir(path.join(stagingRoot, '.silen'))
    for (const file of scaffoldFiles) {
      const stagedFile = path.join(stagingRoot, file.relativePath)
      if (options.writeStagedFile) {
        await options.writeStagedFile(stagedFile, file.source)
      } else {
        await writeFile(stagedFile, file.source, 'utf8')
      }
    }

    const collisions = await scaffoldCollisions(root)
    if (collisions.length > 0) throw collisionError(collisions)

    try {
      await ensureDirectory(root, createdDirectories)
      await ensureDirectory(path.join(root, '.silen'), createdDirectories)
      for (const file of scaffoldFiles) {
        const target = path.join(root, file.relativePath)
        await (options.promoteFile ?? link)(
          path.join(stagingRoot, file.relativePath),
          target,
        )
        const promoted = await lstat(target)
        promotedFiles.push({
          target,
          device: promoted.dev,
          inode: promoted.ino,
        })
        createdPaths.push(target)
      }
    } catch (error) {
      await rollback(promotedFiles, createdDirectories)
      throw error
    }

    return { root, createdPaths }
  } finally {
    await rm(stagingRoot, { force: true, recursive: true })
  }
}
