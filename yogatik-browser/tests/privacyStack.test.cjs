#!/usr/bin/env node
'use strict'

// [chromium-privacy] Chromium privacy & network stack tests.
//
// Style mirrors run-tests.cjs / pagePipeline.test.cjs: sections, pass()/fail()/
// assert(), and the electron stub injected via Module._resolveFilename. The
// exported run() returns the failure count so the parent runner folds it into
// the final verdict.
//
// Covers:
//   - buildDnsSwitches: off/secure/auto matrix, default + custom templates,
//     invalid-mode fallback, switch-string shape
//   - decideCsp: no-CSP+enabled → inject, has-CSP → null, disabled → null,
//     file://|devtools://|yogatik:// → null, localhost/LAN → null,
//     allowlist gating (exact + subdomain), custom policy override
//   - containers: partition ids stable + unique + validated, session creation
//     with injected fromPartition, distinct user agents OFF by default,
//     openInContainer tab stamping
//   - storage audit: pure cookie grouping, getStorageData optional, wipe
//     scoped to one origin
//   - settings: privacy-block defaults merge, structuredClone DEFAULTS
//     regression guard, array replace-not-merge semantics
//   - wirePrivacyStack: IPC surface end-to-end through the stub registry

const fs = require('fs')
const os = require('os')
const path = require('path')
const Module = require('module')

// ── Electron stub wiring (installed before ANY electron-requiring module) ──
const STUB_PATH = path.join(__dirname, 'electron-stub.cjs')
const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'electron') return STUB_PATH
  return origResolve.call(this, request, parent, isMain, options)
}

const electronStub = require('./electron-stub.cjs')

let failures = 0
let passes = 0

