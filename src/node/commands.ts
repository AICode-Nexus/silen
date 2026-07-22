import type { CAC } from 'cac'
import {
  AiEvalSetupError,
  formatAiEvalReport,
  runAiEvaluation,
  serializeAiEvalReport,
  serializeAiEvalSetupError,
} from '../ai/eval.js'
import { serveMcp } from '../ai/mcp/stdio.js'
import { createWorkspace } from '../ai/workspace.js'
import type {
  SilenCliCommandContract,
  SilenCliOptionContract,
} from '../shared/ai-contract.js'
import { build, type BuildResult } from './build.js'
import { resolveConfig } from './config.js'
import { initializeSite } from './init.js'
import {
  createDevServer,
  createPreviewServer,
  type ServerOptions,
  type SilenServer,
} from './server.js'

type ServerFactory = (
  root: string,
  options: ServerOptions,
) => Promise<SilenServer>

export interface SilenCommandDescriptor extends SilenCliCommandContract {
  readonly execute: (...input: unknown[]) => Promise<void>
}

interface CommandDependencies {
  buildSite(root: string): Promise<BuildResult>
  createDevServer: ServerFactory
  createPreviewServer: ServerFactory
  createWorkspace: typeof createWorkspace
  initializeSite: typeof initializeSite
  resolveConfig: typeof resolveConfig
  runAiEvaluation: typeof runAiEvaluation
  serveMcp: typeof serveMcp
  output(message: string): void
  setExitCode(code: number): void
  waitForSignal(server: SilenServer): Promise<void>
}

export function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function commandRoot(value: unknown): string {
  if (value === undefined) return '.'
  if (typeof value !== 'string') {
    throw new TypeError('Silen root must be a path string')
  }
  return value
}

function commandServerOptions(value: unknown): ServerOptions {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Silen server options are invalid')
  }
  const provided = value as Record<string, unknown>
  const options: ServerOptions = {}
  if (provided.host !== undefined) {
    if (
      typeof provided.host !== 'boolean' &&
      typeof provided.host !== 'string'
    ) {
      throw new TypeError('Silen host must be a hostname')
    }
    options.host = provided.host
  }
  if (provided.port !== undefined) {
    if (
      typeof provided.port !== 'number' &&
      typeof provided.port !== 'string'
    ) {
      throw new TypeError('Silen port must be a number')
    }
    options.port = provided.port
  }
  return options
}

function commandAiOptions(value: unknown): { json: boolean } {
  if (value === undefined) return { json: false }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Silen AI options are invalid')
  }
  const json = (value as Record<string, unknown>).json
  if (json !== undefined && typeof json !== 'boolean') {
    throw new TypeError('Silen AI --json option is invalid')
  }
  return { json: json === true }
}

async function waitForProcessSignal(server: SilenServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let closing = false
    const close = (): void => {
      if (closing) return
      closing = true
      process.off('SIGINT', close)
      process.off('SIGTERM', close)
      void server.close().then(resolve, reject)
    }
    process.once('SIGINT', close)
    process.once('SIGTERM', close)
  })
}

const defaultDependencies: CommandDependencies = {
  buildSite: build,
  createDevServer,
  createPreviewServer,
  createWorkspace,
  initializeSite,
  resolveConfig,
  runAiEvaluation,
  serveMcp,
  output(message) {
    console.log(message)
  },
  setExitCode(code) {
    process.exitCode = code
  },
  waitForSignal: waitForProcessSignal,
}

async function runServer(
  name: 'dev' | 'preview',
  factory: ServerFactory,
  root: string,
  options: ServerOptions,
  dependencies: CommandDependencies,
): Promise<void> {
  let server: SilenServer
  try {
    server = await factory(root, options)
  } catch (error) {
    throw new Error('Silen ' + name + ' failed: ' + errorDetail(error), {
      cause: error,
    })
  }
  dependencies.output('Silen ' + name + ' server running at ' + server.url)
  await dependencies.waitForSignal(server)
}

const rootArgument = {
  name: 'root',
  required: false,
  description: 'Documentation content root; defaults to the current directory.',
} as const

const serverOptions: readonly SilenCliOptionContract[] = [
  {
    name: '--host [host]',
    description: 'Host to listen on',
    required: false,
  },
  {
    name: '--port <port>',
    description: 'Port to listen on',
    required: false,
  },
]

