/**
 * Cross-device preferences sync — the small settings that make the app feel
 * like yours, following the user the way the API-key vault already does.
 *
 * Conversations and documents sync as an encrypted corpus (api.js
 * syncCloudData → db.exportAll) and API keys sync per-provider through the
 * same vault. But chat_prefs (temperature, persona, web_search, fallback…),
 * the feature-flag toggles and the theme lived only on the device that set
 * them — so a phone configured how you like it could not lend that to the TV.
 * This module syncs them through the SAME account-derived secret and the
 * SAME opt-in gate (chat_prefs.cloud_sync), stored in their own small
 * Firestore doc (users/{uid}/prefs/prefs_v1) instead of riding the
 * multi-chunk conversation snapshot: prefs push alone, cheaply, and a few KB
 * never justifies re-chunking the corpus.
 *
 * FIELD-LEVEL last-write-wins, not whole-blob: every synced key carries its
 * own timestamp (snapshot.stamps), kept on-device in the Dexie
 * 'prefs_sync_ledger' row. A key is re-stamped only when ITS value changed
 * since this device last pushed — so "mobile just changed the theme" does
 * not overwrite "desktop changed tools_enabled five minutes ago"; both
 * survive and the next push carries the union. Equal stamps keep local,
 * matching the conversation sync's tie rule.
 *
 * Deliberately excluded: API keys (the vault's job — never duplicated in a
 * prefs snapshot), conversations/documents/projects/memory (corpus sync
 * owns those), the cloud_sync opt-in itself (the gate must not follow its
 * own synced data — switching sync off on one device must switch it off
 * THERE, not re-enable it everywhere and not switch it on for a device that
 * never opted in), and per-device noise. Both stores features already read
 * — chat_prefs.features (canonical) and the legacy localStorage
 * `yogatik.features` consent mirror — are honoured on collect and on apply.
 */

import * as db from './db'
import { encryptSecret, decryptSecret } from './crypto'
import { savePrefsSnapshot, loadPrefsSnapshot } from './firebaseAuth'

// Circular import with api.js — deliberate and safe. api.js imports this
// module only for its syncCloudData() wiring; both sides use the other's
// exports exclusively INSIDE function bodies at call time, and ESM live
// bindings are resolved by then. Keeping the gate and the secret here
// by-reference (rather than re-derived copies) means prefs sync can never
// drift away from conversation sync's opt-in semantics.
import { cloudSyncEnabled, vaultSecret } from './api'

export const PREFS_SNAPSHOT_VERSION = 1

/** Firestore doc id this snapshot round-trips through (see firebaseAuth). */
export const PREFS_DOC_ID = 'prefs_v1'

/** One snapshot per account for now; a second profile is a new doc id, not a field. */
export const PREFS_PROFILE = 'default'

/** Dexie settings row holding { [fieldId]: { v, at } } — the stamp book. */
export const PREFS_LEDGER_KEY = 'prefs_sync_ledger'

const PREFS_SYNC_AT_KEY = 'prefs_sync_at'
const THEME_KEY = 'yogatik_theme'
/** downloadConsent.js's consent store; mirrored UNDER chat_prefs.features. */
const LEGACY_FEATURES_KEY = 'yogatik.features'

/**
 * Keys that stay device-local, named in one place so nothing drifts out of
 * the decision. cloud_sync_at and learned_preferences live as their own
 * settings rows (never collected anyway); browser_display_mode is a
 * per-device window/panel choice that only describes one screen.
 */
export const EXCLUDED_PREF_KEYS = new Set([
  'cloud_sync',
  'cloud_sync_at',
  'learned_preferences',
  'browser_display_mode',
])

/** Bookkeeping timestamps inside chat_prefs (…_at) are noise, not prefs. */
export function isSyncablePrefKey(key) {
  if (typeof key !== 'string' || !key) return false
  if (EXCLUDED_PREF_KEYS.has(key)) return false
  if (key.endsWith('_at')) return false
  return true
}

/**
 * The syncable model prefs: the active provider, each provider's chosen
 * model (`model_<pid>`) and the user's pinned custom-model lists
 * (`user_models_<pid>`). Always NOT `models_<pid>` — that is the live-model
 * availability cache, which refetches itself and depends on which keys the
 * device happens to have (key syncing covers that part already).
 */
export function isModelPrefKey(key) {
  return typeof key === 'string' && /^(active_provider|model_.+|user_models_.+)$/.test(key)
}

