import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile as writeFileFromFs,
} from 'node:fs/promises'
import path from 'node:path'
import {
  READ_ONLY_AGENT_SKILL_FILES,
  READ_ONLY_AGENT_SKILL_NAME,
  validateReadOnlyAgentSkillBundle,
  type ReadOnlyAgentSkillBundle,
} from './contract/agent-skills.js'
import { loadPackagedReadOnlyAgentSkill } from './contract/package-assets.js'
import { SILEN_VERSION } from '../shared/version.js'

export interface MaterializedReadOnlyAgentSkill {
  readonly directory: string
  readonly files: typeof READ_ONLY_AGENT_SKILL_FILES
}

export interface MaterializeReadOnlyAgentSkillOptions {
  readonly loadBundle?: () => Promise<ReadOnlyAgentSkillBundle>
  readonly writeFile?: AgentSkillWriteFile
}

export type AgentSkillWriteFile = (
  file: string,
  data: string,
  encoding: 'utf8',
) => Promise<void>

export class AgentSkillInstallError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(`SILEN_AGENT_SKILL_${code}: ${message}`)
    this.name = 'AgentSkillInstallError'
    this.code = code
  }
}

async function targetExists(target: string): Promise<boolean> {
  try {
    await lstat(target)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function assertWrittenBytes(
  root: string,
  bundle: ReadOnlyAgentSkillBundle,
): Promise<void> {
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
  const written: ReadOnlyAgentSkillBundle = {
    name: READ_ONLY_AGENT_SKILL_NAME,
    files,
  }
  validateReadOnlyAgentSkillBundle(written, SILEN_VERSION)
  if (JSON.stringify(written.files) !== JSON.stringify(bundle.files)) {
    throw new AgentSkillInstallError(
      'BYTE_MISMATCH',
      'Written Skill bytes differ from the packaged bundle',
    )
  }
}

export async function materializeReadOnlyAgentSkill(
  destination: string,
  options: MaterializeReadOnlyAgentSkillOptions = {},
): Promise<MaterializedReadOnlyAgentSkill> {
  if (typeof destination !== 'string' || destination.trim() === '') {
    throw new AgentSkillInstallError(
      'DESTINATION_REQUIRED',
      'An explicit destination path is required',
    )
  }

  const loadBundle = options.loadBundle ?? loadPackagedReadOnlyAgentSkill
  const writeFile: AgentSkillWriteFile =
    options.writeFile ??
    ((file, data, encoding) => writeFileFromFs(file, data, encoding))
  const bundle = await loadBundle()
  validateReadOnlyAgentSkillBundle(bundle, SILEN_VERSION)

  const parent = path.resolve(destination)
  const target = path.join(parent, READ_ONLY_AGENT_SKILL_NAME)
  let temporary: string | undefined
  try {
    await mkdir(parent, { recursive: true })
    if (await targetExists(target)) {
      throw new AgentSkillInstallError(
        'TARGET_EXISTS',
        'The target Skill directory already exists',
      )
    }
    temporary = await mkdtemp(
      path.join(parent, `.${READ_ONLY_AGENT_SKILL_NAME}-`),
    )
    for (const relativePath of READ_ONLY_AGENT_SKILL_FILES) {
      const output = path.join(temporary, relativePath)
      await mkdir(path.dirname(output), { recursive: true })
      await writeFile(output, bundle.files[relativePath]!, 'utf8')
    }
    await assertWrittenBytes(temporary, bundle)
    await rename(temporary, target)
    return { directory: target, files: READ_ONLY_AGENT_SKILL_FILES }
  } catch (error) {
    if (error instanceof AgentSkillInstallError) throw error
    throw new AgentSkillInstallError(
      'INSTALL_FAILED',
      'The packaged Skill could not be materialized safely',
    )
  } finally {
    if (temporary !== undefined) {
      await rm(temporary, { recursive: true, force: true })
    }
  }
}
