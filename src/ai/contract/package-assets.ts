import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SILEN_VERSION } from '../../shared/version.js'
import {
  READ_ONLY_AGENT_SKILL_FILES,
  READ_ONLY_AGENT_SKILL_NAME,
  validateReadOnlyAgentSkillBundle,
  type ReadOnlyAgentSkillBundle,
} from './agent-skills.js'

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

function exactEntryNames(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  return (
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
  )
}

export async function loadPackagedReadOnlyAgentSkill(
  startUrl: string | URL = import.meta.url,
): Promise<ReadOnlyAgentSkillBundle> {
  try {
    const assets = await locatePackagedAgentContract(startUrl)
    const root = path.join(assets, 'skills', READ_ONLY_AGENT_SKILL_NAME)
    const [rootEntries, referenceEntries] = await Promise.all([
      readdir(root, { withFileTypes: true }),
      readdir(path.join(root, 'references'), { withFileTypes: true }),
    ])
    if (
      !exactEntryNames(
        rootEntries.map((entry) => entry.name),
        ['SKILL.md', 'references'],
      ) ||
      !rootEntries.some(
        (entry) => entry.name === 'SKILL.md' && entry.isFile(),
      ) ||
      !rootEntries.some(
        (entry) => entry.name === 'references' && entry.isDirectory(),
      ) ||
      !exactEntryNames(
        referenceEntries.map((entry) => entry.name),
        [
          'audit-site.md',
          'audit-site-zh-cn.md',
          'read-site.md',
          'read-site-zh-cn.md',
        ],
      ) ||
      referenceEntries.some((entry) => !entry.isFile())
    ) {
      throw stableAssetError()
    }

    const files = Object.fromEntries(
      await Promise.all(
        READ_ONLY_AGENT_SKILL_FILES.map(
          async (relativePath) =>
            [
              relativePath,
              await readFile(path.join(root, relativePath), 'utf8'),
            ] as const,
        ),
      ),
    )
    const bundle: ReadOnlyAgentSkillBundle = Object.freeze({
      name: READ_ONLY_AGENT_SKILL_NAME,
      files: Object.freeze(files),
    })
    validateReadOnlyAgentSkillBundle(bundle, SILEN_VERSION)
    return bundle
  } catch {
    throw stableAssetError()
  }
}
