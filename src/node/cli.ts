#!/usr/bin/env node
import cac from 'cac'
import { serveMcp } from '../ai/mcp/stdio.js'
import { createWorkspace } from '../ai/workspace.js'
import { build } from './build.js'
import {
  createDevServer,
  createPreviewServer,
  type ServerOptions,
  type SilenServer,
} from './server.js'

const version = '0.1.0-alpha.3'

type ServerFactory = (
  root: string,
  options: ServerOptions,
) => Promise<SilenServer>

function errorDetail(error: unknown): string {
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

async function waitForSignal(server: SilenServer): Promise<void> {
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

async function runServer(
  name: 'dev' | 'preview',
  factory: ServerFactory,
  root: string,
  options: ServerOptions,
): Promise<void> {
  let server: SilenServer
  try {
    server = await factory(root, options)
  } catch (error) {
    throw new Error(`Silen ${name} failed: ${errorDetail(error)}`, {
      cause: error,
    })
  }
  console.log(`Silen ${name} server running at ${server.url}`)
  await waitForSignal(server)
}

async function runCli(): Promise<void> {
  const cli = cac('silen')
  cli
    .command('dev [root]', 'Start the development server')
    .option('--host [host]', 'Host to listen on')
    .option('--port <port>', 'Port to listen on')
    .action(async (root: unknown, options: unknown) => {
      await runServer(
        'dev',
        createDevServer,
        commandRoot(root),
        commandServerOptions(options),
      )
    })
  cli
    .command('build [root]', 'Build a static site')
    .action(async (root: unknown) => {
      let result
      try {
        result = await build(commandRoot(root))
      } catch (error) {
        throw new Error(`Silen build failed: ${errorDetail(error)}`, {
          cause: error,
        })
      }
      console.log(
        `Silen built ${result.routes.length} route${result.routes.length === 1 ? '' : 's'} to ${result.outDir}`,
      )
    })
  cli
    .command('preview [root]', 'Preview the static build')
    .option('--host [host]', 'Host to listen on')
    .option('--port <port>', 'Port to listen on')
    .action(async (root: unknown, options: unknown) => {
      await runServer(
        'preview',
        createPreviewServer,
        commandRoot(root),
        commandServerOptions(options),
      )
    })
  cli
    .command(
      'ai <action> [root]',
      'Initialize, index, or audit the local AI workspace',
    )
    .action(async (action: unknown, root: unknown) => {
      if (action !== 'init' && action !== 'index' && action !== 'audit') {
        throw new Error(
          `Unknown AI command ${JSON.stringify(action)}; expected init, index, or audit`,
        )
      }
      const workspace = await createWorkspace(commandRoot(root))
      if (action === 'init') {
        await workspace.init()
        console.log(`Initialized ${workspace.relativeRoot}`)
        return
      }
      if (action === 'index') {
        console.log(JSON.stringify(await workspace.reindex()))
        return
      }
      const result = await workspace.audit()
      console.log(JSON.stringify(result, null, 2))
      if (!result.ok) process.exitCode = 1
    })
  cli
    .command('mcp [root]', 'Serve the documentation workspace over MCP')
    .option('--allow-write', 'Register write tools', { default: false })
    .action(async (root: unknown, options: { allowWrite?: unknown }) => {
      const workspace = await createWorkspace(commandRoot(root))
      await serveMcp({
        workspace,
        allowWrite: options.allowWrite === true,
      })
    })
  cli.help()
  cli.version(version)
  cli.parse(process.argv, { run: false })

  if (cli.matchedCommand) {
    await cli.runMatchedCommand()
  } else if (!cli.options.help && !cli.options.version && cli.args[0]) {
    throw new Error(`Unknown command ${JSON.stringify(cli.args[0])}`)
  }
}

try {
  await runCli()
} catch (error) {
  console.error(errorDetail(error))
  process.exitCode = 1
}
