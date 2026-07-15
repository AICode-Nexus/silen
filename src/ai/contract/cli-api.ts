import type { SilenApiContract } from '../../shared/ai-contract.js'
import type { SilenCommandDescriptor } from '../../node/commands.js'

export function createCliApiContract(
  descriptors: readonly SilenCommandDescriptor[],
): SilenApiContract['cli'] {
  return {
    commands: descriptors.map((descriptor) => ({
      id: descriptor.id,
      syntax: descriptor.syntax,
      description: descriptor.description,
      sideEffect: descriptor.sideEffect,
      arguments: descriptor.arguments.map((argument) => ({ ...argument })),
      options: descriptor.options.map((option) => ({ ...option })),
    })),
  }
}
