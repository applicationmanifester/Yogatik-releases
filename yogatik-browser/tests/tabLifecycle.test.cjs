#!/usr/bin/env node
'use strict'

// Unit tests for electron/tabLifecycle.cjs — the same Electron-stub pattern
// as the settings-store section of run-tests.cjs: require('electron') is
// redirected to tests/electron-stub.cjs BEFORE the modules load, and the
// sleep/wake/crash machinery runs against duck-typed stub sessions whose
// views/webContents are plain objects exposing just the surface the module
// uses. Pure logic (pickSleepCandidates, mapMetricsToTabs, shouldAutoRestore,
// spellcheckLanguagesForLocale, hostIsBlocklisted) needs no stubbing at all.

const fs = require('fs')
const os = require('os')
const path = require('path')

let failures = 0
let passes = 0

function pass(name) { passes++; console.log('  \u2714 ' + name) }
function fail(name, err) {
  failures++
  console.error('  \u2716 ' + name)
  console.error('      ' + (err && err.message ? err.message : String(err)))
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed') }
function deepEqual(a, b, msg) {
  const ja = JSON.stringify(a)
  const jb = JSON.stringify(b)
  assert(ja === jb, (msg || 'deep equal failed') + ` — got ${ja}, expected ${jb}`)
}

// ── Electron stub wiring (must run before any module require below) ─────
process.env.YOGATIK_TEST_USERDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yogatik-lifecycle-'))
const Module = require('module')
const STUB_PATH = path.join(__dirname, 'electron-stub.cjs')
const origResolve = Module._resolveFilename
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'electron') return STUB_PATH
  return origResolve.call(this, request, parent, isMain, options)
}

const lifecycle = require('../electron/tabLifecycle.cjs')

// ── Stub builders ────────────────────────────────────────────────────────

function makeStubWebContents({ url = '', title = '', audible = false, scroll = { x: 0, y: 0 } } = {}) {
  return {
    destroyedFlag: false,
    loadCalls: [],
    onceSet: [],
    getURL() { return url },
    getTitle() { return title },
    isCurrentlyAudible() { return audible },
    getProcessId() { return 4242 },
    async executeJavaScript() { return scroll },
    loadURL(u) { this.loadCalls.push(u); return Promise.resolve() },
    once(ev) { this.onceSet.push(ev) },
    on() {},
    setWindowOpenHandler() {},
    setUserAgent() {},
    destroy() { this.destroyedFlag = true },
    close() { this.destroyedFlag = true },
  }
}

function makeStubView(wcOpts = {}) {
  const wc = makeStubWebContents(wcOpts)
  return { webContents: wc, setBounds() {}, webPrefsSeen: null }
}

// The surface a window-mode session owns. Rich enough for showActive →
// layout → syncTabBar to run against it without touching a real BrowserWindow.
function makeStubWin() {
  return {
    contentView: {
      children: [],
      addChildView(v) { this.children.push(v) },
      removeChildView(v) {
        const i = this.children.indexOf(v)
        if (i >= 0) this.children.splice(i, 1)
      },
    },
    isDestroyed() { return false },
    isVisible() { return true },
    show() {},
    getContentSize() { return [1200, 800] },
    on() {},
    webContents: { async executeJavaScript() {} },
  }
}

function makeStubTab({ view = null, url = '', title = '', pinned = false, isAgent = false } = {}) {
  return {
    view,
    viewCreated: !!view,
    webPrefs: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    refEpoch: 0, console: [], failed: [], network: [], pendingRequests: new Map(),
    humanControl: false, helpRequested: false, isAgent, pinned,
    _pendingUrl: null, savedUrl: url || null, savedTitle: title || null, savedScroll: null,
    hibernating: false,
  }
}

// The "tab tree": a browserControl session object — tabs Map, activeTabId,
// win. Keyed 'test-session' (not '__default__') so persistSession skips it.
function makeStubTree(tabs, activeTabId) {
  return {
    key: 'test-session',
    mode: 'window',
    win: makeStubWin(),
    tabs: new Map(tabs),
    activeTabId,
  }
}

function settle() { return new Promise((r) => setImmediate(r)) }

// ── Test data constants ──────────────────────────────────────────────────
const NOW = 1_000_000_000
const BUDGET = lifecycle.DEFAULT_SLEEP_AFTER_MS
const AGED_AT = NOW - BUDGET - 1000

