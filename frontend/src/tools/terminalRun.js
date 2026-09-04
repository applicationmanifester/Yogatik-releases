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

import { parseTerminalDiagnostics } from './terminalDiagnostics'

// Command shapes that almost always start a PERSISTENT process — a dev
// server, a watch-mode build, a REPL-style long-running daemon — rather than
// something that exits on its own. Calling this tool on one of them is a real,
// observed failure mode: the command works fine (the server starts, the port
// is live), but terminal_run still WAITS for it to exit, so both the agent
// and the user sit blocked for the full timeout with nothing to show for it.
// This is deliberately a heuristic that only SHORTENS the default timeout
// (see waitMs below), never a refusal — a one-shot script that happens to be
// named "dev" or "start" still runs and finishes exactly as before; only a
// command that genuinely never exits gets killed sooner, with a clearer
// reason, instead of after the full 5-minute default.
export const LONG_RUNNING_RE = /\b(npm|yarn|pnpm|bun)\s+(run\s+)?(dev|start|serve|watch)\b|\bvite\b(?!\s+build)|\bnext\s+dev\b|\bnodemon\b|\bwebpack(-dev-server)?\s+serve\b|\bng\s+serve\b|\bflask\s+run\b|\brails\s+s(erver)?\b|\bpython3?\s+-m\s+http\.server\b|\bhttp-server\b|\blive-server\b|\bwrangler\s+dev\b|\bfirebase\s+(serve|emulators:start)\b|\buvicorn\b.*--reload\b|\bgunicorn\b(?!.*--daemon)/i

