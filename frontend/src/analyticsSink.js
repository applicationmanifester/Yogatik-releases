/**
 * Opt-in analytics sink — a concrete {capture} implementation for analytics.js.
 * Batches events and POSTs them to a PostHog-compatible endpoint (self-hosted
 * PostHog fits Yogatik's privacy-first ethos). No SDK dependency; just fetch.
 *
 * Nothing here runs unless the user explicitly enables analytics AND a project
 * key + host are configured. Only allowlisted, non-PII props reach here (the
 * analytics.js layer already stripped everything else).
 */

const FLUSH_INTERVAL_MS = 15_000
const MAX_BATCH = 20

/**
 * Create a sink. Returns { capture, flush, stop } — pass the object to
 * enableAnalytics(sink).
 * @param {{host:string, projectKey:string, distinctId?:string}} cfg
 */
export function createPostHogSink({ host, projectKey, distinctId = 'anon' } = {}) {
  if (!host || !projectKey) return null
  const endpoint = host.replace(/\/$/, '') + '/capture/'
  let queue = []
  let timer = null

  async function flush() {
    if (!queue.length) return
    const batch = queue.splice(0, MAX_BATCH)
    const body = JSON.stringify({
      api_key: projectKey,
      batch: batch.map(e => ({
        event: e.event,
        properties: { ...e.properties, distinct_id: distinctId, $lib: 'yogatik' },
        timestamp: new Date(e.at).toISOString(),
      })),
    })
    try {
      await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
    } catch { /* drop on failure — analytics must never disrupt UX */ }
  }

  function schedule() {
    if (timer) return
    timer = setTimeout(() => { timer = null; flush() }, FLUSH_INTERVAL_MS)
  }

  return {
    capture(event, properties) {
      queue.push({ event, properties: properties || {}, at: Date.now() })
      if (queue.length >= MAX_BATCH) flush()
      else schedule()
    },
    flush,
    stop() { if (timer) { clearTimeout(timer); timer = null } queue = [] },
  }
}

/** Build a sink from stored settings and enable analytics if configured + opted-in. */
export async function initAnalyticsFromSettings(getSetting) {
  try {
    const prefs = (await getSetting('chat_prefs', {})) || {}
    if (prefs.analytics_enabled !== true) return false
    const cfg = prefs.analytics_config || {}
    const sink = createPostHogSink(cfg)
    if (!sink) return false
    const { enableAnalytics } = await import('./analytics')
    return enableAnalytics(sink)
  } catch { return false }
}
