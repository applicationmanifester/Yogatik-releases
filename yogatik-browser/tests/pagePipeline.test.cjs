#!/usr/bin/env node
'use strict'

// Page-as-Context AI pipeline tests (pagePipeline.cjs + preload bridge).
//
// Style mirrors run-tests.cjs: sections, pass()/fail()/assert(), and the
// electron stub injected via Module._resolveFilename. Exported run() returns
// the failure count so the parent runner can fold it into the final verdict.
//
// Covers:
//   - getSelectionText: happy path, destroyed/missing webContents, executeJavaScript
//     failure with the clipboard fallback guarded (unavailable / throwing / selection buffer)
//   - summarizePage: prompt composition (system line with title+url) and budget truncation,
//     plus the offline template fallback when no model answers
//   - askAboutSelection: quoted selection, surrounding context, no-model fallback, empty selection
//   - exportPageToPdf: atomic write (temp+rename, zero residue), failure paths
//   - watchPage: notification gating by setting + capability, log entries, no monitor loop
//   - wireTabContextMenu: item enabling on selection, click routing, idempotence
//   - bridge + dispatcher: action whitelist enforced on BOTH sides, sender bound,
//     companion panel open + result post

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

// A collectable pass/fail API with the same shape as the parent harness, so
// run-tests.cjs can fold this suite's counts into the final verdict.
const harness = {
  pass, fail, assert, section,
  counts() { return { passes, failures } },
}

// Fake page webContents whose executeJavaScript answers by script shape.
function makeFakeWebContents(overrides = {}) {
  return {
    isDestroyed: () => false,
    executeJavaScript: async (script) => {
      if (script.includes('getSelection')) return 'selected text from dom'
      if (script.includes('innerText')) return 'page body text here'
      return null
    },
    printToPDF: async () => Buffer.from('%PDF-fake'),
    on(event, fn) { (this._handlers = this._handlers || {})[event] = fn; this._wired = (this._wired || 0) + 1 },
    ...overrides,
  }
}

function makeWatchStubMonitor() {
  const m = {
    _subscriber: null,
    onPageChange(fn) { m._subscriber = fn; return () => { m._subscriber = null } },
  }
  return m
}

