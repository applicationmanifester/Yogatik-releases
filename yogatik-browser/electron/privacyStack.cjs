// [chromium-privacy] Chromium privacy & network stack for Yogatik Browser.
//
// Four capabilities, all sharing one module so main.cjs keeps a single
// additive boot hook:
//
//   1. Encrypted DNS — DoH (secure / automatic modes) + Encrypted Client
//      Hello. Command-line switches MUST be appended before `app.ready`,
//      hence the pure spec builder + applier split.
//   2. CSP injection — a conservative Content-Security-Policy for hosts the
//      user allow-lists, ONLY when the response carries no CSP of its own.
//      Never touches file://, devtools://, yogatik://, chrome:// or LAN/
//      localhost targets. Off by default (privacy.cspInjection.enabled).
//   3. Container sessions — per-container `persist:container-<id>` partitions
//      (cookies/storage fully isolated). Distinct per-container user agents
//      exist but are disabled by default (privacy.containers.distinctUserAgents).
//   4. Origin storage audit — group a session's cookies by domain + optional
//      storage estimate, and wipe a single origin on demand.
//
// Pure decision helpers (buildDnsSwitches, decideCsp, groupCookiesByDomain,
// containerPartition) are exported for tests without touching Electron.

const { session } = require('electron')

// ── 1. Encrypted DNS (DoH + ECH) ────────────────────────────────────────────

// Cloudflare (no-logs, anycast) + Google (fallback) — both support RFC 8484
// GET-style templates Chromium's DoH probe expects.
const DEFAULT_DNS_TEMPLATES = 'https://cloudflare-dns.com/dns-query https://dns.google/dns-query'

/**
 * Pure spec builder → Chromium command-line switches for the requested
 * privacy.dns block.
 *
 *   settings { mode: 'off'|'secure'|'auto', template: string }  (may be undefined)
 *
 *   off    → []                          (no switches; DoH + ECH stay off)
 *   secure → DnsOverHttps with DnsOverHttpsMode=secure (never falls back to
 *            plaintext DNS) + EncryptedClientHello, plus the template list.
 *   auto   → DnsOverHttps in automatic mode (DoH preferred, plaintext allowed)
 *            + EncryptedClientHello, plus the template list.
 *
 * An unrecognized/missing mode is treated as 'secure' (privacy-first default).
 * Returns strings of the form '--name=value' so tests can assert exact sets.
 */
function buildDnsSwitches(settings) {
  const s = settings && typeof settings === 'object' ? settings : {}
  const mode = String(s.mode || 'secure').toLowerCase()
  if (mode === 'off') return []

  const template = typeof s.template === 'string' && s.template.trim()
    ? s.template.trim()
    : DEFAULT_DNS_TEMPLATES

  if (mode === 'auto') {
    return [
      '--enable-features=DnsOverHttps,EncryptedClientHello',
      '--dns-over-https-templates=' + template,
    ]
  }
  // secure (default)
  return [
    '--enable-features=DnsOverHttps<DnsOverHttpsMode=secure,EncryptedClientHello',
    '--dns-over-https-templates=' + template,
  ]
}

/**
 * Append pre-parsed '--name=value' switches to an Electron app's command
 * line. Must run before `app.whenReady()` resolves to have any effect.
 * Returns the applied switch list.
 */
function applyDnsSwitches(app, switches) {
  const applied = []
  for (const sw of Array.isArray(switches) ? switches : []) {
    if (typeof sw !== 'string' || !sw.startsWith('--')) continue
    const eq = sw.indexOf('=')
    const name = eq >= 0 ? sw.slice(2, eq) : sw.slice(2)
    const value = eq >= 0 ? sw.slice(eq + 1) : undefined
    try {
      app.commandLine.appendSwitch(name, value)
      applied.push(sw)
    } catch {}
  }
  return applied
}

/**
 * Boot-time entry: read the privacy.dns settings block and append the DoH +
 * ECH switches. Call BEFORE app ready (main.cjs top-level, never in whenReady).
 */
function enableSecureDns(app, dnsSettings) {
  if (!app || !app.commandLine) return []
  return applyDnsSwitches(app, buildDnsSwitches(dnsSettings))
}

// ── 2. CSP injection ────────────────────────────────────────────────────────

