import { describe, it, expect } from 'vitest'
import { validateToolSafety } from './toolGuard'

describe('toolGuard', () => {
  it('allows safe terminal commands', () => {
    expect(validateToolSafety('terminal_run', { command: 'git status' }).safe).toBe(true)
    expect(validateToolSafety('terminal_run', { command: 'npm run build' }).safe).toBe(true)
  })

  it('blocks destructive terminal commands', () => {
    expect(validateToolSafety('terminal_run', { command: 'rm -rf /' }).safe).toBe(false)
    expect(validateToolSafety('terminal_run', { command: 'format C:' }).safe).toBe(false)
    expect(validateToolSafety('terminal_run', { command: 'shutdown /s' }).safe).toBe(false)
  })

  it('blocks dangerous root directory deletions', () => {
    expect(validateToolSafety('fs_delete', { path: '/' }).safe).toBe(false)
    expect(validateToolSafety('fs_delete', { path: 'C:\\' }).safe).toBe(false)
    expect(validateToolSafety('fs_delete', { path: 'src/temp.txt' }).safe).toBe(true)
  })
})
