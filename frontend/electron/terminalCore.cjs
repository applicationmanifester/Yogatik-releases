// The shared terminal timeline — model and transforms. PURE: no electron, no
// child_process, no clock of its own (every function that needs `now` is handed
// it). Same split as rootsCore / browserTree / watchFilter / entitlementCore,
// and the only reason any of this is testable under vitest.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A TIMELINE OF BLOCKS AND NOT A SHARED SHELL
//
// The obvious design is one PTY that both the agent and the human type into.
// It is also the fragile one:
//
//   • Knowing when a command FINISHED means parsing the shell prompt, or
//     wiring OSC 133 shell integration into whatever shell the user has. That
//     is exactly why terminal_run uses a clean spawn — an exit code is a fact,
//     a prompt heuristic is a guess that is wrong on the day it matters.
//   • An agent `cd` would silently move the human's working directory, and vice
//     versa. Two authors, one mutable cwd, no way to reason about either.
//   • A half-typed human line and a streaming agent command share one stdin.
//
// So: ONE TIMELINE, SEPARATE PROCESSES. Every block records who ran it. The
// human can interrupt an agent's block or re-run it as their own, which is the
// part of "shared" that people actually want, without any of the above.

const { createRingBuffer } = require('./procCore.cjs')

/** Output kept per block. Beyond this the head is dropped and the block says so. */
const MAX_BLOCK_CHARS = 200_000
/** Blocks kept per chat. A long session must not grow until the app dies. */
const MAX_BLOCKS = 200

const AUTHOR = {
  AGENT: 'agent',   // the model, via terminal_run
  USER: 'user',     // typed into the drawer
  SYSTEM: 'system', // notices from the app itself (session started, folder changed)
}

const STATUS = {
  RUNNING: 'running',
  EXITED: 'exited',
  KILLED: 'killed',
  FAILED: 'failed',   // never started: bad cwd, missing shell, no grant
}

function createSession(chatId) {
  return { chatId: String(chatId ?? ''), blocks: [], seq: 0 }
}

/**
 * Start a block. The caller owns the process; this only records it.
 * `id` is supplied rather than generated so the impure layer can tie it to the
 * thing it spawned without this module needing a clock or a counter it cannot
 * reproduce in a test.
 */
function beginBlock(session, { id, author, command, cwd, now, meta = null }) {
  const block = {
    id: String(id),
    seq: ++session.seq,
    author: AUTHOR[String(author || '').toUpperCase()] || AUTHOR.USER,
    command: String(command ?? ''),
    cwd: cwd || null,
    startedAt: now,
    endedAt: null,
    exitCode: null,
    status: STATUS.RUNNING,
    out: createRingBuffer(MAX_BLOCK_CHARS),
    meta,
  }
  session.blocks.push(block)
  // Prune from the FRONT and never a running block: dropping a block whose
  // process is still writing would leave output arriving for a row the UI has
  // already forgotten, which renders as nothing at all.
  while (session.blocks.length > MAX_BLOCKS) {
    const i = session.blocks.findIndex(b => b.status !== STATUS.RUNNING)
    if (i === -1) break
    session.blocks.splice(i, 1)
  }
  return block
}

function findBlock(session, id) {
  return session.blocks.find(b => b.id === String(id)) || null
}

function appendOutput(session, id, chunk) {
  const b = findBlock(session, id)
  if (!b || !chunk) return null
  b.out.push(String(chunk))
  return b
}

function finishBlock(session, id, { exitCode = null, killed = false, error = null, now }) {
  const b = findBlock(session, id)
  if (!b || b.status !== STATUS.RUNNING) return null
  b.endedAt = now
  b.exitCode = exitCode
  if (error) { b.status = STATUS.FAILED; b.error = error }
  else if (killed) b.status = STATUS.KILLED
  else b.status = STATUS.EXITED
  return b
}

/**
 * The renderer shape. The ring buffer is a closure and cannot cross IPC, so
 * this is where it becomes text — forgetting that is how a panel ends up
 * rendering "[object Object]", which this codebase has already done once with
 * the PTY payload.
 */
function serializeBlock(b, { withOutput = true } = {}) {
  if (!b) return null
  return {
    id: b.id,
    seq: b.seq,
    author: b.author,
    command: b.command,
    cwd: b.cwd,
    startedAt: b.startedAt,
    endedAt: b.endedAt,
    exitCode: b.exitCode,
    status: b.status,
    error: b.error || null,
    durationMs: b.endedAt && b.startedAt ? b.endedAt - b.startedAt : null,
    truncated: b.out.truncated(),
    ...(withOutput ? { output: b.out.text() } : {}),
  }
}

/** The whole timeline, newest last — what the drawer renders when it opens. */
function serializeSession(session, { limit = MAX_BLOCKS } = {}) {
  const blocks = session.blocks.slice(-limit).map(b => serializeBlock(b))
  return { chatId: session.chatId, blocks }
}

/**
 * A non-zero exit code is a RESULT, not a failure of the tool.
 * CLAUDE.md records terminal_run returning success:false with no `error`, so a
 * missing folder, a bad cwd and a failing test all printed as
 * "terminal_run: Unknown error". Only "never started" is an error.
 */
function isToolFailure(block) {
  return !block || block.status === STATUS.FAILED
}

/** One-line summary for the collapsed row. */
function summarize(b) {
  if (!b) return ''
  if (b.status === STATUS.RUNNING) return 'running…'
  if (b.status === STATUS.FAILED) return b.error || 'did not start'
  if (b.status === STATUS.KILLED) return 'stopped'
  return b.exitCode === 0 ? 'ok' : `exit ${b.exitCode}`
}

module.exports = {
  AUTHOR, STATUS, MAX_BLOCKS, MAX_BLOCK_CHARS,
  createSession, beginBlock, findBlock, appendOutput, finishBlock,
  serializeBlock, serializeSession, isToolFailure, summarize,
}
