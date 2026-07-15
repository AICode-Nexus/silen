#!/usr/bin/env node
import cac from 'cac'
import { SILEN_VERSION } from '../shared/version.js'
import { errorDetail, registerCommands } from './commands.js'

async function runCli(): Promise<void> {
  const cli = cac('silen')
  registerCommands(cli)
  cli.help()
  cli.version(SILEN_VERSION)
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
