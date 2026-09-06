// Entitlement core — the capability matrix, the licence token and the
// trial/grace/locked state machine. PURE: no electron, no disk, no network, no
// ambient clock (every function that needs `now` is handed it).
//
// That split is the only reason any of this is testable. vitest collects
// src/**/*.test.js and cannot load a module that require('electron') — the same
// constraint that produced rootsCore.cjs, browserTree.cjs and watchFilter.cjs.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS IS AND IS NOT
//
// This is a SPEED BUMP, not enforcement. app.asar is a zip, IndexedDB is a
// file, and the renderer is inspectable — anyone determined can bypass it in
// under an hour. That is the correct trade at ₹99/month, and it dictates where
// the effort goes: ONE auditable choke point that cannot silently regress, and
// a signature so a forged licence needs the private key rather than a text
// editor. It explicitly does NOT try to defeat asar repacking, a patched
// binary, or one person running several free accounts.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY A CAPABILITY SET AND NOT A LIST OF FILE TOOLS
//
// Gating fs_* alone is a hole you can drive a truck through:
//   terminal:exec with `cat`/`echo`  IS file access
//   proc_start                        is file access with extra steps
//   mcp-stdio:start                   spawns arbitrary local processes
//   pty:spawn                         is an interactive shell
// So the unit of gating is a capability, and EVERY channel reachable from
// preload.cjs is classified below. entitlement.test.js asserts the list is
// exhaustive: a new channel with no entry fails the suite, which is the only
// mechanism that stops the next capability shipping ungated.

const crypto = require('crypto')

/* ── tiers ──────────────────────────────────────────────────────────────── */

const TIER = {
  /** Gated. Requires trial, pro or grace. */
  PRO: 'pro',
  /** Web-parity. Available to everyone, always. */
  FREE: 'free',
  /**
   * Available even when locked, and DELIBERATELY so — gating it would break
   * something the user owns rather than something they are buying.
   */
  FREE_ALWAYS: 'free_always',
}

const CAP = {
  FILES: 'files',           // read/write/search the disk
  SHELL: 'shell',           // run commands and processes
  BROWSER: 'browser',       // drive a real browsing context
  CONTROL: 'control',       // see and act on the screen / other apps
  AUTOMATION: 'automation', // unattended work that reaches the above
}

/** Human wording per capability, used by the refusal the MODEL reads. */
const CAP_LABEL = {
  [CAP.FILES]: 'file access',
  [CAP.SHELL]: 'shell and process access',
  [CAP.BROWSER]: 'the built-in browser',
  [CAP.CONTROL]: 'screen and input control',
  [CAP.AUTOMATION]: 'background automation',
}

/* ── the matrix ─────────────────────────────────────────────────────────── */

const P = (cap) => ({ tier: TIER.PRO, capability: cap })
const F = { tier: TIER.FREE, capability: null }
const FA = { tier: TIER.FREE_ALWAYS, capability: null }