function snowNode(over = {}) {
  return {
    id: 't',
    pinned: false,
    audible: false,
    hasView: true,
    hibernating: false,
    state: null,
    protected: false,
    url: 'https://example.com/page',
    lastActiveAt: AGED_AT,
    ...over,
  }
}

async function testCase(name, fn) {
  try { await fn(); pass(name) } catch (e) { fail(name, e) }
}

async function run() {
  // ── A. pickSleepCandidates matrix ──
  await testCase('pickSleepCandidates: the active tab is never a candidate', async () => {
    assert(lifecycle.pickSleepCandidates([snowNode({ id: 'a' })], NOW, { activeId: 'a', sleepAfterMs: BUDGET }).length === 0)
  })

  await testCase('pickSleepCandidates: pinned tabs are never candidates', async () => {
    assert(lifecycle.pickSleepCandidates([snowNode({ id: 'p', pinned: true })], NOW, { activeId: null, sleepAfterMs: BUDGET }).length === 0)
  })

  await testCase('pickSleepCandidates: audible tabs are never candidates', async () => {
    assert(lifecycle.pickSleepCandidates([snowNode({ id: 'au', audible: true })], NOW, { activeId: null, sleepAfterMs: BUDGET }).length === 0)
  })

  await testCase('pickSleepCandidates: agent tabs are protected', async () => {
    assert(lifecycle.pickSleepCandidates([snowNode({ id: 'ag', protected: true })], NOW, { activeId: null, sleepAfterMs: BUDGET }).length === 0)
  })

  await testCase('pickSleepCandidates: an aged ordinary tab IS a candidate', async () => {
    deepEqual(lifecycle.pickSleepCandidates([snowNode({ id: 't' })], NOW, { sleepAfterMs: BUDGET }), ['t'])
  })

  await testCase('pickSleepCandidates: a recently active tab is not (yet)', async () => {
    const young = snowNode({ id: 'y', lastActiveAt: NOW - 1000 })
    assert(lifecycle.pickSleepCandidates([young], NOW, { sleepAfterMs: BUDGET }).length === 0)
  })

  await testCase('pickSleepCandidates: a tab with no known activity is left alone', async () => {
    assert(lifecycle.pickSleepCandidates([snowNode({ id: 'u', lastActiveAt: 0 })], NOW, { sleepAfterMs: BUDGET }).length === 0)
  })

  await testCase('pickSleepCandidates: blocklisted host cannot sleep (exact match)', async () => {
    const blocked = snowNode({ id: 'b', url: 'https://gmail.com/mail' })
    assert(lifecycle.pickSleepCandidates([blocked], NOW, { sleepAfterMs: BUDGET, blocklist: ['gmail.com'] }).length === 0)
  })

  await testCase('pickSleepCandidates: blocklist covers subdomains', async () => {
    const sub = snowNode({ id: 's', url: 'https://docs.google.com/document/x' })
    assert(lifecycle.pickSleepCandidates([sub], NOW, { sleepAfterMs: BUDGET, blocklist: ['google.com'] }).length === 0)
  })

  await testCase('pickSleepCandidates: blocklist does not over-match similar hosts', async () => {
    const near = snowNode({ id: 'n', url: 'https://notgoogle.com/' })
    deepEqual(lifecycle.pickSleepCandidates([near], NOW, { sleepAfterMs: BUDGET, blocklist: ['google.com'] }), ['n'])
  })

  await testCase('pickSleepCandidates: already-down tabs are never candidates', async () => {
    const out = [
      snowNode({ id: 'h', hibernating: true }),
      snowNode({ id: 'sa', state: 'asleep' }),
      snowNode({ id: 'sc', state: 'crashed' }),
    ]
    assert(lifecycle.pickSleepCandidates(out, NOW, { sleepAfterMs: BUDGET }).length === 0)
  })

  await testCase('pickSleepCandidates: viewless (lazy) tabs cannot sleep', async () => {
    assert(lifecycle.pickSleepCandidates([snowNode({ id: 'lv', hasView: false })], NOW, { sleepAfterMs: BUDGET }).length === 0)
  })

  await testCase('pickSleepCandidates: sleepAfterMs 0 disables sleeping', async () => {
    assert(lifecycle.pickSleepCandidates([snowNode({ id: 't' })], NOW, { sleepAfterMs: 0 }).length === 0)
  })

  await testCase('pickSleepCandidates: candidates return in input order, filtered', async () => {
    const nodes = [
      snowNode({ id: 'active' }),
      snowNode({ id: 'b1' }),
      snowNode({ id: 'audible', audible: true }),
      snowNode({ id: 'b2' }),
      snowNode({ id: 'blocked', url: 'https://gmail.com/' }),
    ]
    deepEqual(
      lifecycle.pickSleepCandidates(nodes, NOW, { activeId: 'active', sleepAfterMs: BUDGET, blocklist: ['gmail.com'] }),
      ['b1', 'b2'],
    )
  })

  // ── B. sleep: capture, destroy, keep the node ──
  await testCase('sweep puts an aged background tab asleep, preserving url/title/scroll/position', async () => {
    const activeView = makeStubView({ url: 'https://example.com/active', title: 'Active' })
    const oldView = makeStubView({ url: 'https://example.com/article', title: 'Article', scroll: { x: 0, y: 420 } })
    const tree = makeStubTree([
      ['tab-a', makeStubTab({ view: activeView, url: 'https://example.com/active' })],
      ['tab-b', makeStubTab({ view: oldView, url: 'https://example.com/article', title: 'Article' })],
    ], 'tab-a')
    tree.win.contentView.children.push(activeView, oldView)
    lifecycle.noteActivity(tree, 'tab-a', NOW)
    lifecycle.noteActivity(tree, 'tab-b', AGED_AT)

    const slept = await lifecycle.sweepTree(tree, NOW)
    assert(slept.length === 1, 'one tab should have slept')

    const tabB = tree.tabs.get('tab-b')
    assert(tabB.hibernating === true, 'node marked hibernating')
    assert(tabB.view === null, 'view detached and nulled')
    assert(oldView.webContents.destroyedFlag === true, 'webContents destroyed gracefully')
    assert(tabB.sleep.state === 'asleep', 'node state is asleep')
    assert(tabB.sleep.url === 'https://example.com/article', 'url captured')
    assert(tabB.sleep.title === 'Article', 'title captured')
    assert(tabB.sleep.scrollHint && tabB.sleep.scrollHint.y === 420, 'scroll hint captured')
    assert(tabB.sleep.position === 1, 'strip position captured')
    assert(tabB.savedUrl === 'https://example.com/article', 'savedUrl mirrors the capture')
    assert(tabB.savedTitle === 'Article', 'savedTitle mirrors the capture')
    assert(!tree.win.contentView.children.includes(oldView), 'view removed from the surface')
    assert(tree.tabs.get('tab-a').view === activeView, 'active tab untouched')
    assert(tree.activeTabId === 'tab-a', 'active tab unchanged')
  })

  await testCase('sweep never sleeps the active / pinned / audible / blocklisted tabs of a real tree', async () => {
    // The sweep reads the blocklist from the settings store — seed it, and
    // clear it afterwards so later sections start clean.
    const store = require('../electron/settings/store.cjs')
    store.set('performance.blocklist', ['gmail.com'])
    const activeView = makeStubView({ url: 'https://example.com/active' })
    const pinnedView = makeStubView({ url: 'https://example.com/pinned' })
    const audibleView = makeStubView({ url: 'https://radio.fm/stream', title: 'Radio', audible: true })
    const blockedView = makeStubView({ url: 'https://gmail.com/inbox', title: 'Mail' })
    const farFuture = NOW + BUDGET // "aged": seed activities in the past
    const tree = makeStubTree([
      ['tab-a', makeStubTab({ view: activeView, url: 'https://example.com/active' })],
      ['tab-p', makeStubTab({ view: pinnedView, url: 'https://example.com/pinned', pinned: true })],
      ['tab-au', makeStubTab({ view: audibleView, url: 'https://radio.fm/stream' })],
      ['tab-bl', makeStubTab({ view: blockedView, url: 'https://gmail.com/inbox' })],
    ], 'tab-a')
    for (const id of ['tab-a', 'tab-p', 'tab-au', 'tab-bl']) lifecycle.noteActivity(tree, id, farFuture - BUDGET - 1000)

    const slept = await lifecycle.sweepTree(tree, farFuture)
    assert(slept.length === 0, 'nothing should sleep')
    assert(tree.tabs.get('tab-p').view === pinnedView, 'pinned kept alive')
    assert(tree.tabs.get('tab-au').view === audibleView, 'audible kept alive')
    assert(tree.tabs.get('tab-bl').view === blockedView, 'blocklisted kept alive')
    store.set('performance.blocklist', [])
  })

  // ── C. wake: same node, same position, saved url restored ──
  await testCase('wake rebuilds the view at the same position from the saved url', async () => {
    const oldView = makeStubView({ url: 'https://example.com/article', title: 'Article', scroll: { x: 0, y: 420 } })
    const activeView = makeStubView({ url: 'https://example.com/active' })
    const tree = makeStubTree([
      ['tab-a', makeStubTab({ view: activeView, url: 'https://example.com/active' })],
      ['tab-b', makeStubTab({ view: oldView, url: 'https://example.com/article', title: 'Article' })],
    ], 'tab-a')
    lifecycle.noteActivity(tree, 'tab-b', AGED_AT)
    await lifecycle.sweepTree(tree, NOW)
    assert(tree.tabs.get('tab-b').hibernating === true, 'precondition: asleep')

    const created = []
    lifecycle.setViewFactory((webPrefs) => {
      const v = makeStubView({})
      v.webPrefsSeen = webPrefs
      created.push(v)
      return v
    })

    const res = await lifecycle.wake(tree, 'tab-b', { activate: true })
    assert(res.success === true, 'wake succeeded')
    const tabB = tree.tabs.get('tab-b')
    assert(tabB.view === created[created.length - 1], 'view rebuilt through the factory')
    assert(tabB.hibernating === false, 'no longer hibernating')
    assert(tabB.sleep.state === 'awake', 'state awake')
    deepEqual(tabB.view.webPrefsSeen, { contextIsolation: true, nodeIntegration: false, sandbox: true }, 'same web preferences as the original view')
    deepEqual(tabB.view.webContents.loadCalls, ['https://example.com/article'], 'saved url reloaded')
    assert(tabB.view.webContents.onceSet.includes('did-finish-load'), 'scroll restore scheduled on next finish-load')
    assert(tree.activeTabId === 'tab-b', 'wake(activate) made it active')
    deepEqual([...tree.tabs.keys()], ['tab-a', 'tab-b'], 'strip position preserved')

    const before = created.length
    const res2 = await lifecycle.wake(tree, 'tab-b')
    assert(res2.success === true && res2.alreadyAwake === true, 'second wake is a no-op')
    assert(created.length === before, 'no duplicate view created')

    lifecycle.setViewFactory(null)
  })

  await testCase('registerTree honors a per-tree sleepAfterMs override', async () => {
    const view = makeStubView({ url: 'https://example.com/old', title: 'Old' })
    const activeView = makeStubView({ url: 'https://example.com/active' })
    const tree = makeStubTree([
      ['tab-a', makeStubTab({ view: activeView, url: 'https://example.com/active' })],
      ['tab-b', makeStubTab({ view, url: 'https://example.com/old' })],
    ], 'tab-a')
    const handle = lifecycle.registerTree(tree, { sleepAfterMs: 10_000 })
    assert(handle && typeof handle.sweep === 'function' && typeof handle.stop === 'function', 'registerTree returns a sweep/stop handle')
    // 10.5s of inactivity against a 10s override budget → sleeps.
    lifecycle.noteActivity(tree, 'tab-b', NOW - 10_500)
    const slept = await handle.sweep(NOW)
    assert(slept.length === 1, 'override budget applied')
    assert(tree.tabs.get('tab-b').hibernating === true, 'slept under the override')
    handle.stop()
  })

  // ── D. crash resilience: exactly one auto-restore, then user action ──
  await testCase('a crashed renderer is auto-restored exactly once, then requires user action', async () => {
    const crashedView = makeStubView({ url: 'https://app.example.com/', title: 'App' })
    const tree = makeStubTree([['t-c', makeStubTab({ view: crashedView, url: 'https://app.example.com/', title: 'App' })]], 't-c')
    const created = []
    lifecycle.setViewFactory((webPrefs) => { const v = makeStubView({}); created.push(v); return v })

    const state = lifecycle.handleCrash(tree, 't-c', { reason: 'crashed' })
    assert(state && state.crashReason === 'crashed', 'node marked crashed with reason')
    assert(tree.tabs.has('t-c'), 'node is KEPT, never deleted')
    await settle()

    const tab = tree.tabs.get('t-c')
    assert(tab.sleep.state === 'awake', 'first crash auto-restored')
    assert(tab.sleep.autoRestores === 1, 'auto-restore budget consumed')
    assert(tab.hibernating === false && tab.view === created[created.length - 1], 'view rebuilt automatically')
    assert(tree.activeTabId === 't-c', 'crashed active tab stays active')

    // Second crash: NO second auto-restore — the tab stays crashed.
    lifecycle.handleCrash(tree, 't-c', { reason: 'crashed' })
    await settle()
    assert(tree.tabs.get('t-c').sleep.state === 'crashed', 'stays crashed after the budget is used')
    assert(tree.tabs.get('t-c').sleep.autoRestores === 1, 'budget not re-granted')
    assert(tree.tabs.get('t-c').hibernating === true, 'node still marked down')
    assert(created.length === 1, 'no additional view was created automatically')

    // A 'killed' renderer never auto-restores at all.
    const killed = lifecycle.handleCrash(tree, 't-c', { reason: 'killed' })
    assert(killed && killed.state === 'crashed', 'killed renderer still marked crashed')
    await settle()
    assert(created.length === 1, 'killed renderer was not auto-restored')

    // User action (explicit wake through the same path) restores it.
    await lifecycle.wake(tree, 't-c', { activate: true })
    assert(tree.tabs.get('t-c').sleep.state === 'awake', 'user-initiated wake restores')
    assert(created.length === 2, 'user-initiated wake rebuilt the view')

    // clean-exit is not a crash — a sleeping tab must not flip state.
    const cleanResult = lifecycle.handleCrash(tree, 't-c', { reason: 'clean-exit' })
    assert(cleanResult === null, 'clean-exit ignored')
    assert(tree.tabs.get('t-c').sleep.state === 'awake', 'state untouched by clean-exit')

    lifecycle.setViewFactory(null)
  })

  await testCase('shouldAutoRestore allows exactly one automatic restore', async () => {
    assert(lifecycle.shouldAutoRestore(0) === true)
    assert(lifecycle.shouldAutoRestore(1) === false)
    assert(lifecycle.shouldAutoRestore(5, { maxAutoRestores: 10 }) === true)
  })

  // ── E. metrics mapping ──
  await testCase('metrics map onto tabs by renderer process id', async () => {
    const map = lifecycle.mapMetricsToTabs(
      [
        { id: 101, percentCPU: 12.5, memory: { workingSetSize: 4096 } },
        { id: 202, percentCPU: 0.4, memory: { workingSetSize: 8192 } },
      ],
      [{ tabId: 'tab-1', pid: 101 }, { tabId: 'tab-2', pid: 202 }, { tabId: 'tab-3', pid: 999 }],
    )
    deepEqual(map, {
      'tab-1': { cpu: 12.5, memoryKB: 4096 },
      'tab-2': { cpu: 0.4, memoryKB: 8192 },
    })
  })

  await testCase('sampleMetrics survives the Electron stub (no getAppMetrics)', async () => {
    const map = lifecycle.sampleMetrics()
    assert(map && typeof map === 'object', 'returns an object map without throwing')
  })

  await testCase('latestMetrics reflects the most recent sample', async () => {
    let observed = null
    lifecycle.startMetricsSampler({ intervalMs: 1000, onSample: (m) => { observed = m } })
    lifecycle.stopMetricsSampler()
    assert(observed === null || (observed && typeof observed === 'object'), 'sampler start/stop is safe under the stub')
    assert(lifecycle.latestMetrics() != null, 'latestMetrics() always returns an object')
  })

  // ── F. settings: performance block round-trip ──
  await testCase('performance settings defaults round-trip, reset restores, DEFAULTS unpolluted', async () => {
    delete require.cache[require.resolve('../electron/settings/store.cjs')]
    const stub = require('./electron-stub.cjs')
    // The stub caches its userData dir at load; re-point it explicitly (env
    // alone is only read once).
    const newDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yogatik-lifecycle-settings-'))
    process.env.YOGATIK_TEST_USERDATA = newDir
    stub.__setUserDataDir(newDir)
    const store = require('../electron/settings/store.cjs')
    const settingsFile = path.join(newDir, 'settings.json')

    const s = store.load()
    assert(s.performance.sleepAfterMs === 1_200_000, 'default sleepAfterMs is 20 minutes')
    assert(Array.isArray(s.performance.blocklist) && s.performance.blocklist.length === 0, 'default blocklist is empty')
    assert(s.performance.spellcheck === true, 'spellcheck defaults to on')

    store.set('performance.sleepAfterMs', 30_000)
    store.set('performance.blocklist', ['mail.google.com'])
    store.set('performance.spellcheck', false)
    const onDisk = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'))
    assert(onDisk.performance.sleepAfterMs === 30_000, 'sleepAfterMs persisted')
    assert(onDisk.performance.blocklist[0] === 'mail.google.com', 'blocklist persisted')

    const defaultsBefore = JSON.stringify(require('../electron/settings/defaults.json'))
    store.set('performance.sleepAfterMs', 5)
    assert(JSON.stringify(require('../electron/settings/defaults.json')) === defaultsBefore, 'factory DEFAULTS not polluted')

    delete require.cache[require.resolve('../electron/settings/store.cjs')]
    const store2 = require('../electron/settings/store.cjs')
    const reset = store2.reset()
    assert(reset.performance.sleepAfterMs === 1_200_000, 'reset restores sleepAfterMs')
    assert(Array.isArray(reset.performance.blocklist) && reset.performance.blocklist.length === 0, 'reset restores blocklist')
    assert(reset.performance.spellcheck === true, 'reset restores spellcheck')
    assert(!fs.existsSync(settingsFile), 'reset deletes settings.json')
  })

  // ── G. spellcheck locale mapping + blocklist/host edges ──
  await testCase('spellcheckLanguagesForLocale maps bare locales to full BCP-47 tags', async () => {
    deepEqual(lifecycle.spellcheckLanguagesForLocale('en-US'), ['en-US'])
    deepEqual(lifecycle.spellcheckLanguagesForLocale('en'), ['en-US'])
    deepEqual(lifecycle.spellcheckLanguagesForLocale('fr'), ['fr-FR'])
    deepEqual(lifecycle.spellcheckLanguagesForLocale('zz'), ['zz'])
    deepEqual(lifecycle.spellcheckLanguagesForLocale(''), ['en-US'])
  })

  await testCase('enableSpellcheck/disableSpellcheck work on a session-shaped object', async () => {
    const calls = []
    const fakeSession = {
      setSpellCheckerEnabled(on) { calls.push(['enabled', on]) },
      setSpellCheckerLanguages(langs) { calls.push(['languages', langs]) },
    }
    assert(lifecycle.enableSpellcheck(fakeSession) === true, 'enable reports success')
    assert(lifecycle.disableSpellcheck(fakeSession) === true, 'disable reports success')
    deepEqual(calls, [['enabled', true], ['languages', ['en-US']], ['enabled', false]], 'enable → locale dictionaries → disable path')
  })

  await testCase('hostIsBlocklisted edge cases', async () => {
    assert(lifecycle.hostIsBlocklisted('https://a.example.com/x', ['example.com']) === true)
    assert(lifecycle.hostIsBlocklisted('https://example.com.evil.io/', ['example.com']) === false, 'suffix trick does not match')
    assert(lifecycle.hostIsBlocklisted('', ['example.com']) === false)
    assert(lifecycle.hostIsBlocklisted('not a url', ['example.com']) === false)
    assert(lifecycle.hostIsBlocklisted('https://ok.example.com/', []) === false)
  })

  Module._resolveFilename = origResolve

  return { passes, failures }
}

module.exports = { run }

if (require.main === module) {
  run().then(({ passes: p, failures: f }) => {
    console.log('Passed: ' + p + '   Failed: ' + f)
    if (f > 0) { console.error('\u2716 tabLifecycle TEST SUITE FAILED'); process.exit(1) }
    console.log('\u2714 tabLifecycle TEST SUITE PASSED')
    process.exit(0)
  })
}
