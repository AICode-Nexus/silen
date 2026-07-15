import type {
  SilenApiContract,
  SilenContractManifest,
  SilenContractTask,
  SilenPublicExportContract,
} from '../../shared/ai-contract.js'
import { SILEN_VERSION } from '../../shared/version.js'
import { createCommandDescriptors } from '../../node/commands.js'
import { createConfigApiContract } from './config-api.js'
import { createCliApiContract } from './cli-api.js'
import { createMcpApiContract } from './mcp-api.js'
import { readToolDescriptors, writeToolDescriptors } from '../mcp/contracts.js'
import { parseApiContract, parseContractManifest } from './schema.js'
import { serializeContractJson } from './serialize.js'
import { loadBuiltInTaskPack, type TaskPack } from './tasks.js'

const artifactReferences = [
  'ai-index',
  'llms',
  'llms-full',
  'markdown-routes',
  'silen-manifest',
] as const

export interface FrameworkContractBundle {
  readonly manifest: SilenContractManifest
  readonly api: SilenApiContract
  readonly packs: readonly [TaskPack, TaskPack]
}

export interface FrameworkContractOptions {
  readonly publicExports: readonly SilenPublicExportContract[]
}

function taskUrl(locale: string, filename: string): string {
  return locale === 'en-US'
    ? `/agent/tasks/${filename}`
    : `/agent/locales/${locale}/tasks/${filename}`
}

function manifestTasks(packs: readonly TaskPack[]): SilenContractTask[] {
  return packs.flatMap((pack) =>
    pack.tasks.map((task): SilenContractTask => {
      const shared = {
        id: task.metadata.id,
        title: task.metadata.title,
        contractVersion: 1 as const,
        lang: pack.locale,
        url: taskUrl(pack.locale, task.path.split('/').at(-1)!),
      }
      return task.metadata.mode === 'write'
        ? {
            ...shared,
            mode: 'write',
            requiresExplicitAuthorization: true,
          }
        : {
            ...shared,
            mode: 'read',
            ...(task.metadata.requiresExplicitAuthorization === false
              ? { requiresExplicitAuthorization: false as const }
              : {}),
          }
    }),
  )
}

function knownReferences(api: SilenApiContract): ReadonlySet<string> {
  const references = new Set<string>(
    artifactReferences.map((id) => `artifact:${id}`),
  )
  for (const field of api.config.fields) {
    const segments = field.path.split('.')
    for (let length = segments.length; length > 0; length -= 1) {
      references.add(`config:${segments.slice(0, length).join('.')}`)
    }
  }
  for (const command of api.cli.commands) references.add(`cli:${command.id}`)
  for (const tool of api.mcp.tools) references.add(`mcp:${tool.name}`)
  return references
}

function assertTaskReferences(
  packs: readonly TaskPack[],
  api: SilenApiContract,
): void {
  const references = knownReferences(api)
  for (const pack of packs) {
    for (const task of pack.tasks) {
      for (const reference of task.metadata.references) {
        if (!references.has(reference)) {
          throw new TypeError(
            `Unknown framework task reference ${reference} in ${pack.locale}/${task.metadata.id}`,
          )
        }
      }
    }
  }
}

export async function assembleFrameworkContract(
  options: FrameworkContractOptions,
): Promise<FrameworkContractBundle> {
  const packs = await Promise.all([
    loadBuiltInTaskPack('en-US'),
    loadBuiltInTaskPack('zh-CN'),
  ])
  const api = parseApiContract({
    schemaVersion: 1,
    generator: { name: 'Silen', version: SILEN_VERSION },
    config: createConfigApiContract(),
    cli: createCliApiContract(createCommandDescriptors()),
    mcp: createMcpApiContract([
      ...readToolDescriptors,
      ...writeToolDescriptors,
    ]),
    exports: options.publicExports,
  })
  assertTaskReferences(packs, api)

  const manifest = parseContractManifest({
    schemaVersion: 1,
    kind: 'silen-framework',
    generator: { name: 'Silen', version: SILEN_VERSION },
    capabilities: {
      llmsTxt: true,
      llmsFullTxt: true,
      markdownRoutes: true,
      index: true,
      mcp: {
        transport: 'stdio',
        localOnly: true,
        readOnlyByDefault: true,
        writeRequiresFlag: '--allow-write',
      },
    },
    resources: [
      {
        id: 'silen-manifest',
        format: 'application/json',
        url: '/agent/manifest.json',
      },
      { id: 'api', format: 'application/json', url: '/agent/api.json' },
      { id: 'guide', format: 'text/markdown', url: '/agent/guide.md' },
      {
        id: 'guide',
        format: 'text/markdown',
        lang: 'zh-CN',
        url: '/agent/locales/zh-CN/guide.md',
      },
    ],
    tasks: manifestTasks(packs),
  })

  return { manifest, api, packs }
}

export function renderFrameworkContract(
  bundle: FrameworkContractBundle,
): Readonly<Record<string, string>> {
  const [english, chinese] = bundle.packs
  const files: Record<string, string> = {
    'manifest.json': serializeContractJson(bundle.manifest),
    'api.json': serializeContractJson(bundle.api),
    'guide.md': english.guide,
    'locales/zh-CN/guide.md': chinese.guide,
  }
  for (const task of english.tasks) {
    files[`tasks/${task.path.split('/').at(-1)!}`] = task.markdown
  }
  for (const task of chinese.tasks) {
    files[`locales/zh-CN/tasks/${task.path.split('/').at(-1)!}`] = task.markdown
  }
  return Object.fromEntries(
    Object.entries(files).sort(([left], [right]) =>
      left.localeCompare(right, 'en'),
    ),
  )
}