const CHANNELS = {
  /* ── files: the product being sold ─────────────────────────────────── */
  fs_grant: P(CAP.FILES), fs_granted_root: P(CAP.FILES), fs_clear_grant: P(CAP.FILES),
  fs_list: P(CAP.FILES), fs_read: P(CAP.FILES), fs_write: P(CAP.FILES),
  fs_edit: P(CAP.FILES), fs_search: P(CAP.FILES), fs_find_files: P(CAP.FILES),
  fs_delete: P(CAP.FILES), fs_mkdir: P(CAP.FILES), fs_move: P(CAP.FILES),
  fs_batch_read: P(CAP.FILES), fs_file_tree: P(CAP.FILES), fs_multi_edit: P(CAP.FILES),
  fs_stat: P(CAP.FILES), fs_copy: P(CAP.FILES), fs_codebase_map: P(CAP.FILES),
  // Granting a working folder is the door itself.
  roots_add: P(CAP.FILES), roots_list: P(CAP.FILES), roots_remove: P(CAP.FILES),
  roots_set_primary: P(CAP.FILES), roots_rebind: P(CAP.FILES), roots_unbind: P(CAP.FILES),
  // The journal holds snapshotted file BYTES — reading it is reading files.
  journal_list: P(CAP.FILES), journal_revert: P(CAP.FILES), journal_diff: P(CAP.FILES),
  // git reads and writes the repository on disk.
  git_run: P(CAP.FILES), git_status: P(CAP.FILES), git_log: P(CAP.FILES),
  git_diff: P(CAP.FILES), git_write: P(CAP.FILES), git_show_untracked: P(CAP.FILES),
  git_file_history: P(CAP.FILES), git_show_file: P(CAP.FILES),
  // A watcher reports the contents of a directory over time.
  watch_start: P(CAP.FILES), watch_stop: P(CAP.FILES), watch_changes: P(CAP.FILES),
  'watcher:start': P(CAP.FILES), 'watcher:stop': P(CAP.FILES),
  'watcher:stopAll': P(CAP.FILES), 'watcher:list': P(CAP.FILES),
  // The search sidecar indexes the granted folder.
  'local-search': P(CAP.FILES),

  /* ── shell: equivalent to files, which is the whole point ──────────── */
  // NAMED EXPLICITLY in the test. `terminal:exec` + `cat` is file access, so a
  // files-only gate would be decorative.
  'terminal:exec': P(CAP.SHELL),
  // The human's own terminal is the same capability as the agent's — it is the
  // same shell, on the same machine, in the same folder. Reading the timeline
  // is gated too: it contains the output of commands that already ran.
  'terminal:run': P(CAP.SHELL), 'terminal:session': P(CAP.SHELL),
  'terminal:stop': P(CAP.SHELL), 'terminal:clear': P(CAP.SHELL),
  'terminal:attach': P(CAP.SHELL), 'terminal:pty-write': P(CAP.SHELL),
  'terminal:pty-resize': P(CAP.SHELL), 'terminal:pty-kill': P(CAP.SHELL),
  proc_start: P(CAP.SHELL), proc_output: P(CAP.SHELL),
  proc_stop: P(CAP.SHELL), proc_list: P(CAP.SHELL),
  // Project hooks execute scripts out of the working folder.
  hooks_run: P(CAP.SHELL), hooks_list: P(CAP.SHELL),
  hooks_trust: P(CAP.SHELL), hooks_trusted: P(CAP.SHELL),
  'pty:available': P(CAP.SHELL), 'pty:spawn': P(CAP.SHELL), 'pty:write': P(CAP.SHELL),
  'pty:resize': P(CAP.SHELL), 'pty:kill': P(CAP.SHELL),
  'process:list': P(CAP.SHELL), 'process:kill': P(CAP.SHELL),
  // A stdio MCP server is an arbitrary local process.
  mcp_stdio_start: P(CAP.SHELL), mcp_stdio_call: P(CAP.SHELL),
  mcp_stdio_stop: P(CAP.SHELL), mcp_stdio_list: P(CAP.SHELL),
  'mcp-stdio:start': P(CAP.SHELL), 'mcp-stdio:rpc': P(CAP.SHELL),
  'mcp-stdio:notify': P(CAP.SHELL), 'mcp-stdio:stop': P(CAP.SHELL),

  /* ── browser: a real top-level browsing context ────────────────────── */
  'browser:navigate': P(CAP.BROWSER), 'browser:read': P(CAP.BROWSER),
  'browser:click': P(CAP.BROWSER), 'browser:type': P(CAP.BROWSER),
  'browser:select': P(CAP.BROWSER),
  'browser:upload': P(CAP.BROWSER), 'browser:network': P(CAP.BROWSER),
  'browser:hover': P(CAP.BROWSER), 'browser:pdf': P(CAP.BROWSER),
  'browser:cookies': P(CAP.BROWSER), 'browser:storage': P(CAP.BROWSER),
  'browser:key': P(CAP.BROWSER), 'browser:scroll': P(CAP.BROWSER),
  'browser:screenshot': P(CAP.BROWSER), 'browser:new-tab': P(CAP.BROWSER),
  'browser:list-tabs': P(CAP.BROWSER), 'browser:select-tab': P(CAP.BROWSER),
  'browser:close-tab': P(CAP.BROWSER), 'browser:history': P(CAP.BROWSER),
  'browser:reload': P(CAP.BROWSER), 'browser:evaluate': P(CAP.BROWSER),
  'browser:get-html': P(CAP.BROWSER), 'browser:wait-for': P(CAP.BROWSER),
  'browser:console': P(CAP.BROWSER), 'browser:diagnose': P(CAP.BROWSER),
  'browser:assert': P(CAP.BROWSER), 'browser:audit-a11y': P(CAP.BROWSER),
  'browser:set-mode': P(CAP.BROWSER), 'browser:set-bounds': P(CAP.BROWSER),
  'browser:set-detached': P(CAP.BROWSER), 'browser:close': P(CAP.BROWSER),
  'browser:get-nav-state': P(CAP.BROWSER),
  'browser:zoom': P(CAP.BROWSER), 'browser:find': P(CAP.BROWSER), 'browser:find-stop': P(CAP.BROWSER),
  'browser:downloads': P(CAP.BROWSER), 'browser:cancel-download': P(CAP.BROWSER),
  'browser:open-download': P(CAP.BROWSER), 'browser:show-download': P(CAP.BROWSER),

  /* ── control: the screen and other applications ────────────────────── */
  // NATIVE capture only. companion/capture.js already tiers native →
  // getDisplayMedia → null, so a locked build still watches a shared tab and
  // says which it is using. The toggle never becomes a dead switch.
  'desktop:captureScreen': P(CAP.CONTROL),
  'desktop:executeAction': P(CAP.CONTROL),
  'companion:move': P(CAP.CONTROL), 'companion:click': P(CAP.CONTROL),
  'companion:scroll': P(CAP.CONTROL), 'companion:key': P(CAP.CONTROL),
  // Reads what OTHER applications copied — no web equivalent exists.
  'clipboard:read': P(CAP.CONTROL), 'clipboard:history': P(CAP.CONTROL),
  'clipboard:clear': P(CAP.CONTROL),

  /* ── automation: unattended work that reaches all of the above ─────── */
  'scheduler:get-jobs': P(CAP.AUTOMATION), 'scheduler:create-job': P(CAP.AUTOMATION),
  'scheduler:update-job': P(CAP.AUTOMATION), 'scheduler:delete-job': P(CAP.AUTOMATION),
  'scheduler:toggle-job': P(CAP.AUTOMATION), 'scheduler:run-now': P(CAP.AUTOMATION),
  'scheduler:parse-schedule': P(CAP.AUTOMATION), 'scheduler:get-job-logs': P(CAP.AUTOMATION),
  'subagent:spawn': P(CAP.AUTOMATION), 'subagent:execute': P(CAP.AUTOMATION),
  'subagent:status': P(CAP.AUTOMATION), 'subagent:list': P(CAP.AUTOMATION),
  'subagent:kill': P(CAP.AUTOMATION),
  'subagent:python:execute': P(CAP.AUTOMATION), 'subagent:python:install': P(CAP.AUTOMATION),
  'subagent:python:reset': P(CAP.AUTOMATION), 'subagent:python:namespace': P(CAP.AUTOMATION),
  // Local image/video generation runs an unattended local process to
  // completion, same class as a sub-agent — gated, but discovery is not (see
  // the free block below, mirroring ollama:status).
  'comfy:generate-image': P(CAP.AUTOMATION), 'comfy:generate-video': P(CAP.AUTOMATION),
  'comfy:cancel': P(CAP.AUTOMATION),

  /* ── dialogs: split, deliberately ──────────────────────────────────── */
  // The OS picker returning ONE user-chosen file is functionally identical to
  // <input type=file>, which the WEB build already has. Gating it would make
  // the free desktop build strictly worse than the website — the opposite of
  // the rule it implements ("expired == web app").
  'dialog:open-file': F, 'dialog:open-files': F, 'dialog:read-picked': F,
  // Writing to an arbitrary path, and picking a FOLDER (which is a grant, not
  // a file), are not web-parity.
  'dialog:save-file': P(CAP.FILES), 'dialog:pick-folder': P(CAP.FILES),

  /* ── deep links + recent files ─────────────────────────────────────── */
  // A yogatik:// link carries no privilege — it names a chat to open, and the
  // renderer decides what that means. The recent list holds only PATHS the
  // user themselves opened; reading a file still goes through the gated fs_*
  // handlers, so this cannot become a way around them.
  'deeplink:ready': F, 'recent:list': F, 'recent:add': F, 'recent:clear': F,

  /* ── free: desktop conveniences with no privileged reach ───────────── */
  'desktop:isAlwaysOnTop': F, 'desktop:toggleAlwaysOnTop': F,
  'desktop:getSystemInfo': F, 'desktop:showItemInFolder': F,
  'desktop:openPath': F, 'desktop:openExternal': F,
  'desktop:getActiveWindow': F, 'desktop:setCompanionMode': F,
  'auth:google-desktop': F,
  notify: F,
  'power:get-state': F,
  'clipboard:write': F,   // putting text on the clipboard is not reading the system
  'companion:toggle': F, 'companion:show': F, 'companion:hide': F,
  'companion:close': F, 'companion:resize': F, 'companion:set-always-on-top': F,
  // Buying is not a paid feature.
  'entitlement:get': F, 'entitlement:refresh': F, 'entitlement:checkout': F,
  'entitlement:sign-out': F,
  // Local model discovery & management
  'ollama:status': F, 'ollama:start': F, 'ollama:list': F, 'ollama:pull': F, 'ollama:cancel': F,
  // Local generation discovery & setup — same free/gated split as Ollama:
  // finding out whether ComfyUI is installed, pointing at a folder, and
  // starting it are not the paid part; actually generating is (above).
  'comfy:status': F, 'comfy:set-root': F, 'comfy:start': F,
  // Casting: finding devices on the LAN and reading playback state are
  // read-only (same split as comfy:status above); actually driving a
  // device — pushing media to it, transport control, volume — is CONTROL,
  // the same tier as computer_control and browser_control, because that is
  // exactly what it is: acting on another device rather than this one.
  'cast:discover': F, 'cast:list-devices': F, 'cast:status': F,
  'cast:cast': P(CAP.CONTROL), 'cast:pause': P(CAP.CONTROL), 'cast:resume': P(CAP.CONTROL),
  'cast:stop': P(CAP.CONTROL), 'cast:set-volume': P(CAP.CONTROL),

  /* ── free ALWAYS — gating these breaks something the user owns ─────── */
  // THE TRAP. db.js transparently seals apikey_* values through safeStorage
  // with a `kc.v1:` prefix. Gate the keychain and a lapsed customer cannot
  // read their OWN API keys — the app looks like it deleted them. Never gate.
  'keychain:available': FA, 'keychain:encrypt': FA, 'keychain:decrypt': FA,
  // BitTorrent client runs locally in desktop mode; user's own downloads and
  // folders are always accessible and never locked out.
  'torrent:getDefaultPath': FA, 'torrent:add': FA, 'torrent:list': FA,
  'torrent:pause': FA, 'torrent:resume': FA, 'torrent:remove': FA,
  'torrent:openFolder': FA,
}

