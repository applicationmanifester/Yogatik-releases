/**
 * expertiseTracker.js — Progressive Disclosure & Expertise Adaptation
 *
 * Auto-detects user expertise level from interaction patterns and adapts the
 * UI density accordingly. The level is computed from objective signals:
 *   - Total conversations started
 *   - Number of features enabled beyond defaults
 *   - Slash commands used
 *   - Live sessions completed
 *   - Tools explicitly enabled
 *
 * Three levels:
 *   novice        — fewer than 10 interactions (clean, simple UI)
 *   intermediate   — 10–100 interactions (more visible tools)
 *   expert         — 100+ interactions (all controls visible)
 *
 * Persisted in IndexedDB via db.js so the level survives restarts.
 * Pure and side-effect free for easy testing.
 */

import { getSetting, setSetting } from './db'

const STORAGE_KEY = 'expertiseMetrics'
const LEVEL_KEY = 'expertiseLevel'

const DEFAULT_METRICS = {
  conversationsStarted: 0,
  slashCommandsUsed: 0,
  liveSessionsCompleted: 0,
  toolsEnabled: 0,
  featuresToggled: 0,
  agentsRun: 0,
  lastUpdated: 0,
}

const _listeners = new Set()
let _cached = null

/** Read metrics from IndexedDB, with in-memory caching. */
export async function getMetrics() {
  if (_cached) return { ...DEFAULT_METRICS, ..._cached }
  try {
    const stored = await getSetting(STORAGE_KEY)
    _cached = stored ? { ...DEFAULT_METRICS, ...stored } : { ...DEFAULT_METRICS }
  } catch {
    _cached = { ...DEFAULT_METRICS }
  }
  return { ..._cached }
}

/** Persist a partial metrics update. */
async function saveMetrics(patch) {
  const prev = await getMetrics()
  const next = { ...prev, ...patch, lastUpdated: Date.now() }
  _cached = next
  try { await setSetting(STORAGE_KEY, next) } catch { /* offline ok */ }
  notifyListeners(computeLevel(next))
  return next
}

/** Compute expertise level from metrics. */
export function computeLevel(metrics) {
  if (!metrics) return 'novice'
  const score = (metrics.conversationsStarted || 0)
    + (metrics.slashCommandsUsed || 0) * 2
    + (metrics.liveSessionsCompleted || 0) * 3
    + (metrics.toolsEnabled || 0)
    + (metrics.featuresToggled || 0)
    + (metrics.agentsRun || 0) * 2

  if (score >= 100) return 'expert'
  if (score >= 10) return 'intermediate'
  return 'novice'
}

/** Get the current expertise level (sync if cached, else async). */
export async function getExpertiseLevel() {
  const metrics = await getMetrics()
  return computeLevel(metrics)
}

/** Get cached level synchronously — returns 'novice' if not yet loaded. */
export function getExpertiseLevelSync() {
  return computeLevel(_cached)
}

/* ── increment helpers ─────────────────────────────────────────────────── */

export async function trackConversation() {
  const m = await getMetrics()
  return saveMetrics({ conversationsStarted: m.conversationsStarted + 1 })
}

export async function trackSlashCommand() {
  const m = await getMetrics()
  return saveMetrics({ slashCommandsUsed: m.slashCommandsUsed + 1 })
}

export async function trackLiveSession() {
  const m = await getMetrics()
  return saveMetrics({ liveSessionsCompleted: m.liveSessionsCompleted + 1 })
}

export async function trackToolEnabled() {
  const m = await getMetrics()
  return saveMetrics({ toolsEnabled: m.toolsEnabled + 1 })
}

export async function trackFeatureToggle() {
  const m = await getMetrics()
  return saveMetrics({ featuresToggled: m.featuresToggled + 1 })
}

export async function trackAgentRun() {
  const m = await getMetrics()
  return saveMetrics({ agentsRun: m.agentsRun + 1 })
}

/* ── subscription ──────────────────────────────────────────────────────── */

function notifyListeners(level) {
  for (const cb of _listeners) {
    try { cb(level) } catch (err) { console.error('[expertiseTracker] listener error:', err) }
  }
}

/**
 * Subscribe to expertise level changes.
 * @param {(level: 'novice'|'intermediate'|'expert') => void} callback
 * @returns {() => void} unsubscribe
 */
export function subscribeExpertise(callback) {
  if (typeof callback !== 'function') return () => {}
  _listeners.add(callback)
  return () => _listeners.delete(callback)
}

/** Reset all metrics (testing only). */
export async function resetMetrics() {
  _cached = { ...DEFAULT_METRICS }
  try { await setSetting(STORAGE_KEY, _cached) } catch { /* ok */ }
  notifyListeners('novice')
}

/**
 * Which sidebar items should be hidden for a given expertise level.
 * Returns a Set of tab IDs that should be hidden (unless the user
 * explicitly clicks "Show all").
 */
export function hiddenForLevel(level) {
  if (level === 'expert') return new Set()
  if (level === 'intermediate') return new Set(['scheduler', 'mcp'])
  // novice: hide advanced panels
  return new Set(['agents', 'scheduler', 'mcp', 'workspace', 'codebase'])
}
