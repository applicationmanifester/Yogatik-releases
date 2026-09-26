import { describe, it, expect } from 'vitest'
import { enrichToolError } from './toolReflection'

describe('enrichToolError', () => {
  it('returns untouched object when tool succeeded', () => {
    const successResult = { success: true, content: 'file data' }
    expect(enrichToolError('fs_read', { path: 'file.txt' }, successResult)).toBe(successResult)
  })

  it('attaches reflection hint for missing file errors', () => {
    const errorResult = { success: false, error: 'ENOENT: no such file or directory' }
    const enriched = enrichToolError('fs_read', { path: 'missing.js' }, errorResult)
    expect(enriched.reflection_hint).toContain('fs_find_files')
  })

  it('attaches reflection hint for search empty or rate-limited errors', () => {
    const errorResult = { success: false, error: 'HTTP 429 Rate Limit Exceeded' }
    const enriched = enrichToolError('web_search', { query: 'crypto' }, errorResult)
    expect(enriched.reflection_hint).toContain('rate limited')
  })

  it('attaches reflection hint for command not found in terminal_run', () => {
    const errorResult = { success: false, error: "'cargo' is not recognized as an internal or external command" }
    const enriched = enrichToolError('terminal_run', { command: 'cargo build' }, errorResult)
    expect(enriched.reflection_hint).toContain('PATH')
  })

  it('attaches reflection hint when the tool name was hallucinated as the file path', () => {
    const errorResult = { success: false, error: 'File not found: fs_read (no such file or directory)' }
    const enriched = enrichToolError('fs_read', { path: 'fs_read' }, errorResult)
    expect(enriched.reflection_hint).toContain('passed the tool name')
    expect(enriched.reflection_hint).toContain('fs_find_files')
  })
})