/** Every capability a state grants, or null for "everything". */
function capabilityFor(channel) {
  return CHANNELS[channel] || null
}

/* ── states ─────────────────────────────────────────────────────────────── */

const STATE = {
  ANONYMOUS: 'anonymous',  // not signed in — free, and that is fine
  TRIAL: 'trial',          // within the trial window
  PRO: 'pro',              // paid and current
  GRACE: 'grace',          // paid, period ended, refresh not yet succeeded
  LOCKED: 'locked',        // trial over or subscription lapsed
}

const UNLOCKED_STATES = new Set([STATE.TRIAL, STATE.PRO, STATE.GRACE])

function isUnlocked(state) { return UNLOCKED_STATES.has(state) }

/**
 * May this channel run in this state?
 * An UNKNOWN channel is refused. Failing closed is the only safe default: a
 * handler someone forgot to classify must not be silently free, and the test
 * makes forgetting a build failure rather than a discovery in production.
 */
function isAllowed(channel, state) {
  const entry = capabilityFor(channel)
  if (!entry) return false
  if (entry.tier !== TIER.PRO) return true
  return isUnlocked(state)
}

/**
 * The refusal a locked handler returns. It is phrased for the MODEL as much as
 * the user: agent.js inserts this text, and "unknown error" would make the
 * model retry the same call forever.
 */