export function createCommandDescriptors(
  dependencies: CommandDependencies = defaultDependencies,
): readonly SilenCommandDescriptor[] {
  return [
    {
      id: 'init',
      syntax: 'init <root>',
      description: 'Create a starter Silen site in a new or existing directory',
      sideEffect: 'write',
      arguments: [
        {
          name: 'root',
          required: true,
          description: 'Directory to activate as a Silen site.',
        },
      ],
      options: [],
      async execute(root: unknown) {
        if (typeof root !== 'string') {
          throw new TypeError('Silen init requires a root path')
        }
        const result = await dependencies.initializeSite(root)
        for (const file of result.createdPaths) {
          dependencies.output('Created ' + file)
        }
        dependencies.output('Next: pnpm silen dev ' + root)
      },
    },
    {
      id: 'dev',
      syntax: 'dev [root]',
      description: 'Start the development server',
      sideEffect: 'server',
      arguments: [rootArgument],
      options: serverOptions,
      async execute(root: unknown, options: unknown) {
        await runServer(
          'dev',
          dependencies.createDevServer,
          commandRoot(root),
          commandServerOptions(options),
          dependencies,
        )
      },
    },
    {
      id: 'build',
      syntax: 'build [root]',
      description: 'Build a static site',
      sideEffect: 'build',
      arguments: [rootArgument],
      options: [],
      async execute(root: unknown) {
        let result: BuildResult
        try {
          result = await dependencies.buildSite(commandRoot(root))
        } catch (error) {
          throw new Error('Silen build failed: ' + errorDetail(error), {
            cause: error,
          })
        }
        dependencies.output(
          'Silen built ' +
            result.routes.length +
            ' route' +
            (result.routes.length === 1 ? '' : 's') +
            ' to ' +
            result.outDir,
        )
      },
    },
    {
      id: 'preview',
      syntax: 'preview [root]',
      description: 'Preview the static build',
      sideEffect: 'server',
      arguments: [rootArgument],
      options: serverOptions,
      async execute(root: unknown, options: unknown) {
        await runServer(
          'preview',
          dependencies.createPreviewServer,
          commandRoot(root),
          commandServerOptions(options),
          dependencies,
        )
      },
    },
    {
      id: 'ai',
      syntax: 'ai <action> [root]',
      description:
        'Initialize, index, audit, or evaluate the local AI workspace',
      sideEffect: 'write',
      arguments: [
        {
          name: 'action',
          required: true,
          description: 'One of init, index, audit, or eval.',
        },
        rootArgument,
      ],
      options: [
        {
          name: '--json',
          description: 'Print the AI evaluation as JSON',
          required: false,
          default: false,
        },
      ],
      async execute(action: unknown, root: unknown, rawOptions: unknown) {
        if (
          action !== 'init' &&
          action !== 'index' &&
          action !== 'audit' &&
          action !== 'eval'
        ) {
          throw new Error(
            'Unknown AI command ' +
              JSON.stringify(action) +
              '; expected init, index, audit, or eval',
          )
        }
        const resolvedRoot = commandRoot(root)
        const options = commandAiOptions(rawOptions)
        if (action === 'eval') {
          try {
            const result = await dependencies.runAiEvaluation(resolvedRoot)
            dependencies.output(
              options.json
                ? serializeAiEvalReport(result).trimEnd()
                : formatAiEvalReport(result),
            )
            if (!result.ok) dependencies.setExitCode(1)
          } catch (error) {
            if (!(error instanceof AiEvalSetupError)) throw error
            dependencies.output(
              options.json
                ? serializeAiEvalSetupError(error).trimEnd()
                : error.message,
            )
            dependencies.setExitCode(2)
          }
          return
        }

        const workspace = await dependencies.createWorkspace(
          resolvedRoot,
          action === 'audit'
            ? {
                resolveAuditBase: async () =>
                  (await dependencies.resolveConfig(resolvedRoot, 'build'))
                    .base,
              }
            : undefined,
        )
        if (action === 'init') {
          await workspace.init()
          dependencies.output('Initialized ' + workspace.relativeRoot)
          return
        }
        if (action === 'index') {
          dependencies.output(JSON.stringify(await workspace.reindex()))
          return
        }
        const result = await workspace.audit()
        dependencies.output(JSON.stringify(result, null, 2))
        if (!result.ok) dependencies.setExitCode(1)
      },
    },
    {
      id: 'mcp',
      syntax: 'mcp [root]',
      description: 'Serve the documentation workspace over MCP',
      sideEffect: 'server',
      arguments: [rootArgument],
      options: [
        {
          name: '--allow-write',
          description: 'Register write tools',
          required: false,
          default: false,
        },
      ],
      async execute(root: unknown, options: unknown) {
        const provided =
          typeof options === 'object' && options !== null
            ? (options as Record<string, unknown>)
            : {}
        const workspace = await dependencies.createWorkspace(commandRoot(root))
        await dependencies.serveMcp({
          workspace,
          allowWrite: provided.allowWrite === true,
        })
      },
    },
  ]
}

export const commandDescriptors = createCommandDescriptors()

export function registerCommands(
  cli: CAC,
  descriptors: readonly SilenCommandDescriptor[] = commandDescriptors,
): void {
  for (const descriptor of descriptors) {
    const command = cli.command(descriptor.syntax, descriptor.description)
    for (const option of descriptor.options) {
      if (option.default === undefined) {
        command.option(option.name, option.description)
      } else {
        command.option(option.name, option.description, {
          default: option.default,
        })
      }
    }
    command.action((...input: unknown[]) => descriptor.execute(...input))
  }
}