function pass(name) { passes++; console.log('  \u2714 ' + name) }
function fail(name, err) {
  failures++
  console.error('  \u2716 ' + name)
  console.error('      ' + (err && err.message ? err.message : String(err)))
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed') }

function section(title) {
  console.log('\n=== ' + title + ' ===')
}

// Fake Electron session with an in-memory cookie store.
function makeFakeSession(cookies, opts = {}) {
  return {
    cookies: {
      getAll: async () => cookies.map((c) => ({ ...c })),
      remove: async (url, name) => { (opts.removed = opts.removed || []).push({ url, name }) },
    },
    clearStorageData: async (o) => { (opts.cleared = opts.cleared || []).push(o) },
    ...(opts.getStorageData ? { getStorageData: opts.getStorageData } : {}),
  }
}

async function run() {
  // Isolated temp userData — the settings store caches its file path at first
  // use, so cache entries from earlier suites must be dropped.
  process.env.YOGATIK_TEST_USERDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yogatik-privacy-'))
  for (const mod of ['settings/store.cjs', 'privacyStack.cjs']) {
    try { delete require.cache[require.resolve('../electron/' + mod)] } catch {}
  }

  const store = require('../electron/settings/store.cjs')
  const privacyStack = require('../electron/privacyStack.cjs')

  // ── 1. buildDnsSwitches (DoH + ECH matrix) ──────────────────────────────
  section('1. buildDnsSwitches (DoH mode matrix, pure spec builder)')

  try {
    assert(Array.isArray(privacyStack.buildDnsSwitches({ mode: 'off' })), 'off should return an array')
    assert(privacyStack.buildDnsSwitches({ mode: 'off' }).length === 0, 'off must produce no switches')
    pass('mode "off" produces no switches')
  } catch (e) { fail('mode "off" produces no switches', e) }

  try {
    const sw = privacyStack.buildDnsSwitches({ mode: 'secure' })
    assert(Array.isArray(sw) && sw.length === 2, 'secure should produce exactly 2 switches, got: ' + JSON.stringify(sw))
    const features = sw.find(s => s.startsWith('--enable-features='))
    assert(/DnsOverHttps<DnsOverHttpsMode=secure/.test(features), 'secure mode must set DnsOverHttpsMode=secure: ' + features)
    assert(/EncryptedClientHello/.test(features), 'ECH feature flag must be present: ' + features)
    const templates = sw.find(s => s.startsWith('--dns-over-https-templates='))
    assert(/https:\/\/cloudflare-dns\.com\/dns-query/.test(templates) && /https:\/\/dns\.google\/dns-query/.test(templates),
      'default templates must be Cloudflare + Google: ' + templates)
    pass('mode "secure" → strict DoH + ECH + Cloudflare/Google templates')
  } catch (e) { fail('mode "secure" → strict DoH + ECH + Cloudflare/Google templates', e) }

  try {
    const sw = privacyStack.buildDnsSwitches({ mode: 'auto' })
    const features = sw.find(s => s.startsWith('--enable-features='))
    assert(/DnsOverHttps/.test(features) && /EncryptedClientHello/.test(features), 'auto must enable DoH + ECH: ' + features)
    assert(!/DnsOverHttpsMode/.test(features), 'auto must NOT pin DnsOverHttpsMode: ' + features)
    pass('mode "auto" → DoH + ECH without a pinned mode')
  } catch (e) { fail('mode "auto" → DoH + ECH without a pinned mode', e) }

  try {
    assert(JSON.stringify(privacyStack.buildDnsSwitches(undefined)) === JSON.stringify(privacyStack.buildDnsSwitches({})),
      'undefined settings should behave like an empty block')
    assert(JSON.stringify(privacyStack.buildDnsSwitches(undefined)) === JSON.stringify(privacyStack.buildDnsSwitches({ mode: 'secure' })),
      'missing mode should default to secure')
    assert(JSON.stringify(privacyStack.buildDnsSwitches({ mode: 'yolo' })) === JSON.stringify(privacyStack.buildDnsSwitches({ mode: 'secure' })),
      'invalid mode should fall back to secure')
    pass('missing/invalid mode defaults to "secure"')
  } catch (e) { fail('missing/invalid mode defaults to "secure"', e) }

  try {
    const tpl = 'https://dns.example/cleartext?family=1'
    const sw = privacyStack.buildDnsSwitches({ mode: 'secure', template: tpl })
    assert(sw.some(s => s === '--dns-over-https-templates=' + tpl), 'custom template must be honored verbatim')
    pass('custom template honored')
  } catch (e) { fail('custom template honored', e) }

  try {
    for (const sw of privacyStack.buildDnsSwitches({ mode: 'secure' })) {
      assert(sw.startsWith('--'), 'switch must start with --: ' + sw)
      const body = sw.slice(2)
      const eq = body.indexOf('=')
      assert(eq > 0, 'switch must have a name before "=": ' + sw)
      assert(/^[\w-]+$/.test(body.slice(0, eq)), 'switch name must be a flag name: ' + sw)
    }
    pass('switch strings are well-formed --name=value pairs')
  } catch (e) { fail('switch strings are well-formed --name=value pairs', e) }

  // ── 2. decideCsp (pure header decision) ─────────────────────────────────
  section('2. decideCsp (inject only for CSP-less, allow-listed, http(s) hosts)')

  try {
    const policy = privacyStack.decideCsp({}, 'example.com', true)
    assert(typeof policy === 'string' && policy.length > 0, 'no-CSP + enabled must inject, got: ' + policy)
    assert(policy === privacyStack.DEFAULT_CSP_POLICY, 'wildcard injection must use the default policy')
    assert(/default-src 'self'/.test(policy) && /object-src 'none'/.test(policy), 'policy must be conservative')
    pass('no-CSP + enabled → conservative policy injected')
  } catch (e) { fail('no-CSP + enabled → conservative policy injected', e) }

  try {
    assert(privacyStack.decideCsp({ 'Content-Security-Policy': ["default-src 'none'"] }, 'example.com', true) === null,
      'existing enforced CSP must suppress injection')
    assert(privacyStack.decideCsp({ 'content-security-policy-report-only': ['x'] }, 'example.com', true) === null,
      'existing report-only CSP must suppress injection (case-insensitive)')
    assert(privacyStack.decideCsp({ 'content-security-policy': ['x'] }, 'example.com', true) === null,
      'lowercase CSP header key must be detected')
    pass('any existing CSP header (any casing, report-only too) → null')
  } catch (e) { fail('any existing CSP header (any casing, report-only too) → null', e) }

  try {
    assert(privacyStack.decideCsp({}, 'example.com', false) === null, 'disabled (false) must be null')
    assert(privacyStack.decideCsp({}, 'example.com', undefined) === null, 'disabled (undefined) must be null')
    assert(privacyStack.decideCsp({}, 'example.com', { enabled: false, allowlist: ['example.com'] }) === null,
      'disabled settings block must be null')
    assert(privacyStack.decideCsp({}, 'example.com', 0) === null, 'falsy enabled must be null')
    pass('disabled → null in boolean and settings-block forms')
  } catch (e) { fail('disabled → null in boolean and settings-block forms', e) }

  try {
    for (const bad of ['file:///C:/page.html', 'devtools://devtools/bundle.js', 'yogatik://newtab.html',
      'chrome://settings/', 'about:blank', 'data:text/html,x', '']) {
      assert(privacyStack.decideCsp({}, bad, true) === null, 'non-http(s) host must never be touched: ' + bad)
    }
    pass('file://, devtools://, yogatik://, chrome://, about:, data: → null')
  } catch (e) { fail('file://, devtools://, yogatik://, chrome://, about:, data: → null', e) }

  try {
    for (const local of ['localhost', 'http://localhost:3000/', '127.0.0.1', 'http://127.0.0.1:8080/',
      '10.0.0.5', '192.168.1.4', '172.16.0.9', '169.254.1.1', '[::1]']) {
      assert(privacyStack.decideCsp({}, local, true) === null, 'local/LAN targets are exempt: ' + local)
    }
    pass('localhost / loopback / LAN exemptions hold')
  } catch (e) { fail('localhost / loopback / LAN exemptions hold', e) }

  try {
    const cfg = { enabled: true, allowlist: ['example.com'] }
    assert(typeof privacyStack.decideCsp({}, 'example.com', cfg) === 'string', 'allow-listed host should inject')
    assert(typeof privacyStack.decideCsp({}, 'https://sub.example.com/page', cfg) === 'string', 'subdomains of an allow-listed host should inject')
    assert(privacyStack.decideCsp({}, 'other.com', cfg) === null, 'non-allow-listed host must NOT inject')
    assert(privacyStack.decideCsp({}, 'evilexample.com', cfg) === null, 'suffix spoof (no dot boundary) must NOT match')
    pass('allow-list gating: exact + subdomain in, everything else out')
  } catch (e) { fail('allow-list gating: exact + subdomain in, everything else out', e) }

  try {
    const cfg = { enabled: true, allowlist: ['example.com'], policy: "default-src 'none'" }
    assert(privacyStack.decideCsp({}, 'example.com', cfg) === "default-src 'none'", 'custom policy must be returned verbatim')
    pass('custom policy override honored')
  } catch (e) { fail('custom policy override honored', e) }

  try {
    const merged = privacyStack.withOptionalCsp('https://example.com/x', { 'X-Test': ['1'] }, true)
    assert(Array.isArray(merged['Content-Security-Policy']) && merged['Content-Security-Policy'].length === 1,
      'withOptionalCsp must append an array-valued CSP header')
    assert(merged['X-Test'][0] === '1', 'existing headers must be preserved')
    assert(privacyStack.withOptionalCsp('https://has-csp.test/', { 'Content-Security-Policy': ['x'] }, true)['Content-Security-Policy'].length === 1,
      'withOptionalCsp must not stack a second CSP')
    pass('withOptionalCsp merges without clobbering existing headers')
  } catch (e) { fail('withOptionalCsp merges without clobbering existing headers', e) }

  // ── 3. Containers (partition ids, sessions, openInContainer) ────────────
  section('3. Containers (stable/unique partitions, UA opt-in, tab stamping)')

  try {
    assert(privacyStack.containerPartition('Shopping') === 'persist:container-shopping', 'id must be normalized')
    assert(privacyStack.containerPartition('shopping') === privacyStack.containerPartition('Shopping'),
      'same id must map to the SAME partition (stable across restarts)')
    assert(privacyStack.containerPartition('a') !== privacyStack.containerPartition('b'), 'distinct ids must map to distinct partitions')
    for (const bad of ['', '   ', '../evil', 'has space', 'a'.repeat(40), 42, null, undefined, {}]) {
      assert(privacyStack.containerPartition(bad) === null, 'invalid id must map to null: ' + JSON.stringify(bad))
    }
    pass('container partition ids stable, unique, and validated')
  } catch (e) { fail('container partition ids stable, unique, and validated', e) }

  try {
    const created = []
    const sessions = privacyStack.createContainerSessions(
      { work: 'Work', personal: 'Personal', '../evil': 'bad' },
      { fromPartition: (p) => { created.push(p); return { partition: p } } }
    )
    assert(sessions.size === 2, 'only valid ids should get sessions, got: ' + created.join(','))
    assert(created.includes('persist:container-work') && created.includes('persist:container-personal'),
      'partitions must follow the persist:container-<id> scheme: ' + created.join(','))
    assert(sessions.get('work').partition === 'persist:container-work', 'session must carry its partition')
    assert(!created.some(p => p.includes('evil')), 'invalid id must never create a partition')
    pass('createContainerSessions builds one session per valid id')
  } catch (e) { fail('createContainerSessions builds one session per valid id', e) }

  try {
    const uaCalls = []
    const sessions = privacyStack.createContainerSessions(['x', 'y'], {
      fromPartition: () => ({ setUserAgent: (ua) => uaCalls.push(ua) }),
      baseUserAgent: 'Mozilla/5.0 Base',
    })
    assert(uaCalls.length === 0, 'distinct user agents must be DISABLED by default, got: ' + uaCalls.length)
    const sessionsUa = privacyStack.createContainerSessions(['x', 'y'], {
      fromPartition: () => ({ setUserAgent: (ua) => uaCalls.push(ua) }),
      distinctUserAgents: true,
      baseUserAgent: 'Mozilla/5.0 Base',
    })
    assert(uaCalls.length === 2, 'opt-in distinct user agents must cover every container')
    assert(uaCalls[0] !== uaCalls[1], 'per-container user agents must be distinct from each other')
    assert(uaCalls.every(ua => ua.startsWith('Mozilla/5.0 Base')), 'distinct UA must keep the base string')
    assert(sessions.size === 2 && sessionsUa.size === 2, 'sessions must be created in both runs')
    pass('distinct user agents opt-in only, distinct per container')
  } catch (e) { fail('distinct user agents opt-in only, distinct per container', e) }

  try {
    const tab = {}
    const session = { tabs: new Map() }
    let captured = null
    const res = privacyStack.openInContainer({
      session,
      createTab: (s, url, opts) => { captured = { s, url, opts }; session.tabs.set('t1', tab); return 't1' },
    }, 'Work', 'https://example.test/')
    assert(res.success === true && res.tabId === 't1', 'openInContainer should succeed: ' + JSON.stringify(res))
    assert(res.partition === 'persist:container-work', 'tab must use the container partition')
    assert(captured && captured.opts && captured.opts.partition === 'persist:container-work', 'createTab must receive the partition opt')
    assert(tab.containerId === 'work', 'tab must be stamped with its containerId for tree-node assignment')
    const bad = privacyStack.openInContainer({ session, createTab: () => 'x' }, '../evil')
    assert(bad.success === false && bad.error, 'invalid container id must be refused')
    pass('openInContainer creates the tab in the container partition and stamps it')
  } catch (e) { fail('openInContainer creates the tab in the container partition and stamps it', e) }

  // ── 4. Storage audit (pure grouping + optional estimate) ────────────────
  section('4. Origin storage audit (pure cookie grouping, optional estimate)')

  try {
    const grouped = privacyStack.groupCookiesByDomain([
      { domain: '.youtube.com', name: 'a' },
      { domain: '.youtube.com', name: 'b' },
      { domain: 'YOUTUBE.com', name: 'c' },
      { domain: '.github.com', name: 'd' },
      { url: 'https://news.test/page', name: 'e' },
      { domain: '', name: 'no-domain' },
      null,
    ])
    assert(grouped.length === 3, 'dot/case variants must merge into one domain per site, got: ' + JSON.stringify(grouped))
    assert(grouped[0].domain === 'youtube.com' && grouped[0].count === 3, 'youtube should group to 3 cookies')
    assert(grouped[0].names.join(',') === 'a,b,c', 'cookie names should be kept for the audit view')
    assert(grouped[1].domain === 'github.com' && grouped[1].count === 1, 'sort must be by count desc')
    assert(grouped.some(g => g.domain === 'news.test' && g.count === 1), 'url-derived host must be used when domain is missing')
    pass('groupCookiesByDomain merges dot/case variants and sorts by count')
  } catch (e) { fail('groupCookiesByDomain merges dot/case variants and sorts by count', e) }

  try {
    const audit = await privacyStack.auditOriginStorage(null)
    assert(audit.success === false && Array.isArray(audit.origins), 'null session must refuse cleanly')
    const ses = makeFakeSession([{ domain: '.a.test', name: 'x' }, { domain: '.b.test', name: 'y' }, { domain: '.b.test', name: 'z' }])
    const ok = await privacyStack.auditOriginStorage(ses)
    assert(ok.success === true && ok.totalCookies === 3, 'audit should count all cookies')
    assert(ok.origins.length === 2 && ok.origins[0].domain === 'b.test' && ok.origins[0].count === 2, 'grouped origins should be sorted')
    assert(ok.storage === null, 'missing getStorageData must report storage:null, not throw')
    pass('auditOriginStorage groups cookies and tolerates a missing getStorageData')
  } catch (e) { fail('auditOriginStorage groups cookies and tolerates a missing getStorageData', e) }

  try {
    const ses = makeFakeSession([{ domain: '.a.test', name: 'x' }], {
      getStorageData: async () => ({ usage: 2048, quota: 4096 }),
    })
    const ok = await privacyStack.auditOriginStorage(ses)
    assert(ok.storage && ok.storage.usage === 2048 && ok.storage.quota === 4096, 'storage estimate should flow through when available')
    const throwing = makeFakeSession([{ domain: '.a.test', name: 'x' }], {
      getStorageData: async () => { throw new Error('boom') },
    })
    const still = await privacyStack.auditOriginStorage(throwing)
    assert(still.success === true && still.storage === null, 'a throwing getStorageData must not fail the audit')
    pass('storage estimate used when available, swallowed when it throws')
  } catch (e) { fail('storage estimate used when available, swallowed when it throws', e) }

  // ── 5. wipeOrigin (scoped removal) ──────────────────────────────────────
  section('5. wipeOrigin (scoped to one origin)')

  try {
    const opts = {}
    const ses = makeFakeSession([
      { domain: '.youtube.com', name: 'one', secure: true, path: '/' },
      { domain: 'youtube.com', name: 'two', secure: false, path: '/' },
      { domain: '.notyoutube.com', name: 'three', secure: false, path: '/' },
      { domain: '.github.com', name: 'keep', secure: true, path: '/' },
    ], opts)
    const res = await privacyStack.wipeOrigin(ses, 'https://www.youtube.com')
    assert(res.success === true && res.removed === 2, 'only the target origin\'s cookies must be removed, got: ' + JSON.stringify(res))
    assert(opts.removed.length === 2 && opts.removed.every(r => /youtube\.com\/$/.test(r.url)), 'remove urls must target youtube: ' + JSON.stringify(opts.removed))
    assert(opts.removed.some(r => r.url.startsWith('https://')), 'secure cookies must remove via https://')
    assert(opts.cleared && opts.cleared.length === 1 && opts.cleared[0].origins[0] === 'https://www.youtube.com',
      'clearStorageData must scope to the target origin')
    pass('wipeOrigin removes exactly the target origin (subdomains included)')
  } catch (e) { fail('wipeOrigin removes exactly the target origin (subdomains included)', e) }

  try {
    const ses = makeFakeSession([])
    const bad = await privacyStack.wipeOrigin(ses, 'not a url')
    assert(bad.success === false && bad.error, 'invalid origin must be refused')
    const none = await privacyStack.wipeOrigin(null, 'https://a.test')
    assert(none.success === false, 'null session must refuse cleanly')
    pass('wipeOrigin refuses invalid origins and null sessions')
  } catch (e) { fail('wipeOrigin refuses invalid origins and null sessions', e) }

  // ── 6. Settings privacy block (defaults merge + structuredClone guard) ──
  section('6. Settings privacy block (defaults, structuredClone regression guard)')

  try {
    const s = store.load()
    assert(s.privacy.dns && s.privacy.dns.mode === 'secure', 'privacy.dns.mode default must be "secure"')
    assert(s.privacy.dns.template === '', 'privacy.dns.template default must be empty')
    assert(s.privacy.cspInjection && s.privacy.cspInjection.enabled === false, 'cspInjection must default OFF')
    assert(Array.isArray(s.privacy.cspInjection.allowlist) && s.privacy.cspInjection.allowlist.length === 0, 'cspInjection allowlist must default empty')
    assert(s.privacy.containers && s.privacy.containers.enabled === false, 'containers must default disabled')
    assert(s.privacy.containers.distinctUserAgents === false, 'distinct container user agents must default off')
    assert(Array.isArray(s.privacy.containers.list) && s.privacy.containers.list.length === 0, 'containers list must default empty')
    pass('privacy block defaults load through (dns secure, cspInjection off, containers off)')
  } catch (e) { fail('privacy block defaults load through (dns secure, cspInjection off, containers off)', e) }

  try {
    const defaultsBefore = JSON.stringify(require('../electron/settings/defaults.json'))
    store.set('privacy.dns.mode', 'off')
    store.set('privacy.cspInjection.allowlist', ['a.com'])
    const defaultsAfter = JSON.stringify(require('../electron/settings/defaults.json'))
    assert(defaultsBefore === defaultsAfter, 'factory DEFAULTS were mutated by privacy settings writes (structuredClone regression)')
    assert(store.get('privacy.dns.mode') === 'off', 'dot-path write should be visible via get()')
    assert(store.get('privacy.dns.template') === '', 'sibling default should survive the merge untouched')
    assert(JSON.stringify(store.get('privacy.cspInjection.allowlist')) === JSON.stringify(['a.com']),
      'arrays must REPLACE defaults, not merge element-wise')
    const reset = store.reset()
    assert(reset.privacy.dns.mode === 'secure' && reset.privacy.cspInjection.enabled === false, 'reset() must restore privacy factory values')
    pass('privacy writes never pollute DEFAULTS; arrays replace, reset restores')
  } catch (e) { fail('privacy writes never pollute DEFAULTS; arrays replace, reset restores', e) }

  // ── 7. wirePrivacyStack (IPC surface, end-to-end through the stub) ─────
  section('7. wirePrivacyStack (containers + audit IPC surface)')

  try {
    const wired = privacyStack.wirePrivacyStack({
      ipcMain: electronStub.ipcMain,
      getSetting: store.get,
      setSetting: store.set,
      defaultSession: makeFakeSession([]),
      sessions: new Map(),
      ensureSession: () => ({ tabs: new Map() }),
      createTab: () => 'tab-x',
      showActive: () => {},
      mainWindowGetter: () => null,
    })
    assert(wired === true, 'wirePrivacyStack should register and return true')
    const listed = await electronStub.ipcRenderer.invoke('privacy:containers-list')
    assert(listed.success === true && Array.isArray(listed.containers) && listed.containers.length === 0,
      'containers-list should start empty on factory defaults: ' + JSON.stringify(listed))
    assert(listed.enabled === false && listed.distinctUserAgents === false, 'list should report the opt-in flags')
    pass('wirePrivacyStack registers the IPC surface; list starts empty')
  } catch (e) { fail('wirePrivacyStack registers the IPC surface; list starts empty', e) }

  try {
    const created = await electronStub.ipcRenderer.invoke('privacy:containers-create', { id: 'Work', label: 'Work stuff' })
    assert(created.success === true && created.id === 'work', 'create should normalize the id: ' + JSON.stringify(created))
    assert(created.partition === 'persist:container-work', 'create should report the partition')
    const persisted = store.get('privacy.containers.list')
    assert(Array.isArray(persisted) && persisted.length === 1 && persisted[0].id === 'work' && persisted[0].label === 'Work stuff',
      'container must persist to settings privacy.containers.list')
    const dup = await electronStub.ipcRenderer.invoke('privacy:containers-create', { id: 'work' })
    assert(dup.success === false && dup.error, 'duplicate container ids must be refused')
    const invalid = await electronStub.ipcRenderer.invoke('privacy:containers-create', { id: '../evil' })
    assert(invalid.success === false && invalid.error, 'invalid container ids must be refused at IPC level too')
    pass('containers-create normalizes, persists, and refuses duplicates/invalid ids')
  } catch (e) { fail('containers-create normalizes, persists, and refuses duplicates/invalid ids', e) }

  try {
    const chromeSession = { tabs: new Map() }
    let captured = null
    // Re-wire with a resolvable chrome session + recording createTab.
    privacyStack.wirePrivacyStack({
      ipcMain: electronStub.ipcMain,
      getSetting: store.get,
      setSetting: store.set,
      defaultSession: makeFakeSession([]),
      sessions: new Map([['__default__', { win: { fake: true }, tabs: new Map() }]]),
      ensureSession: () => chromeSession,
      createTab: (s, url, opts2) => {
        captured = { s, url, opts: opts2 }
        chromeSession.tabs.set('tab-1', {})
        return 'tab-1'
      },
      showActive: () => {},
      mainWindowGetter: () => ({ fake: true }),
    })
    const opened = await electronStub.ipcRenderer.invoke('privacy:containers-open', { id: 'work', url: 'https://example.test/' })
    assert(opened.success === true && opened.tabId === 'tab-1', 'containers-open should create the tab: ' + JSON.stringify(opened))
    assert(captured && captured.opts.partition === 'persist:container-work', 'the tab must be created inside the container partition')
    assert(chromeSession.tabs.get('tab-1').containerId === 'work', 'tree-node container assignment stamp must be set')
    const notOpen = await electronStub.ipcRenderer.invoke('privacy:containers-open', { id: 'does-not-exist!' })
    assert(notOpen.success === false, 'invalid container id must be refused on open')
    pass('containers-open creates a stamped tab inside the container partition')
  } catch (e) { fail('containers-open creates a stamped tab inside the container partition', e) }

  try {
    const audit = await electronStub.ipcRenderer.invoke('privacy:storage-audit')
    assert(audit.success === true && audit.origins.length === 0 && audit.totalCookies === 0, 'audit on an empty fake session should be clean')
    const wiped = await electronStub.ipcRenderer.invoke('privacy:wipe-origin', { origin: 'https://a.test' })
    assert(wiped.success === true && wiped.removed === 0, 'wipe on an empty session should succeed with 0 removals')
    const badWipe = await electronStub.ipcRenderer.invoke('privacy:wipe-origin', { origin: 42 })
    assert(badWipe.success === false, 'non-string origins must be refused at the IPC boundary')
    pass('storage-audit + wipe-origin IPC validate payloads and respond cleanly')
  } catch (e) { fail('storage-audit + wipe-origin IPC validate payloads and respond cleanly', e) }

  // Restore module resolution for anything loaded after this suite.
  Module._resolveFilename = origResolve
  return { passes, failures }
}

// A collectable pass/fail API with the same shape as the parent harness.
const harness = {
  pass, fail, assert, section,
  counts() { return { passes, failures } },
}

module.exports = { run, harness }

// Standalone: node tests/privacyStack.test.cjs
if (require.main === module) {
  run().then((res) => {
    console.log('\nprivacyStack tests — Passed: ' + res.passes + '   Failed: ' + res.failures)
    process.exit(res.failures > 0 ? 1 : 0)
  }).catch((e) => {
    console.error('privacyStack test suite crashed:', e)
    process.exit(1)
  })
}