function lockedResult(channel, state) {
  const entry = capabilityFor(channel)
  const what = entry?.capability ? CAP_LABEL[entry.capability] : 'this capability'
  return {
    success: false,
    locked: true,
    state,
    capability: entry?.capability || null,
    error: entry
      ? `Yogatik Pro is required for ${what}. The trial has ended or the subscription is not active. Tell the user plainly and offer to open the upgrade screen — do not retry this tool.`
      : `Unknown command: ${channel}`,
  }
}

/* ── licence token ──────────────────────────────────────────────────────── */

/**
 * Ed25519 over a compact `base64url(payload).base64url(signature)`.
 * Not JWT: no algorithm field, so there is no `alg: none` to confuse, and no
 * dependency. The public key ships in the app; the private key exists only in
 * the Cloud Function.
 */
const LICENSE_PUBLIC_KEY =
  process.env.YOGATIK_LICENSE_PUBKEY ||
  '-----BEGIN PUBLIC KEY-----\n' +
  'MCowBQYDK2VwAyEA0s+5Fh+qR+yM2Z1rDvYKzZnQSArVx3QD5WaEPImYpvo=\n' +
  '-----END PUBLIC KEY-----\n'

/** Offline tolerance. See resolveState for why this number is what it is. */
const GRACE_MS = 14 * 24 * 60 * 60 * 1000
const TRIAL_DAYS = 30

