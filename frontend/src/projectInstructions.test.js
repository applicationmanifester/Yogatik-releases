import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { INSTRUCTION_FILES, pickInstructionFiles, formatInstructionsBlock, loadProjectInstructions, clearInstructionsCache } from './projectInstructions'

describe('pickInstructionFiles', () => {
  it('prefers YOGATIK.md over the other names', () => {
    expect(pickInstructionFiles(['README.md', 'AGENTS.md', 'YOGATIK.md'])).toEqual(['YOGATIK.md'])
  })

  it('falls back through the priority list', () => {
    expect(pickInstructionFiles(['README.md', 'CLAUDE.md'])).toEqual(['CLAUDE.md'])
    expect(pickInstructionFiles(['AGENTS.md', 'CLAUDE.md'])).toEqual(['AGENTS.md'])
  })

  it('finds the dotted path', () => {
    expect(pickInstructionFiles(['.yogatik/instructions.md'])).toEqual(['.yogatik/instructions.md'])
  })

  it('returns nothing when no instruction file is present', () => {
    expect(pickInstructionFiles(['README.md', 'package.json'])).toEqual([])
  })

  it('is case-insensitive on the filename', () => {
    expect(pickInstructionFiles(['agents.md'])).toEqual(['agents.md'])
  })

  it('every candidate name is covered by the priority list', () => {
    for (const name of INSTRUCTION_FILES) {
      expect(pickInstructionFiles([name])).toEqual([name])
    }
  })
})

describe('formatInstructionsBlock', () => {
  it('is empty when there are no docs', () => {
    expect(formatInstructionsBlock([])).toBe('')
  })

  it('labels each document with its source path', () => {
    const out = formatInstructionsBlock([{ path: '/repo/YOGATIK.md', text: 'Use tabs.' }])
    expect(out).toContain('PROJECT INSTRUCTIONS')
    expect(out).toContain('/repo/YOGATIK.md')
    expect(out).toContain('Use tabs.')
  })

  it('keeps several roots separate', () => {
    const out = formatInstructionsBlock([
      { path: '/a/YOGATIK.md', text: 'Alpha rule.' },
      { path: '/b/AGENTS.md', text: 'Beta rule.' },
    ])
    expect(out).toContain('Alpha rule.')
    expect(out).toContain('Beta rule.')
  })

  it('truncates a runaway file so it cannot eat the context window', () => {
    const huge = 'x'.repeat(50000)
    const out = formatInstructionsBlock([{ path: '/a/YOGATIK.md', text: huge }])
    expect(out.length).toBeLessThan(20000)
    expect(out).toMatch(/truncated/i)
  })
})

describe('loadProjectInstructions', () => {
  afterEach(() => { delete globalThis.window; clearInstructionsCache() })
  beforeEach(() => { clearInstructionsCache() })

  it('returns empty off-desktop rather than throwing', async () => {
    expect(await loadProjectInstructions()).toBe('')
  })

  it('reads the instruction file from each bound root', async () => {
    globalThis.window = {
      __TAURI__: {
        core: {
          invoke: async (cmd, args) => {
            if (cmd === 'roots_list') return [{ id: 'r1', path: '/repo', label: 'repo', primary: true }]
            if (cmd === 'fs_list') return [{ name: 'YOGATIK.md', path: '/repo/YOGATIK.md', is_dir: false, size: 10 }]
            if (cmd === 'fs_read') return args.path === '/repo/YOGATIK.md' ? 'Always run tests.' : ''
            return null
          },
        },
      },
    }
    const block = await loadProjectInstructions()
    expect(block).toContain('Always run tests.')
    expect(block).toContain('/repo/YOGATIK.md')
  })

  it('returns empty when the root has no instruction file', async () => {
    globalThis.window = {
      __TAURI__: {
        core: {
          invoke: async (cmd) => {
            if (cmd === 'roots_list') return [{ id: 'r1', path: '/repo', label: 'repo', primary: true }]
            if (cmd === 'fs_list') return [{ name: 'README.md', path: '/repo/README.md', is_dir: false, size: 10 }]
            return null
          },
        },
      },
    }
    expect(await loadProjectInstructions()).toBe('')
  })

  it('never throws when the bridge fails — instructions are best-effort', async () => {
    globalThis.window = {
      __TAURI__: { core: { invoke: async () => { throw new Error('bridge down') } } },
    }
    expect(await loadProjectInstructions()).toBe('')
  })
})
