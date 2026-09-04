// The shared terminal — one timeline per chat, written by BOTH the agent and
// the human. terminalCore.cjs holds the model; this file owns the processes,
// the streaming and the IPC.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS REPLACES
//
// Before: `terminal:exec` collected stdout and stderr and forwarded NONE of it
// until the process closed, so a 30-second command was a spinner and then a
// card. The human could not watch it, could not stop it, and could not see
// anything the agent had run before they opened the panel. Meanwhile
// TerminalPanel spawned its own private PTY, killed it on close (losing cwd,
// env and any running process), and knew nothing about the agent at all.
//
// After: every command — agent or human — is a BLOCK in one per-chat timeline
// that streams as it runs.
//
// TWO TIERS, deliberately, mirroring the vision/capture pattern already in the
// app:
//   1. `run`    — clean spawn. No native dependency, works everywhere, gives a
//                 real exit code, and covers git/npm/builds/tests.
//   2. `attach` — node-pty, only if it is installed. For REPLs, prompts and
//                 full-screen TUIs, which tier 1 genuinely cannot do.
// Tier 1 is not a fallback for tier 2; it is the primary path.

const { ipcMain } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const core = require('./terminalCore.cjs')
const { rootPathsFor, resolvePath } = require('./roots.cjs')
const { safeSend } = require('./safeWindow.cjs')
const { killTree } = require('./procKill.cjs')

const sessions = new Map()   // chatId -> session
const live = new Map()       // blockId -> { child, chatId, timer, backstop, finish }
let seq = 0

/* ── streaming ──────────────────────────────────────────────────────────── */

let getWindow = null

function send(channel, payload) {
  // safeSend, not an isDestroyed() check: the window and its webContents are
  // separate native objects, and the webContents is torn down FIRST — so there
  // is a real window during quit where !isDestroyed() is true and reading
  // .webContents throws "Object has been destroyed".
  safeSend(getWindow?.(), channel, payload)
}

function sessionFor(chatId) {
  const key = String(chatId ?? '')
  if (!sessions.has(key)) sessions.set(key, core.createSession(key))
  return sessions.get(key)
}

/**
 * Output is streamed COALESCED, not per chunk. A build emits thousands of
 * small writes; one IPC message each would flood the renderer exactly the way
 * the un-batched fs watcher did, and for the same reason it is fixed the same
 * way — one message per frame-ish window.
 */
const FLUSH_MS = 60
const pendingOut = new Map()   // blockId -> { chatId, text, timer }

function streamOutput(chatId, blockId, chunk) {
  core.appendOutput(sessionFor(chatId), blockId, chunk)
  const p = pendingOut.get(blockId) || { chatId, text: '', timer: null }
  p.text += chunk
  if (!p.timer) {
    p.timer = setTimeout(() => {
      const cur = pendingOut.get(blockId)
      pendingOut.delete(blockId)
      if (cur) send('terminal:output', { chatId: cur.chatId, blockId, chunk: cur.text })
    }, FLUSH_MS)
    p.timer.unref?.()
  }
  pendingOut.set(blockId, p)
}

function flushOutput(blockId) {
  const p = pendingOut.get(blockId)
  if (!p) return
  clearTimeout(p.timer)
  pendingOut.delete(blockId)
  if (p.text) send('terminal:output', { chatId: p.chatId, blockId, chunk: p.text })
}

/* ── killing a tree, not a shell — see procKill.cjs, shared with proc_stop ── */

/* ── tier 1: run one command as a block ─────────────────────────────────── */

/**
 * @returns {Promise<object>} the serialized block, when it finishes.
 * Never rejects: a tool that throws across IPC arrives as "Error invoking
 * remote method", which the model cannot act on.
 */
