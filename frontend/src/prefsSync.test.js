import { describe, it, expect, vi, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import FDBFactory from 'fake-indexeddb/lib/FDBFactory'
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange'
import Dexie from 'dexie'

globalThis.indexedDB ??= new FDBFactory()
globalThis.IDBKeyRange ??= FDBKeyRange
Dexie.dependencies.indexedDB = globalThis.indexedDB
Dexie.dependencies.IDBKeyRange = globalThis.IDBKeyRange

// In-memory Firestore prefs doc + a signed-in user, so pushPrefs/pullPrefs
// exercise the real encrypt → doc → decrypt → merge path with no network.
// Same pattern as cloudSync.test.js's vault, in its own tiny namespace:
// users/{uid}/prefs/prefs_v1 is a single doc (prefs snapshots are a few KB).
let prefsVault = null
let prefsMeta = null

vi.mock('./firebaseAuth', () => ({
  signInWithGoogle: vi.fn(), checkRedirectResult: vi.fn(), logOutGoogle: vi.fn(),
  saveUserApiKey: vi.fn(), getUserApiKeys: vi.fn(async () => ({})),
  purgePlaintextKeys: vi.fn(), authRedirectPending: () => false,
  saveVault: vi.fn(), loadVault: vi.fn(), getVaultMeta: vi.fn(),
  savePrefsSnapshot: vi.fn(async (cipher, meta) => { prefsVault = cipher; prefsMeta = meta; return { synced: true } }),
  loadPrefsSnapshot: vi.fn(async () => prefsVault),
  getPrefsMeta: vi.fn(async () => prefsMeta),
}))

import { db, setSetting, getSetting, _clearSettingsCache } from './db'
import {
  pushPrefs, pullPrefs, autoApply, collectSyncablePrefs, resolveMerge,
  registerPrefsApplier, PREFS_LEDGER_KEY, flattenRemote,
} from './prefsSync'
import { decryptSecret } from './crypto'
import { vaultSecret } from './api'

const THEME_KEY = 'yogatik_theme'
const LEGACY_FEATURES_KEY = 'yogatik.features'

/** Signed-in user + opted-in gate, the baseline for every happy-path test. */
async function signedInAndOptedIn(prefs = {}) {
  await setSetting('user', { uid: 'user-123', email: 'a@b.c' })
  await setSetting('chat_prefs', { cloud_sync: true, ...prefs })
}

beforeEach(async () => {
  prefsVault = null
  prefsMeta = null
  await db.settings.clear()
  // Dexie's clear() does not touch the module's get/set cache — stale rows
  // would leak across tests and make "fresh device" claims lie.
  _clearSettingsCache()
  localStorage.clear()
})

describe('prefs cross-device sync', () => {
  describe('collectSyncablePrefs', () => {
    it('collects chat prefs, feature toggles, theme, session and model prefs', async () => {
      localStorage.setItem(THEME_KEY, 'light')
      localStorage.setItem(LEGACY_FEATURES_KEY, JSON.stringify({ soundCues: true }))
      await signedInAndOptedIn({
        temperature: 0.7,
        web_search: false,
        tools_enabled: true,
        persona: 'coder',
        auto_route: true,
        fallback: false,
        locale_override: 'de-DE',
        units_override: 'metric',
      })
      await setSetting('active_project', 7)
      await setSetting('active_provider', 'groq')
      await setSetting('model_groq', 'llama-3')
      await setSetting('user_models_openai', ['gpt-custom-1'])
      await setSetting('models_openai', { ts: 1, list: ['gpt-4o'] })   // live availability cache — noise
      await setSetting('toolmode_openai::default', 'prompted')         // per-device learned protocol
      await setSetting('usage_2026-10-16', { groq: { in: 10, out: 20 } })

      const c = await collectSyncablePrefs()

      expect(c.prefs).toMatchObject({
        temperature: 0.7, web_search: false, tools_enabled: true, persona: 'coder',
        auto_route: true, fallback: false,
      })
      expect(c.prefs.locale_override).toBe('de-DE')
      expect(c.prefs.units_override).toBe('metric')
      expect(c.prefs.cloud_sync).toBeUndefined()          // the gate itself never rides along
      expect(c.features.soundCues).toBe(true)             // legacy localStorage mirror merged under
      expect(c.ui).toEqual({ theme: 'light' })
      expect(c.session).toEqual({ activeProjectId: 7 })
      expect(c.models).toMatchObject({
        active_provider: 'groq', model_groq: 'llama-3', user_models_openai: ['gpt-custom-1'],
      })
      expect(c.models.models_openai).toBeUndefined()      // availability cache never syncs
      expect(c.models['toolmode_openai::default']).toBeUndefined()
      expect(Object.keys(c.models)).not.toContain('usage_2026-10-16')
    })

    it('never includes API keys, their metadata or the account row', async () => {
      await signedInAndOptedIn({ temperature: 0.5 })
      await setSetting('apikey_openai', 'sk-live-secret-123456')
      await setSetting('synced_openai', Date.now())
      await setSetting('cloud_sync_at', 12345)

      const flat = JSON.stringify(await collectSyncablePrefs())
      expect(flat).not.toContain('sk-live-secret-123456')
      expect(flat).not.toContain('apikey_openai')
      expect(flat).not.toContain('synced_openai')
      expect(flat).not.toContain('cloud_sync_at')
      expect(flat).not.toContain('a@b.c')                 // the user row itself
    })
  })

  describe('pushPrefs / pullPrefs', () => {
    it('pushes an encrypted snapshot with per-field stamps in the documented shape', async () => {
      await signedInAndOptedIn({ temperature: 0.8, auto_route: true, persona: 'researcher' })

      const res = await pushPrefs()
      expect(res.pushed).toBe(true)
      expect(res.fields).toBeGreaterThan(0)
      expect(prefsVault.startsWith('v1.')).toBe(true)      // AES-GCM envelope
      expect(prefsVault).not.toContain('temperature')      // ciphertext hides keys AND values
      expect(prefsVault).not.toContain('researcher')
      expect(prefsMeta.fields).toBeGreaterThan(0)
      expect(await getSetting('prefs_sync_at')).toBeGreaterThan(0)

      const json = await decryptSecret(prefsVault, await vaultSecret())
      const snap = JSON.parse(json)
      expect(snap.v).toBe(1)
      expect(snap.profile).toBe('default')
      expect(snap.at).toBeGreaterThan(0)
      expect(snap.prefs.temperature).toBe(0.8)
      expect(snap.prefs.auto_route).toBe(true)
      expect(typeof snap.stamps).toBe('object')
      expect(snap.stamps['prefs.temperature']).toBeGreaterThan(0)
    })

    it('round-trips: a fresh device pulls and applies the account prefs', async () => {
      // Device A: configured with the works, then pushed.
      localStorage.setItem(THEME_KEY, 'contrast')
      await signedInAndOptedIn({
        temperature: 0.3,
        web_search: false,
        persona: 'writer',
        auto_route: true,
        features: { planMode: true, soundCues: false },
      })
      await setSetting('active_project', 12)
      await setSetting('active_provider', 'groq')
      await setSetting('user_models_gemini', ['gemini-next'])
      await pushPrefs()

      // Device B: wiped down to a signed-in, opted-in blank device.
      await db.settings.clear()
      _clearSettingsCache()
      await setSetting('user', { uid: 'user-123', email: 'a@b.c' })
      await setSetting('chat_prefs', { cloud_sync: true })
      localStorage.setItem(THEME_KEY, 'dark')

      const applied = []
      const unreg = registerPrefsApplier((summary) => applied.push(summary))
      try {
        const res = await pullPrefs()
        expect(res.pulled).toBeGreaterThan(0)

        // Stores updated…
        const prefs = await getSetting('chat_prefs', {})
        expect(prefs.temperature).toBe(0.3)
        expect(prefs.web_search).toBe(false)
        expect(prefs.persona).toBe('writer')
        expect(prefs.auto_route).toBe(true)
        expect(prefs.features.planMode).toBe(true)
        expect(prefs.features.soundCues).toBe(false)
        expect(await getSetting('active_project')).toBe(12)
        expect(await getSetting('active_provider')).toBe('groq')
        expect(await getSetting('user_models_gemini')).toEqual(['gemini-next'])
        // …localStorage replaced…
        expect(localStorage.getItem(THEME_KEY)).toBe('contrast')
        // …the downloadConsent legacy mirror follows the feature toggles…
        expect(JSON.parse(localStorage.getItem(LEGACY_FEATURES_KEY)).planMode).toBe(true)
        // …and appliers were notified with what was applied.
        const last = applied[applied.length - 1]
        expect(last.theme).toBe('contrast')
        expect(last.activeProjectId).toBe(12)
        expect(last.prefs.temperature).toBe(0.3)
        expect(last.features.planMode).toBe(true)
      } finally {
        unreg()
      }
    })

    it('opt-in gate: with cloud_sync off, push and pull are no-ops', async () => {
      await setSetting('user', { uid: 'user-123', email: 'a@b.c' })
      await setSetting('chat_prefs', { temperature: 0.9, cloud_sync: false })

      const push = await pushPrefs()
      expect(push.pushed).toBe(false)
      expect(push.reason).toBe('disabled')
      expect(prefsVault).toBeNull()

      const pull = await pullPrefs()
      expect(pull).toMatchObject({ pulled: 0, reason: 'disabled' })

      // No ledger entry ever written while gated off.
      expect(await getSetting(PREFS_LEDGER_KEY, {})).toEqual({})
    })

    it('signed-out: no push, no pull, no writes', async () => {
      await setSetting('chat_prefs', { cloud_sync: true, temperature: 0.4 })
      expect(await vaultSecret()).toBeNull()      // no user row anywhere (localStorage cleared too)
      expect(await pushPrefs()).toMatchObject({ pushed: false, reason: 'signed-out' })
      expect(await pullPrefs()).toMatchObject({ pulled: 0, reason: 'signed-out' })
      expect(prefsVault).toBeNull()
    })

    it('field-level LWW: recent theme on one device, recent auto_route on the other — both land', async () => {
      // ── Device M (mobile): auto_route changed recently @100; theme dark @100.
      await setSetting('user', { uid: 'user-123', email: 'a@b.c' })
      await setSetting('chat_prefs', { cloud_sync: true, auto_route: true, tools_enabled: true })
      localStorage.setItem(THEME_KEY, 'dark')
      await setSetting(PREFS_LEDGER_KEY, {
        'prefs.auto_route': { v: true, at: 100 },
        'prefs.tools_enabled': { v: true, at: 100 },
        'ui.theme': { v: 'dark', at: 100 },
      })
      await pushPrefs()                            // ledger matches live → stamps stay 100, deterministic

      // ── Device D (desktop): kept auto_route @100 (adopted earlier from M),
      //    but did re-theme recently @200. Pull first (as syncCloudData does)
      //    — M's @100 theme is OLDER than D's @200, so nothing applies…
      await setSetting('chat_prefs', { cloud_sync: true, auto_route: true, tools_enabled: true })
      localStorage.setItem(THEME_KEY, 'light')
      await setSetting(PREFS_LEDGER_KEY, {
        'prefs.auto_route': { v: true, at: 100 },
        'prefs.tools_enabled': { v: true, at: 100 },
        'ui.theme': { v: 'light', at: 200 },
      })
      expect((await pullPrefs()).pulled).toBe(0)
      // …then push: cloud now holds theme light @200 AND auto_route true @100.
      await pushPrefs()

      // ── Back on M (its own stores again — dark theme, its own ledger):
      //    pull D's push. The newer theme lands; M's own edits stand.
      localStorage.setItem(THEME_KEY, 'dark')
      await setSetting(PREFS_LEDGER_KEY, {
        'prefs.auto_route': { v: true, at: 100 },
        'prefs.tools_enabled': { v: true, at: 100 },
        'ui.theme': { v: 'dark', at: 100 },
      })
      expect((await pullPrefs()).pulled).toBe(1)
      expect(localStorage.getItem(THEME_KEY)).toBe('light')
      expect((await getSetting('chat_prefs', {})).auto_route).toBe(true)
      expect((await getSetting('chat_prefs', {})).tools_enabled).toBe(true)

      // Convergence: M re-pushes carrying BOTH stamps — no edit is rebroadcast
      // as if new, so no device can out-race the other's history.
      await pushPrefs()
      const snap = JSON.parse(await decryptSecret(prefsVault, await vaultSecret()))
      expect(snap.stamps['prefs.auto_route']).toBe(100)
      expect(snap.stamps['ui.theme']).toBe(200)
      expect(snap.stamps['ui.theme']).toBeGreaterThan(snap.stamps['prefs.auto_route'])
    })

    it('LWW tie keeps local (same rule as conversation sync)', () => {
      const ledger = { 'prefs.auto_route': { v: false, at: 150 } }
      const local = { prefs: { auto_route: false }, features: {}, ui: { theme: 'dark' }, session: { activeProjectId: null }, models: {} }
      const snap = {
        v: 1, profile: 'default', at: 999,
        prefs: { auto_route: true }, features: {}, ui: { theme: 'dark' }, session: {}, models: {},
        stamps: { 'prefs.auto_route': 150 },       // same stamp, DIFFERENT value
      }
      const { staged, applied } = resolveMerge(snap, local, ledger)
      expect(applied).toBe(0)
      expect(staged).toEqual({})
      expect(ledger['prefs.auto_route'].v).toBe(false)   // local still owns the field
    })

    it('an un-synced local edit beats a pull (pull never reverts live work)', () => {
      const now = Date.now()
      const ledger = { 'ui.theme': { v: 'dark', at: now - 1000 } }
      const local = { prefs: {}, features: {}, ui: { theme: 'purple' }, session: {}, models: {} }  // edited after the stamp was taken
      const snap = { prefs: {}, features: {}, ui: { theme: 'dark' }, session: {}, models: {}, stamps: { 'ui.theme': now - 900 }, at: now - 900 }
      const { staged, applied } = resolveMerge(snap, local, ledger, now)
      expect(applied).toBe(0)
      expect(staged).toEqual({})
    })

    it('remote stamps without a value body do not stage empty merges', () => {
      const remote = flattenRemote({ v: 1, at: 100, prefs: {}, features: {}, ui: {}, session: {}, models: {}, stamps: { 'ui.theme': 500 } })
      expect(remote['ui.theme']).toBeUndefined()
    })

    it('autoApply is decoupled from React: stores first, appliers after', async () => {
      await setSetting('chat_prefs', { features: { planMode: false } })
      const seen = []
      const unreg = registerPrefsApplier(async (summary) => {
        // By the time appliers run, Dexie already agrees with them.
        seen.push({ summary, persisted: (await getSetting('chat_prefs', {})).features })
      })
      try {
        const summary = await autoApply({
          'features.planMode': true,
          'ui.theme': 'light',
          'models.active_provider': 'groq',
          'session.activeProjectId': 3,
        })
        expect(summary.fields).toHaveLength(4)
        expect(JSON.parse(localStorage.getItem(LEGACY_FEATURES_KEY)).planMode).toBe(true)
        expect(await getSetting('active_provider')).toBe('groq')
        expect(await getSetting('active_project')).toBe(3)
        expect(localStorage.getItem(THEME_KEY)).toBe('light')
        expect(document.documentElement.getAttribute('data-theme')).toBe('light')
        expect(seen[0].persisted.planMode).toBe(true)    // store write preceded the notify
      } finally {
        unreg()
      }
    })

    it('malformed ciphertext never applies anything', async () => {
      await signedInAndOptedIn()
      prefsVault = 'v1.AAAA.AAAA.AAAA'                   // well-formed shape, wrong bytes
      expect(await pullPrefs()).toMatchObject({ pulled: 0, reason: 'decrypt-failed' })
      expect(await getSetting('chat_prefs', {})).toEqual({ cloud_sync: true })
    })
  })
})
