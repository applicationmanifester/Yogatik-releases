/**
 * fs_skim composes the REAL fs_read tool rather than talking to the bridge
 * itself — these tests mock fsReadTool.execute at the module boundary (not
 * the bridge), so a change to fs_read's own truncation/binary/caching
 * contract is exactly what would be exercised here too.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const state = { readResult: null }

vi.mock('./localFs', () => ({
  fail: (msg) => ({ success: false, error: msg }),
  fsReadTool: { execute: vi.fn(async () => state.readResult) },
}))

const { fsSkimTool } = await import('./fsSkim')
const { fsReadTool } = await import('./localFs')

beforeEach(() => {
  state.readResult = null
  fsReadTool.execute.mockClear()
})

describe('fs_skim', () => {
  it('requires a path', async () => {
    const res = await fsSkimTool.execute({})
    expect(res.success).toBe(false)
  })

  it('falls back to a full read for a language it cannot safely skeletonize', async () => {
    state.readResult = { success: true, tool: 'fs_read', path: 'notes.py', content: 'def f():\n    pass\n' }
    const res = await fsSkimTool.execute({ path: 'notes.py' })
    expect(res.success).toBe(true)
    expect(res.skeleton).toBe(false)
    expect(res.content).toBe('def f():\n    pass\n') // real content, not mangled
    expect(res.note).toMatch(/isn't supported/i)
  })

  it('passes through a failed read untouched', async () => {
    state.readResult = { success: false, error: 'File not found: x.js (no such file or directory)' }
    const res = await fsSkimTool.execute({ path: 'x.js' })
    expect(res).toEqual(state.readResult)
  })

  it('declines to skeletonize a binary file', async () => {
    state.readResult = { success: true, tool: 'fs_read', path: 'a.js', content: '', binary: true }
    const res = await fsSkimTool.execute({ path: 'a.js' })
    expect(res.skeleton).toBe(false)
    expect(res.note).toMatch(/binary/i)
  })

  it('declines to skeletonize a truncated read rather than risk collapsing a cut-off body', async () => {
    state.readResult = { success: true, tool: 'fs_read', path: 'big.js', content: 'function f() {\n', truncated: true }
    const res = await fsSkimTool.execute({ path: 'big.js' })
    expect(res.skeleton).toBe(false)
    expect(res.note).toMatch(/truncated/i)
  })

  it('skeletonizes a supported file and tells the model how to get the real content back', async () => {
    const body = Array.from({ length: 8 }, (_, i) => `  const x${i} = ${i}`).join('\n')
    state.readResult = {
      success: true, tool: 'fs_read', path: 'big.js',
      content: `function big() {\n${body}\n  return x0\n}\n`,
    }
    const res = await fsSkimTool.execute({ path: 'big.js' })
    expect(res.success).toBe(true)
    expect(res.skeleton).toBe(true)
    expect(res.collapsed_regions).toBeGreaterThan(0)
    expect(res.content).toContain('collapsed')
    expect(res.content).toContain('function big() {')
    expect(res.note).toMatch(/fs_read/)
  })

  it('honors a custom collapse_threshold', async () => {
    state.readResult = {
      success: true, tool: 'fs_read', path: 'small.js',
      content: 'function tiny() {\n  const a = 1\n  const b = 2\n}\n',
    }
    const loose = await fsSkimTool.execute({ path: 'small.js', collapse_threshold: 10 })
    expect(loose.collapsed_regions).toBe(0) // 2-line body, default AND loose threshold both spare it
    const strict = await fsSkimTool.execute({ path: 'small.js', collapse_threshold: 1 })
    expect(strict.collapsed_regions).toBe(1) // 2 > 1, now worth collapsing
  })

  it('reports nothing collapsed honestly when the file was already short', async () => {
    state.readResult = { success: true, tool: 'fs_read', path: 'tiny.js', content: 'const x = 1\n' }
    const res = await fsSkimTool.execute({ path: 'tiny.js' })
    expect(res.collapsed_regions).toBe(0)
    expect(res.note).toMatch(/already/i)
  })
})