// Conservative policy for CSP-less hosts: locks down script/frame/object
// sources while keeping inline styles and same-site media working. A site
// that breaks under it simply does not belong on the user's allow-list (or
// the user overrides `privacy.cspInjection.policy`).
const DEFAULT_CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ')

// HTTP(S) hosts only; never file://, devtools://, yogatik://, chrome://,
// localhost, loopback or LAN targets (dev servers, router admin pages).
function isInjectableHost(hostOrUrl) {
  if (typeof hostOrUrl !== 'string' || !hostOrUrl.trim()) return false
  let h = hostOrUrl.trim().toLowerCase()
  if (h.includes('://')) {
    let u
    try { u = new URL(h) } catch { return false }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    h = u.hostname
  }
  h = h.replace(/^\[|\]$/g, '')
  if (!h) return false
  if (h === 'localhost' || h.endsWith('.localhost')) return false
  if (h === '::1' || h.startsWith('127.') || h.includes(':')) return false
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(h)) return false
  return true
}

function hostFromHostArg(hostOrUrl) {
  let h = String(hostOrUrl).trim().toLowerCase()
  if (h.includes('://')) {
    try { h = new URL(h).hostname } catch { return '' }
  }
  return h.replace(/^\./, '')
}

function hostAllowed(host, allowlist) {
  // Empty/absent allow-list = wildcard (explicit opt-in via enabled=true).
  if (!Array.isArray(allowlist) || allowlist.length === 0) return true
  const bare = host.replace(/^\./, '')
  return allowlist.some((entry) => {
    if (typeof entry !== 'string' || !entry.trim()) return false
    const e = entry.trim().toLowerCase().replace(/^\./, '').replace(/\/.*$/, '')
    return bare === e || bare.endsWith('.' + e)
  })
}

/**
 * Pure header decision: should a CSP header be injected for this response?
 *
 *   decideCsp(existingHeaders, host, enabled) → null | policy-string
 *
 *   existingHeaders — the response's current headers (any casing)
 *   host            — bare hostname OR full URL string
 *   enabled         — falsey → null.
 *                     true   → wildcard injection for any eligible host.
 *                     object → the privacy.cspInjection settings block
 *                              ({ enabled, allowlist, policy }); injects only
 *                              when block.enabled is true and the host is on
 *                              block.allowlist (when non-empty).
 *
 * Returns null when the response already carries ANY CSP header (enforced or
 * report-only), when disabled, or when the host is not injectable.
 */
function decideCsp(existingHeaders, host, enabled) {
  if (!enabled) return null
  if (!existingHeaders || typeof existingHeaders !== 'object') return null

  // The site (or an extension) already ships a policy — never stack ours on
  // top of it, double-reporting or conflicting directives help no one.
  for (const key of Object.keys(existingHeaders)) {
    if (/^content-security-policy(-report-only)?$/i.test(key)) return null
  }

  if (!isInjectableHost(host)) return null

  let allowlist = null
  let policy = ''
  if (typeof enabled === 'object') {
    if (enabled.enabled !== true) return null
    allowlist = enabled.allowlist
    policy = typeof enabled.policy === 'string' ? enabled.policy.trim() : ''
  }

  const bareHost = hostFromHostArg(host)
  if (!hostAllowed(bareHost, allowlist)) return null

  return policy || DEFAULT_CSP_POLICY
}

/**
 * Merge an optional CSP into a responseHeaders object (array-valued, as the
 * webRequest API expects). Used by BOTH the main session's applyCSP handler
 * (Electron allows one onHeadersReceived listener per session — injection
 * must ride the same pass) and by container session installation.
 */
function withOptionalCsp(url, responseHeaders, cfg) {
  const headers = responseHeaders && typeof responseHeaders === 'object' ? responseHeaders : {}
  const policy = decideCsp(headers, url, cfg)
  if (!policy) return headers
  return {
    ...headers,
    'Content-Security-Policy': [...(headers['Content-Security-Policy'] || []), policy],
  }
}

/**
 * Install CSP injection on a session that has no other onHeadersReceived
 * listener (container sessions). The default session's injection rides the
 * applyCSP handler in main.cjs instead — see withOptionalCsp.
 */
