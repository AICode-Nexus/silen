import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const packageName = '@aicode-nexus/silen'

function stableAssetError(): Error {
  return new Error(
    'SILEN_AGENT_CONTRACT_UNAVAILABLE: rebuild or reinstall the matching Silen package',
  )
}

export async function locatePackagedAgentContract(
  startUrl: string | URL = import.meta.url,
): Promise<string> {
  let directory = path.dirname(fileURLToPath(startUrl))

  for (;;) {
    try {
      const manifest = JSON.parse(
        await readFile(path.join(directory, 'package.json'), 'utf8'),
      ) as { name?: unknown }
      if (manifest.name === packageName) {
        const assets = path.join(directory, 'dist', 'agent')
        await access(path.join(assets, 'manifest.json'))
        await access(path.join(assets, 'api.json'))
        return assets
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT' && error instanceof SyntaxError) {
        throw stableAssetError()
      }
    }

    const parent = path.dirname(directory)
    if (parent === directory) throw stableAssetError()
    directory = parent
  }
}
