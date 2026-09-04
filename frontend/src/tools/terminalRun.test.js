/**
 * FIELD REPORT: the agent ran `npm run dev` via terminal_run. The dev server
 * started fine (Vite was live on :5173, visible in the terminal panel) — but
 * terminal_run WAITS for the process to exit, and a dev server never does, so
 * both the agent and the user sat blocked for terminal_run's default 5-minute
 * timeout with nothing to show for it. Its own schema even said so ("wrong
 * tool for anything long-running: use proc_start") — the model just picked
 * the wrong tool anyway, and there was nothing shortening the wait once it did.
 *
 * These tests pin the fix: a command that LOOKS like it starts a persistent
 * process gets a much shorter default timeout (fast, actionable failure)
 * unless the caller explicitly asked for a specific one — never a refusal, so
 * a one-shot script that happens to be named "dev" still runs normally.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { terminalRunTool, LONG_RUNNING_RE } from './terminalRun'

describe('LONG_RUNNING_RE', () => {
  const shouldMatch = [
    'npm run dev',
    'npm start',
    'yarn dev',
    'pnpm run dev',
    'cd app && npm run dev',
    'npx vite',
    'next dev',
    'nodemon server.js',
    'webpack serve',
    'ng serve',
    'flask run',
    'rails server',
    'rails s',
    'python -m http.server 8000',
    'http-server .',
    'firebase emulators:start',
    'wrangler dev',
    'uvicorn app:app --reload',
  ]
  for (const cmd of shouldMatch) {
    it(`flags "${cmd}" as likely persistent`, () => {
      expect(LONG_RUNNING_RE.test(cmd)).toBe(true)
    })
  }

  const shouldNotMatch = [
    'npm test',
    'npm run build',
    'npm install',
    'vite build',
    'git status',
    'ls -la',
    'python script.py',
    'gunicorn app:app --daemon',
  ]
  for (const cmd of shouldNotMatch) {
    it(`does NOT flag "${cmd}"`, () => {
      expect(LONG_RUNNING_RE.test(cmd)).toBe(false)
    })
  }
})

describe('terminalRunTool — long-running command handling', () => {
  afterEach(() => {
    delete window.__TAURI__
    delete window.__YOGATIK_TERMINAL__
  })

  function stubDesktop(exec) {
    window.__TAURI__ = { core: { invoke: vi.fn(async () => { throw new Error('Unknown command') }) } }
    window.__YOGATIK_TERMINAL__ = { exec }
  }

  it('shortens the default timeout for a detected dev-server command', async () => {
    // exitCode is null here — a process Node confirmed was killed by signal
    // reports a null exit code, not -1. -1 is reserved for the "force-killed
    // but never confirmed dead" case, covered separately below.
    const exec = vi.fn(async () => ({ success: true, exitCode: null, killed: true, stdout: 'VITE ready', stderr: '' }))
    stubDesktop(exec)
    const res = await terminalRunTool.execute({ command: 'npm run dev' })
    expect(exec.mock.calls[0][1].timeout).toBe(12000)
    expect(res.killed).toBe(true)
    expect(res.note).toMatch(/persistent process/i)
    expect(res.note).toMatch(/proc_start/)
  })

  it('an explicit timeout always overrides the heuristic', async () => {
    const exec = vi.fn(async () => ({ success: true, exitCode: 0, stdout: '', stderr: '' }))
    stubDesktop(exec)
    await terminalRunTool.execute({ command: 'npm run dev', timeout: 60000 })
    expect(exec.mock.calls[0][1].timeout).toBe(60000)
  })

  it('an ordinary command still gets the full 5-minute default', async () => {
    const exec = vi.fn(async () => ({ success: true, exitCode: 0, stdout: 'ok', stderr: '' }))
    stubDesktop(exec)
    await terminalRunTool.execute({ command: 'npm test' })
    expect(exec.mock.calls[0][1].timeout).toBe(300000)
  })

  it('a killed ordinary (non-persistent-looking) command keeps the generic note', async () => {
    const exec = vi.fn(async () => ({ success: true, exitCode: null, killed: true, stdout: '', stderr: '' }))
    stubDesktop(exec)
    const res = await terminalRunTool.execute({ command: 'npm test', timeout: 5000 })
    expect(res.note).toBe('Timed out after 5000ms and was killed. Use proc_start for long-running commands.')
  })
})

describe('terminalRunTool — pre-flight failure vs. force-killed-unconfirmed', () => {
  afterEach(() => {
    delete window.__TAURI__
    delete window.__YOGATIK_TERMINAL__
  })

  function stubDesktop(exec) {
    window.__TAURI__ = { core: { invoke: vi.fn(async () => { throw new Error('Unknown command') }) } }
    window.__YOGATIK_TERMINAL__ = { exec }
  }

  it('a genuine pre-flight failure (no working folder) is reported as an error, not a silent empty success', async () => {
    // This is what the real terminal:exec handler returns for a pre-flight
    // failure: exitCode null, an `error` string, stdout/stderr empty. Before
    // this fix, terminalRunTool only checked `exitCode === -1` for a
    // failure — which this is NOT — so it fell through to the generic
    // success branch and reported `success: true` with '(no output)',
    // silently hiding the real reason nothing ran.
    const exec = vi.fn(async () => ({ success: false, exitCode: null, error: 'No working folder for this chat. Ask the user to add one.', stdout: '', stderr: '' }))
    stubDesktop(exec)
    const res = await terminalRunTool.execute({ command: 'npm test' })
    expect(res.success).toBe(false)
    expect(res.error).toBe('No working folder for this chat. Ask the user to add one.')
  })

  it('exitCode -1 with no `error` means force-killed-but-unconfirmed, not "could not start"', async () => {
    // The backstop path: killed, but `close` never fired to confirm the
    // process actually died. Reporting this as "could not be started" would
    // be false — the command absolutely ran — and would hide that a
    // persistent process might still be alive.
    const exec = vi.fn(async () => ({ success: false, exitCode: -1, killed: true, stdout: 'partial output', stderr: '' }))
    stubDesktop(exec)
    const res = await terminalRunTool.execute({ command: 'some-stubborn-command' })
    expect(res.success).toBe(false)
    expect(res.error).not.toMatch(/could not be started/i)
    expect(res.error).toMatch(/force-killed/i)
    expect(res.error).toMatch(/still.*running/i)
    expect(res.killed).toBe(true)
  })
})
