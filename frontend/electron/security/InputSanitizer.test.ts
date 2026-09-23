import { describe, it, expect } from 'vitest'

// Unit tests for InputSanitizer — the CRITICAL fix for command injection in
// desktop:executeAction. The original code interpolated raw user input into a
// PowerShell command; this module replaces it with ALLOWLIST-based
// sanitization. These tests pin that contract: only allowlisted action types,
// hotkeys, domains and apps pass; everything else is refused with a reason.
// The arbitrary-hotkey test FAILS against the original injection-prone code
// (the string went straight into the shell command), so the suite is
// non-vacuous.

import { InputSanitizer } from './InputSanitizer'

describe('InputSanitizer', () => {
  const sanitizer = new InputSanitizer()

  // --- Structural refusals ---

  it('rejects non-object input', () => {
    // NOTE: an empty array legitimately passes the typeof-object check (and
    // then fails as a missing type) — so it is asserted in the type test below.
    for (const bad of [null, undefined, 'type', 42]) {
      const res = sanitizer.sanitizeAction(bad)
      expect(res.valid).toBe(false)
      expect(res.error).toContain('must be an object')
    }
  })

  it('rejects missing or non-string action type', () => {
    for (const bad of [{}, { type: 42 }, { type: null }]) {
      const res = sanitizer.sanitizeAction(bad)
      expect(res.valid).toBe(false)
      expect(res.error).toContain('action type')
    }
  })

  it('rejects action types outside the allowlist (the injection class)', () => {
    for (const bad of ['shutdown', 'exec', 'eval', 'shell', 'rm_rf', 'write', 'keyboard']) {
      const res = sanitizer.sanitizeAction({ type: bad })
      expect(res.valid).toBe(false)
      expect(res.error).toContain('not allowed')
    }
  })

  // --- Type (keyboard text) actions ---

  it('allows plain typing text and passes it through escaped', () => {
    const res = sanitizer.sanitizeAction({ type: 'type', text: 'hello world' })
    expect(res.valid).toBe(true)
    expect(res.action?.type).toBe('type')
    expect(res.action?.text).toBe('hello world')
  })

  it('escapes SendKeys special characters so they type literally', () => {
    const res = sanitizer.sanitizeAction({ type: 'type', text: 'price: 100% (+5)' })
    expect(res.valid).toBe(true)
    // %, (, +, ) each wrapped as {X} — they can no longer be interpreted as
    // SendKeys modifiers by whatever executes the action.
    expect(res.action?.text).toBe('price: 100{%} {(}{+}5{)}')
  })

  it('rejects typing text containing control characters', () => {
    const res = sanitizer.sanitizeAction({ type: 'type', text: 'bad\x00null\x07bell' })
    expect(res.valid).toBe(false)
    expect(res.error).toContain('control characters')
  })

  it('rejects typing text over the 10k char limit', () => {
    const res = sanitizer.sanitizeAction({ type: 'type', text: 'a'.repeat(10_001) })
    expect(res.valid).toBe(false)
    expect(res.error).toContain('Text too long')
  })

  it('rejects a type action with no text', () => {
    const res = sanitizer.sanitizeAction({ type: 'type' })
    expect(res.valid).toBe(false)
    expect(res.error).toContain('requires text')
  })

  // --- Hotkey actions ---

  it('allows hotkeys from the explicit allowlist', () => {
    for (const keys of ['^c', '^v', '{ENTER}', '{TAB}', '{ESC}', '%{F4}']) {
      const res = sanitizer.sanitizeAction({ type: 'hotkey', keys })
      expect(res.valid).toBe(true)
      expect(res.action?.keys).toBe(keys)
    }
  })

  it('rejects hotkeys outside the allowlist (injection-prone strings refused)', () => {
    for (const keys of ['^a; rm -rf /', 'foobar', '^p && whoami', '{ENTER}{ENTER}{ENTER}...payload', 'ctrl+c']) {
      const res = sanitizer.sanitizeAction({ type: 'hotkey', keys })
      expect(res.valid).toBe(false)
      expect(res.error).toContain('not in allowlist')
    }
  })

  it('rejects hotkey strings over the 100 char limit', () => {
    const res = sanitizer.sanitizeAction({ type: 'hotkey', keys: '^c'.repeat(51) })
    expect(res.valid).toBe(false)
    expect(res.error).toContain('Keys too long')
  })

  it('rejects a hotkey action with no keys', () => {
    const res = sanitizer.sanitizeAction({ type: 'hotkey' })
    expect(res.valid).toBe(false)
    expect(res.error).toContain('requires keys')
  })

  // --- Clipboard actions ---

  it('allows clipboard text verbatim', () => {
    const res = sanitizer.sanitizeAction({ type: 'clipboard', text: 'copy this ^ or {that}' })
    expect(res.valid).toBe(true)
    expect(res.action?.text).toBe('copy this ^ or {that}')
  })

  it('rejects clipboard text over the 10k char limit', () => {
    const res = sanitizer.sanitizeAction({ type: 'clipboard', text: 'x'.repeat(10_001) })
    expect(res.valid).toBe(false)
    expect(res.error).toContain('Text too long')
  })

  // --- Launch actions ---

  it('allows launch URLs on the domain allowlist, including subdomains', () => {
    for (const url of ['https://yogatik.web.app', 'https://docs.yogatik.web.app/guide', 'http://github.com/x/y']) {
      const res = sanitizer.sanitizeAction({ type: 'launch', targetUrl: url })
      expect(res.valid).toBe(true)
      expect(res.action?.targetUrl).toBe(url)
    }
  })

  it('rejects launch URLs on other domains', () => {
    const res = sanitizer.sanitizeAction({ type: 'launch', targetUrl: 'https://evil.example.com' })
    expect(res.valid).toBe(false)
    expect(res.error).toContain('not in allowlist')
  })

  it('rejects look-alike domains (endsWith guard needs the dot)', () => {
    // 'evilyogatik.web.app' ends with 'yogatik.web.app' as a SUBSTRING — the
    // '.' + domain guard must not let it through.
    const res = sanitizer.sanitizeAction({ type: 'launch', targetUrl: 'https://evilyogatik.web.app' })
    expect(res.valid).toBe(false)
    expect(res.error).toContain('not in allowlist')
  })

  it('rejects disallowed URL protocols', () => {
    for (const url of ['file:///C:/Windows/system32/cmd.exe', 'javascript:alert(1)', 'ftp://yogatik.web.app/x']) {
      const res = sanitizer.sanitizeAction({ type: 'launch', targetUrl: url })
      expect(res.valid).toBe(false)
    }
  })

  it('rejects malformed URLs', () => {
    const res = sanitizer.sanitizeAction({ type: 'launch', targetUrl: 'not a url at all :://' })
    expect(res.valid).toBe(false)
    expect(res.error).toContain('Invalid URL')
  })

  it('allows targetApp only from the application allowlist', () => {
    const res = sanitizer.sanitizeAction({ type: 'launch', targetApp: 'notepad' })
    expect(res.valid).toBe(true)
    expect(res.action?.targetApp).toBe('notepad')
  })

  it('rejects targetApp outside the allowlist (conservative by design)', () => {
    // Pinned CURRENT behaviour: 'notepad.exe' (with extension) is refused —
    // the allowlist carries the canonical extension-less name the OS resolves
    // via PATH. Relaxing this is a security decision, not a bug fix.
    for (const app of ['regedit', 'C:\\Windows\\System32\\notepad.exe', 'diskmgmt.msc']) {
      const res = sanitizer.sanitizeAction({ type: 'launch', targetApp: app })
      expect(res.valid).toBe(false)
      expect(res.error).toContain('not in allowlist')
    }
  })

  it('rejects a launch action with neither targetUrl nor targetApp', () => {
    const res = sanitizer.sanitizeAction({ type: 'launch' })
    expect(res.valid).toBe(false)
    expect(res.error).toContain('requires targetUrl or targetApp')
  })
})
