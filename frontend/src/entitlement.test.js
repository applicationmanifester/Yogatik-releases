// The gate is a speed bump by design (MONETIZATION.md §1), so the ONE thing
// that has to be mechanically true is that no privileged channel is left
// unclassified. Test 1 reads preload.cjs itself and fails on any channel the
// matrix does not name — the schemaContract.test.js pattern, and the only
// reason the next capability cannot ship ungated.
//
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { generateKeyPairSync } from 'crypto'
// Explicit: the file runs under the node environment, but eslint lints src/
// with browser globals, where Buffer does not exist.
import { Buffer } from 'buffer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const require_ = createRequire(import.meta.url)
const core = require_('../electron/entitlementCore.cjs')

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PRELOAD = fs.readFileSync(path.join(HERE, '..', 'electron', 'preload.cjs'), 'utf8')

/** Every ipcRenderer.invoke('<name>') and every entry of FS_COMMANDS. */
function channelsInPreload() {
  const found = new Set()
  for (const m of PRELOAD.matchAll(/ipcRenderer\.invoke\(\s*'([^']+)'/g)) found.add(m[1])
  const block = /const FS_COMMANDS = new Set\(\[([\s\S]*?)\]\)/.exec(PRELOAD)
  if (block) for (const m of block[1].matchAll(/'([^']+)'/g)) found.add(m[1])
  // invoke(cmd, …) inside the FS bridge is the indirection FS_COMMANDS covers.
  found.delete('cmd')
  return [...found]
}

describe('capability matrix', () => {
  it('classifies EVERY channel preload can reach', () => {
    const unclassified = channelsInPreload().filter(c => !core.capabilityFor(c))
    // If this fails you added an IPC channel and no tier. Decide deliberately:
    // PRO (privileged), FREE (web-parity), FREE_ALWAYS (the user owns it).
    expect(unclassified).toEqual([])
  })

  it('found a real channel list — the regex has not silently stopped matching', () => {
    const names = channelsInPreload()
    expect(names.length).toBeGreaterThan(80)
    expect(names).toContain('fs_write')
    expect(names).toContain('terminal:exec')
    expect(names).toContain('keychain:decrypt')
  })

  it('gates the SHELL, because a files-only gate would be decorative', () => {
    // `terminal:exec` with cat/echo IS file access. Named explicitly so nobody
    // "simplifies" the matrix down to fs_* later.
    for (const ch of ['terminal:exec', 'proc_start', 'pty:spawn', 'mcp-stdio:start', 'hooks_run']) {
      expect(core.isAllowed(ch, core.STATE.LOCKED), ch).toBe(false)
      expect(core.isAllowed(ch, core.STATE.PRO), ch).toBe(true)
    }
  })

  it('NEVER gates the keychain', () => {
    // db.js seals apikey_* through safeStorage with a `kc.v1:` prefix. Gating
    // this locks a lapsed customer out of their own API keys and looks exactly
    // like the app deleting them.
    for (const ch of ['keychain:available', 'keychain:encrypt', 'keychain:decrypt']) {
      expect(core.capabilityFor(ch).tier, ch).toBe(core.TIER.FREE_ALWAYS)
      expect(core.isAllowed(ch, core.STATE.LOCKED), ch).toBe(true)
    }
  })

  it('keeps the free tier at true web parity — no worse than the website', () => {
    // The OS picker returning ONE user-chosen file is <input type=file>, which
    // the web build has. Gating it would make the free desktop app worse than
    // the site it is meant to match.
    for (const ch of ['dialog:open-file', 'dialog:open-files', 'dialog:read-picked']) {
      expect(core.isAllowed(ch, core.STATE.LOCKED), ch).toBe(true)
    }
    // ...but writing anywhere, and picking a FOLDER (a grant, not a file), are not.
    expect(core.isAllowed('dialog:save-file', core.STATE.LOCKED)).toBe(false)
    expect(core.isAllowed('dialog:pick-folder', core.STATE.LOCKED)).toBe(false)
  })

  it('refuses an unknown channel — failing closed, not open', () => {
    expect(core.isAllowed('fs_wipe_everything', core.STATE.PRO)).toBe(false)
    expect(core.lockedResult('fs_wipe_everything', core.STATE.PRO).error).toMatch(/Unknown command/)
  })

  it('tells the MODEL what happened, not just the user', () => {
    // agent.js inserts this string. "Unknown error" makes the model retry the
    // same call forever — the failure mode CLAUDE.md records for every tool
    // that answered a bad call with a raw TypeError.
    const r = core.lockedResult('fs_write', core.STATE.LOCKED)
    expect(r).toMatchObject({ success: false, locked: true, capability: 'files' })
    expect(r.error).toMatch(/Yogatik Pro/)
    expect(r.error).toMatch(/do not retry/i)
  })

  it('unlocks for trial and grace, not only for pro', () => {
    for (const s of [core.STATE.TRIAL, core.STATE.PRO, core.STATE.GRACE]) {
      expect(core.isAllowed('fs_write', s), s).toBe(true)
    }
    for (const s of [core.STATE.LOCKED, core.STATE.ANONYMOUS]) {
      expect(core.isAllowed('fs_write', s), s).toBe(false)
    }
  })
})

describe('personal edition must never ship', () => {
  const readRoot = (...p) => fs.readFileSync(path.join(HERE, '..', ...p), 'utf8')

  it('is not what CI builds or publishes', () => {
    // The personal build has NO gate. If it ever reached the GitHub Release the
    // product would be free for everyone, silently, and the only symptom would
    // be revenue that never arrives.
    const wf = path.join(HERE, '..', '..', '.github', 'workflows', 'electron-release.yml')
    if (!fs.existsSync(wf)) return
    const text = fs.readFileSync(wf, 'utf8')
    expect(text).not.toMatch(/YOGATIK_EDITION\s*[:=]\s*personal/)
    expect(text).not.toMatch(/electron-builder\.personal\.json/)
    expect(text).not.toMatch(/electron:build:personal/)
  })

  it('publishes nothing and installs beside the store build', () => {
    // Personal edition must have its own builder config with publish:null
    const builderFile = 'electron-builder.personal.json'
    const cfg = JSON.parse(readRoot(builderFile))
    const store = JSON.parse(readRoot('package.json')).build
    // publish:null — electron-builder must have no upload target at all.
    expect(cfg.publish).toBeNull()
    // Different appId, or the studio build UPGRADES OVER the store one and
    // the user silently loses the gated app (and its separate userData).
    expect(cfg.appId).not.toBe(store.appId)
    expect(cfg.directories.output).not.toBe(store.directories.output)
  })

  it('is opt-in via the environment, never a default', () => {
    const src = readRoot('electron', 'entitlement.cjs')
    // A default of `personal`/`studio`, or a truthy check on an unset variable, would
    // ship the ungated build to everyone.
    expect(src).toMatch(/(=== 'personal' \? 'personal' : 'store'|=== 'personal' \|\| e === 'studio')/)
  })
})

/* ── licence token ──────────────────────────────────────────────────────── */

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const PUB = publicKey.export({ type: 'spki', format: 'pem' })
const other = generateKeyPairSync('ed25519')

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_760_000_000_000

const mint = (over = {}, key = privateKey) => core.signToken({
  v: 1, sub: 'uid-1', plan: 'pro', iat: NOW, exp: NOW + 14 * DAY, per: NOW + 20 * DAY, ...over,
}, key)

describe('verifyToken', () => {
  it('accepts what the server signed', () => {
    const r = core.verifyToken(mint(), { publicKey: PUB })
    expect(r.ok).toBe(true)
    expect(r.payload.sub).toBe('uid-1')
  })

  it('rejects a tampered payload, a tampered signature and the wrong key', () => {
    const good = mint()
    const [body, sig] = good.split('.')
    const forged = Buffer.from(JSON.stringify({ v: 1, sub: 'uid-1', plan: 'pro', exp: NOW + 9e9 }))
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    expect(core.verifyToken(`${forged}.${sig}`, { publicKey: PUB }).ok).toBe(false)
    expect(core.verifyToken(`${body}.${sig.slice(0, -4)}AAAA`, { publicKey: PUB }).ok).toBe(false)
    expect(core.verifyToken(mint({}, other.privateKey), { publicKey: PUB }).ok).toBe(false)
  })

  it('never throws on garbage — a corrupt file must not kill main before the window exists', () => {
    for (const bad of [null, undefined, '', 'nodot', '.', 'a.b', '{}', 42, {}]) {
      expect(() => core.verifyToken(bad, { publicKey: PUB })).not.toThrow()
      expect(core.verifyToken(bad, { publicKey: PUB }).ok).toBe(false)
    }
  })
})

/* ── state machine ──────────────────────────────────────────────────────── */

const S = (o) => core.resolveState({ publicKey: PUB, now: NOW, uid: 'uid-1', ...o })

describe('resolveState', () => {
  it('is anonymous when signed out — free, and that is a supported way to use the app', () => {
    expect(S({ uid: null, token: null }).state).toBe(core.STATE.ANONYMOUS)
  })

  it('locks with no licence, an expired one, or one for another account', () => {
    expect(S({ token: null }).state).toBe(core.STATE.LOCKED)
    expect(S({ token: mint({ exp: NOW - 1 }) })).toMatchObject({ state: core.STATE.LOCKED, reason: 'expired' })
    expect(S({ token: mint({ sub: 'someone-else' }) }))
      .toMatchObject({ state: core.STATE.LOCKED, reason: 'wrong-account' })
  })

  it('runs the trial to its server-set end and then stops', () => {
    const t = mint({ plan: 'trial', per: NOW + 5 * DAY })
    expect(S({ token: t }).state).toBe(core.STATE.TRIAL)
    expect(core.resolveState({ publicKey: PUB, uid: 'uid-1', token: t, now: NOW + 6 * DAY }))
      .toMatchObject({ state: core.STATE.LOCKED, reason: 'trial-ended' })
  })

  it('grants grace when the period ends before the refresh lands', () => {
    // A renewal in flight, a Firebase outage or a fortnight offline must not
    // lock out someone who has paid.
    const t = mint({ per: NOW + 1 * DAY, exp: NOW + 14 * DAY })
    expect(S({ token: t }).state).toBe(core.STATE.PRO)
    expect(core.resolveState({ publicKey: PUB, uid: 'uid-1', token: t, now: NOW + 3 * DAY }))
      .toMatchObject({ state: core.STATE.GRACE })
    // ...and grace is bounded by the token, so a cancelled subscription stops.
    expect(core.resolveState({ publicKey: PUB, uid: 'uid-1', token: t, now: NOW + 15 * DAY }).state)
      .toBe(core.STATE.LOCKED)
  })

  it('refuses a rolled-back clock', () => {
    // The cheapest attack on any offline licence is setting the date back.
    const t = mint()
    expect(core.resolveState({
      publicKey: PUB, uid: 'uid-1', token: t, now: NOW - 30 * DAY, highWaterMark: NOW,
    })).toMatchObject({ state: core.STATE.LOCKED, reason: 'clock-rollback' })

    // A minute of NTP drift is not an attack.
    expect(core.resolveState({
      publicKey: PUB, uid: 'uid-1', token: t, now: NOW - 30_000, highWaterMark: NOW,
    }).state).toBe(core.STATE.PRO)
  })

  it('computes the trial window from a SERVER start, never the local clock', () => {
    expect(core.trialEndsAt(NOW)).toBe(NOW + 30 * DAY)
    expect(core.trialEndsAt(0)).toBe(0)
    expect(core.trialEndsAt(null)).toBe(0)
    expect(core.daysLeft(NOW + 3.2 * DAY, NOW)).toBe(4)
    expect(core.daysLeft(NOW - DAY, NOW)).toBe(0)
    expect(core.daysLeft(0, NOW)).toBe(0)
  })
})
