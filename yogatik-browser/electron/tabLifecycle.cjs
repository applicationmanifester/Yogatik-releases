// Tab lifecycle & performance for Yogatik Browser.
//
// Owns the four things Chrome does that browserControl.cjs's plain
// open/activate/close model does not:
//
//   1. Sleeping tabs — after performance.sleepAfterMs of inactivity a tab's
//      WebContentsView is detached and its webContents destroyed; the NODE
//      itself stays in the session at its strip position, carrying
//      {url, title, scrollHint, position} so wake() can rebuild the view
//      exactly where it was. Never sleeps: the active tab, pinned tabs,
//      audible tabs (destroying their renderer would kill playback), agent
//      tabs (automation state cannot survive a reload), new-tab pages
//      (nothing to preserve), or anything on the settings blocklist.
//   2. Per-tab metrics — app.getAppMetrics() mapped onto tabs by renderer
//      process id, exposed as { [tabId]: { cpu, memoryKB } } on a 10s
//      sampler (start/stop). The chrome UI can surface it later; the API
//      and the sampler are the deliverable.
//   3. Crash resilience — a gone renderer marks its node 'crashed' with the
//      reason and is auto-restored through the same wake path exactly ONCE;
//      after that the tab stays crashed until a user action wakes it. No
//      reload loops, ever.
//   4. Power — one powerSaveBlocker holds the display awake ONLY while some
//      registered tree's ACTIVE tab is playing media; released on tab
//      switch, sleep, crash and teardown.
//
// Structure mirrors browserTree.cjs: the interesting decisions
// (pickSleepCandidates, mapMetricsToTabs, shouldAutoRestore,
// spellcheckLanguagesForLocale, hostIsBlocklisted) are PURE and exported for
// tests; everything touching Electron is glue around them.
//
// The destructive sleep/wake mechanics deliberately do NOT route through
// browserControl's own hibernateTab/restoreTab: those resolve the surface
// via host() → createWindowSurface(), which would conjure a real
// BrowserWindow when invoked against a stub tree in tests, and restoreTab
// constructs WebContentsView directly (unavailable outside Electron). So
// sleepTab/wake duck-type the session object instead (tree.win, tree.tabs,
// tab.view — the same fields browserControl sets) and wake rebuilds views
// through an INJECTABLE view factory (setViewFactory) so the whole path is
// unit-testable. Listener re-wiring on wake reuses browserControl's
// wireTabListeners, so a woken tab has full fidelity (console capture, ref
// epochs, network log) — the same listeners a brand-new tab gets.

const { app, WebContentsView, powerSaveBlocker, session: electronSession } = require('electron')
const { get: getSetting } = require('./settings/store.cjs')
const { wireTabListeners, showActive } = require('./browserControl.cjs')
const { injectAdShield } = require('./adBlocker.cjs')