/**
 * Everything this device currently holds that is worth following the user
 * across devices — chat_prefs scalars, feature toggles, UI prefs, session
 * continuity (active project) and model prefs. Pure: writes nothing.
 *
 * Field ids are prefixed by their storage section (prefs. / features. /
 * ui. / session. / models.) so a merged field can be written back to the
 * right store without a lookup table.
 */
export async function collectSyncablePrefs() {
  const all = await db.getAllSettings().catch(() => ({}))
  const chatPrefs = (all['chat_prefs'] && typeof all['chat_prefs'] === 'object')
    ? { ...all['chat_prefs'] }
    : {}
  // features.* is the one structured subgroup of chat_prefs; the snapshot
  // carries it at its own level so each TOGGLE gets its own LWW stamp.
  const features = {
    ...legacyFeatureMirror(),
    ...(chatPrefs.features && typeof chatPrefs.features === 'object' ? chatPrefs.features : {}),
  }
  delete chatPrefs.features

  const prefs = {}
  for (const [k, v] of Object.entries(chatPrefs)) {
    if (isSyncablePrefKey(k) && v !== undefined) prefs[k] = v
  }

  // Only what actually has a store today: the theme (dark / light /
  // contrast). accent / fontSize / density have no storing UI yet — when one
  // appears it slots into this object without changing the snapshot shape.
  const ui = { theme: readTheme() }

  const session = { activeProjectId: all['active_project'] ?? null }

  const models = {}
  for (const [k, v] of Object.entries(all)) {
    if (isModelPrefKey(k) && v !== undefined && v !== null) models[k] = v
  }

  return { prefs, features, ui, session, models }
}

function legacyFeatureMirror() {
  try {
    const raw = JSON.parse(localStorage.getItem(LEGACY_FEATURES_KEY) || '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch { return {} }
}

function readTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'dark' } catch { return 'dark' }
}

// ─── Field flattening ─────────────────────────────────────────────────────────

export function flattenCollected(collected) {
  const out = {}
  for (const [k, v] of Object.entries(collected?.prefs || {})) out[`prefs.${k}`] = v
  for (const [k, v] of Object.entries(collected?.features || {})) out[`features.${k}`] = v
  for (const [k, v] of Object.entries(collected?.ui || {})) out[`ui.${k}`] = v
  for (const [k, v] of Object.entries(collected?.session || {})) out[`session.${k}`] = v
  for (const [k, v] of Object.entries(collected?.models || {})) out[`models.${k}`] = v
  return out
}

/**
 * Remote snapshot → fieldId → { v, at }. Field stamps default to the
 * snapshot's own `at` and are refined by snapshot.stamps; a stamp without a
 * carrying value is dropped rather than turned into an empty merge.
 */
export function flattenRemote(snapshot) {
  const out = {}
  const baseAt = Number.isFinite(snapshot?.at) ? snapshot.at : 0
  const eat = (map, prefix) => {
    for (const [k, v] of Object.entries(map || {})) {
      if (v === undefined) continue           // never merge a void
      out[`${prefix}${k}`] = { v, at: baseAt }
    }
  }
  eat(snapshot?.prefs, 'prefs.')
  eat(snapshot?.features, 'features.')
  eat(snapshot?.ui, 'ui.')
  eat(snapshot?.session, 'session.')
  eat(snapshot?.models, 'models.')
  for (const [id, stamp] of Object.entries(snapshot?.stamps || {})) {
    if (out[id] && Number.isFinite(stamp)) out[id].at = stamp
  }
  return out
}

/**
 * Deep-equal that survives cross-device JSON: object key order is
 * insignificant for "did this value change?", so compare sorted.
 */
export function sameValue(a, b) {
  if (a === b) return true
  try { return JSON.stringify(sortDeep(a)) === JSON.stringify(sortDeep(b)) } catch { return false }
}

function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k])
    return out
  }
  return v
}

/**
 * Field-level LWW, the core rule.
 *
 * Remote wins when its stamp is STRICTLY newer than the newest change this
 * device has recorded for that field. Local wins on ties (same rule as
 * conversation sync) and when this device has an un-synced local edit since
 * its last push — `live` ahead of the ledger is treated as a fresh local
 * change, so a pull never reverts it; the push immediately after then
 * re-stamps it and the cloud adopts it later.
 *
 * Mutates `ledger` in place (the caller persists it). Only fields whose
 * VALUE actually differ from this device's live state come back as `staged`,
 * so equal-but-newer stamps quietly converge the stamp book without waking
 * the UI for nothing.
 */
