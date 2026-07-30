import { createHash } from 'node:crypto'
import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'
import {
  READ_ONLY_AGENT_SKILL_FILES,
  READ_ONLY_AGENT_SKILL_NAME,
  renderReadOnlyAgentSkill,
} from '../../src/ai/contract/agent-skills'
import {
  loadBuiltInTaskPack,
  type ParsedTaskDocument,
  type TaskPack,
} from '../../src/ai/contract/tasks'

function normalizedBody(markdown: string): string {
  return matter(markdown).content.replace(/\r\n?/g, '\n').trim() + '\n'
}

function bundleHash(files: Readonly<Record<string, string>>): string {
  const hash = createHash('sha256')
  for (const [relativePath, content] of Object.entries(files)) {
    hash.update(relativePath)
    hash.update('\0')
    hash.update(content)
    hash.update('\0')
  }
  return hash.digest('hex')
}

async function packs(): Promise<readonly [TaskPack, TaskPack]> {
  return Promise.all([
    loadBuiltInTaskPack('en-US'),
    loadBuiltInTaskPack('zh-CN'),
  ])
}

function syntheticTask(id: string, mode: 'read' | 'write'): ParsedTaskDocument {
  return {
    path: `en-US/tasks/${id}.md`,
    metadata:
      mode === 'write'
        ? {
            id,
            title: id,
            contractVersion: 1,
            mode,
            requiresExplicitAuthorization: true,
            references: [],
          }
        : {
            id,
            title: id,
            contractVersion: 1,
            mode,
            requiresExplicitAuthorization: false,
            references: [],
          },
    markdown: `---\nid: ${id}\ntitle: ${id}\ncontractVersion: 1\nmode: ${mode}\n${
      mode === 'write' ? 'requiresExplicitAuthorization: true\n' : ''
    }references: []\n---\n\n# ${id}\n`,
  }
}

describe('read-only Agent Skill renderer', () => {
  it('emits the exact five-file standards-compatible bundle', async () => {
    const sourcePacks = await packs()
    const bundle = renderReadOnlyAgentSkill({
      version: '0.5.0',
      packs: sourcePacks,
    })

    expect(bundle.name).toBe(READ_ONLY_AGENT_SKILL_NAME)
    expect(Object.isFrozen(bundle)).toBe(true)
    expect(Object.isFrozen(bundle.files)).toBe(true)
    expect(Object.keys(bundle.files)).toEqual(READ_ONLY_AGENT_SKILL_FILES)
    const parsed = matter(bundle.files['SKILL.md']!)
    expect(parsed.data).toEqual({
      name: 'silen-docs-readonly',
      description:
        'Use this skill when reading, searching, citing, or performing a model-free audit of Silen documentation or knowledge bases, including requests to 阅读、检索、引用或审计 Silen 文档. It is read-only and does not grant shell, network, filesystem-write, commit, push, or deployment permission.',
      license: 'MIT',
      compatibility:
        'Requires a Silen Agent Contract v2 package or site. Any MCP, command, filesystem, or network access must be separately available and authorized by the host or user.',
      metadata: {
        'silen-version': '0.5.0',
        'silen-contract-version': '2',
        'silen-source-tasks': 'audit-site,read-site',
      },
    })
    expect(parsed.data).not.toHaveProperty('allowed-tools')
    expect(parsed.content).toContain('references/read-site.md')
    expect(parsed.content).toContain('references/audit-site-zh-cn.md')
  })

  it('copies only canonical parsed task bodies in both locales', async () => {
    const sourcePacks = await packs()
    const bundle = renderReadOnlyAgentSkill({
      version: '0.5.0',
      packs: sourcePacks,
    })
    const [english, chinese] = sourcePacks

    expect(bundle.files['references/audit-site.md']).toBe(
      normalizedBody(
        english.tasks.find(({ metadata }) => metadata.id === 'audit-site')!
          .markdown,
      ),
    )
    expect(bundle.files['references/read-site.md']).toBe(
      normalizedBody(
        english.tasks.find(({ metadata }) => metadata.id === 'read-site')!
          .markdown,
      ),
    )
    expect(bundle.files['references/audit-site-zh-cn.md']).toBe(
      normalizedBody(
        chinese.tasks.find(({ metadata }) => metadata.id === 'audit-site')!
          .markdown,
      ),
    )
    expect(bundle.files['references/read-site-zh-cn.md']).toBe(
      normalizedBody(
        chinese.tasks.find(({ metadata }) => metadata.id === 'read-site')!
          .markdown,
      ),
    )
  })

  it('excludes write tasks and unlisted future read tasks', async () => {
    const [english, chinese] = await packs()
    const bundle = renderReadOnlyAgentSkill({
      version: '0.5.0',
      packs: [
        {
          ...english,
          tasks: [...english.tasks, syntheticTask('future-read', 'read')],
        },
        {
          ...chinese,
          tasks: [
            ...chinese.tasks,
            {
              ...syntheticTask('future-read', 'read'),
              path: 'zh-CN/tasks/future-read.md',
            },
          ],
        },
      ],
    })
    const output = Object.values(bundle.files).join('\n')

    expect(output).not.toContain('future-read')
    for (const id of [
      'create-site',
      'deploy-site',
      'maintain-site',
      'migrate-content',
    ]) {
      expect(output).not.toContain(`id: ${id}`)
    }
  })

  it('rejects a missing, duplicate, or write-reclassified selected task', async () => {
    const [english, chinese] = await packs()
    const withoutRead = {
      ...english,
      tasks: english.tasks.filter(
        ({ metadata }) => metadata.id !== 'read-site',
      ),
    }
    expect(() =>
      renderReadOnlyAgentSkill({
        version: '0.5.0',
        packs: [withoutRead, chinese],
      }),
    ).toThrow(/read-site/)

    const read = english.tasks.find(
      ({ metadata }) => metadata.id === 'read-site',
    )!
    expect(() =>
      renderReadOnlyAgentSkill({
        version: '0.5.0',
        packs: [{ ...english, tasks: [...english.tasks, read] }, chinese],
      }),
    ).toThrow(/read-site/)

    const reclassified = syntheticTask('read-site', 'write')
    expect(() =>
      renderReadOnlyAgentSkill({
        version: '0.5.0',
        packs: [
          {
            ...english,
            tasks: english.tasks.map((task) =>
              task.metadata.id === 'read-site' ? reclassified : task,
            ),
          },
          chinese,
        ],
      }),
    ).toThrow(/read-only/)
  })

  it('is byte-stable and contains no process path or environment secret', async () => {
    process.env.SILEN_AGENT_SKILL_TEST_SECRET = 'must-not-appear-in-skill'
    const sourcePacks = await packs()
    const first = renderReadOnlyAgentSkill({
      version: '0.5.0',
      packs: sourcePacks,
    })
    const second = renderReadOnlyAgentSkill({
      version: '0.5.0',
      packs: sourcePacks,
    })
    const output = Object.values(first.files).join('\n')

    expect(first).toEqual(second)
    expect(bundleHash(first.files)).toBe(bundleHash(second.files))
    expect(output).not.toContain(process.cwd())
    expect(output).not.toContain('must-not-appear-in-skill')
    for (const content of Object.values(first.files)) {
      expect(content).not.toMatch(/\r/)
      expect(content).toMatch(/[^\n]\n$/)
      expect(content).not.toMatch(/\n{2}$/)
    }
  })
})
