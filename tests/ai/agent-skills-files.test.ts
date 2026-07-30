import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  READ_ONLY_AGENT_SKILL_FILES,
  READ_ONLY_AGENT_SKILL_NAME,
} from '../../src/ai/contract/agent-skills'
import { loadPackagedReadOnlyAgentSkill } from '../../src/ai/contract/package-assets'
import { materializeReadOnlyAgentSkill } from '../../src/ai/skills'

const temporaryDirectories: string[] = []

async function temporaryDirectory(label: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), label))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  )
})

describe('packaged read-only Agent Skill files', () => {
  it('loads the exact validated bytes generated under dist/agent', async () => {
    const bundle = await loadPackagedReadOnlyAgentSkill()

    expect(bundle.name).toBe(READ_ONLY_AGENT_SKILL_NAME)
    expect(Object.isFrozen(bundle)).toBe(true)
    expect(Object.isFrozen(bundle.files)).toBe(true)
    expect(Object.keys(bundle.files)).toEqual(READ_ONLY_AGENT_SKILL_FILES)
    for (const relativePath of READ_ONLY_AGENT_SKILL_FILES) {
      expect(bundle.files[relativePath]).toBe(
        await readFile(
          path.resolve(
            'dist/agent/skills',
            READ_ONLY_AGENT_SKILL_NAME,
            relativePath,
          ),
          'utf8',
        ),
      )
    }
  })

  it.each(['absolute', 'relative'] as const)(
    'materializes into a new %s destination without changing bytes',
    async (kind) => {
      const root = await temporaryDirectory('silen-agent-skill-files-')
      const absoluteParent = path.join(root, 'installed-skills')
      const destination =
        kind === 'absolute'
          ? absoluteParent
          : path.relative(process.cwd(), absoluteParent)
      const packaged = await loadPackagedReadOnlyAgentSkill()
      const result = await materializeReadOnlyAgentSkill(destination)

      expect(result.directory).toBe(
        path.join(absoluteParent, READ_ONLY_AGENT_SKILL_NAME),
      )
      expect(result.files).toEqual(READ_ONLY_AGENT_SKILL_FILES)
      for (const relativePath of READ_ONLY_AGENT_SKILL_FILES) {
        expect(
          await readFile(path.join(result.directory, relativePath), 'utf8'),
        ).toBe(packaged.files[relativePath])
      }
    },
  )

  it('rejects an existing target without modifying its content', async () => {
    const root = await temporaryDirectory('silen-agent-skill-conflict-')
    const target = path.join(root, READ_ONLY_AGENT_SKILL_NAME)
    await mkdir(target, { recursive: true })
    await writeFile(path.join(target, 'keep.txt'), 'do not change\n')

    await expect(materializeReadOnlyAgentSkill(root)).rejects.toThrow(
      'SILEN_AGENT_SKILL_TARGET_EXISTS',
    )
    expect(await readFile(path.join(target, 'keep.txt'), 'utf8')).toBe(
      'do not change\n',
    )
    expect(await readdir(target)).toEqual(['keep.txt'])
  })

  it('removes the temporary sibling after an injected write failure', async () => {
    const root = await temporaryDirectory('silen-agent-skill-cleanup-')
    const failingWrite = async (
      file: string,
      data: string,
      encoding: 'utf8',
    ): Promise<void> => {
      await writeFile(file, data, encoding)
      if (String(file).endsWith('references/read-site.md')) {
        throw new Error('injected write failure')
      }
    }

    await expect(
      materializeReadOnlyAgentSkill(root, { writeFile: failingWrite }),
    ).rejects.toThrow('SILEN_AGENT_SKILL_INSTALL_FAILED')
    expect(await readdir(root)).toEqual([])
  })

  it('requires a non-empty explicit destination', async () => {
    await expect(materializeReadOnlyAgentSkill('')).rejects.toThrow(
      'SILEN_AGENT_SKILL_DESTINATION_REQUIRED',
    )
    await expect(materializeReadOnlyAgentSkill('   ')).rejects.toThrow(
      'SILEN_AGENT_SKILL_DESTINATION_REQUIRED',
    )
  })
})