function runBlock({ ctx, command, cwd, author, timeout = 30000, env: extraEnv }) {
  const chatId = String(ctx?.conversationId ?? '')
  const session = sessionFor(chatId)
  const id = `blk_${Date.now().toString(36)}_${++seq}`

  const fail = (error) => {
    const b = core.beginBlock(session, { id, author, command, cwd: null, now: Date.now() })
    core.finishBlock(session, id, { error, now: Date.now() })
    const s = core.serializeBlock(b)
    send('terminal:block', { chatId, block: s })
    return Promise.resolve(s)
  }

  const roots = rootPathsFor(ctx)
  if (!roots.length) return fail('No working folder for this chat. Ask the user to add one.')

  let workingDir
  try { workingDir = resolvePath(ctx, cwd || '.') } catch (e) {
    return fail(`Invalid working directory: ${e.message}`)
  }

  const block = core.beginBlock(session, { id, author, command, cwd: workingDir, now: Date.now() })
  // Announce the block BEFORE the first byte, or the drawer shows nothing at
  // all for the first slow command and the user assumes it is broken.
  send('terminal:block', { chatId, block: core.serializeBlock(block) })

  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    const shellCmd = isWin ? 'cmd.exe' : '/bin/sh'
    const shellArgs = isWin ? ['/d', '/s', '/c', command] : ['-c', command]

    let child
    try {
      child = spawn(shellCmd, shellArgs, {
        cwd: workingDir,
        windowsHide: true,
        // POSIX: its own process GROUP, so the whole tree can be killed.
        detached: !isWin,
        env: {
          ...process.env,
          // Without these a command that wants input blocks on a prompt with no
          // terminal to show it, and the only symptom is a hang until the kill.
          CI: '1', GIT_TERMINAL_PROMPT: '0', PAGER: 'cat', GIT_PAGER: 'cat',
          npm_config_yes: 'true',
          ...(extraEnv && typeof extraEnv === 'object' ? extraEnv : {}),
        },
      })
    } catch (e) { resolve(fail(e.message)); return }

    let settled = false
    let killed = false

    const finish = ({ exitCode = null, error = null }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(backstop)
      live.delete(id)
      flushOutput(id)
      core.finishBlock(session, id, { exitCode, killed, error, now: Date.now() })
      const s = core.serializeBlock(session.blocks.find(b => b.id === id))
      send('terminal:block', { chatId, block: s })
      resolve(s)
    }

    const timer = setTimeout(() => { killed = true; killTree(child) }, timeout)
    // If a grandchild we failed to kill still holds the pipes, `close` never
    // arrives. Answer anyway with what was captured: a partial result is
    // recoverable, a promise that never settles takes the whole turn with it.
    const backstop = setTimeout(() => finish({ exitCode: -1 }), timeout + 5000)
    backstop.unref?.()

    live.set(id, { child, chatId, kill: () => { killed = true; killTree(child) } })

    child.stdout?.on('data', d => streamOutput(chatId, id, d.toString('utf8')))
    child.stderr?.on('data', d => streamOutput(chatId, id, d.toString('utf8')))
    child.on('error', e => finish({ error: e.message }))
    child.on('close', code => finish({ exitCode: code }))
  })
}

/** Stop one running block. This is what makes an agent command interruptible. */
function stopBlock(id) {
  const l = live.get(String(id))
  if (!l) return { success: false, error: 'That command is not running.' }
  l.kill()
  return { success: true, id: String(id) }
}

/* ── tier 2: an interactive PTY, only if node-pty is installed ──────────── */

let ptyMod = null
let ptyTried = false
const ptySessions = new Map()   // chatId -> { proc, id }

function loadPty() {
  if (ptyTried) return ptyMod
  ptyTried = true
  try { ptyMod = require('node-pty') } catch { ptyMod = null }
  return ptyMod
}