export function resolveMerge(snapshot, localCollected, ledger, now = Date.now()) {
  const remote = flattenRemote(snapshot)
  const localFields = flattenCollected(localCollected)
  const staged = {}

  for (const [id, { v, at }] of Object.entries(remote)) {
    const entry = ledger[id] || null
    const localV = localFields[id]
    let localAt = entry?.at ?? 0

    // Un-synced local edit: newer than anything we might pull right now.
    if (entry && localV !== undefined && !sameValue(entry.v, localV)) localAt = now

    if (at > localAt) {
      ledger[id] = { v, at }
      if (localV === undefined || !sameValue(localV, v)) staged[id] = v
    } else if (entry && sameValue(entry.v, v) && sameValue(localV ?? entry.v, v)) {
      // Equal world — adopt the remote's stamp so the next push does not
      // rebroadcast an old edit as if it were new.
      entry.at = at
      entry.v = v
    }
  }

  return { staged, applied: Object.keys(staged).length }
}

// ─── Applier registry (decoupled from React) ─────────────────────────────────

const appliers = new Set()

/**
 * Register a callback that fires whenever REMOTE prefs are applied to this
 * device's stores, so the live UI can mirror them into component state. The
 * payload carries the per-field summary App.jsx maps to its setters; the
 * stores are already written when it runs. Returns an unsubscribe function.
 */
export function registerPrefsApplier(fn) {
  if (typeof fn !== 'function') return () => {}
  appliers.add(fn)
  return () => { appliers.delete(fn) }
}

async function notifyAppliers(summary) {
  for (const fn of [...appliers]) {
    try { await fn(summary) } catch { /* one bad listener must not drop the rest */ }
  }
}

/**
 * Write pulled fields to the stores they belong to (Dexie settings,
 * localStorage) and then notify registered appliers. This is the ONLY thing
 * that knows how a field reaches a store — nothing here imports React.
 *
 * Never called for excluded keys (they are never collected, so they can
 * never be staged), which includes the cloud_sync gate itself.
 */
export async function autoApply(staged) {
  const ids = Object.keys(staged || {})
  const summary = { fields: [], prefs: {}, features: {}, models: {}, theme: undefined, activeProjectId: undefined }
  if (!ids.length) return summary

  const prefPatch = {}
  let featurePatch = null
  for (const [id, value] of Object.entries(staged)) {
    if (id.startsWith('prefs.')) {
      prefPatch[id.slice('prefs.'.length)] = value
    } else if (id.startsWith('features.')) {
      if (!featurePatch) featurePatch = {}
      featurePatch[id.slice('features.'.length)] = value
    } else if (id.startsWith('ui.')) {
      const key = id.slice('ui.'.length)
      if (key === 'theme' && typeof value === 'string') {
        try {
          localStorage.setItem(THEME_KEY, value)
          if (typeof document !== 'undefined') document.documentElement.setAttribute('data-theme', value)
        } catch { /* private mode — the React applier may still pick it up */ }
        summary.theme = value
      }
      // accent / fontSize / density: no such store yet — write here when one appears.
    } else if (id.startsWith('session.')) {
      const key = id.slice('session.'.length)
      if (key === 'activeProjectId') {
        try { await db.setSetting('active_project', value ?? null) } catch { /* keep going */ }
        summary.activeProjectId = value ?? null
      }
    } else if (id.startsWith('models.')) {
      const key = id.slice('models.'.length)
      try { await db.setSetting(key, value) } catch { /* keep going */ }
      summary.models[key] = value
    }
  }

  const hasPrefs = Object.keys(prefPatch).length > 0
  const hasFeatures = featurePatch && Object.keys(featurePatch).length > 0
  if (hasPrefs || hasFeatures) {
    try {
      const cur = (await db.getSetting('chat_prefs', {})) || {}
      await db.setSetting('chat_prefs', {
        ...cur, ...prefPatch,
        ...(hasFeatures ? { features: { ...(cur.features || {}), ...featurePatch } } : {}),
      })
      summary.prefs = prefPatch
      summary.features = hasFeatures ? featurePatch : {}
    } catch {
      // If the store write failed, live components must NOT adopt values
      // Dexie does not agree with — bail before notifying anyone.
      return summary
    }
  }

  // Keep the legacy consent mirror in step: downloadConsent.hasConsent and
  // the Settings UI both read chat_prefs.features now, but stale installs
  // still read this file.
  if (hasFeatures) {
    try {
      localStorage.setItem(LEGACY_FEATURES_KEY, JSON.stringify({ ...legacyFeatureMirror(), ...featurePatch }))
    } catch { /* best-effort */ }
  }

  summary.fields = ids
  await notifyAppliers(summary)
  return summary
}

