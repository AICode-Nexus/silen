import matter from 'gray-matter'
import type { ParsedTaskDocument, TaskPack } from './tasks.js'

export const READ_ONLY_AGENT_SKILL_NAME = 'silen-docs-readonly' as const
export const READ_ONLY_AGENT_SKILL_TASK_IDS = [
  'audit-site',
  'read-site',
] as const
export const READ_ONLY_AGENT_SKILL_FILES = [
  'SKILL.md',
  'references/audit-site.md',
  'references/audit-site-zh-cn.md',
  'references/read-site.md',
  'references/read-site-zh-cn.md',
] as const

export const READ_ONLY_AGENT_SKILL_DESCRIPTION =
  'Use this skill when reading, searching, citing, or performing a model-free audit of Silen documentation or knowledge bases, including requests to 阅读、检索、引用或审计 Silen 文档. It is read-only and does not grant shell, network, filesystem-write, commit, push, or deployment permission.'

export const READ_ONLY_AGENT_SKILL_COMPATIBILITY =
  'Requires a Silen Agent Contract v2 package or site. Any MCP, command, filesystem, or network access must be separately available and authorized by the host or user.'

export interface ReadOnlyAgentSkillBundle {
  readonly name: typeof READ_ONLY_AGENT_SKILL_NAME
  readonly files: Readonly<Record<string, string>>
}

export interface RenderReadOnlyAgentSkillOptions {
  readonly version: string
  readonly packs: readonly [TaskPack, TaskPack]
}

export class AgentSkillContractError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(`SILEN_AGENT_SKILL_${code}: ${message}`)
    this.name = 'AgentSkillContractError'
    this.code = code
  }
}

function fail(code: string, message: string): never {
  throw new AgentSkillContractError(code, message)
}

function normalizedBody(markdown: string): string {
  const body = matter(markdown).content.replace(/\r\n?/g, '\n').trim()
  if (body.length === 0) fail('EMPTY_REFERENCE', 'Selected task body is empty')
  return body + '\n'
}

function selectedPack(
  packs: readonly TaskPack[],
  locale: 'en-US' | 'zh-CN',
): TaskPack {
  const matches = packs.filter((pack) => pack.locale === locale)
  if (matches.length !== 1) {
    return fail('LOCALE_COUNT', `Expected exactly one ${locale} task pack`)
  }
  return matches[0]!
}

function selectedTask(pack: TaskPack, id: string): ParsedTaskDocument {
  const matches = pack.tasks.filter((task) => task.metadata.id === id)
  if (matches.length !== 1) {
    return fail('TASK_COUNT', `Expected exactly one ${pack.locale} ${id} task`)
  }
  const task = matches[0]!
  if (
    task.metadata.requiresExplicitAuthorization === true ||
    task.metadata.contractVersion !== 1 ||
    task.metadata.mode !== 'read'
  ) {
    return fail('TASK_MODE', `${pack.locale} ${id} must remain read-only`)
  }
  return task
}

function skillMarkdown(version: string): string {
  return `---
name: silen-docs-readonly
description: >-
  Use this skill when reading, searching, citing, or performing a model-free
  audit of Silen documentation or knowledge bases, including requests to
  阅读、检索、引用或审计 Silen 文档. It is read-only and does not grant shell,
  network, filesystem-write, commit, push, or deployment permission.
license: MIT
compatibility: >-
  Requires a Silen Agent Contract v2 package or site. Any MCP, command,
  filesystem, or network access must be separately available and authorized by
  the host or user.
metadata:
  silen-version: ${JSON.stringify(version)}
  silen-contract-version: "2"
  silen-source-tasks: "audit-site,read-site"
---

# Silen read-only documentation workflows

## Use this skill

Prefer the installed or deployed Silen Agent Contract as the canonical source.
Use this Skill only for reading, searching, citing, and model-free auditing.

## Choose the workflow

- Read or cite documentation with [the English reading workflow](references/read-site.md).
- Audit a knowledge base with [the English audit workflow](references/audit-site.md).

## Language

For Chinese requests, use [the Chinese reading workflow](references/read-site-zh-cn.md)
or [the Chinese audit workflow](references/audit-site-zh-cn.md).

## Permission boundary

These instructions grant no tool, shell, command, network, filesystem-write,
source-edit, commit, push, deployment, or external-system authority. The host or
user must provide and authorize every operation separately.

## Completion

Use canonical public sources, report evidence and limitations concisely, and
stop before any source change unless the user separately authorizes it.
`
}