export const terminalRunTool = {
  schema: {
    description:
      'Execute a terminal CLI command in this chat’s primary working folder. ' +
      'Use to run tests (npm test), build projects, check git status, or execute scripts. ' +
      'Returns stdout, stderr, exit code, and structured compiler/test diagnostics. ' +
      'It WAITS for the command to finish (default timeout 5 minutes), so it is the wrong tool ' +
      'for anything long-running: use proc_start for dev servers, watch-mode tests and streaming ' +
      'builds — a command like "npm run dev" that starts a server and never exits will simply be ' +
      'killed once the timeout is reached, wasting the wait. Needs a working folder granted for ' +
      'this chat — if none is bound, ask the user to add one instead of concluding you cannot run ' +
      'commands. Desktop app only.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The exact CLI command string to run.' },
        cwd: { type: 'string', description: 'Optional relative path for working directory.' },
        timeout: { type: 'number', description: 'Optional timeout in milliseconds (default 300000 / 5 minutes).' },
        timeout_ms: { type: 'number', description: 'Alias for timeout.' },
        shell: { type: 'string', description: 'Optional shell: "auto" (default, auto-detects PowerShell/cmd/bash), "powershell", "cmd", or "bash".' },
        env: { type: 'object', description: 'Optional extra environment variables for this command.' },
      },
      required: ['command'],
    },
  },
  async execute(args = {}, opts = {}) {
    const command = args.command ?? args.cmd ?? args.CommandLine ?? args.script ?? args.exec
    const cwd = args.cwd ?? args.Cwd ?? args.directory ?? args.dir
    const timeout = args.timeout ?? args.timeout_ms ?? args.timeoutMs ?? args.WaitMsBeforeAsync
    const shell = args.shell ?? args.Shell ?? args.shell_type ?? args.ShellType ?? 'auto'
    const env = args.env

    if (!command || typeof command !== 'string' || !command.trim()) {
      return { success: false, error: 'command is required (e.g. { command: "npm test" })' }
    }
    if (!isDesktop()) {
      return { success: false, error: 'Terminal execution runs only in the Yogatik desktop app.' }
    }
    const bridge = typeof window !== 'undefined' ? window.__YOGATIK_TERMINAL__ : null
    if (!bridge?.exec) {
      return { success: false, error: 'Terminal bridge is unavailable in this environment.' }
    }

    // An explicit timeout from the model always wins — it may deliberately
    // want to wait longer (or, after being told about the shorter default
    // below, shorter still). Only when NOTHING was specified do we shorten
    // the wait for a command shape that looks like it starts a server rather
    // than exiting on its own — the whole point being a fast, actionable
    // answer instead of a 5-minute block for a result that was foretold by
    // the command itself.
    const explicitTimeout = Number(timeout) || 0
    const looksPersistent = !explicitTimeout && LONG_RUNNING_RE.test(command)
    const waitMs = explicitTimeout || (looksPersistent ? 12000 : 300000)
    const startedAt = Date.now()
    try {
      const res = await bridge.exec(command, {
        cwd,
        timeout: waitMs,
        shell,
        // The ctx MUST come from the chat that issued this command, never from
        // the ambient "active chat". Two chats can stream at once (aborters and
        // loadingMap are both keyed by clientId), and the ambient slot holds
        // whichever entered LAST — so resolving the ambient context here ran
        // chat A's shell command inside chat B's folder. Explicit ctx wins;
        // ambient remains the fallback for UI callers, where only one chat is
        // ever active.
        ctx: getWorkspaceCtx(opts?.ctx),
        env: { ...NON_INTERACTIVE_ENV, ...(env && typeof env === 'object' ? env : {}) },
      })
      // A PRE-FLIGHT failure (no working folder bound, bad cwd, spawn error) —
      // the command never ran at all. The bridge's `terminal:exec` handler
      // reports this via `error`, with exitCode left `null`, NOT `-1` (that
      // was true of an older, since-replaced implementation; this comment
      // used to describe exitCode -1 as "never started", which stopped being
      // accurate the moment terminal:exec was rewritten to delegate to the
      // shared runBlock — checking exitCode alone would let a genuine
      // pre-flight failure like "No working folder for this chat" fall
      // through to the generic success branch below and get silently
      // reported as an empty-output SUCCESS). Check the real signal instead.
      if (res?.error) {
        return { success: false, error: res.error }
      }
      // exitCode -1 (with no `error`) means the opposite of "never started":
      // the command WAS running, got force-killed after the timeout, and
      // still had not confirmed it actually exited within the extra grace
      // period — a real possibility especially on Windows, where the kill is
      // itself a fire-and-forget spawn. Reporting this as "could not be
      // started" would be flatly false, and dangerous for a persistent
      // process (a dev server, a stray build) that might still be running.
      if (res?.exitCode === -1) {
        return {
          success: false,
          error: `The command was force-killed after ${waitMs}ms but did not confirm it exited — ` +
            'it may have been a persistent process (a server, watcher, or similar) that is still ' +
            'running. Use proc_start for anything long-running instead, so it can be stopped cleanly.',
          killed: true,
        }
      }
      // A non-zero exit is a RESULT, not a tool failure: the card should show the
      // real stdout/stderr instead of an error card with nothing in it.
      const rawStdout = stripAnsi(res?.stdout || '')
      const rawStderr = stripAnsi(res?.stderr || '')
      const combined = rawStdout + '\n' + rawStderr
      const diagnostics = parseTerminalDiagnostics(combined)

      let suggestion = undefined
      if (res?.exitCode !== 0 && /is not recognized as an internal or external command/i.test(combined)) {
        suggestion = 'Command was unrecognized by cmd.exe. Try running with { shell: "powershell" } or using PowerShell syntax.'
      }

      return {
        success: true,
        tool: 'terminal_run',
        command,
        cwd: cwd || '.',
        shell: res?.shell,
        exitCode: res?.exitCode,
        stdout: rawStdout || '(no output)',
        stderr: rawStderr,
        diagnostics: diagnostics.length ? diagnostics : undefined,
        suggestion,
        durationMs: Date.now() - startedAt,
        killed: res?.killed || false,
        ...(res?.killed ? {
          note: looksPersistent
            ? `Killed after ${waitMs}ms — this command looks like it starts a persistent process ` +
              '(a dev server, watch-mode build, or similar) rather than exiting on its own. Use ' +
              'proc_start to run it in the background, then proc_output to read its output as it ' +
              'starts up (e.g. to confirm the port it is listening on).'
            : `Timed out after ${waitMs}ms and was killed. Use proc_start for long-running commands.`,
        } : {}),
      }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  },
}