function attachPty({ ctx, cols = 80, rows = 24, shell }) {
  const mod = loadPty()
  if (!mod) {
    return {
      success: false,
      available: false,
      // Honest, and it names the tier that DOES work rather than reading as
      // "the terminal is broken".
      error: 'Interactive shell unavailable — node-pty is not installed. Commands still run normally; only REPLs and full-screen programs need this.',
    }
  }
  const chatId = String(ctx?.conversationId ?? '')
  const existing = ptySessions.get(chatId)
  // A session SURVIVES the drawer closing. The old panel killed its PTY on
  // unmount, so closing the terminal threw away the cwd, the environment and
  // anything still running in it.
  if (existing) return { success: true, id: existing.id, reused: true, cwd: existing.cwd }

  const root = rootPathsFor(ctx)[0]
  if (!root) return { success: false, error: 'No working folder for this chat. Add one first.' }

  const shellCmd = shell || (process.platform === 'win32'
    ? 'powershell.exe'
    : (process.env.SHELL || '/bin/bash'))
  try {
    const proc = mod.spawn(shellCmd, [], {
      name: 'xterm-color', cols, rows, cwd: root, env: process.env,
    })
    const id = `pty_${chatId}_${++seq}`
    proc.onData(data => send('terminal:pty-data', { chatId, id, data: String(data ?? '') }))
    proc.onExit(({ exitCode }) => {
      ptySessions.delete(chatId)
      send('terminal:pty-exit', { chatId, id, exitCode })
    })
    ptySessions.set(chatId, { proc, id, cwd: root })
    return { success: true, id, shell: shellCmd, cwd: root }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

/* ── IPC ────────────────────────────────────────────────────────────────── */

function registerTerminalSession(getWindowFn) {
  getWindow = getWindowFn

  // The whole timeline for a chat — what the drawer renders on open, including
  // everything the agent ran before it was opened.
  ipcMain.handle('terminal:session', (_e, { ctx } = {}) => ({
    success: true,
    ...core.serializeSession(sessionFor(ctx?.conversationId)),
    ptyAvailable: Boolean(loadPty()),
  }))

  // A command the HUMAN typed. Same path as the agent's, so both land in the
  // same timeline with the same semantics — that is the whole point.
  ipcMain.handle('terminal:run', async (_e, { ctx, command, cwd, timeout } = {}) => {
    if (!String(command || '').trim()) return { success: false, error: 'No command given.' }
    const block = await runBlock({
      ctx, command, cwd, author: core.AUTHOR.USER,
      // A human watching their own command should not have it shot at 30s.
      timeout: Number(timeout) || 600000,
    })
    return { success: !core.isToolFailure(block), block }
  })

  ipcMain.handle('terminal:stop', (_e, { id } = {}) => stopBlock(id))

  ipcMain.handle('terminal:clear', (_e, { ctx } = {}) => {
    const s = sessionFor(ctx?.conversationId)
    // Never discard a running block: output would keep arriving for a row the
    // UI has forgotten, and the Stop button would vanish with it.
    s.blocks = s.blocks.filter(b => b.status === core.STATUS.RUNNING)
    return { success: true, ...core.serializeSession(s) }
  })

  ipcMain.handle('terminal:attach', (_e, { ctx, cols, rows, shell } = {}) =>
    attachPty({ ctx, cols, rows, shell }))

  ipcMain.handle('terminal:pty-write', (_e, { ctx, data } = {}) => {
    const s = ptySessions.get(String(ctx?.conversationId ?? ''))
    if (!s) return { success: false, error: 'No interactive session.' }
    try { s.proc.write(String(data ?? '')); return { success: true } } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('terminal:pty-resize', (_e, { ctx, cols, rows } = {}) => {
    const s = ptySessions.get(String(ctx?.conversationId ?? ''))
    if (!s) return { success: false, error: 'No interactive session.' }
    try { s.proc.resize(cols, rows); return { success: true } } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('terminal:pty-kill', (_e, { ctx } = {}) => {
    const key = String(ctx?.conversationId ?? '')
    const s = ptySessions.get(key)
    if (!s) return { success: false, error: 'No interactive session.' }
    try { s.proc.kill() } catch { /* already gone */ }
    ptySessions.delete(key)
    return { success: true }
  })
}

function stopAllTerminals() {
  for (const l of live.values()) { try { l.kill() } catch { /* ignore */ } }
  live.clear()
  for (const s of ptySessions.values()) { try { s.proc.kill() } catch { /* ignore */ } }
  ptySessions.clear()
}

module.exports = {
  registerTerminalSession, stopAllTerminals,
  runBlock, stopBlock, sessionFor, killTree,
  _sessions: sessions, _live: live,
}