// Keep in lockstep with browserControl.cjs's CHROME_UA — a woken view must
// present the same user agent the rest of the browser does.
const CHROME_VERSION = process.versions.chrome || '130.0.6723.117'
const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`

const DEFAULT_SLEEP_AFTER_MS = 20 * 60 * 1000 // 20 minutes of background time
const MIN_SLEEP_AFTER_MS = 10 * 1000          // floor for a sane configured value
const SWEEP_INTERVAL_MS = 30 * 1000           // how often registered trees are swept
const METRICS_INTERVAL_MS = 10 * 1000         // the metrics HUD sampler cadence
const MAX_AUTO_RESTORES = 1                   // after one automatic restore, a crash needs user action

// Only these reasons qualify for the single auto-restore: a renderer the
// task manager killed ('killed') or that exited oddly stays crashed until
// the user asks for it back — auto-resurrecting a killed tab fights the
// user's own intent.
const AUTO_RESTORE_REASONS = new Set(['crashed', 'oom'])

function safeSync(fn, fallback) {
  try { return fn() } catch { return fallback }
}

// ── Pure decision logic ───────────────────────────────────────────────────

// Which tab ids may sleep RIGHT NOW. `nodes` are plain descriptors (see
// sweepTree for what production enrichment looks like):
//   { id, pinned, audible, hasView, hibernating, state, protected, url,
//     lastActiveAt }
// `opts`: { activeId, sleepAfterMs, blocklist }. A sleepAfterMs of 0 (or any
// non-positive number) disables sleeping entirely. A node with no known
// lastActiveAt is left alone — the conservative choice for anything the
// caller could not timestamp.
function pickSleepCandidates(nodes, now, { activeId = null, sleepAfterMs = DEFAULT_SLEEP_AFTER_MS, blocklist = [] } = {}) {
  const ids = []
  if (!Array.isArray(nodes)) return ids
  const budget = Number(sleepAfterMs)
  if (!Number.isFinite(budget) || budget <= 0) return ids
  const bl = Array.isArray(blocklist) ? blocklist : []
  for (const n of nodes) {
    if (!n || !n.id) continue
    if (activeId != null && n.id === activeId) continue            // active
    if (n.pinned) continue                                         // pinned
    if (n.audible) continue                                        // audible
    if (n.protected) continue                                      // agent tab — automation state is unrecoverable
    if (n.hibernating || n.state === 'asleep' || n.state === 'crashed') continue // already out
    if (!n.hasView) continue                                       // nothing to destroy
    const last = Number(n.lastActiveAt) || 0
    if (!last) continue                                            // never-seen: leave alone
    if (now - last < budget) continue                              // not aged yet
    if (hostIsBlocklisted(n.url, bl)) continue                     // settings blocklist
    ids.push(n.id)
  }
  return ids
}

// True when the hostname of `url` is on the blocklist — exact host match or
// a subdomain of a listed host ('google.com' covers 'docs.google.com').
function hostIsBlocklisted(url, blocklist) {
  if (!url || !Array.isArray(blocklist) || !blocklist.length) return false
  let host = ''
  try { host = new URL(String(url)).hostname.toLowerCase() } catch { return false }
  if (!host) return false
  for (const entry of blocklist) {
    const e = String(entry || '').toLowerCase().trim()
    if (!e) continue
    if (host === e || host.endsWith('.' + e)) return true
  }
  return false
}

// Pure core of sampleMetrics: map app.getAppMetrics() rows onto tabs by
// renderer process id. `metrics` rows are ProcessMetrics ({ id: <pid>,
// percentCPU, memory: { workingSetSize } }); `tabs` are [{ tabId, pid }].
// Returns a plain { [tabId]: { cpu, memoryKB } } — JSON-friendly so it can
// cross IPC to a HUD later without reshaping.
function mapMetricsToTabs(metrics, tabs) {
  const out = {}
  if (!Array.isArray(metrics) || !Array.isArray(tabs)) return out
  const byPid = new Map()
  for (const m of metrics) {
    if (!m || m.id == null) continue
    byPid.set(Number(m.id), m)
  }
  for (const t of tabs) {
    if (!t || !t.tabId || t.pid == null) continue
    const m = byPid.get(Number(t.pid))
    if (!m) continue
    out[t.tabId] = {
      cpu: Number(m.percentCPU) || 0,
      memoryKB: (m.memory && Number(m.memory.workingSetSize)) || 0,
    }
  }
  return out
}

// Crash policy: how many automatic restores has this tab already used up,
// and is it allowed another one? MAX_AUTO_RESTORES caps it — after the
// first automatic restore a crashing tab stays crashed until user action.
function shouldAutoRestore(autoRestores, { maxAutoRestores = MAX_AUTO_RESTORES } = {}) {
  return (Number(autoRestores) || 0) < maxAutoRestores
}

// Electron's setSpellCheckerLanguages wants full BCP-47 tags ('en-US'); a
// bare app locale ('en', 'fr') needs a default region appended or the
// call is refused. Unknown/empty locales fall back to US English.
const SPELLCHECK_REGION_DEFAULTS = {
  ar: 'ar-SA', cs: 'cs-CZ', da: 'da-DK', de: 'de-DE', el: 'el-GR',
  en: 'en-US', es: 'es-ES', fi: 'fi-FI', fr: 'fr-FR', he: 'he-IL',
  hi: 'hi-IN', hu: 'hu-HU', id: 'id-ID', it: 'it-IT', ja: 'ja-JP',
  ko: 'ko-KR', nl: 'nl-NL', no: 'nb-NO', nb: 'nb-NO', pl: 'pl-PL',
  pt: 'pt-BR', ro: 'ro-RO', ru: 'ru-RU', sv: 'sv-SE', th: 'th-TH',
  tr: 'tr-TR', vi: 'vi-VN', zh: 'zh-CN',
}

function spellcheckLanguagesForLocale(locale) {
  const raw = String(locale || '').trim()
  if (!raw) return ['en-US']
  if (raw.includes('-')) return [raw]
  return [SPELLCHECK_REGION_DEFAULTS[raw.toLowerCase()] || raw]
}

// ── Registry & state ──────────────────────────────────────────────────────

const registry = new Set()       // registered session objects ("tab trees")
const treeOpts = new WeakMap()   // tree -> { sleepAfterMs } per-tree override
const activity = new WeakMap()   // tree -> Map(tabId -> last-active timestamp)
const media = new WeakMap()      // tree -> Set(tabId) currently playing media
const mediaWired = new WeakSet() // tabs whose media listeners are attached
const sleeping = new WeakSet()   // tabs with a sleep in flight (re-entrancy guard)

let sessionsRef = null // the browserControl sessions Map, for registry pruning
let sweepTimer = null
let metricsTimer = null
let lastMetrics = {}

// A new-tab page carries nothing worth preserving; sleeping one is churn.
function isNewTabUrl(u) {
  const str = String(u || '')
  return !str || str === 'about:blank' || str === 'yogatik://newtab' || str.includes('newtab.html')
}

function sleepAfterMsFor(tree) {
  const override = treeOpts.get(tree)
  if (override && override.sleepAfterMs != null) {
    const n = Number(override.sleepAfterMs)
    if (n === 0) return 0
    if (Number.isFinite(n) && n > 0) return Math.max(MIN_SLEEP_AFTER_MS, n)
  }
  let raw = null
  try { raw = getSetting('performance.sleepAfterMs') } catch {}
  const n = Number(raw)
  if (n === 0) return 0 // explicit 0 disables sleeping
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_SLEEP_AFTER_MS
  return Math.max(MIN_SLEEP_AFTER_MS, n)
}

function blocklistFor() {
  try {
    const bl = getSetting('performance.blocklist')
    return Array.isArray(bl) ? bl.filter((x) => typeof x === 'string' && x.trim()) : []
  } catch { return [] }
}

/** Register a session ("tab tree") for lifecycle management. Returns a
 *  handle with sweep() and stop(); the module-level sweeper runs every 30s
 *  against every registered tree once any is registered. */
function registerTree(tree, opts = {}) {
  if (!tree || !tree.tabs || typeof tree.tabs.get !== 'function') return null
  registry.add(tree)
  if (opts && opts.sleepAfterMs != null) treeOpts.set(tree, { sleepAfterMs: opts.sleepAfterMs })
  if (!activity.has(tree)) activity.set(tree, new Map())
  if (!media.has(tree)) media.set(tree, new Set())
  ensureSweeper()
  return {
    sweep: (now = Date.now()) => sweepTree(tree, now),
    stop: () => registry.delete(tree),
  }
}

function noteActivity(tree, tabId, ts = Date.now()) {
  if (!tree || !tabId) return
  let act = activity.get(tree)
  if (!act) { act = new Map(); activity.set(tree, act) }
  act.set(tabId, Number(ts) || Date.now())
}

// Media tracking via the webContents' own playback events (media-started-
// playing / media-paused), attached lazily on first sweep sighting. These
// are what let the power-save blocker follow actual playback rather than a
// guess — a muted video still fires them.
function wireMedia(tree, tabId, tab) {
  if (!tab || !tab.view || mediaWired.has(tab)) return
  const wc = safeSync(() => tab.view.webContents, null)
  if (!wc || typeof wc.on !== 'function') return
  let set = media.get(tree)
  if (!set) { set = new Set(); media.set(tree, set) }
  mediaWired.add(tab)
  const refresh = () => { if (tree.activeTabId === tabId) updatePowerSave() }
  try { wc.on('media-started-playing', () => { set.add(tabId); refresh() }) } catch {}
  try { wc.on('media-paused', () => { set.delete(tabId); refresh() }) } catch {}
}

// Playback = the tab's own media events OR an audible renderer (an audio-
// only player never mounts a <video> but webContents knows it makes sound).
function isPlayingMedia(tree, tabId, tab) {
  if (!tab || !tab.view) return false
  const set = media.get(tree)
  if (set && set.has(tabId)) return true
  return safeSync(() => tab.view.webContents.isCurrentlyAudible(), false) === true
}

// ── Power: one display-sleep blocker, held only while the ACTIVE tab of a
// registered tree is actually playing media. Released on switch, sleep,
// crash and stopAll — the blocker id is module-level so every path shares it.
let powerBlockerId = null

function updatePowerSave() {
  let shouldHold = false
  for (const tree of registry) {
    const activeId = tree.activeTabId
    if (activeId && tree.tabs && isPlayingMedia(tree, activeId, tree.tabs.get(activeId))) {
      shouldHold = true
      break
    }
  }
  if (shouldHold && powerBlockerId === null) {
    try { powerBlockerId = powerSaveBlocker.start('prevent-display-sleep') } catch { powerBlockerId = null }
  } else if (!shouldHold && powerBlockerId !== null) {
    const id = powerBlockerId
    powerBlockerId = null
    try { powerSaveBlocker.stop(id) } catch {}
  }
}

function releasePowerBlocker() {
  if (powerBlockerId === null) return
  const id = powerBlockerId
  powerBlockerId = null
  try { powerSaveBlocker.stop(id) } catch {}
}

function tryShowActive(tree) {
  try { showActive(tree) } catch {}
}

// ── Sleeping ──────────────────────────────────────────────────────────────

/** Put one tab to sleep: capture {url, title, scrollHint, position} while
 *  the page can still answer, then detach the view from the surface and
 *  destroy its webContents — the same choreography browserControl's own
 *  hibernateTab uses. The NODE stays in tree.tabs at its position, marked
 *  hibernating with tab.sleep holding the snapshot. Returns the snapshot,
 *  or null when the tab may not / need not sleep. */
async function sleepTab(tree, tabId, { reason = 'idle' } = {}) {
  const tab = tree && tree.tabs ? tree.tabs.get(tabId) : null
  if (!tab || tab.hibernating || !tab.view) return null
  if (tabId === tree.activeTabId) return null
  if (tab.pinned || tab.isAgent) return null
  if (safeSync(() => tab.view.webContents.isCurrentlyAudible(), false) === true) return null
  const liveUrl = safeSync(() => tab.view.webContents.getURL(), '') || tab.savedUrl || ''
  if (isNewTabUrl(liveUrl)) return null
  if (hostIsBlocklisted(liveUrl, blocklistFor())) return null
  if (sleeping.has(tab)) return null
  sleeping.add(tab)
  try {
    // The scroll hint needs a live renderer — capture BEFORE destroy.
    let scrollHint = null
    try {
      const sc = await tab.view.webContents.executeJavaScript('({ x: window.scrollX || 0, y: window.scrollY || 0 })')
      if (sc && (Number(sc.x) > 0 || Number(sc.y) > 0)) scrollHint = { x: Number(sc.x) || 0, y: Number(sc.y) || 0 }
    } catch {}
    const snapshot = {
      id: tabId,
      url: liveUrl,
      title: safeSync(() => tab.view.webContents.getTitle(), '') || '',
      scrollHint,
      // Strip position: Map iteration order IS the tab strip order.
      position: [...tree.tabs.keys()].indexOf(tabId),
    }
    const win = tree.win
    if (win && typeof win.isDestroyed === 'function' && !win.isDestroyed() && win.contentView &&
        Array.isArray(win.contentView.children) && win.contentView.children.includes(tab.view)) {
      try { win.contentView.removeChildView(tab.view) } catch {}
    }
    try { tab.view.webContents.destroy() } catch {}
    tab.view = null
    tab.hibernating = true
    tab.sleep = {
      ...(tab.sleep || {}),
      state: 'asleep',
      reason,
      ...snapshot,
      sleptAt: Date.now(),
    }
    // Mirror browserControl's own hibernate capture into the fields the rest
    // of the model reads for a down tab (listTabs, navSnapshot, session
    // persistence): a sleeping tab reports its saved url/title everywhere.
    tab.savedUrl = snapshot.url || tab.savedUrl || null
    tab.savedTitle = snapshot.title || tab.savedTitle || null
    if (snapshot.scrollHint) tab.savedScroll = snapshot.scrollHint
    updatePowerSave()
    return tab.sleep
  } finally {
    sleeping.delete(tab)
  }
}

/** Wake a sleeping (or crashed) tab: rebuild its view at the SAME position —
 *  the node never left tree.tabs — reload its saved url and re-apply the
 *  saved scroll once the page can scroll. This is the same path a crash
 *  restore takes. `activate` also re-shows the tree (attaching the view if
 *  the tab is the active one). */
async function wake(tree, tabId, { activate = false } = {}) {
  const tab = tree && tree.tabs ? tree.tabs.get(tabId) : null
  if (!tab) return { success: false, error: 'No such tab' }
  const crashed = !!(tab.sleep && tab.sleep.state === 'crashed')

  if (tab.view && !crashed) {
    // Already awake — nothing to rebuild.
    if (tab.sleep) tab.sleep.state = 'awake'
    noteActivity(tree, tabId)
    if (activate) tree.activeTabId = tabId
    if (activate || tree.activeTabId === tabId) tryShowActive(tree)
    return { success: true, state: 'awake', alreadyAwake: true }
  }

  if (tab.view && crashed) {
    // The husk: the renderer is gone but the WebContentsView shell lingers.
    // Close it so a fresh view can take the node's place.
    try { tab.view.webContents.close() } catch {}
    tab.view = null
  }

  if (!tab.view) {
    const webPrefs = tab.webPrefs || {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
    }
    let view = null
    try { view = makeView(webPrefs) } catch { view = null }
    if (!view || !view.webContents) {
      return { success: false, error: 'Could not create a view for this tab' }
    }
    tab.view = view
    const wc = view.webContents
    try { injectAdShield(wc) } catch {}
    try { if (typeof wc.setUserAgent === 'function') wc.setUserAgent(CHROME_UA) } catch {}
    // Full-fidelity re-wiring — the same listeners a brand-new tab gets
    // (console ring, ref epochs, network capture, fullscreen, shortcuts).
    try { wireTabListeners(tree, tabId, tab) } catch {}
    tab.viewCreated = true
    tab.hibernating = false

    const targetUrl = (tab.sleep && tab.sleep.url) || tab.savedUrl || tab._pendingUrl || ''
    if (targetUrl) {
      try { wc.loadURL(targetUrl).catch(() => {}) } catch {}
    }
    const scrollHint = (tab.sleep && tab.sleep.scrollHint) || tab.savedScroll
    if (scrollHint && (Number(scrollHint.x) > 0 || Number(scrollHint.y) > 0) && typeof wc.once === 'function') {
      wc.once('did-finish-load', () => {
        try {
          wc.executeJavaScript(`window.scrollTo(${Number(scrollHint.x) || 0}, ${Number(scrollHint.y) || 0})`).catch(() => {})
        } catch {}
      })
    }
  }

  if (tab.sleep) tab.sleep.state = 'awake'
  noteActivity(tree, tabId)
  if (activate) tree.activeTabId = tabId
  if (activate || tree.activeTabId === tabId) tryShowActive(tree)
  return { success: true, state: 'awake' }
}

// ── Crashes ───────────────────────────────────────────────────────────────

/** Mark a tab crashed and apply the restore policy. Called (via
 *  browserControl's setCrashHandler) from webContents 'render-process-gone'
 *  with the Electron `detail` ({ reason, exitCode }). The tab NODE is kept —
 *  never deleted — at its position, with tab.sleep.state 'crashed' and the
 *  reason recorded. Auto-restores at most ONCE (reason permitting); after
 *  that, restoring is the user's call through the same wake path. */
function handleCrash(tree, tabId, detail = {}) {
  const tab = tree && tree.tabs ? tree.tabs.get(tabId) : null
  if (!tab) return null
  const reason = String((detail && detail.reason) || 'unknown')
  // A renderer WE destroyed on purpose (sleep, close) reports clean-exit —
  // that is not a crash and must not flip the node's state.
  if (reason === 'clean-exit') return null
  const previous = tab.sleep || {}
  const state = {
    ...previous,
    state: 'crashed',
    crashReason: reason,
    crashedAt: Date.now(),
    url: previous.url || tab.savedUrl || safeSync(() => tab.view.webContents.getURL(), '') || '',
    title: previous.title || tab.savedTitle || '',
    position: previous.position != null ? previous.position : [...tree.tabs.keys()].indexOf(tabId),
    autoRestores: Number(previous.autoRestores) || 0,
  }
  // restoreTab-style rebuilds are gated on this flag; listTabs reads
  // savedUrl/savedTitle while the node is down.
  tab.hibernating = true
  tab.sleep = state
  tab.savedUrl = state.url || tab.savedUrl || null
  tab.savedTitle = state.title || tab.savedTitle || null
  const set = media.get(tree)
  if (set) set.delete(tabId)
  updatePowerSave()
  tryShowActive(tree) // push the crashed state to the tab strip
  if (AUTO_RESTORE_REASONS.has(reason) && shouldAutoRestore(state.autoRestores)) {
    state.autoRestores++
    wake(tree, tabId, { activate: tree.activeTabId === tabId, cause: 'auto-restore' }).catch(() => {})
  }
  return state
}

// ── Sweeper ───────────────────────────────────────────────────────────────

/** One pass over a tree: normalize built-in-hibernated tabs into lifecycle
 *  state, pick sleep candidates and put them to sleep, refresh power state.
 *  Exported for tests — the interval sweeper just calls this on a clock. */
async function sweepTree(tree, now = Date.now()) {
  if (!tree || !tree.tabs) return []
  // Backfill: a tab browserControl's own built-in timer hibernated directly
  // has no lifecycle record yet — normalize it so state is always readable
  // from one place.
  for (const [tabId, tab] of tree.tabs) {
    if (tab.hibernating && !tab.sleep) {
      tab.sleep = {
        state: 'asleep',
        reason: 'idle',
        url: tab.savedUrl || '',
        title: tab.savedTitle || '',
        scrollHint: tab.savedScroll || null,
        position: [...tree.tabs.keys()].indexOf(tabId),
        sleptAt: now,
        autoRestores: 0,
      }
    }
  }
  let act = activity.get(tree)
  if (!act) { act = new Map(); activity.set(tree, act) }
  updatePowerSave()

  const sleepAfterMs = sleepAfterMsFor(tree)
  if (!sleepAfterMs) return [] // sleeping disabled for this tree

  const nodes = []
  for (const [tabId, tab] of tree.tabs) {
    // First sighting starts the tab's grace period at now — conservative:
    // nothing sleeps before it has been known for at least one budget.
    if (!act.has(tabId)) act.set(tabId, now)
    wireMedia(tree, tabId, tab)
    nodes.push({
      id: tabId,
      pinned: !!tab.pinned,
      audible: !tab.hibernating && tab.view
        ? safeSync(() => tab.view.webContents.isCurrentlyAudible(), false) === true
        : false,
      hasView: !!tab.view && !tab.hibernating,
      hibernating: !!tab.hibernating,
      state: tab.sleep ? tab.sleep.state : null,
      protected: !!tab.isAgent,
      url: tab.hibernating ? (tab.savedUrl || '') : safeSync(() => (tab.view ? tab.view.webContents.getURL() : ''), ''),
      lastActiveAt: act.get(tabId) || 0,
    })
  }
  const ids = pickSleepCandidates(nodes, now, {
    activeId: tree.activeTabId,
    sleepAfterMs,
    blocklist: blocklistFor(),
  })
  const slept = []
  for (const id of ids) {
    const res = await sleepTab(tree, id, { reason: 'idle' }).catch(() => null)
    if (res) slept.push(res)
  }
  if (slept.length) tryShowActive(tree) // refresh the tab strip once, not per tab
  return slept
}

function ensureSweeper() {
  if (sweepTimer) return
  sweepTimer = setInterval(() => {
    pruneRegistry()
    for (const tree of [...registry]) {
      try { sweepTree(tree, Date.now()).catch(() => {}) } catch {}
    }
  }, SWEEP_INTERVAL_MS)
  if (sweepTimer.unref) sweepTimer.unref()
}

// Sessions die in browserControl (closeTab of the last tab, destroySession);
// drop them from the registry so nothing here pins them in memory.
function pruneRegistry() {
  if (!sessionsRef) return
  let live = null
  try { live = new Set(sessionsRef.values()) } catch { return }
  for (const tree of [...registry]) {
    if (!live.has(tree)) {
      registry.delete(tree)
      updatePowerSave()
    }
  }
}

// ── Metrics HUD ───────────────────────────────────────────────────────────

/** Sample app.getAppMetrics() and map rows onto tabs by renderer pid.
 *  Returns { [tabId]: { cpu, memoryKB } }. Hibernating tabs have no
 *  renderer and no entry. */
function sampleMetrics() {
  const metrics = safeSync(() => app.getAppMetrics() || [], [])
  const tabs = []
  for (const tree of registry) {
    if (!tree || !tree.tabs) continue
    for (const [tabId, tab] of tree.tabs) {
      if (!tab.view || tab.hibernating) continue
      const pid = safeSync(() => tab.view.webContents.getProcessId(), null)
      if (pid == null) continue
      tabs.push({ tabId, pid: Number(pid) })
    }
  }
  return mapMetricsToTabs(metrics, tabs)
}

/** Start the 10s metrics sampler. `onSample(map)` fires after each pull.
 *  A second call stops the previous timer first — there is only ever one. */
function startMetricsSampler({ intervalMs = METRICS_INTERVAL_MS, onSample } = {}) {
  stopMetricsSampler()
  const ms = Math.max(1000, Number(intervalMs) || METRICS_INTERVAL_MS)
  metricsTimer = setInterval(() => {
    lastMetrics = sampleMetrics()
    if (typeof onSample === 'function') {
      try { onSample(lastMetrics) } catch {}
    }
  }, ms)
  if (metricsTimer.unref) metricsTimer.unref()
  return metricsTimer
}

function stopMetricsSampler() {
  if (metricsTimer) {
    clearInterval(metricsTimer)
    metricsTimer = null
  }
}

/** The most recent sample, whatever pulled it last. */
function latestMetrics() {
  return lastMetrics
}

// ── Spellcheck ────────────────────────────────────────────────────────────

/** Enable spellchecking on a session (default session when omitted), with
 *  the dictionary for the app's locale. Returns whether it stuck. */
function enableSpellcheck(session) {
  const ses = session || safeSync(() => electronSession && electronSession.defaultSession, null)
  if (!ses || typeof ses.setSpellCheckerEnabled !== 'function') return false
  try {
    ses.setSpellCheckerEnabled(true)
    const langs = spellcheckLanguagesForLocale(safeSync(() => app.getLocale(), ''))
    if (langs.length && typeof ses.setSpellCheckerLanguages === 'function') {
      ses.setSpellCheckerLanguages(langs)
    }
    return true
  } catch { return false }
}

/** Disable path — performance.spellcheck: false lands here. */
function disableSpellcheck(session) {
  const ses = session || safeSync(() => electronSession && electronSession.defaultSession, null)
  if (!ses || typeof ses.setSpellCheckerEnabled !== 'function') return false
  try {
    ses.setSpellCheckerEnabled(false)
    return true
  } catch { return false }
}

/** Apply the performance.spellcheck setting (default true). */
function applySpellcheckSettings(session) {
  let enabled = true
  try { enabled = getSetting('performance.spellcheck') !== false } catch {}
  return enabled ? enableSpellcheck(session) : disableSpellcheck(session)
}

// ── Injectable view factory ───────────────────────────────────────────────

// Production uses WebContentsView directly; tests inject a stub so the
// wake path runs outside Electron. Never called at module load.
let viewFactory = null

function setViewFactory(fn) {
  viewFactory = typeof fn === 'function' ? fn : null
}

function makeView(webPrefs) {
  const factory = viewFactory || ((prefs) => new WebContentsView({ webPreferences: prefs }))
  return factory(webPrefs)
}

// ── Wiring ────────────────────────────────────────────────────────────────

// browserControl funnels every tab mutation through syncTabBar; this hook
// is how the lifecycle sees them without touching each call site.
function onTabSync(tree) {
  if (!registry.has(tree)) registerTree(tree)
  if (tree.activeTabId) noteActivity(tree, tree.activeTabId)
  updatePowerSave()
}

/** Wire the lifecycle to the browser: hook tab mutations + crashes,
 *  register any existing sessions (future ones self-register via the sync
 *  hook), apply spellcheck, and start the sweep + metrics timers. Returns
 *  a stop handle. */
function init({ sessions, metricsIntervalMs } = {}) {
  let bc = null
  try { bc = require('./browserControl.cjs') } catch {}
  if (!sessions && bc) sessions = bc.sessions
  sessionsRef = sessions || null
  if (bc) {
    if (typeof bc.setTabBarSyncHook === 'function') bc.setTabBarSyncHook(onTabSync)
    if (typeof bc.setCrashHandler === 'function') bc.setCrashHandler(handleCrash)
  }
  if (sessions) {
    try { for (const s of sessions.values()) registerTree(s) } catch {}
  }
  applySpellcheckSettings()
  ensureSweeper()
  startMetricsSampler({ intervalMs: metricsIntervalMs })
  return { stop: stopAll }
}

/** Tear everything down: timers, blocker, hooks, registry. */
function stopAll() {
  if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null }
  stopMetricsSampler()
  releasePowerBlocker()
  registry.clear()
  let bc = null
  try { bc = require('./browserControl.cjs') } catch {}
  if (bc) {
    if (typeof bc.setTabBarSyncHook === 'function') bc.setTabBarSyncHook(null)
    if (typeof bc.setCrashHandler === 'function') bc.setCrashHandler(null)
  }
}

module.exports = {
  // pure, unit-testable
  pickSleepCandidates,
  mapMetricsToTabs,
  shouldAutoRestore,
  spellcheckLanguagesForLocale,
  hostIsBlocklisted,
  // lifecycle
  registerTree,
  sweepTree,
  sleepTab,
  wake,
  handleCrash,
  noteActivity,
  // metrics HUD
  sampleMetrics,
  startMetricsSampler,
  stopMetricsSampler,
  latestMetrics,
  // spellcheck
  enableSpellcheck,
  disableSpellcheck,
  applySpellcheckSettings,
  // wiring
  setViewFactory,
  init,
  stopAll,
  // constants (documented defaults, used by tests)
  DEFAULT_SLEEP_AFTER_MS,
  MIN_SLEEP_AFTER_MS,
  SWEEP_INTERVAL_MS,
  METRICS_INTERVAL_MS,
  MAX_AUTO_RESTORES,
  AUTO_RESTORE_REASONS,
}
