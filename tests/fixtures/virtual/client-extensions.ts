import type { SilenClientExtension } from '../../../src/shared/plugin'

const clientExtensions: SilenClientExtension[] = []

export function setClientExtensions(
  extensions: readonly SilenClientExtension[],
): void {
  clientExtensions.splice(0, clientExtensions.length, ...extensions)
}

export { clientExtensions }
export default clientExtensions
