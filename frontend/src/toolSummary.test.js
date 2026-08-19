/**
 * The empty-answer fallback used to paste raw JSON.stringify output — a 187KB
 * file's contents, plus internal bookkeeping like the repeated-call note —
 * which is barely better than the blank bubble it replaced.
 */
import { describe, it, expect } from 'vitest'
import { summariseResult, summariseToolResults } from './toolSummary'

describe('summariseResult', () => {
  it('names the file and its size instead of dumping the payload', () => {
    const out = summariseResult('fs_read', {
      success: true, tool: 'fs_read', path: 'C:/app/App.jsx', bytes: 187816,
      content: 'import React from "react"\nconst x = 1',
    })
    expect(out).toContain('C:/app/App.jsx')
    // Grouping is locale-dependent (1,87,816 under en-IN), and showing the
    // user's own formatting is correct — so assert against the same call.
    expect(out).toContain(`${(187816).toLocaleString()} bytes`)
    expect(out).not.toContain('"success"')
    expect(out).not.toContain('{')
  })

  it('clips a long preview rather than reprinting the file', () => {
    const out = summariseResult('fs_read', { success: true, content: 'x'.repeat(5000) })
    expect(out.length).toBeLessThan(600)
    expect(out).toContain('…')
  })

  it('reduces a failure to its reason', () => {
    const out = summariseResult('fs_search', {
      success: false,
      error: 'query is required',
      repeated: true,
      note: 'You already called fs_search with exactly these arguments in this turn…',
    })
    expect(out).toContain('query is required')
    expect(out).not.toMatch(/already called/i)   // internal bookkeeping, not a finding
    expect(out).not.toContain('repeated')
  })

  it('counts results instead of listing them all', () => {
    const out = summariseResult('web_search', { success: true, results: [1, 2, 3] })
    expect(out).toContain('3 results')
  })

  it('uses the singular where it should', () => {
    expect(summariseResult('web_search', { success: true, results: [1] })).toContain('1 result')
  })

  it('handles a plain string result', () => {
    expect(summariseResult('x', 'just text')).toContain('just text')
  })

  it('survives null and odd shapes without throwing', () => {
    expect(() => summariseResult('x', null)).not.toThrow()
    expect(() => summariseResult('x', { weird: true })).not.toThrow()
    expect(summariseResult('x', { weird: true })).toMatch(/weird/)
  })
})

describe('summariseToolResults', () => {
  it('puts what worked before what failed', () => {
    const out = summariseToolResults({
      fs_search: { success: false, error: 'query is required' },
      fs_read: { success: true, path: 'a.txt', bytes: 10 },
    })
    expect(out.indexOf('fs_read')).toBeLessThan(out.indexOf('fs_search'))
  })

  it('returns nothing when there is nothing to report', () => {
    expect(summariseToolResults({})).toBe('')
    expect(summariseToolResults(null)).toBe('')
  })

  it('never emits raw JSON braces', () => {
    const out = summariseToolResults({
      fs_read: { success: true, path: 'a.txt', bytes: 1, content: 'hi' },
      web_search: { success: true, results: [1, 2] },
    })
    expect(out).not.toContain('{"')
  })
})
