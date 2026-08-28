// RETIRED — safe to delete this file, together with TerminalPanel.jsx and
// electron/pty.cjs.
//
// It covered a component that no longer exists. The ANSI parser it also tested
// moved to terminal/ansi.js and is covered by terminal/ansi.test.js; the
// terminal's real behaviour is covered by terminalTimeline.test.js.
//
// Kept as a stub rather than an empty file so the retirement is visible to the
// next person rather than looking like tests that were quietly dropped.
import { describe, it, expect } from 'vitest'
import { parseAnsiToSegments } from '../terminal/ansi'

describe('TerminalPanel (retired)', () => {
  it('re-exports the ANSI parser from its new home', () => {
    expect(parseAnsiToSegments('ok')[0].text).toBe('ok')
  })
})
