// The shared terminal timeline. terminalCore is pure, so the model and its
// invariants are testable here; the process handling in terminalSession is not.
//
// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const require_ = createRequire(import.meta.url)
const core = require_('../electron/terminalCore.cjs')
const entitlement = require_('../electron/entitlementCore.cjs')

const NOW = 1_760_000_000_000
let s

beforeEach(() => { s = core.createSession('chat-1') })

const start = (over = {}) => core.beginBlock(s, {
  id: 'b1', author: 'agent', command: 'npm test', cwd: '/repo', now: NOW, ...over,
})

describe('blocks', () => {
  it('records who ran it — the point of the whole surface', () => {
    start({ id: 'a', author: 'agent' })
    start({ id: 'u', author: 'user' })
    expect(core.findBlock(s, 'a').author).toBe('agent')
    expect(core.findBlock(s, 'u').author).toBe('user')
    // An unknown author must not silently become 'agent': mislabelling who ran
    // a command is worse than not labelling it.
    start({ id: 'x', author: 'wat' })
    expect(core.findBlock(s, 'x').author).toBe('user')
  })

  it('streams output into the block and reports it as text', () => {
    start()
    core.appendOutput(s, 'b1', 'hello ')
    core.appendOutput(s, 'b1', 'world')
    // The ring buffer is a CLOSURE and cannot cross IPC. Forgetting to
    // serialize it is how a panel ends up rendering "[object Object]" — which
    // this codebase has already done once, with the PTY payload.
    const out = core.serializeBlock(core.findBlock(s, 'b1'))
    expect(out.output).toBe('hello world')
    expect(typeof out.output).toBe('string')
    expect(out.out).toBeUndefined()
  })

  it('treats a non-zero exit as a RESULT, not a tool failure', () => {
    // CLAUDE.md: terminal_run used to return success:false with no `error`, so
    // a missing folder, a bad cwd and a failing test all printed as
    // "terminal_run: Unknown error".
    start()
    core.finishBlock(s, 'b1', { exitCode: 1, now: NOW + 500 })
    const b = core.findBlock(s, 'b1')
    expect(b.status).toBe(core.STATUS.EXITED)
    expect(core.isToolFailure(b)).toBe(false)
    expect(core.summarize(b)).toBe('exit 1')

    start({ id: 'b2' })
    core.finishBlock(s, 'b2', { error: 'No working folder for this chat.', now: NOW })
    expect(core.isToolFailure(core.findBlock(s, 'b2'))).toBe(true)
  })

  it('distinguishes stopped from exited', () => {
    start()
    core.finishBlock(s, 'b1', { exitCode: null, killed: true, now: NOW + 100 })
    expect(core.findBlock(s, 'b1').status).toBe(core.STATUS.KILLED)
    expect(core.summarize(core.findBlock(s, 'b1'))).toBe('stopped')
  })

  it('finishes a block only once', () => {
    // The timeout kill and the process close race by design: the backstop
    // exists precisely because `close` may never come. Both paths call finish.
    start()
    core.finishBlock(s, 'b1', { exitCode: 0, now: NOW + 10 })
    expect(core.finishBlock(s, 'b1', { exitCode: 137, now: NOW + 99 })).toBeNull()
    expect(core.findBlock(s, 'b1').exitCode).toBe(0)
  })

  it('computes a duration only once the block has ended', () => {
    start()
    expect(core.serializeBlock(core.findBlock(s, 'b1')).durationMs).toBeNull()
    core.finishBlock(s, 'b1', { exitCode: 0, now: NOW + 1500 })
    expect(core.serializeBlock(core.findBlock(s, 'b1')).durationMs).toBe(1500)
  })
})

describe('pruning', () => {
  it('never evicts a RUNNING block', () => {
    // Output would keep arriving for a row the UI has forgotten, and the Stop
    // button — the only way to interrupt an agent command — would vanish.
    core.beginBlock(s, { id: 'live', author: 'agent', command: 'npm run dev', now: NOW })
    for (let i = 0; i < core.MAX_BLOCKS + 20; i++) {
      core.beginBlock(s, { id: `f${i}`, author: 'user', command: 'ls', now: NOW })
      core.finishBlock(s, `f${i}`, { exitCode: 0, now: NOW })
    }
    expect(s.blocks.length).toBeLessThanOrEqual(core.MAX_BLOCKS)
    expect(core.findBlock(s, 'live')).toBeTruthy()
    expect(core.findBlock(s, 'live').status).toBe(core.STATUS.RUNNING)
  })

  it('drops the OLDEST finished block, not the newest', () => {
    for (let i = 0; i < core.MAX_BLOCKS + 5; i++) {
      core.beginBlock(s, { id: `f${i}`, author: 'user', command: 'ls', now: NOW })
      core.finishBlock(s, `f${i}`, { exitCode: 0, now: NOW })
    }
    expect(core.findBlock(s, 'f0')).toBeNull()
    expect(core.findBlock(s, `f${core.MAX_BLOCKS + 4}`)).toBeTruthy()
  })
})

describe('wiring', () => {
  const PRELOAD = fs.readFileSync(path.join(HERE, '..', 'electron', 'preload.cjs'), 'utf8')

  it('exposes every terminal channel through preload AND classifies it', () => {
    // A handler missing from preload is "Unknown command" (how fs_find_files
    // shipped dead); one missing from the entitlement matrix FAILS CLOSED and
    // is unreachable even for a paying user.
    for (const ch of [
      'terminal:session', 'terminal:run', 'terminal:stop', 'terminal:clear',
      'terminal:attach', 'terminal:pty-write', 'terminal:pty-resize', 'terminal:pty-kill',
    ]) {
      expect(PRELOAD, ch).toContain(ch)
      expect(entitlement.capabilityFor(ch), ch).toBeTruthy()
    }
  })

  it('gates the human terminal exactly as hard as the agent one', () => {
    // It is the same shell, on the same machine, in the same folder. Reading
    // the timeline is gated too — it holds the output of commands that ran.
    for (const ch of ['terminal:run', 'terminal:session', 'terminal:exec', 'terminal:attach']) {
      expect(entitlement.isAllowed(ch, entitlement.STATE.LOCKED), ch).toBe(false)
      expect(entitlement.isAllowed(ch, entitlement.STATE.PRO), ch).toBe(true)
    }
  })
})