function installCspInjection(sessionLike, opts = {}) {
  if (!sessionLike || !sessionLike.webRequest) return false
  const getCfg = typeof opts.getCfg === 'function' ? opts.getCfg : () => null
  sessionLike.webRequest.onHeadersReceived((details, callback) => {
    let headers = details.responseHeaders || {}
    try {
      headers = withOptionalCsp(details.url || '', headers, getCfg())
    } catch {}
    callback({ responseHeaders: headers })
  })
  return true
}

// ── 3. Container sessions ───────────────────────────────────────────────────

/**
 * 'Shopping' → 'persist:container-shopping'. Pure + total: invalid ids map to
 * null so callers can refuse them. Stable (same id → same partition, cookies
 * survive restarts) and unique (distinct ids never collide).
 */
function normalizeContainerId(id) {
  if (typeof id !== 'string') return null
  const norm = id.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(norm)) return null
  return norm
}

function containerPartition(id) {
  const norm = normalizeContainerId(id)
  return norm ? 'persist:container-' + norm : null
}

/**
 * Create one Electron session per container id.
 *
 *   idsOrMap — array/Set of ids, or { id → label } object/Map (labels unused
 *              here, accepted for convenience)
 *   opts.fromPartition        — defaults to electron session.fromPartition
 *   opts.distinctUserAgents   — opt-in per-container UA suffix (OFF by default)
 *   opts.baseUserAgent         — base UA the suffix is appended to
 *
 * Returns Map<id, session>; ids that fail validation or session creation are
 * skipped.
 */
function createContainerSessions(idsOrMap, opts = {}) {
  const out = new Map()
  if (!idsOrMap) return out

  let ids = []
  if (idsOrMap instanceof Map) ids = [...idsOrMap.keys()]
  else if (idsOrMap instanceof Set) ids = [...idsOrMap]
  else if (Array.isArray(idsOrMap)) ids = idsOrMap
  else if (typeof idsOrMap === 'object') ids = Object.keys(idsOrMap)

  const fromPartition = opts.fromPartition || (session && typeof session.fromPartition === 'function'
    ? session.fromPartition
    : null)

  for (const id of ids) {
    const norm = normalizeContainerId(id)
    const partition = containerPartition(id)
    if (!norm || !partition || out.has(id)) continue
    let ses = null
    try {
      if (!fromPartition) continue
      ses = fromPartition(partition)
    } catch { continue }
    if (ses && opts.distinctUserAgents && typeof ses.setUserAgent === 'function') {
      try { ses.setUserAgent((opts.baseUserAgent || '') + ' YogatikContainer/' + norm) } catch {}
    }
    out.set(id, ses)
  }
  return out
}

/**
 * Open a new tab inside a container partition. Dependency-injected so tests
 * (and future callers) never need the full browserControl module:
 *
 *   deps { session, createTab } — session is the chrome window's browser
 *   session; createTab(s, url, { partition }) is browserControl's createTab,
 *   which natively supports a partition opt.
 *
 * Stamps tab.containerId so tree-node/container assignment has a stable key.
 */
function openInContainer(deps, containerId, url) {
  const partition = containerPartition(containerId)
  if (!partition) return { success: false, error: 'Invalid container id' }
  if (!deps || !deps.session || typeof deps.createTab !== 'function') {
    return { success: false, error: 'Container tab creation unavailable' }
  }
  try {
    const tabId = deps.createTab(deps.session, url || null, { partition })
    try {
      const tab = deps.session.tabs instanceof Map ? deps.session.tabs.get(tabId) : null
      if (tab) tab.containerId = normalizeContainerId(containerId)
    } catch {}
    return { success: true, tabId, partition, containerId: normalizeContainerId(containerId) }
  } catch (err) {
    return { success: false, error: (err && err.message) || String(err) }
  }
}

// ── 4. Origin storage audit ─────────────────────────────────────────────────

/**
 * Pure grouping: [{ domain, name, ... }] cookies → sorted
 * [{ domain, count, names }] with leading dots stripped ('.youtube.com' and
 * 'youtube.com' merge). Sorted by count desc, then domain asc.
 */