const b64uDecode = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
const b64uEncode = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/**
 * @returns {{ok:true, payload:object} | {ok:false, reason:string}}
 * NEVER throws — a corrupt file on disk must degrade to "locked", not crash
 * the main process before the window exists.
 */
function verifyToken(token, { publicKey = LICENSE_PUBLIC_KEY } = {}) {
  try {
    if (typeof token !== 'string' || !token.includes('.')) return { ok: false, reason: 'malformed' }
    const dot = token.indexOf('.')
    const body = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    if (!body || !sig) return { ok: false, reason: 'malformed' }

    const ok = crypto.verify(null, Buffer.from(body, 'utf8'), publicKey, b64uDecode(sig))
    if (!ok) return { ok: false, reason: 'bad-signature' }

    const payload = JSON.parse(b64uDecode(body).toString('utf8'))
    if (!payload || typeof payload !== 'object') return { ok: false, reason: 'malformed' }
    if (payload.v !== 1) return { ok: false, reason: 'version' }
    if (!payload.sub) return { ok: false, reason: 'no-subject' }
    return { ok: true, payload }
  } catch (e) {
    return { ok: false, reason: e?.message || 'verify-failed' }
  }
}

/** Used by the Cloud Function and by the tests. The app never signs. */
function signToken(payload, privateKey) {
  const body = b64uEncode(Buffer.from(JSON.stringify(payload), 'utf8'))
  const sig = crypto.sign(null, Buffer.from(body, 'utf8'), privateKey)
  return `${body}.${b64uEncode(sig)}`
}