// ─── Push / Pull ─────────────────────────────────────────────────────────────

async function gateOpen() {
  try { return await cloudSyncEnabled() === true } catch { return false }
}

/**
 * Push this device's prefs to the account's prefs doc, encrypted with the
 * account secret (same derivation as the key vault — export via crypto.js
 * exactly like saveUserApiKey does).
 *
 * `{ force: true }` skips the auto-sync opt-in gate for an explicit user
 * action (Settings → "Sync Now"): auto-sync stays gated, manual sync brings
 * everything. The signed-in requirement is never skipped.
 */
export async function pushPrefs({ force = false } = {}) {
  if (!force && !(await gateOpen())) return { pushed: false, reason: 'disabled' }
  const secret = await vaultSecret()
  if (!secret) return { pushed: false, reason: 'signed-out' }

  try {
    const collected = await collectSyncablePrefs()
    const ledger = (await db.getSetting(PREFS_LEDGER_KEY, {})) || {}
    const now = Date.now()
    const stamps = {}
    for (const [id, value] of Object.entries(flattenCollected(collected))) {
      const entry = ledger[id]
      if (!entry || !sameValue(entry.v, value)) {
        // Changed since the last push — this device's edit deserves the fresh stamp.
        ledger[id] = { v: value, at: now }
        stamps[id] = now
      } else {
        // Unchanged — keep its historical stamp so a quiet re-push never
        // rebroadcasts it as a new edit that would out-race the other device.
        stamps[id] = entry.at
      }
    }

    const snapshot = {
      v: PREFS_SNAPSHOT_VERSION,
      profile: PREFS_PROFILE,
      at: now,
      prefs: collected.prefs,
      features: collected.features,
      ui: collected.ui,
      session: collected.session,
      models: collected.models,
      stamps,
    }
    const cipher = await encryptSecret(JSON.stringify(snapshot), secret)
    const res = await savePrefsSnapshot(cipher, { profile: PREFS_PROFILE, fields: Object.keys(stamps).length })
    if (!res?.synced) return { pushed: false, reason: res?.reason || 'prefs-write-restricted' }

    // Stamps are only trustworthy once the cloud accepted the snapshot.
    await db.setSetting(PREFS_LEDGER_KEY, ledger).catch(() => {})
    await db.setSetting(PREFS_SYNC_AT_KEY, now).catch(() => {})
    return { pushed: true, fields: Object.keys(stamps).length, at: now }
  } catch (err) {
    return { pushed: false, reason: err?.message || 'push-failed' }
  }
}

/**
 * Pull the account's prefs doc, decrypt it and merge it field-by-field into
 * this device (never destructive). Applied fields go through autoApply, so
 * both the stores and every registered applier see them. `{ force: true }`
 * skips the auto-sync opt-in for an explicit manual sync — same contract as
 * pushPrefs.
 */
export async function pullPrefs({ force = false } = {}) {
  if (!force && !(await gateOpen())) return { pulled: 0, reason: 'disabled' }
  const secret = await vaultSecret()
  if (!secret) return { pulled: 0, reason: 'signed-out' }

  try {
    const cipher = await loadPrefsSnapshot()
    if (!cipher) return { pulled: 0 }                  // nothing in the cloud yet
    const json = await decryptSecret(cipher, secret)
    if (!json) return { pulled: 0, reason: 'decrypt-failed' }
    let snapshot
    try { snapshot = JSON.parse(json) } catch { return { pulled: 0, reason: 'corrupt' } }
    if (snapshot?.v !== PREFS_SNAPSHOT_VERSION) return { pulled: 0, reason: 'unsupported' }

    const collected = await collectSyncablePrefs()
    const ledger = (await db.getSetting(PREFS_LEDGER_KEY, {})) || {}
    const { staged, applied } = resolveMerge(snapshot, collected, ledger)
    // Persist stamps even when nothing was applied: equal-world pulls adopt
    // the remote stamp so this device never rebroadcasts an old edit.
    await db.setSetting(PREFS_LEDGER_KEY, ledger).catch(() => {})
    if (applied > 0) await autoApply(staged)
    return { pulled: applied, snapshotAt: snapshot.at ?? null }
  } catch (err) {
    return { pulled: 0, reason: err?.message || 'pull-failed' }
  }
}
