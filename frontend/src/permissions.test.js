import { describe, it, expect, beforeEach } from 'vitest'
import {
  TOOL_RISK, riskOf, ruleMatches, decide, describeCall,
  setPermissionPrompt, requestPermission, _resetPermissions,
} from './permissions'

describe('riskOf', () => {
  it('classifies reads as read', () => {
    expect(riskOf('fs_read')).toBe('read')
    expect(riskOf('fs_list')).toBe('read')
    expect(riskOf('fs_search')).toBe('read')
  })

  it('classifies mutations as write', () => {
    expect(riskOf('fs_write')).toBe('write')
    expect(riskOf('fs_edit')).toBe('write')
    expect(riskOf('fs_move')).toBe('write')
  })

  it('classifies the irreversible ones as destructive', () => {
    expect(riskOf('fs_delete')).toBe('destructive')
    expect(riskOf('terminal_run')).toBe('destructive')
  })

  it('treats unknown tools as read so existing tools are not gated by surprise', () => {
    expect(riskOf('weather')).toBe('read')
    expect(riskOf('some_future_tool')).toBe('read')
  })

  it('every declared risk is one of the three levels', () => {
    for (const r of Object.values(TOOL_RISK)) {
      expect(['read', 'write', 'destructive']).toContain(r)
    }
  })
})

describe('ruleMatches', () => {
  it('matches on tool name alone when there is no pattern', () => {
    expect(ruleMatches({ tool: 'fs_write' }, 'fs_write', {})).toBe(true)
    expect(ruleMatches({ tool: 'fs_write' }, 'fs_read', {})).toBe(false)
  })

  it('matches a glob against the call target', () => {
    expect(ruleMatches({ tool: 'fs_write', pattern: 'src/*' }, 'fs_write', { path: 'src/a.js' })).toBe(true)
    expect(ruleMatches({ tool: 'fs_write', pattern: 'src/*' }, 'fs_write', { path: 'docs/a.js' })).toBe(false)
  })

  it('matches a command prefix for terminal_run', () => {
    expect(ruleMatches({ tool: 'terminal_run', pattern: 'npm test*' }, 'terminal_run', { command: 'npm test -- --watch' })).toBe(true)
    expect(ruleMatches({ tool: 'terminal_run', pattern: 'npm test*' }, 'terminal_run', { command: 'rm -rf /' })).toBe(false)
  })
})

describe('decide', () => {
  const ctx = { conversationId: 1, projectId: null }

  it('auto-allows reads with no rules', () => {
    expect(decide([], 'fs_read', { path: 'a' }, ctx).outcome).toBe('allow')
  })

  it('asks for writes with no rules', () => {
    expect(decide([], 'fs_write', { path: 'a' }, ctx).outcome).toBe('ask')
  })

  it('asks for destructive with no rules', () => {
    expect(decide([], 'fs_delete', { path: 'a' }, ctx).outcome).toBe('ask')
  })

  it('honours an allow rule', () => {
    const rules = [{ tool: 'fs_write', outcome: 'allow', scope: 'chat', conversationId: 1 }]
    expect(decide(rules, 'fs_write', { path: 'a' }, ctx).outcome).toBe('allow')
  })

  it('honours a deny rule', () => {
    const rules = [{ tool: 'fs_write', outcome: 'deny', scope: 'global' }]
    expect(decide(rules, 'fs_write', { path: 'a' }, ctx).outcome).toBe('deny')
  })

  it('deny beats allow no matter the order', () => {
    const rules = [
      { tool: 'fs_delete', outcome: 'allow', scope: 'global' },
      { tool: 'fs_delete', outcome: 'deny', scope: 'global' },
    ]
    expect(decide(rules, 'fs_delete', { path: 'a' }, ctx).outcome).toBe('deny')
  })

  it('ignores a chat-scoped rule belonging to a different chat', () => {
    const rules = [{ tool: 'fs_write', outcome: 'allow', scope: 'chat', conversationId: 999 }]
    expect(decide(rules, 'fs_write', { path: 'a' }, ctx).outcome).toBe('ask')
  })

  it('applies a project-scoped rule only inside that project', () => {
    const rules = [{ tool: 'fs_write', outcome: 'allow', scope: 'project', projectId: 7 }]
    expect(decide(rules, 'fs_write', {}, { conversationId: 1, projectId: 7 }).outcome).toBe('allow')
    expect(decide(rules, 'fs_write', {}, { conversationId: 1, projectId: 8 }).outcome).toBe('ask')
  })
})

describe('describeCall', () => {
  it('summarises a file write by path', () => {
    expect(describeCall('fs_write', { path: 'src/a.js' })).toContain('src/a.js')
  })

  it('summarises a shell command by its command line', () => {
    expect(describeCall('terminal_run', { command: 'rm -rf build' })).toContain('rm -rf build')
  })

  it('flags a recursive delete explicitly', () => {
    expect(describeCall('fs_delete', { path: 'build', recursive: true })).toMatch(/recursive/i)
  })
})

describe('requestPermission', () => {
  beforeEach(() => { _resetPermissions() })

  it('allows reads without ever prompting', async () => {
    let prompted = false
    setPermissionPrompt(async () => { prompted = true; return { outcome: 'allow' } })
    const r = await requestPermission('fs_read', { path: 'a' }, {})
    expect(r.allowed).toBe(true)
    expect(prompted).toBe(false)
  })

  it('prompts for a write and honours the answer', async () => {
    setPermissionPrompt(async () => ({ outcome: 'allow', remember: 'once' }))
    const r = await requestPermission('fs_write', { path: 'a' }, {})
    expect(r.allowed).toBe(true)
  })

  it('returns a denial the model can read, rather than throwing', async () => {
    setPermissionPrompt(async () => ({ outcome: 'deny' }))
    const r = await requestPermission('fs_delete', { path: 'a' }, {})
    expect(r.allowed).toBe(false)
    expect(r.reason).toMatch(/denied/i)
  })

  it('DENIES when no prompt handler is installed — fail closed, never open', async () => {
    setPermissionPrompt(null)
    const r = await requestPermission('terminal_run', { command: 'rm -rf /' }, {})
    expect(r.allowed).toBe(false)
  })

  it('denies when the prompt itself throws', async () => {
    setPermissionPrompt(async () => { throw new Error('ui exploded') })
    const r = await requestPermission('fs_write', { path: 'a' }, {})
    expect(r.allowed).toBe(false)
  })
})

describe('executeTool enforcement (end-to-end)', () => {
  beforeEach(() => { _resetPermissions() })

  it('BLOCKS a destructive tool when no approval UI is installed', async () => {
    const { executeTool } = await import('./tools/index')
    setPermissionPrompt(null)
    const r = await executeTool('terminal_run', { command: 'rm -rf /' })
    expect(r.success).toBe(false)
    expect(r.denied).toBe(true)
  })

  it('BLOCKS fs_delete when the user says no', async () => {
    const { executeTool } = await import('./tools/index')
    setPermissionPrompt(async () => ({ outcome: 'deny' }))
    const r = await executeTool('fs_delete', { path: 'x', recursive: true })
    expect(r.success).toBe(false)
    expect(r.denied).toBe(true)
  })

  it('lets a harmless read through without prompting', async () => {
    const { executeTool } = await import('./tools/index')
    let prompted = false
    setPermissionPrompt(async () => { prompted = true; return { outcome: 'deny' } })
    const r = await executeTool('calculator', { expression: '2+2' })
    expect(prompted).toBe(false)
    expect(r.denied).toBeUndefined()
  })
})