async function run() {
  // Isolated temp userData — the settings store caches its file path at first
  // use, so the cache entries from the settings-suite run must be dropped.
  process.env.YOGATIK_TEST_USERDATA = fs.mkdtempSync(path.join(os.tmpdir(), 'yogatik-pagepipe-'))
  for (const mod of ['settings/store.cjs', 'aiEngine.cjs', 'pagePipeline.cjs', 'pageMonitor.cjs']) {
    try { delete require.cache[require.resolve('../electron/' + mod)] } catch {}
  }

  const store = require('../electron/settings/store.cjs')
  const aiEngine = require('../electron/aiEngine.cjs')
  const pagePipeline = require('../electron/pagePipeline.cjs')

  // ── 1. getSelectionText ────────────────────────────────────────────────
  section('1. getSelectionText (selection grab + guarded fallback)')

  try {
    const wc = makeFakeWebContents()
    const res = await pagePipeline.getSelectionText(wc)
    assert(res.success === true && res.text === 'selected text from dom', 'unexpected result: ' + JSON.stringify(res))
    assert(res.source === 'dom', 'primary path should report source "dom"')
    pass('selection grab via executeJavaScript returns the DOM selection')
  } catch (e) { fail('selection grab via executeJavaScript returns the DOM selection', e) }

  try {
    const missing = await pagePipeline.getSelectionText(null)
    assert(missing.success === false && missing.text === '' && missing.error, 'null webContents should refuse cleanly')
    const destroyed = await pagePipeline.getSelectionText(makeFakeWebContents({ isDestroyed: () => true }))
    assert(destroyed.success === false, 'destroyed webContents should refuse cleanly')
    pass('selection grab refuses missing/destroyed webContents without throwing')
  } catch (e) { fail('selection grab refuses missing/destroyed webContents without throwing', e) }

  try {
    // No clipboard in the stub -> the fallback guard must refuse, not throw.
    const wc = makeFakeWebContents({ executeJavaScript: async () => { throw new Error('context gone') } })
    const res = await pagePipeline.getSelectionText(wc)
    assert(res.success === false && res.fallbackBlocked === true, 'expected fallbackBlocked refusal, got: ' + JSON.stringify(res))
    pass('executeJavaScript failure with no clipboard bridge refuses cleanly (fallback guard)')
  } catch (e) { fail('executeJavaScript failure with no clipboard bridge refuses cleanly (fallback guard)', e) }

  try {
    // The fallback must read ONLY the 'selection' buffer — never the default
    // clipboard (that would siphon whatever the user copied for another app).
    electronStub.clipboard = {
      readText(buffer) {
        if (buffer !== 'selection') throw new Error('default clipboard read attempted')
        return 'selection-buffer text'
      },
    }
    const wc = makeFakeWebContents({ executeJavaScript: async () => { throw new Error('context gone') } })
    const res = await pagePipeline.getSelectionText(wc)
    assert(res.success === true && res.text === 'selection-buffer text' && res.source === 'clipboard', 'unexpected: ' + JSON.stringify(res))
    pass('clipboard fallback reads only the selection buffer')
    delete electronStub.clipboard
  } catch (e) {
    delete electronStub.clipboard
    fail('clipboard fallback reads only the selection buffer', e)
  }

  try {
    electronStub.clipboard = { readText() { throw new Error('clipboard boom') } }
    const wc = makeFakeWebContents({ executeJavaScript: async () => { throw new Error('context gone') } })
    const res = await pagePipeline.getSelectionText(wc)
    assert(res.success === false && /clipboard boom/.test(res.error), 'expected clipboard error surfaced, got: ' + JSON.stringify(res))
    pass('throwing clipboard fallback degrades to a clean refusal')
    delete electronStub.clipboard
  } catch (e) {
    delete electronStub.clipboard
    fail('throwing clipboard fallback degrades to a clean refusal', e)
  }

  // ── 2. summarizePage ───────────────────────────────────────────────────
  section('2. summarizePage (prompt composition + budget truncation)')

  const origChat = aiEngine.chat
  try {
    let captured = null
    aiEngine.chat = async (messages) => { captured = messages; return { text: 'SUMMARY', via: 'Ollama', model: 'test-model' } }
    const res = await pagePipeline.summarizePage('Some page prose. '.repeat(20), { title: 'My Title', url: 'https://example.com/article' })
    assert(Array.isArray(captured) && captured.length === 2, 'expected a system+user message pair')
    assert(captured[0].role === 'system', 'first message must be the system line')
    assert(captured[0].content.startsWith('You are summarizing a web page; title: My Title; url: https://example.com/article'), 'system line must carry page title and url')
    assert(captured[1].content.includes('Some page prose.'), 'user message must carry the page text')
    assert(res.text === 'SUMMARY' && res.via === 'Ollama' && res.model === 'test-model', 'result must be routed through aiEngine.chat')
    assert(res.truncated === false, 'short pages must not be marked truncated')
    pass('summarize composes page-context system line and routes through aiEngine.chat')
  } catch (e) { fail('summarize composes page-context system line and routes through aiEngine.chat', e) }

  try {
    let captured = null
    aiEngine.chat = async (messages) => { captured = messages; return { text: 'S', via: 'Ollama', model: 'm' } }
    const res = await pagePipeline.summarizePage('x'.repeat(100_000), { budgetTokens: 1000 })
    const userContent = captured[1].content
    assert(res.truncated === true, 'oversized page must be marked truncated')
    assert(userContent.includes('[Page text truncated to 4000 of 100000'), 'truncation marker with real counts expected')
    assert(userContent.length < 4200, 'prompt must respect the token-ish budget, got ' + userContent.length)
    pass('summarize truncates oversized pages to the token-ish budget with an honest marker')
  } catch (e) { fail('summarize truncates oversized pages to the token-ish budget with an honest marker', e) }

  try {
    aiEngine.chat = async () => { throw new Error('NO_MODEL') }
    const res = await pagePipeline.summarizePage('First paragraph about yoga. ' + 'Long sentence number two for the bullets. '.repeat(3), { title: 'Offline Page', url: 'https://offline.example' })
    assert(res.via === 'Templates' && res.fallback === true, 'no-model path must fall back to templates')
    assert(res.text.includes('Offline Page'), 'template summary should reference the title')
    pass('summarize still answers from templates when no model is reachable')
  } catch (e) { fail('summarize still answers from templates when no model is reachable', e) }

  // ── 3. askAboutSelection ───────────────────────────────────────────────
  section('3. askAboutSelection (quoted selection + surrounding context)')

  try {
    let captured = null
    let calls = 0
    aiEngine.chat = async (messages) => { calls++; captured = messages; return { text: 'ANSWER', via: 'Ollama', model: 'm' } }
    const pageText = 'Intro sentence before the highlight. ' + 'TARGET-SELECTION-PHRASE' + ' trailing context after the highlight.'
    const res = await pagePipeline.askAboutSelection('TARGET-SELECTION-PHRASE', pageText, { question: 'What does this mean?' })
    assert(calls === 1, 'exactly one model call expected')
    const user = captured[1].content
    assert(user.includes('Question: What does this mean?'), 'question must be composed into the prompt')
    assert(user.includes('Selected text: "TARGET-SELECTION-PHRASE"'), 'selection must be quoted')
    assert(user.includes('Intro sentence before the highlight.'), 'surrounding page context expected around the selection')
    assert(res.text === 'ANSWER' && res.via === 'Ollama', 'same aiEngine.chat routing expected')
    pass('askAboutSelection quotes the selection with surrounding context via aiEngine.chat')
  } catch (e) { fail('askAboutSelection quotes the selection with surrounding context via aiEngine.chat', e) }

  try {
    let calls = 0
    aiEngine.chat = async () => { calls++; return { text: 'X', via: 'Ollama', model: 'm' } }
    const res = await pagePipeline.askAboutSelection('   ', 'some page')
    assert(calls === 0, 'no model call may be made for an empty selection')
    assert(res.via === 'Templates' && /Nothing is selected/i.test(res.text), 'empty selection refuses cleanly')
    pass('empty selection answers from templates without any model call')
  } catch (e) { fail('empty selection answers from templates without any model call', e) }

  try {
    let captured = null
    aiEngine.chat = async (messages) => { captured = messages; return { text: 'A', via: 'Ollama', model: 'm' } }
    const pageText = 'alpha '.repeat(200) + 'UNMATCHED-HIGHLIGHT beta'
    await pagePipeline.askAboutSelection('NOT-IN-PAGE-SELECTION', pageText, {})
    assert(captured[1].content.includes('Selected text: "NOT-IN-PAGE-SELECTION"'), 'selection still quoted')
    assert(captured[1].content.includes('alpha'), 'context falls back to the head of the page')
    pass('selection absent from page still composes head-of-page context')
  } catch (e) { fail('selection absent from page still composes head-of-page context', e) }

  // ── 4. exportPageToPdf ─────────────────────────────────────────────────
  section('4. exportPageToPdf (atomic write, no residue)')

  try {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yogatik-pdf-'))
    const outPath = path.join(outDir, 'page.pdf')
    const wc = makeFakeWebContents({ printToPDF: async () => Buffer.from('%PDF-1.4 real bytes') })
    const res = await pagePipeline.exportPageToPdf(wc, { outPath })
    assert(res.success === true && res.outPath === outPath && res.bytes === Buffer.from('%PDF-1.4 real bytes').length, 'unexpected: ' + JSON.stringify(res))
    assert(fs.readFileSync(outPath).toString().startsWith('%PDF-1.4'), 'PDF bytes must land at the destination')
    const residue = fs.readdirSync(outDir).filter(f => f.endsWith('.tmp'))
    assert(residue.length === 0, 'no .tmp residue allowed, found: ' + residue.join(', '))
    pass('PDF export writes atomically (temp+rename) with zero .tmp residue')
  } catch (e) { fail('PDF export writes atomically (temp+rename) with zero .tmp residue', e) }

  try {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yogatik-pdf-'))
    const outPath = path.join(outDir, 'page.pdf')
    const wc = makeFakeWebContents({ printToPDF: async () => { throw new Error('print failed') } })
    const res = await pagePipeline.exportPageToPdf(wc, { outPath })
    assert(res.success === false && /print failed/.test(res.error), 'expected print failure surfaced')
    assert(!fs.existsSync(outPath), 'failed print must not create the destination')
    assert(fs.readdirSync(outDir).length === 0, 'failed print must leave zero residue')
    pass('printToPDF failure leaves no destination file and no residue')
  } catch (e) { fail('printToPDF failure leaves no destination file and no residue', e) }

  try {
    const wc = makeFakeWebContents()
    const rel = await pagePipeline.exportPageToPdf(wc, { outPath: 'relative/path.pdf' })
    assert(rel.success === false && /absolute/.test(rel.error), 'relative outPath must be refused')
    const bad = await pagePipeline.exportPageToPdf(null, { outPath: 'C:\\tmp\\x.pdf' })
    assert(bad.success === false && /webContents/.test(bad.error), 'missing webContents must be refused')
    pass('PDF export validates destination (absolute) and webContents up front')
  } catch (e) { fail('PDF export validates destination (absolute) and webContents up front', e) }

  // ── 5. watchPage (notification gating + log, no loop of its own) ───────
  section('5. watchPage (pageMonitor change events, notification gating)')

  try {
    const monitor = makeWatchStubMonitor()
    const shown = []
    electronStub.__notifications.length = 0
    const res = pagePipeline.watchPage(monitor, { showNotification: (evt) => { shown.push(evt); return true } })
    assert(res.success === true && typeof res.stop === 'function', 'watchPage must subscribe and return stop()')
    monitor._subscriber({ url: 'https://example.com/prices', title: 'Prices' })
    const log = pagePipeline.getWatchLog(10)
    assert(log.length === 1 && log[0].url === 'https://example.com/prices' && log[0].title === 'Prices', 'change must append a watch-log entry')
    assert(shown.length === 1 && shown[0].title === 'Prices', 'allowed change must notify')
    res.stop()
    pass('watchPage subscribes to monitor changes: log entry + notification, no own loop')
  } catch (e) { fail('watchPage subscribes to monitor changes: log entry + notification, no own loop', e) }

  try {
    store.set('pageWatchNotifications', false)
    const monitor = makeWatchStubMonitor()
    const shown = []
    const res = pagePipeline.watchPage(monitor, { showNotification: (evt) => { shown.push(evt); return true } })
    monitor._subscriber({ url: 'https://example.com/quiet', title: 'Quiet' })
    assert(shown.length === 0, 'notification must be gated off by the setting')
    const log = pagePipeline.getWatchLog(10)
    assert(log.some(e => e.url === 'https://example.com/quiet'), 'gated change must STILL be logged')
    res.stop()
    pass('notification gate suppresses the desktop notification but keeps the log entry')
  } finally {
    store.reset()
  }

  try {
    electronStub.__notifications.length = 0
    const monitor = makeWatchStubMonitor()
    const res = pagePipeline.watchPage(monitor) // default notification impl
    monitor._subscriber({ url: 'https://example.com/n', title: 'Notif' })
    assert(electronStub.__notifications.length === 1, 'default impl should show a stub Notification')
    assert(electronStub.__notifications[0].shown === true, 'notification .show() must have been called')
    res.stop()
    pass('default notification path fires through the guarded Notification wrapper')
  } catch (e) { fail('default notification path fires through the guarded Notification wrapper', e) }

  try {
    const refused = pagePipeline.watchPage({})
    assert(refused.success === false && /change events/.test(refused.error), 'monitor without change events must be refused')
    pass('watchPage refuses monitors that expose no change events')
  } catch (e) { fail('watchPage refuses monitors that expose no change events', e) }

  try {
    const pm = require('../electron/pageMonitor.cjs')
    assert(typeof pm.onPageChange === 'function', 'pageMonitor must expose the onPageChange subscription')
    let hit = 0
    const off = pm.onPageChange(() => { hit++ })
    assert(typeof off === 'function', 'subscription must return an unsubscribe fn')
    off()
    pass('real pageMonitor exposes the onPageChange subscription surface')
  } catch (e) { fail('real pageMonitor exposes the onPageChange subscription surface', e) }

  // ── 6. wireTabContextMenu ──────────────────────────────────────────────
  section('6. wireTabContextMenu (menu items, enabling, routing, idempotence)')

  try {
    const wc = makeFakeWebContents()
    const captured = { count: 0, items: null, ctx: null }
    const ok = pagePipeline.wireTabContextMenu(wc, {
      showMenu: (items, ctx) => { captured.count++; captured.items = items; captured.ctx = ctx },
    })
    assert(ok === true, 'wiring should succeed')
    assert(typeof wc._handlers['context-menu'] === 'function', 'context-menu listener must be registered')

    wc._handlers['context-menu'](null, { x: 10, y: 20, selectionText: 'hello world' })
    assert(captured.count === 1, 'menu should be shown once')
    assert(captured.items.length === 4, 'three items + separator expected')
    assert(captured.items[0].label === 'Ask Yogatik about selection' && captured.items[0].enabled === true, 'ask item enabled on selection')
    assert(captured.items[1].label === 'Save page as PDF to Yogatik', 'pdf item present')
    assert(captured.items[3].label === 'Read this page', 'reader item present')
    pass('context menu shows with selection-dependent enabling')
  } catch (e) { fail('context menu shows with selection-dependent enabling', e) }

  try {
    const wc = makeFakeWebContents()
    const hooksFired = { ask: 0, pdf: 0, read: 0, selection: null }
    pagePipeline.wireTabContextMenu(wc, {
      onAskSelection: (ctx) => { hooksFired.ask++; hooksFired.selection = ctx.selection },
      onSavePdf: () => { hooksFired.pdf++ },
      onReadPage: () => { hooksFired.read++ },
      showMenu: (items) => { wc._capturedItems = items },
    })
    wc._handlers['context-menu'](null, { x: 0, y: 0, selectionText: 'the selection text' })
    wc._capturedItems[0].click()
    wc._capturedItems[1].click()
    wc._capturedItems[3].click()
    assert(hooksFired.ask === 1 && hooksFired.selection === 'the selection text', 'ask click must route the selection')
    assert(hooksFired.pdf === 1 && hooksFired.read === 1, 'pdf and reader clicks must route to their hooks')
    pass('menu item clicks route to injected hooks with the selection payload')
  } catch (e) { fail('menu item clicks route to injected hooks with the selection payload', e) }

  try {
    const wc = makeFakeWebContents()
    let shown = 0
    pagePipeline.wireTabContextMenu(wc, { showMenu: () => { shown++ } })
    const again = pagePipeline.wireTabContextMenu(wc, { showMenu: () => { shown++ } })
    assert(again === true, 'second wiring should report already-wired success')
    assert(wc._wired === 1, 'listener must be registered exactly once, got ' + wc._wired)
    wc._handlers['context-menu'](null, { selectionText: '' })
    assert(shown === 1, 'menu still opens with an empty selection (ask item disabled)')
    pass('context menu wiring is idempotent per webContents')
  } catch (e) { fail('context menu wiring is idempotent per webContents', e) }

  // ── 7. Bridge + dispatcher (whitelist enforcement, sender bound) ───────
  section('7. Bridge + dispatcher (whitelist + sender bound + panel routing)')

  try {
    // Load the REAL preload against the stub: contextBridge.exposeInMainWorld
    // lands in electronStub.exposed; ipcRenderer.invoke resolves against the
    // handlers registered via wirePagePipeline below.
    delete require.cache[require.resolve('../electron/browserWindowPreload.cjs')]
    require('../electron/browserWindowPreload.cjs')
    const bridge = electronStub.exposed.__pagePipeline
    assert(typeof bridge === 'function', 'preload must expose __pagePipeline')
    assert(bridge('evaluate', {}) instanceof Promise, 'non-whitelisted action must still return a Promise (refusal)')

    // Whitelist refusal happens in the PRELOAD — the dispatcher error string
    // differs, so exact-match proves the request never crossed IPC.
    const refused = await bridge('evaluate', {})
    assert(refused.success === false && refused.error === 'Unknown page-pipeline action', 'expected preload-side refusal')
    const badPayload = await bridge('get-selection', 'not-an-object')
    assert(badPayload.success === false && badPayload.error === 'Invalid page-pipeline payload', 'non-object payload must be refused')
    pass('preload bridge enforces the action whitelist and payload shape')
  } catch (e) { fail('preload bridge enforces the action whitelist and payload shape', e) }

  try {
    // End-to-end: stub ipcRenderer -> registered dispatcher -> fake session.
    const ipcMain = electronStub.ipcMain
    const sessions = new Map()
    const chromeSender = electronStub.__rendererSender
    const calls = { layout: 0, syncTabBar: 0 }
    const posts = []
    chromeSender.executeJavaScript = async (code) => { posts.push(code); return true }

    const tabWc = makeFakeWebContents({
      executeJavaScript: async (script) => {
        if (script.includes('getSelection')) return 'BRIDGE-SELECTION'
        if (script.includes('innerText')) return 'long page text for the bridge question'
        return null
      },
    })
    const session = {
      win: { isDestroyed: () => false, webContents: chromeSender },
      activeTabId: 'tab-1',
      tabs: new Map([['tab-1', { view: { webContents: tabWc } }]]),
      aiPanelOpen: false,
    }
    sessions.set('s1', session)

    let dispatched = null
    aiEngine.chat = async (messages) => { dispatched = messages; return { text: 'BRIDGE ANSWER', via: 'Ollama', model: 'm' } }

    pagePipeline.wirePagePipeline({
      ipcMain,
      app: electronStub.app,
      getMainWindow: () => ({ isDestroyed: () => false, webContents: chromeSender }),
      sessions,
      layout: () => { calls.layout++ },
      syncTabBar: () => { calls.syncTabBar++ },
    })

    const sel = await electronStub.ipcRenderer.invoke('browser:page-pipeline', { action: 'get-selection', payload: {} })
    assert(sel.success === true && sel.text === 'BRIDGE-SELECTION', 'bridge get-selection should resolve from the active tab, got: ' + JSON.stringify(sel))

    const asked = await electronStub.ipcRenderer.invoke('browser:page-pipeline', { action: 'ask-yogatik-selection', payload: { question: 'why?' } })
    assert(asked.success === true && /BRIDGE ANSWER/.test(asked.result), 'bridge ask should return the model answer')
    assert(dispatched[1].content.includes('"BRIDGE-SELECTION"'), 'dispatcher must quote the grabbed selection')
    assert(session.aiPanelOpen === true && calls.layout === 1 && calls.syncTabBar === 1, 'companion panel must be made visible')
    assert(posts.some(c => c.includes('__setAiResult')), 'result must be posted to the companion panel channel')
    assert(!posts.some(c => c.includes('long page text for the bridge question')), 'raw page text must never be posted or returned')

    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yogatik-bridge-pdf-'))
    const pdf = await electronStub.ipcRenderer.invoke('browser:page-pipeline', { action: 'export-page-pdf', payload: { outPath: path.join(outDir, 'bridge.pdf') } })
    assert(pdf.success === true && fs.existsSync(path.join(outDir, 'bridge.pdf')), 'bridge pdf export should write the file')
    pass('bounded dispatcher end-to-end: selection, panel-routed ask, atomic PDF')
  } catch (e) { fail('bounded dispatcher end-to-end: selection, panel-routed ask, atomic PDF', e) }

  try {
    const sessions = new Map()
    const chromeSender = electronStub.__rendererSender
    pagePipeline.wirePagePipeline({
      ipcMain: electronStub.ipcMain,
      app: electronStub.app,
      getMainWindow: () => ({ isDestroyed: () => false, webContents: chromeSender }),
      sessions,
      layout: () => {},
      syncTabBar: () => {},
    })
    const noSession = await electronStub.ipcRenderer.invoke('browser:page-pipeline', { action: 'get-selection', payload: {} })
    assert(noSession.success === false && /No active browser session/.test(noSession.error), 'empty sessions must refuse')
    pass('dispatcher refuses when no browser session owns the chrome sender')
  } catch (e) { fail('dispatcher refuses when no browser session owns the chrome sender', e) }

  try {
    const res = await pagePipeline.handlePagePipelineAction(
      { action: 'delete-history', payload: {} },
      { sender: { id: 'x' }, getMainWindow: () => ({ webContents: { id: 'x' } }) },
    )
    assert(res.success === false && /Unknown page-pipeline action/.test(res.error), 'dispatcher must refuse unknown actions even with a matching sender')
    pass('dispatcher whitelist holds even for chrome-looking senders')
  } catch (e) { fail('dispatcher whitelist holds even for chrome-looking senders', e) }

  try {
    const res = await pagePipeline.handlePagePipelineAction(
      { action: 'get-selection', payload: {} },
      { sender: { id: 'page-sender' }, getMainWindow: () => ({ webContents: { id: 'chrome' } }) },
    )
    assert(res.success === false && res.error === 'forbidden sender', 'non-chrome sender must be forbidden')
    pass('sender bound: only the chrome window may call the pipeline')
  } catch (e) { fail('sender bound: only the chrome window may call the pipeline', e) }

  // Restore module resolution for anything loaded after this suite.
  Module._resolveFilename = origResolve
  return { passes, failures }
}

module.exports = { run, harness }
