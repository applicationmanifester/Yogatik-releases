/**
 * Shared CORS fetch for tools.
 *
 * Order matters. Our own Cloudflare Worker goes FIRST: it returns the real
 * bytes, it is not shared with the rest of the internet, and it is the only
 * relay allowed to carry a credential (it validates the target host).
 *
 * The public relays are a fallback and each has a catch:
 *  - allorigins / corsproxy: heavily used, so 403/429 comes and goes.
 *  - r.jina.ai returns MARKDOWN, not the original document. Anything that
 *    parses HTML (search results, link previews) finds nothing in it, which is
 *    why it is last and not first.
 * A relay that just failed is skipped for a minute instead of being retried on
 * every single call.
 */

import { getProxyEndpoint } from '../llm'

const PUBLIC_RELAYS = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?url=',
  'https://thingproxy.freeboard.io/fetch/',
  'https://api.codetabs.com/v1/proxy?quest=',
]

const COOLDOWN_MS = 60_000
// A 429 from OUR worker is a daily quota, not a blip: retrying in a minute just
// burns another request. Back off properly, and remember it across reloads so a
// refresh does not restart the hammering.
const QUOTA_COOLDOWN_MS = 15 * 60_000
const STORE = 'yogatik.relayCooldown'

const cooldown = new Map()
try {
  const saved = JSON.parse(sessionStorage.getItem(STORE) || '{}')
  for (const [k, v] of Object.entries(saved)) if (v > Date.now()) cooldown.set(k, v)
} catch { /* private mode */ }

const usable = (relay) => (cooldown.get(relay) || 0) < Date.now()
function penalise(relay, ms = COOLDOWN_MS) {
  if (!ms) return
  cooldown.set(relay, Date.now() + ms)
  try { sessionStorage.setItem(STORE, JSON.stringify(Object.fromEntries(cooldown))) } catch { /* ignore */ }
}

// Some targets refuse every proxy there is (YouTube blocks datacenter IPs
// outright). Retrying four relays per call just prints four CORS errors and
// costs a second, so a host that beat all of them is skipped for a while.
const HOST_COOLDOWN_MS = 5 * 60_000
const deadHosts = new Map()
const hostOf = (url) => { try { return new URL(url).hostname } catch { return '' } }
const hostBlocked = (url) => (deadHosts.get(hostOf(url)) || 0) > Date.now()

/** Forget the cooldowns — only useful in tests. */
export function resetRelayHealth() {
  cooldown.clear()
  deadHosts.clear()
  try { sessionStorage.removeItem(STORE) } catch { /* ignore */ }
}

const activeSignals = new Set()
export function pushAmbientSignal(s) { if (s) activeSignals.add(s) }
export function popAmbientSignal(s) { if (s) activeSignals.delete(s) }
function ambientSignal() {
  return activeSignals.size === 1 ? [...activeSignals][0] : undefined
}

/** Seconds from Retry-After, capped: a relay saying "come back in an hour" is a no. */
function retryAfterMs(resp, cap = 4000) {
  const raw = resp.headers?.get?.('retry-after')
  const secs = raw && /^\d+$/.test(raw.trim()) ? Number(raw) * 1000 : 0
  return secs > 0 && secs <= cap ? secs : 0
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export async function proxyFetch(url, { credentials = false, ...init } = {}) {
  const signal = init.signal ?? ambientSignal()
  // The host beat every relay including ours a moment ago; skip the whole
  // cascade rather than reprint the same four failures.
  if (hostBlocked(url)) {
    throw new Error(`${hostOf(url)} is refusing proxied requests right now`)
  }
  const endpoint = getProxyEndpoint()

  if (endpoint && usable(endpoint)) {
    const send = () => fetch(endpoint, {
      ...init, signal, headers: { ...init.headers, 'X-Target-URL': url },
    })
    try {
      let resp = await send()
      if (!resp.ok && resp.status === 429) {
        const wait = retryAfterMs(resp)
        if (wait) { await sleep(wait); resp = await send() }
      }
      if (resp.ok) return resp
      // Whose failure is it? The worker labels anything it merely relayed, so a
      // 429 from DuckDuckGo does not get our own proxy benched — we just try a
      // public relay, whose egress IP the target may not be throttling.
      const relayed = resp.headers?.get?.('x-yogatik-proxy') === 'upstream'
      penalise(endpoint, relayed ? 0
        : resp.status === 429 ? QUOTA_COOLDOWN_MS
        : resp.status >= 500 ? COOLDOWN_MS : 0)
      if (credentials) throw new Error(`Proxy refused the request (${resp.status})`)
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      penalise(endpoint)
      if (credentials) throw err
    }
  }

  if (credentials) {
    throw new Error('No private proxy available — refusing to send credentials through a public relay.')
  }

  let lastError = null
  for (const relay of PUBLIC_RELAYS) {
    if (!usable(relay)) continue
    try {
      const target = relay.includes('?') ? relay + encodeURIComponent(url) : relay + url
      const resp = await fetch(target, { ...init, signal })
      if (resp.ok) return resp
      penalise(relay, resp.status === 429 ? QUOTA_COOLDOWN_MS
        : resp.status === 403 ? COOLDOWN_MS : 5_000)
      lastError = new Error(`${new URL(relay).hostname} returned ${resp.status}`)
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      penalise(relay)
      lastError = err
    }
  }
  // Nothing could reach it: blame the target, not the relays.
  if (hostOf(url)) deadHosts.set(hostOf(url), Date.now() + HOST_COOLDOWN_MS)
  throw lastError || new Error(`All proxy relays failed to fetch ${url}`)
}

export async function proxyText(url, opts) {
  const resp = await proxyFetch(url, opts)
  if (!resp.ok) throw new Error(`Fetch failed (${resp.status})`)
  return resp.text()
}

export async function proxyJson(url, opts) {
  const resp = await proxyFetch(url, opts)
  if (!resp.ok) throw new Error(`Fetch failed (${resp.status})`)
  return resp.json()
}
