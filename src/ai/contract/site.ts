import { randomUUID } from 'node:crypto'
import {
  cp,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import type {
  SilenApiContract,
  SilenContractLocale,
  SilenContractManifest,
  SilenContractResource,
  SilenContractTask,
} from '../../shared/ai-contract.js'
import type { ResolvedConfig } from '../../shared/config.js'
import { joinBaseRoute } from '../../shared/url.js'
import { SILEN_VERSION } from '../../shared/version.js'
import { locatePackagedAgentContract } from './package-assets.js'
import { loadPublicContractContent } from './public-files.js'
import { parseApiContract, parseContractManifest } from './schema.js'
import { serializeContractJson } from './serialize.js'

export interface SiteContractOptions {
  readonly outDir: string
  readonly config: ResolvedConfig
  readonly assetDir?: string
}

export interface SiteContractResult {
  readonly files: readonly string[]
}

async function pathExists(file: string): Promise<boolean> {
  try {
    await lstat(file)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

function contractUrl(base: string, relativePath: string): string {
  return joinBaseRoute(base, `/.well-known/silen/${relativePath}`)
}

function normalizedLocaleRoot(root: string | undefined): string {
  if (root === undefined || root === '') return '/'
  const leading = root.startsWith('/') ? root : `/${root}`
  return leading.endsWith('/') ? leading : `${leading}/`
}

function siteLocales(config: ResolvedConfig): SilenContractLocale[] {
  const locales = new Map<string, SilenContractLocale>()
  locales.set(config.lang, { lang: config.lang, root: '/' })
  for (const locale of config.themeConfig.locales ?? []) {
    locales.set(locale.lang, {
      lang: locale.lang,
      root: normalizedLocaleRoot(locale.root),
      label: locale.label,
    })
  }
  return [...locales.values()]
}

function siteResources(
  config: ResolvedConfig,
  includeChinese: boolean,
): SilenContractResource[] {
  return [
    {
      id: 'silen-manifest',
      format: 'application/json',
      url: contractUrl(config.base, 'manifest.json'),
    },
    {
      id: 'api',
      format: 'application/json',
      url: contractUrl(config.base, 'api.json'),
    },
    {
      id: 'guide',
      format: 'text/markdown',
      url: contractUrl(config.base, 'guide.md'),
    },
    ...(includeChinese
      ? [
          {
            id: 'guide',
            format: 'text/markdown',
            lang: 'zh-CN',
            url: contractUrl(config.base, 'locales/zh-CN/guide.md'),
          } satisfies SilenContractResource,
        ]
      : []),
    ...(config.ai.llmsTxt
      ? [
          {
            id: 'llms',
            format: 'text/markdown',
            url: joinBaseRoute(config.base, '/llms.txt'),
          } satisfies SilenContractResource,
        ]
      : []),
    ...(config.ai.llmsFullTxt
      ? [
          {
            id: 'llms-full',
            format: 'text/markdown',
            url: joinBaseRoute(config.base, '/llms-full.txt'),
          } satisfies SilenContractResource,
        ]
      : []),
    ...(config.ai.index
      ? [
          {
            id: 'ai-index',
            format: 'application/json',
            url: joinBaseRoute(config.base, '/ai-index.json'),
          } satisfies SilenContractResource,
        ]
      : []),
    ...(config.ai.markdownRoutes
      ? [
          {
            id: 'markdown-routes',
            format: 'text/markdown',
            url: joinBaseRoute(config.base, '/index.md'),
          } satisfies SilenContractResource,
        ]
      : []),
  ]
}

async function loadFrameworkAssets(assetDir: string): Promise<{
  manifest: SilenContractManifest
  api: SilenApiContract
  guide: string
}> {
  try {
    const [manifestSource, apiSource, guide] = await Promise.all([
      readFile(path.join(assetDir, 'manifest.json'), 'utf8'),
      readFile(path.join(assetDir, 'api.json'), 'utf8'),
      readFile(path.join(assetDir, 'guide.md'), 'utf8'),
    ])
    const manifest = parseContractManifest(JSON.parse(manifestSource))
    const api = parseApiContract(JSON.parse(apiSource))
    if (
      manifest.kind !== 'silen-framework' ||
      manifest.generator.version !== SILEN_VERSION ||
      api.generator.version !== SILEN_VERSION
    ) {
      throw new Error('version mismatch')
    }
    return { manifest, api, guide }
  } catch {
    throw new Error(
      'SILEN_AGENT_CONTRACT_INVALID: rebuild or reinstall the matching Silen package',
    )
  }
}

function builtInSiteTasks(
  framework: SilenContractManifest,
  config: ResolvedConfig,
  includeChinese: boolean,
): SilenContractTask[] {
  return framework.tasks
    .filter(
      (task) =>
        task.lang === 'en-US' || (includeChinese && task.lang === 'zh-CN'),
    )
    .map((task) => ({
      ...task,
      url: contractUrl(
        config.base,
        task.lang === 'zh-CN'
          ? `locales/zh-CN/tasks/${task.id}.md`
          : `tasks/${task.id}.md`,
      ),
    }))
}

export async function generateSiteContract(
  options: SiteContractOptions,
): Promise<SiteContractResult> {
  if (!options.config.ai.contract.enabled) return { files: [] }

  const assetDir =
    options.assetDir ?? (await locatePackagedAgentContract(import.meta.url))
  const framework = await loadFrameworkAssets(assetDir)
  const locales = siteLocales(options.config)
  const includeChinese = locales.some((locale) => locale.lang === 'zh-CN')
  const publicContent = await loadPublicContractContent(
    options.config.root,
    options.config.lang,
    options.config.ai.contract,
  )
  const tasks = builtInSiteTasks(
    framework.manifest,
    options.config,
    includeChinese,
  )
  const taskKeys = new Set(
    tasks.map((task) => `${task.id}\0${task.lang ?? ''}`),
  )
  const customTasks = publicContent.tasks.map((task): SilenContractTask => {
    const key = `${task.metadata.id}\0${options.config.lang}`
    if (taskKeys.has(key)) {
      throw new Error(
        `Duplicate public Agent task ${task.metadata.id} for ${options.config.lang}`,
      )
    }
    taskKeys.add(key)
    return task.metadata.mode === 'write'
      ? {
          id: task.metadata.id,
          title: task.metadata.title,
          contractVersion: 1,
          mode: 'write',
          requiresExplicitAuthorization: true,
          lang: options.config.lang,
          url: contractUrl(options.config.base, `tasks/${task.metadata.id}.md`),
        }
      : {
          id: task.metadata.id,
          title: task.metadata.title,
          contractVersion: 1,
          mode: 'read',
          ...(task.metadata.requiresExplicitAuthorization === false
            ? { requiresExplicitAuthorization: false as const }
            : {}),
          lang: options.config.lang,
          url: contractUrl(options.config.base, `tasks/${task.metadata.id}.md`),
        }
  })
  const manifest = parseContractManifest({
    schemaVersion: 1,
    kind: 'silen-site',
    generator: { name: 'Silen', version: SILEN_VERSION },
    site: {
      title: options.config.title,
      description: options.config.description,
      base: options.config.base,
      lang: options.config.lang,
      locales,
    },
    capabilities: {
      llmsTxt: options.config.ai.llmsTxt,
      llmsFullTxt: options.config.ai.llmsFullTxt,
      markdownRoutes: options.config.ai.markdownRoutes,
      index: options.config.ai.index,
      mcp: {
        transport: 'stdio',
        localOnly: true,
        readOnlyByDefault: true,
        writeRequiresFlag: '--allow-write',
      },
    },
    resources: siteResources(options.config, includeChinese),
    tasks: [...tasks, ...customTasks],
  })

  const wellKnown = path.join(options.outDir, '.well-known')
  const destination = path.join(wellKnown, 'silen')
  if (await pathExists(destination)) {
    throw new Error('Reserved output collision at .well-known/silen')
  }
  const temporary = path.join(wellKnown, `.silen-${randomUUID()}.tmp`)
  const files = ['manifest.json', 'api.json', 'guide.md']
  await mkdir(wellKnown, { recursive: true })
  try {
    await mkdir(temporary, { recursive: true })
    await cp(path.join(assetDir, 'tasks'), path.join(temporary, 'tasks'), {
      recursive: true,
    })
    files.push(
      ...framework.manifest.tasks
        .filter((task) => task.lang === 'en-US')
        .map((task) => `tasks/${task.id}.md`),
    )
    if (includeChinese) {
      await cp(
        path.join(assetDir, 'locales', 'zh-CN'),
        path.join(temporary, 'locales', 'zh-CN'),
        { recursive: true },
      )
      files.push(
        'locales/zh-CN/guide.md',
        ...framework.manifest.tasks
          .filter((task) => task.lang === 'zh-CN')
          .map((task) => `locales/zh-CN/tasks/${task.id}.md`),
      )
    }
    const guide =
      publicContent.instructions === undefined
        ? framework.guide
        : `${framework.guide.trimEnd()}\n\n## Site instructions\n\n${publicContent.instructions.trim()}\n`
    await Promise.all([
      writeFile(
        path.join(temporary, 'manifest.json'),
        serializeContractJson(manifest),
      ),
      writeFile(
        path.join(temporary, 'api.json'),
        serializeContractJson(framework.api),
      ),
      writeFile(path.join(temporary, 'guide.md'), guide, 'utf8'),
      ...publicContent.tasks.map(async (task) => {
        const relativeFile = `tasks/${task.metadata.id}.md`
        files.push(relativeFile)
        await writeFile(
          path.join(temporary, relativeFile),
          task.markdown,
          'utf8',
        )
      }),
    ])
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
  return { files: [...new Set(files)].sort() }
}
