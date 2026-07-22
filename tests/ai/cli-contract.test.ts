import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { execa } from 'execa'
import { createCliApiContract } from '../../src/ai/contract/cli-api'
import { commandDescriptors } from '../../src/node/commands'

const cliRunner = path.resolve('node_modules/.bin/jiti')
const cli = path.resolve('src/node/cli.ts')

describe('CLI Agent Contract registry', () => {
  it('describes every command once with its public side effect', () => {
    expect(commandDescriptors.map((command) => command.id)).toEqual([
      'init',
      'dev',
      'build',
      'preview',
      'ai',
      'mcp',
    ])
    expect(new Set(commandDescriptors.map((command) => command.id)).size).toBe(
      commandDescriptors.length,
    )
    expect(
      Object.fromEntries(
        commandDescriptors.map((command) => [command.id, command.sideEffect]),
      ),
    ).toEqual({
      init: 'write',
      dev: 'server',
      build: 'build',
      preview: 'server',
      ai: 'write',
      mcp: 'server',
    })
  })

  it('generates serializable CLI API without runtime handlers', () => {
    const contract = createCliApiContract(commandDescriptors)
    expect(contract.commands).toHaveLength(commandDescriptors.length)
    expect(commandDescriptors.find(({ id }) => id === 'ai')).toMatchObject({
      description:
        'Initialize, index, audit, or evaluate the local AI workspace',
      options: [
        {
          name: '--json',
          required: false,
          default: false,
        },
      ],
    })
    expect(
      contract.commands.find((command) => command.id === 'mcp'),
    ).toMatchObject({
      syntax: 'mcp [root]',
      options: [
        {
          name: '--allow-write',
          default: false,
          required: false,
        },
      ],
    })
    expect(JSON.stringify(contract)).not.toContain('execute')
  })

  it('uses the registry syntax and options in CLI help', async () => {
    const help = await execa(cliRunner, [cli, '--help'])
    for (const command of commandDescriptors) {
      expect(help.stdout).toContain(command.syntax)
      const commandHelp = await execa(cliRunner, [cli, command.id, '--help'])
      for (const option of command.options) {
        expect(commandHelp.stdout).toContain(option.name)
      }
    }
  }, 30_000)

  it('retains the safe unknown AI action error', async () => {
    const result = await execa(cliRunner, [cli, 'ai', 'unknown'], {
      reject: false,
      all: true,
    })
    expect(result.exitCode).not.toBe(0)
    expect(result.all).toContain(
      'Unknown AI command "unknown"; expected init, index, audit, or eval',
    )
  })
})
