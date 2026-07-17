import { describe, expect, it } from 'vitest'
import {
  BUILT_IN_TASK_REFERENCES,
  MAX_TASK_BYTES,
  loadBuiltInTaskPack,
  parseTaskDocument,
  parseTaskPack,
} from '../../src/ai/contract/tasks'

function taskSource(
  overrides: Partial<{
    id: string
    title: string
    contractVersion: number
    mode: string
    requiresExplicitAuthorization: boolean
    references: string[]
    body: string
  }> = {},
): string {
  const task = {
    id: 'read-site',
    title: 'Read a Silen site',
    contractVersion: 1,
    mode: 'read',
    requiresExplicitAuthorization: false,
    references: ['mcp:read'],
    body: '## Steps\n\n1. Read the requested page.\n',
    ...overrides,
  }
  return `---
id: ${task.id}
title: ${task.title}
contractVersion: ${task.contractVersion}
mode: ${task.mode}
requiresExplicitAuthorization: ${String(task.requiresExplicitAuthorization)}
references:
${task.references.map((reference) => `  - ${reference}`).join('\n')}
---

# ${task.title}

${task.body}`
}

describe('Agent task contract', () => {
  it('parses and normalizes a read task', () => {
    const task = parseTaskDocument(
      taskSource(),
      'en-US/tasks/read-site.md',
      BUILT_IN_TASK_REFERENCES,
    )

    expect(task.metadata).toMatchObject({
      id: 'read-site',
      contractVersion: 1,
      mode: 'read',
      references: ['mcp:read'],
    })
    expect(task.markdown).toMatch(/\n$/)
    expect(task.markdown).not.toMatch(/\r/)
  })

  it.each([
    ['missing id', taskSource().replace('id: read-site\n', '')],
    ['unsupported contract version', taskSource({ contractVersion: 2 })],
    ['unsupported mode', taskSource({ mode: 'execute' })],
    [
      'read task requesting write authorization',
      taskSource({ requiresExplicitAuthorization: true }),
    ],
    [
      'write task omitting authorization',
      taskSource({
        id: 'maintain-site',
        mode: 'write',
        requiresExplicitAuthorization: false,
        body: '## Verification\n\nRun the checks.\n',
      }),
    ],
  ])('rejects %s', (_label, source) => {
    expect(() =>
      parseTaskDocument(
        source,
        'en-US/tasks/invalid.md',
        BUILT_IN_TASK_REFERENCES,
      ),
    ).toThrow()
  })

  it('rejects a write task without a verification section', () => {
    expect(() =>
      parseTaskDocument(
        taskSource({
          id: 'maintain-site',
          mode: 'write',
          requiresExplicitAuthorization: true,
          body: '## Steps\n\n1. Change the page.\n',
        }),
        'en-US/tasks/maintain-site.md',
        BUILT_IN_TASK_REFERENCES,
      ),
    ).toThrow(/verification/i)
  })

  it('rejects an unknown contract reference', () => {
    expect(() =>
      parseTaskDocument(
        taskSource({ references: ['mcp:unknown'] }),
        'en-US/tasks/read-site.md',
        BUILT_IN_TASK_REFERENCES,
      ),
    ).toThrow(/mcp:unknown/)
  })

  it('rejects executable MDX and non-Markdown task paths', () => {
    expect(() =>
      parseTaskDocument(
        taskSource({ body: "import secret from './secret'\n" }),
        'en-US/tasks/read-site.md',
        BUILT_IN_TASK_REFERENCES,
      ),
    ).toThrow(/executable/i)
    expect(() =>
      parseTaskDocument(
        taskSource(),
        'en-US/tasks/read-site.mdx',
        BUILT_IN_TASK_REFERENCES,
      ),
    ).toThrow(/\.md/i)
  })

  it('rejects a task over the public size limit', () => {
    expect(() =>
      parseTaskDocument(
        taskSource({ body: 'x'.repeat(MAX_TASK_BYTES) }),
        'en-US/tasks/read-site.md',
        BUILT_IN_TASK_REFERENCES,
      ),
    ).toThrow(/size/i)
  })

  it('rejects duplicate ids in one task pack', () => {
    const source = taskSource()
    expect(() =>
      parseTaskPack(
        'en-US',
        '# Guide\n',
        [
          { path: 'a.md', source },
          { path: 'b.md', source },
        ],
        BUILT_IN_TASK_REFERENCES,
      ),
    ).toThrow(/duplicate/i)
  })

  it('loads matching English and Chinese built-in task packs', async () => {
    const [english, chinese] = await Promise.all([
      loadBuiltInTaskPack('en-US'),
      loadBuiltInTaskPack('zh-CN'),
    ])

    const englishIds = english.tasks.map((task) => task.metadata.id)
    const chineseIds = chinese.tasks.map((task) => task.metadata.id)
    expect(englishIds).toEqual([
      'audit-site',
      'create-site',
      'deploy-site',
      'maintain-site',
      'migrate-content',
      'read-site',
    ])
    expect(chineseIds).toEqual(englishIds)
    expect(english.guide).toContain('# Silen Agent Guide')
    expect(chinese.guide).toContain('# Silen AI 操作指南')
  })

  it('guides agents to use the safe init command for new sites', async () => {
    const [english, chinese] = await Promise.all([
      loadBuiltInTaskPack('en-US'),
      loadBuiltInTaskPack('zh-CN'),
    ])
    const englishTask = english.tasks.find(
      (task) => task.metadata.id === 'create-site',
    )
    const chineseTask = chinese.tasks.find(
      (task) => task.metadata.id === 'create-site',
    )

    expect(englishTask?.metadata.references).toContain('cli:init')
    expect(englishTask?.markdown).toContain('pnpm silen init <root>')
    expect(chineseTask?.metadata.references).toContain('cli:init')
    expect(chineseTask?.markdown).toContain('pnpm silen init <root>')
  })
})