/* ── state machine ──────────────────────────────────────────────────────── */

/**
 * Decide the current state from what is on disk. Pure — `now` is a parameter,
 * never Date.now().
 *
 * @param {object}  o
 * @param {string?} o.token           the cached signed licence
 * @param {string?} o.uid             the signed-in account, or null
 * @param {number}  o.now             ms
 * @param {number}  o.highWaterMark   greatest `iat` ever seen (clock guard)
 * @param {string?} o.publicKey
 */
function resolveState({ token, uid = null, now, highWaterMark = 0, publicKey } = {}) {
  // CLOCK ROLLBACK. `exp` is compared against a clock the user owns, so the
  // cheapest attack on any offline licence is setting the date back. Refusing
  // when the clock is behind the newest timestamp we have ever been handed
  // defeats the naive version for one line; it does not pretend to defeat a
  // determined one, and §1 of MONETIZATION.md says so.
  if (highWaterMark && now < highWaterMark - 60_000) {
    return { state: STATE.LOCKED, reason: 'clock-rollback' }
  }

  if (!uid) return { state: STATE.ANONYMOUS, reason: 'signed-out' }
  if (!token) return { state: STATE.LOCKED, reason: 'no-license' }

  const v = verifyToken(token, publicKey ? { publicKey } : {})
  if (!v.ok) return { state: STATE.LOCKED, reason: v.reason }

  const p = v.payload
  // A licence issued for a DIFFERENT account is not a licence. Otherwise one
  // paid token could be copied between installs and accounts freely.
  if (p.sub !== uid) return { state: STATE.LOCKED, reason: 'wrong-account' }

  // `exp` is the TOKEN's expiry, deliberately short — min(periodEnd, iat+14d).
  // A long-lived token means one purchase then cancel and use forever; a token
  // that needs the network every launch kills the offline promise the whole
  // product is sold on. Fourteen days is the compromise: a flight, a bad week
  // of wifi or a Firebase outage never lock out a paying customer, and a
  // cancelled one keeps access for at most two weeks.
  if (typeof p.exp === 'number' && now > p.exp) {
    return { state: STATE.LOCKED, reason: 'expired', payload: p }
  }

  if (p.plan === 'trial') {
    const ends = Number(p.per) || 0
    if (ends && now > ends) return { state: STATE.LOCKED, reason: 'trial-ended', payload: p }
    return { state: STATE.TRIAL, reason: 'trial', payload: p, endsAt: ends }
  }

  if (p.plan === 'pro') {
    const periodEnd = Number(p.per) || 0
    // Period has passed but the token has not: the refresh has not landed yet.
    // Keep working rather than locking someone whose renewal is in flight.
    if (periodEnd && now > periodEnd) {
      return { state: STATE.GRACE, reason: 'awaiting-renewal', payload: p, endsAt: p.exp }
    }
    return { state: STATE.PRO, reason: 'active', payload: p, endsAt: periodEnd }
  }

  return { state: STATE.LOCKED, reason: 'no-plan', payload: p }
}

/** Trial window end from a SERVER-issued start. The client clock never decides
 *  when a trial began — it resets with the system date. */
function trialEndsAt(trialStartedAtMs, days = TRIAL_DAYS) {
  const start = Number(trialStartedAtMs) || 0
  return start ? start + days * 24 * 60 * 60 * 1000 : 0
}

function daysLeft(endsAt, now) {
  if (!endsAt || now >= endsAt) return 0
  return Math.ceil((endsAt - now) / (24 * 60 * 60 * 1000))
}

module.exports = {
  TIER, CAP, CAP_LABEL, STATE, CHANNELS,
  capabilityFor, isAllowed, isUnlocked, lockedResult,
  verifyToken, signToken, resolveState, trialEndsAt, daysLeft,
  LICENSE_PUBLIC_KEY, GRACE_MS, TRIAL_DAYS,
}
