import { describe, expect, it } from 'vitest'
import { defineConfig } from '../src/index'

describe('public package contract', () => {
  it('returns typed configuration unchanged', () => {
    const config = defineConfig({ title: 'Docs', base: '/project/' })
    expect(config).toEqual({ title: 'Docs', base: '/project/' })
  })
})