function expectedMetadata(version: string): Record<string, unknown> {
  return {
    name: READ_ONLY_AGENT_SKILL_NAME,
    description: READ_ONLY_AGENT_SKILL_DESCRIPTION,
    license: 'MIT',
    compatibility: READ_ONLY_AGENT_SKILL_COMPATIBILITY,
    metadata: {
      'silen-version': version,
      'silen-contract-version': '2',
      'silen-source-tasks': 'audit-site,read-site',
    },
  }
}

export function validateReadOnlyAgentSkillBundle(
  bundle: ReadOnlyAgentSkillBundle,
  version: string,
): void {
  if (bundle.name !== READ_ONLY_AGENT_SKILL_NAME) {
    fail('NAME', 'Skill directory and name must be silen-docs-readonly')
  }
  if (!/^[0-9A-Za-z][0-9A-Za-z.+-]{0,99}$/.test(version)) {
    fail('VERSION', 'Silen version is invalid')
  }
  const paths = Object.keys(bundle.files)
  if (JSON.stringify(paths) !== JSON.stringify(READ_ONLY_AGENT_SKILL_FILES)) {
    fail('FILES', 'Skill file set or ordering is invalid')
  }

  for (const [relativePath, content] of Object.entries(bundle.files)) {
    if (relativePath.startsWith('/') || relativePath.includes('..')) {
      fail('PATH', 'Skill files must remain inside the Skill directory')
    }
    if (
      content.includes('\r') ||
      !content.endsWith('\n') ||
      content.endsWith('\n\n')
    ) {
      fail('NORMALIZATION', `${relativePath} is not byte-normalized`)
    }
  }

  const parsed = matter(bundle.files['SKILL.md']!)
  if (
    JSON.stringify(parsed.data) !== JSON.stringify(expectedMetadata(version))
  ) {
    fail(
      'FRONTMATTER',
      'SKILL.md frontmatter does not match the reviewed contract',
    )
  }
  if (
    READ_ONLY_AGENT_SKILL_DESCRIPTION.length > 1024 ||
    READ_ONLY_AGENT_SKILL_COMPATIBILITY.length > 500
  ) {
    fail('FIELD_LIMIT', 'Agent Skills field length limit exceeded')
  }

  const links = Array.from(
    parsed.content.matchAll(/\]\(([^)]+)\)/g),
    (match) => match[1],
  )
  const expectedLinks = [
    'references/read-site.md',
    'references/audit-site.md',
    'references/read-site-zh-cn.md',
    'references/audit-site-zh-cn.md',
  ]
  if (JSON.stringify(links) !== JSON.stringify(expectedLinks)) {
    fail(
      'REFERENCES',
      'SKILL.md references must be the reviewed one-level paths',
    )
  }

  const output = Object.values(bundle.files).join('\n')
  if (/(?:file:\/\/|[A-Za-z]:\\|\/Users\/|\/home\/)/.test(output)) {
    fail('LOCAL_PATH', 'Generated Skill contains a local absolute path')
  }
  if (
    /^(?:import|export)\s/m.test(output) ||
    /<\/?[A-Z][A-Za-z0-9.]*/.test(output)
  ) {
    fail('EXECUTABLE_CONTENT', 'Generated Skill must remain plain Markdown')
  }
}

export function renderReadOnlyAgentSkill(
  options: RenderReadOnlyAgentSkillOptions,
): ReadOnlyAgentSkillBundle {
  const english = selectedPack(options.packs, 'en-US')
  const chinese = selectedPack(options.packs, 'zh-CN')
  const files: Record<string, string> = {
    'SKILL.md': skillMarkdown(options.version),
    'references/audit-site.md': normalizedBody(
      selectedTask(english, 'audit-site').markdown,
    ),
    'references/audit-site-zh-cn.md': normalizedBody(
      selectedTask(chinese, 'audit-site').markdown,
    ),
    'references/read-site.md': normalizedBody(
      selectedTask(english, 'read-site').markdown,
    ),
    'references/read-site-zh-cn.md': normalizedBody(
      selectedTask(chinese, 'read-site').markdown,
    ),
  }
  const bundle: ReadOnlyAgentSkillBundle = Object.freeze({
    name: READ_ONLY_AGENT_SKILL_NAME,
    files: Object.freeze(files),
  })
  validateReadOnlyAgentSkillBundle(bundle, options.version)
  return bundle
}
