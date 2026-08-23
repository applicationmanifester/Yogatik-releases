/**
 * terminal_run — the ONE shell tool.
 *
 * There used to be two: terminal_run and terminal_exec, both registered, both
 * scored ~200 for shell-ish phrasing, both talking to the same IPC handler. The
 * model had to choose between two near-identical descriptions every turn and one
 * of them wasted a slot in the per-request tool budget. terminal_exec's extras —
 * a non-interactive env, ANSI stripping and a duration — are folded in here, and
 * the name survives as an alias.
 */

import { isDesktop, getWorkspaceCtx, stripAnsi } from './localFs'

// Commands that block on a prompt hang until the 30s kill, so tell the tools
// that read these that nobody is watching.
const NON_INTERACTIVE_ENV = {
  CI: 'true',
  PAGER: 'cat',
  GIT_TERMINAL_PROMPT: '0',
  DEBIAN_FRONTEND: 'noninteractive',
}

export const terminalRunTool = {
  schema: {
    description:
      'Execute a terminal CLI command in this chat’s primary working folder. ' +
      'Use to run tests (npm test), build projects, check git status, or execute scripts. ' +
      'Returns stdout, stderr, and exit code. ' +
      'It WAITS for the command to finish and times out (default 30s), so it is the wrong tool ' +
      'for anything long-running: use proc_start for dev servers, watch-mode tests and streaming ' +
      'builds. Needs a working folder granted for this chat — if none is bound, ask the user to ' +
      'add one instead of concluding you cannot run commands. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The exact CLI command string to run.' },
        cwd: { type: 'string', description: 'Optional relative path for working directory.' },
        timeout: { type: 'number', description: 'Optional timeout in milliseconds (default 30000).' },
        timeout_ms: { type: 'number', description: 'Alias for timeout.' },
        env: { type: 'object', description: 'Optional extra environment variables for this command.' },
      },
      required: ['command'],
    },
  },
  async execute({ command, cwd, timeout, timeout_ms, env } = {}) {
    if (!command || typeof command !== 'string' || !command.trim()) {
      return { success: false, error: 'command is required' }
    }
    if (!isDesktop()) {
      return { success: false, error: 'Terminal execution runs only in the Yogatik desktop app.' }
    }
    const bridge = typeof window !== 'undefined' ? window.__YOGATIK_TERMINAL__ : null
    if (!bridge?.exec) {
      return { success: false, error: 'Terminal bridge is unavailable in this environment.' }
    }

    const waitMs = Number(timeout ?? timeout_ms) || 30000
    const startedAt = Date.now()
    try {
      const res = await bridge.exec(command, {
        cwd,
        timeout: waitMs,
        ctx: getWorkspaceCtx(),
        env: { ...NON_INTERACTIVE_ENV, ...(env && typeof env === 'object' ? env : {}) },
      })
      // exitCode -1 means the command never STARTED (no working folder bound, bad
      // cwd, spawn error). That is a real tool failure and needs an `error` field —
      // without one the log only ever said "terminal_run: Unknown error".
      if (res?.exitCode === -1) {
        return { success: false, error: res.stderr || 'The command could not be started.' }
      }
      // A non-zero exit is a RESULT, not a tool failure: the card should show the
      // real stdout/stderr instead of an error card with nothing in it.
      return {
        success: true,
        tool: 'terminal_run',
        command,
        cwd: cwd || '.',
        exitCode: res?.exitCode,
        stdout: stripAnsi(res?.stdout || '') || '(no output)',
        stderr: stripAnsi(res?.stderr || ''),
        durationMs: Date.now() - startedAt,
        killed: res?.killed || false,
        ...(res?.killed ? { note: `Timed out after ${waitMs}ms and was killed. Use proc_start for long-running commands.` } : {}),
      }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  },
}
