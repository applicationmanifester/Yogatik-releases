/**
 * Sprint 3 — Opt-in analytics consent gate.
 *
 * Default OFF. Nothing is loaded, buffered, sent, or stored until the user
 * explicitly opts in via the transparent toggle in Settings → Privacy & Sync.
 *
 * - Consent persists in localStorage (`yogatik_analytics_consent` = '1').
 * - The PostHog-compatible sink (`analyticsSink.js`) is lazily imported ONLY
 *   after consent, so no analytics network code is even fetched before opt-in.
 * - Revoking consent disables analytics and drops the sink immediately.
 * - Only anonymised counts/timings ever flow (see analytics.js SAFE_KEYS).
 *   Never message content, URLs, keys, or user text.
 */

const CONSENT_KEY = 'yogatik_analytics_consent'
const CONFIG_KEY = 'yogatik_analytics_config'

function readLS(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeLS(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch { /* storage unavailable — consent simply won't persist */ }
}

export function isAnalyticsConsented() {
  return readLS(CONSENT_KEY) === '1'
}

export function getAnalyticsConfig() {
  try {
    const raw = readLS(CONFIG_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

/**
 * Set consent on/off. Enabling lazily loads the sink and enables analytics;
 * disabling tears everything down. Never throws.
 * @param {boolean} consented
 * @param {{host?:string, projectKey?:string}} [config]
 * @returns {Promise<boolean>} analytics active or not
 */
export async function setAnalyticsConsent(consented, config) {
  const { disableAnalytics } = await import('./analytics')
  if (!consented) {
    writeLS(CONSENT_KEY, null)
    disableAnalytics()
    return false
  }
  writeLS(CONSENT_KEY, '1')
  if (config) {
    try { writeLS(CONFIG_KEY, JSON.stringify({ host: config.host || '', projectKey: config.projectKey || '' })) } catch { /* ignore */ }
  }
  return ensureAnalytics()
}

/**
 * Activate analytics if (and only if) consent is stored AND a valid
 * host + projectKey are configured. Safe to call at startup.
 * @returns {Promise<boolean>}
 */
export async function ensureAnalytics() {
  if (!isAnalyticsConsented()) return false
  const cfg = getAnalyticsConfig()
  if (!cfg.host || !cfg.projectKey) return false
  try {
    const [{ createPostHogSink }, { enableAnalytics }] = await Promise.all([
      import('./analyticsSink'),
      import('./analytics'),
    ])
    const sink = createPostHogSink({ host: cfg.host, projectKey: cfg.projectKey })
    if (!sink) return false
    return enableAnalytics(sink)
  } catch { return false }
}
