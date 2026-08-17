import { describe, it, expect } from 'vitest'
import { parseCommandFile, commandToSkill, mergeRepoCommands } from './repoCommands'

describe('parseCommandFile', () => {
  it('reads YAML-ish frontmatter and body', () => {
    const c = parseCommandFile('review.md', '---\nname: Code Review\ndescription: Review a diff\n---\nDo the review.')
    expect(c.name).toBe('Code Review')
    expect(c.description).toBe('Review a diff')
    expect(c.system).toBe('Do the review.')
  })

  it('falls back to the filename when there is no frontmatter', () => {
    const c = parseCommandFile('deploy-app.md', 'Ship it.')
    expect(c.name).toBe('deploy-app')
    expect(c.system).toBe('Ship it.')
  })

  it('parses a comma-separated tools list', () => {
    const c = parseCommandFile('x.md', '---\ntools: fs_read, fs_write ,terminal_run\n---\nbody')
    expect(c.tools).toEqual(['fs_read', 'fs_write', 'terminal_run'])
  })

  it('has no tools restriction when none is declared', () => {
    expect(parseCommandFile('x.md', 'body').tools).toEqual([])
  })

  it('returns null for an empty body', () => {
    expect(parseCommandFile('x.md', '   ')).toBeNull()
    expect(parseCommandFile('x.md', '---\nname: X\n---\n   ')).toBeNull()
  })

  it('ignores unknown frontmatter keys rather than choking', () => {
    const c = parseCommandFile('x.md', '---\nname: A\nweird: yes\n---\nbody')
    expect(c.name).toBe('A')
    expect(c.system).toBe('body')
  })
})

describe('commandToSkill', () => {
  it('marks the skill as coming from the repo and gives a stable id', () => {
    const s = commandToSkill(parseCommandFile('review.md', 'body'), '/repo')
    expect(s.fromRepo).toBe(true)
    expect(s.id).toContain('repo:')
    expect(s.id).toContain('review')
  })

  it('is stable across calls for the same file', () => {
    const a = commandToSkill(parseCommandFile('review.md', 'body'), '/repo')
    const b = commandToSkill(parseCommandFile('review.md', 'body'), '/repo')
    expect(a.id).toBe(b.id)
  })

  it('distinguishes the same filename in different roots', () => {
    const a = commandToSkill(parseCommandFile('review.md', 'b'), '/repo-a')
    const b = commandToSkill(parseCommandFile('review.md', 'b'), '/repo-b')
    expect(a.id).not.toBe(b.id)
  })
})

describe('mergeRepoCommands', () => {
  const stored = [{ id: 'local1', name: 'Mine' }]

  it('appends repo commands to stored skills', () => {
    const repo = [{ id: 'repo:x', name: 'Repo One', fromRepo: true }]
    expect(mergeRepoCommands(stored, repo)).toHaveLength(2)
  })

  it('lets a stored skill with the same id win, so a user edit is not clobbered', () => {
    const repo = [{ id: 'local1', name: 'Repo Version', fromRepo: true }]
    const out = mergeRepoCommands(stored, repo)
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('Mine')
  })

  it('handles empty inputs', () => {
    expect(mergeRepoCommands([], [])).toEqual([])
    expect(mergeRepoCommands(null, null)).toEqual([])
  })
})