function groupCookiesByDomain(cookies) {
  const byDomain = new Map()
  for (const c of Array.isArray(cookies) ? cookies : []) {
    if (!c || typeof c !== 'object') continue
    let domain = typeof c.domain === 'string' && c.domain ? c.domain : ''
    if (!domain && typeof c.url === 'string') {
      try { domain = new URL(c.url).hostname } catch { domain = '' }
    }
    domain = domain.replace(/^\./, '').toLowerCase()
    if (!domain) continue
    const entry = byDomain.get(domain) || { domain, count: 0, names: [] }
    entry.count++
    if (typeof c.name === 'string' && c.name) entry.names.push(c.name)
    byDomain.set(domain, entry)
  }
  return [...byDomain.values()]
    .map(({ domain, count, names }) => ({ domain, count, names: names.slice(0, 12) }))
    .sort((a, b) => (b.count - a.count) || (a.domain < b.domain ? -1 : 1))
}

/**
 * Per-origin audit for a session: cookie counts grouped by domain plus the
 * storage estimate when session.getStorageData is available (it is not on
 * every Electron build — reported as null rather than failing the audit).
 */
async function auditOriginStorage(sessionLike) {
  if (!sessionLike || !sessionLike.cookies || typeof sessionLike.cookies.getAll !== 'function') {
    return { success: false, error: 'Session cookies unavailable', origins: [], totalCookies: 0, storage: null }
  }
  let cookies = []
  try {
    cookies = await sessionLike.cookies.getAll({})
  } catch (err) {
    return { success: false, error: (err && err.message) || String(err), origins: [], totalCookies: 0, storage: null }
  }
  const origins = groupCookiesByDomain(cookies)

  let storage = null
  try {
    if (typeof sessionLike.getStorageData === 'function') {
      const usage = await sessionLike.getStorageData()
      if (usage && typeof usage === 'object') {
        storage = { usage: Number(usage.usage) || 0, quota: Number(usage.quota) || 0 }
      }
    }
  } catch {}

  return { success: true, origins, totalCookies: Array.isArray(cookies) ? cookies.length : 0, storage }
}

/**
 * Wipe every cookie + storage entry for one origin (host form or URL form).
 * Only cookies whose domain equals or is a subdomain of the target host are
 * removed; everything else is left untouched.
 */
async function wipeOrigin(sessionLike, origin) {
  if (!sessionLike || !sessionLike.cookies || typeof sessionLike.cookies.getAll !== 'function') {
    return { success: false, error: 'Session cookies unavailable' }
  }
  let host = ''
  let fullOrigin = ''
  try {
    const u = new URL(String(origin).includes('://') ? String(origin) : 'https://' + String(origin))
    host = u.hostname.toLowerCase().replace(/^\./, '')
    fullOrigin = u.protocol + '//' + u.hostname
  } catch {
    return { success: false, error: 'Invalid origin' }
  }
  if (!host) return { success: false, error: 'Invalid origin' }

  let removed = 0
  try {
    const all = await sessionLike.cookies.getAll({})
    for (const c of Array.isArray(all) ? all : []) {
      const d = String(c.domain || '').replace(/^\./, '').toLowerCase()
      // Bidirectional: a cookie's domain may be a PARENT of the wiped host
      // ('.youtube.com' applies to www.youtube.com) or a SUBDOMAIN of it
      // (wiping 'youtube.com' also clears 'www.youtube.com' cookies). Dot
      // boundaries on both sides keep 'notyoutube.com' out of a 'youtube.com' wipe.
      if (d && (d === host || d.endsWith('.' + host) || host.endsWith('.' + d))) {
        try {
          await sessionLike.cookies.remove((c.secure ? 'https://' : 'http://') + d + (c.path || '/'), c.name)
          removed++
        } catch {}
      }
    }
  } catch (err) {
    return { success: false, error: (err && err.message) || String(err), removed }
  }

  try {
    if (typeof sessionLike.clearStorageData === 'function') {
      await sessionLike.clearStorageData({ origins: [fullOrigin] })
    }
  } catch {}

  return { success: true, removed, origin: host }
}

// ── IPC wiring (called once from main.cjs's [chromium-privacy] block) ──────

/**
 * Resolve the chrome window's browser session (the one the UI is driving).
 * Dependency-injected to keep this module testable outside Electron.
 */
