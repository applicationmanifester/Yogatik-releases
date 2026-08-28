// The ANSI parser, moved out of the retired TerminalPanel with its tests.
// Real command output carries colour, and a terminal that renders escape codes
// as literal `\x1b[32m` is unreadable for exactly the output people care about.
import { describe, it, expect } from 'vitest'
import { parseAnsiToSegments } from './ansi'

describe('parseAnsiToSegments', () => {
  it('returns one plain segment when there are no escapes', () => {
    const res = parseAnsiToSegments('hello world')
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ text: 'hello world', color: null, bold: false })
  })

  it('applies colour and weight, and resets them', () => {
    const res = parseAnsiToSegments('\x1b[32m\x1b[1mSuccess\x1b[0m normal \x1b[31mError\x1b[0m')
    const success = res.find(s => s.text === 'Success')
    expect(success.color).toBe('#10b981')
    expect(success.bold).toBe(true)
    const normal = res.find(s => s.text === ' normal ')
    expect(normal.color).toBeNull()
    expect(normal.bold).toBe(false)
    expect(res.find(s => s.text === 'Error').color).toBe('#ef4444')
  })

  it('never throws on non-string input', () => {
    // Output arrives from IPC; a null chunk during teardown must not take the
    // drawer down with it.
    for (const bad of [null, undefined, 42, {}]) {
      expect(() => parseAnsiToSegments(bad)).not.toThrow()
    }
  })
})
