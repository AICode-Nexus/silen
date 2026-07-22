import { describe, expect, it } from 'vitest'
import { auditDocuments, type WorkspaceDocument } from '../../src/ai/audit'

const artifacts = new Set(['llms.txt', 'llms-full.txt', 'ai-index.json'])

function documents(target: string): WorkspaceDocument[] {
  return [
    {
      id: 'index.mdx',
      path: 'index.mdx',
      route: '/',
      title: 'Home',
      text: `# Home\n\n[Guide](${target})\n`,
    },
    {
      id: 'guide/index.mdx',
      path: 'guide/index.mdx',
      route: '/guide',
      title: 'Guide',
      text: '# Guide\n',
    },
  ]
}

describe('base-aware AI audit', () => {
  it('strips one exact deployment base from root-relative links', () => {
    const result = auditDocuments(documents('/silen/guide/'), {
      artifacts,
      base: '/silen/',
      indexFresh: false,
    })
    expect(result).toMatchObject({ ok: true, issues: [] })
    expect(result.notices).toEqual([
      expect.objectContaining({ code: 'index-cache' }),
    ])
  })

  it('does not strip a lookalike prefix', () => {
    const result = auditDocuments(documents('/silen-other/guide/'), {
      artifacts,
      base: '/silen/',
      indexFresh: true,
    })
    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'broken-link' }),
    ])
  })

  it('accepts a built artifact link under the deployment base', () => {
    const result = auditDocuments(
      documents('/silen/.well-known/silen/manifest.json'),
      {
        artifacts: new Set([...artifacts, '.well-known/silen/manifest.json']),
        base: '/silen/',
        indexFresh: true,
      },
    )
    expect(result.issues).toEqual([])
  })

  it('keeps root-base and relative-link behavior', () => {
    expect(
      auditDocuments(documents('/guide/'), {
        artifacts,
        base: '/',
        indexFresh: true,
      }).issues,
    ).toEqual([])
    expect(
      auditDocuments(documents('guide/'), {
        artifacts,
        base: '/silen/',
        indexFresh: true,
      }).issues,
    ).toEqual([])
  })

  it('reports unknown base and stale cache only as notices', () => {
    const result = auditDocuments(documents('/guide/'), {
      artifacts,
      indexFresh: false,
    })
    expect(result.ok).toBe(true)
    expect(result.issues).toEqual([])
    expect(result.notices.map(({ code }) => code)).toEqual([
      'base-unknown',
      'index-cache',
    ])
  })
})