function resolveChromeSession({ sessions, ensureSession, mainWindowGetter } = {}) {
  try {
    const win = typeof mainWindowGetter === 'function' ? mainWindowGetter() : null
    if (win && sessions) {
      const found = [...sessions.values()].find((s) => s && s.win === win)
      if (found) return found
    }
    if (typeof ensureSession === 'function') return ensureSession('__default__', 'window')
  } catch {}
  return null
}

function readContainerSpecs(getSetting) {
  try {
    const list = getSetting('privacy.containers.list')
    return Array.isArray(list) ? list.filter((c) => c && typeof c.id === 'string') : []
  } catch { return [] }
}

/**
 * Register the privacy IPC surface:
 *   privacy:containers-list | -create | -open
 *   privacy:storage-audit   | privacy:wipe-origin
 * Ids and origins are re-validated here regardless of what the preload sent.
 */
function wirePrivacyStack(deps = {}) {
  const { ipcMain, getSetting, setSetting, defaultSession } = deps
  if (!ipcMain || typeof ipcMain.handle !== 'function') return false

  ipcMain.handle('privacy:containers-list', () => {
    const specs = readContainerSpecs(getSetting)
    return {
      success: true,
      enabled: !!(() => { try { return getSetting('privacy.containers.enabled') === true } catch { return false } })(),
      distinctUserAgents: !!(() => { try { return getSetting('privacy.containers.distinctUserAgents') === true } catch { return false } })(),
      containers: specs.map((c) => ({
        id: normalizeContainerId(c.id) || c.id,
        label: typeof c.label === 'string' && c.label.trim() ? c.label.trim() : c.id,
        partition: containerPartition(c.id) || '',
      })),
    }
  })

  ipcMain.handle('privacy:containers-create', (_e, p = {}) => {
    const id = normalizeContainerId(p.id)
    if (!id) return { success: false, error: 'Container id must be 1-32 chars: letters, numbers, "-" or "_"' }
    const label = typeof p.label === 'string' && p.label.trim() ? p.label.trim() : id
    const specs = readContainerSpecs(getSetting)
    if (specs.some((c) => normalizeContainerId(c.id) === id)) {
      return { success: false, error: 'Container "' + id + '" already exists' }
    }
    const next = [...specs, { id, label }]
    try { if (typeof setSetting === 'function') setSetting('privacy.containers.list', next) } catch {}
    return { success: true, id, label, partition: containerPartition(id), containers: next }
  })

  ipcMain.handle('privacy:containers-open', (_e, p = {}) => {
    const s = resolveChromeSession(deps)
    if (!s) return { success: false, error: 'No active browser session' }
    const res = openInContainer({ session: s, createTab: deps.createTab }, p.id, p.url)
    try { if (res.success && typeof deps.showActive === 'function') deps.showActive(s) } catch {}
    return res
  })

  ipcMain.handle('privacy:storage-audit', async () => {
    const res = await auditOriginStorage(defaultSession)
    if (res.success) {
      // Cap the wire payload — the UI shows the top origins only.
      res.origins = res.origins.slice(0, 50)
    }
    return res
  })

  ipcMain.handle('privacy:wipe-origin', async (_e, p = {}) => {
    if (typeof p.origin !== 'string' || !p.origin.trim()) {
      return { success: false, error: 'Origin required' }
    }
    return wipeOrigin(defaultSession, p.origin)
  })

  // Pre-create sessions for persisted containers (partition warm-up). Distinct
  // per-container user agents are opt-in (privacy.containers.distinctUserAgents,
  // disabled by default).
  try {
    const specs = readContainerSpecs(getSetting)
    if (specs.length) {
      const distinct = (() => {
        try { return getSetting('privacy.containers.distinctUserAgents') === true } catch { return false }
      })()
      createContainerSessions(specs.map((c) => c.id), { distinctUserAgents: distinct })
    }
  } catch {}

  return true
}

module.exports = {
  DEFAULT_DNS_TEMPLATES,
  DEFAULT_CSP_POLICY,
  buildDnsSwitches,
  applyDnsSwitches,
  enableSecureDns,
  decideCsp,
  withOptionalCsp,
  installCspInjection,
  normalizeContainerId,
  containerPartition,
  createContainerSessions,
  openInContainer,
  groupCookiesByDomain,
  auditOriginStorage,
  wipeOrigin,
  wirePrivacyStack,
}
