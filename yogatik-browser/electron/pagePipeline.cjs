// Page-as-Context AI pipeline for Yogatik Browser.
//
// The companion could already summarize a page, but only from INSIDE its own
// panel flow. This module makes the page itself the context for the AI:
//
//   - grab the user's selection (with a guarded fallback),
//   - summarize a page within a token-ish context budget,
//   - answer questions about a quoted selection,
//   - export the page as a PDF atomically,
//   - feed pageMonitor's change events into a notification + watch log.
//
// ROUTING RULE: every model call goes through aiEngine's existing ask path.
// aiEngine.cjs has no exported `ask()` — its one-shot ask is `chat()`, the
// exact function the companion panel's answerWithModel() uses. We never build
// a second LLM client here.
//
// SURFACE RULE: results only ever travel to OUR chrome (file://
// browserWindow.html) — the IPC handler sender-checks the chrome window and
// raw page text is never handed to any other origin.

const fs = require('fs')
const path = require('path')
const { Notification } = require('electron')
const { get: getSetting } = require('./settings/store.cjs')
const aiEngine = require('./aiEngine.cjs')

// Actions the preload bridge may name — enforced AGAINST in main.cjs as well,
// because a whitelist that only lives in the renderer is not a whitelist.
const PAGE_PIPELINE_ACTIONS = new Set([
  'ask-yogatik-selection',
  'export-page-pdf',
  'get-selection',
])

function isValidPageAction(action) {
  return PAGE_PIPELINE_ACTIONS.has(action)
}

// ── Context budget ────────────────────────────────────────────────────────
// "Token-ish": ~4 characters per token for prose. The budget bounds what we
// put INTO the prompt so the page cannot blow the model's context window —
// 3000 tokens ≈ one long article, which is what a page summary is for.
const DEFAULT_BUDGET_TOKENS = 3000
const CHARS_PER_TOKEN = 4

/**
 * Truncate page text to the budget, appending an honest truncation marker
 * (a silent cut looks exactly like a page that simply ends there).
 */
function applyBudget(pageText, budgetTokens = DEFAULT_BUDGET_TOKENS) {
  const src = String(pageText || '')
  const budgetChars = Math.max(200, Number(budgetTokens) || DEFAULT_BUDGET_TOKENS) * CHARS_PER_TOKEN
  if (src.length <= budgetChars) return { text: src, truncated: false }
  return {
    text: src.slice(0, budgetChars) + `\n\n[Page text truncated to ${budgetChars} of ${src.length} characters to fit the model context budget.]`,
    truncated: true,
  }
}

// ── Shared model routing ──────────────────────────────────────────────────
/**
 * One model call through aiEngine.chat (the companion's own path). When no
 * model is reachable (offline, NO_MODEL) the caller's fallback builder keeps
 * the pipeline answering — the panel ALWAYS answers, and so do we.
 */
async function askModel(system, user, { buildFallback, onToken, temperature } = {}) {
  try {
    const { text, via, model } = await aiEngine.chat([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ], { onToken, temperature })
    if (!text || !String(text).trim()) throw new Error('empty completion')
    return { text: String(text), via, model }
  } catch (err) {
    const fb = buildFallback ? buildFallback(err) : null
    if (!fb || !String(fb.text || '').trim()) throw err
    return { text: String(fb.text), via: 'Templates', model: null, fallback: true }
  }
}

// Deterministic offline fallback: first paragraph as TL;DR, then the longest
// early sentences as bullets. Never as good as a model, always something.
function extractiveSummary(pageText, { title, url } = {}) {
  const clean = String(pageText || '').replace(/\s+/g, ' ').trim()
  if (!clean) return `### 📄 ${title || 'Page'}\n\nNo readable text could be extracted from this page.`
  const sentences = clean
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 35 && s.length < 300)
    .slice(0, 5)
  const head = ['### 📄 Summary: ' + (title || 'Page'), '']
  head.push(clean.slice(0, 400) + (clean.length > 400 ? '…' : ''))
  if (sentences.length) {
    head.push('', '**Key points**')
    for (const s of sentences) head.push(`- ${s}`)
  }
  if (url) head.push('', `_Source: ${url}_`)
  return head.join('\n')
}

// ── 1. Selection grab ─────────────────────────────────────────────────────
/**
 * Read the current text selection from a page's webContents.
 *
 * Primary path: executeJavaScript over window.getSelection(). The fallback is
 * GUARDED twice over: it only ever reads the X11 'selection' buffer — never
 * the default clipboard, which would siphon whatever the user last copied
 * for an unrelated app — and it degrades to a clean { success:false } when
 * the clipboard bridge is unavailable rather than throwing.
 */
async function getSelectionText(wc) {
  if (!wc || (typeof wc.isDestroyed === 'function' && wc.isDestroyed())) {
    return { success: false, text: '', error: 'webContents unavailable' }
  }
  try {
    const raw = await wc.executeJavaScript(
      '(() => { try { const s = window.getSelection && window.getSelection(); return s ? String(s.toString()) : "" } catch { return "" } })()',
      false,
    )
    const text = String(raw || '')
    // An empty selection is a RESULT (right-click with nothing highlighted),
    // not an error — the context menu disables its selection item for it.
    return { success: true, text, source: 'dom', length: text.length }
  } catch (err) {
    try {
      // Lazy require: keeps this path testable when the electron stub ships
      // no clipboard (the guard below then refuses cleanly).
      const { clipboard } = require('electron')
      if (!clipboard || typeof clipboard.readText !== 'function') {
        return { success: false, text: '', error: 'selection unavailable', fallbackBlocked: true }
      }
      const text = String(clipboard.readText('selection') || '')
      if (!text) return { success: false, text: '', error: 'selection buffer empty' }
      return { success: true, text, source: 'clipboard', length: text.length }
    } catch (err2) {
      return { success: false, text: '', error: err2?.message || 'clipboard fallback failed' }
    }
  }
}

// ── 2. Page summarizer ────────────────────────────────────────────────────
/**
 * Summarize page text within a token-ish budget.
 * @param {string} pageText - the page's visible text (already extracted)
 * @param {{title?: string, url?: string, budgetTokens?: number, onToken?: (t: string) => void}} opts
 * @returns {Promise<{text, via, model, truncated}>}
 */
async function summarizePage(pageText, opts = {}) {
  const title = String(opts.title || 'Untitled page')
  const url = String(opts.url || '')
  const { text: budgeted, truncated } = applyBudget(pageText, opts.budgetTokens)

  const system = `You are summarizing a web page; title: ${title}; url: ${url}. ` +
    'Produce a tight Markdown summary: one-line TL;DR, key points as bullets, and any numbers or claims worth noting. Plain, factual, no fluff.'
  const user = `Page content:\n\n${budgeted}`

  const out = await askModel(system, user, {
    onToken: opts.onToken,
    buildFallback: () => ({ text: extractiveSummary(pageText, { title, url }) }),
  })
  return { ...out, truncated }
}

// ── 3. Ask about a selection ──────────────────────────────────────────────
const SELECTION_CONTEXT_WINDOW = 600 // chars of page text around the selection

/**
 * Answer a question about the user's quoted selection, with the surrounding
 * page text as context. Same routing as summarizePage (aiEngine.chat).
 * @param {string} selection - the text the user highlighted
 * @param {string} pageText - the page's visible text
 * @param {{question?: string, title?: string, url?: string, budgetTokens?: number, onToken?: (t: string) => void}} opts
 */
async function askAboutSelection(selection, pageText, opts = {}) {
  const sel = String(selection || '').trim()
  if (!sel) return { text: 'Nothing is selected on the page.', via: 'Templates', model: null, fallback: true }

  const title = String(opts.title || 'Untitled page')
  const url = String(opts.url || '')
  const question = String(opts.question || 'Explain this selection in context.')

  // Surrounding context: the selection located in the page, with a window of
  // prose either side. When the selection is not found verbatim (normalized
  // whitespace, cross-node highlight), fall back to the head of the page.
  const { text: budgeted } = applyBudget(pageText, opts.budgetTokens)
  const at = budgeted.indexOf(sel)
  const context = at >= 0
    ? budgeted.slice(Math.max(0, at - SELECTION_CONTEXT_WINDOW), at + sel.length + SELECTION_CONTEXT_WINDOW)
    : budgeted.slice(0, SELECTION_CONTEXT_WINDOW * 2)

  const system = `You are answering a question about a highlighted passage on a web page; title: ${title}; url: ${url}. ` +
    'Use ONLY the quoted selection and the surrounding page content. Quote the selection when it helps. If the answer is not present, say so plainly.'
  const user = `Question: ${question}\n\nSelected text: "${sel}"\n\nSurrounding page context:\n\n${context}`

  return askModel(system, user, {
    onToken: opts.onToken,
    buildFallback: () => ({
      text: `> "${sel.slice(0, 400)}${sel.length > 400 ? '…' : ''}"\n\nNo model is reachable right now, so this is the raw selection — retry once a model is up.`,
    }),
  })
}

// ── 4. PDF export (atomic write) ──────────────────────────────────────────
/**
 * Print a page to PDF and save it with the settings-store's atomic-write
 * discipline: temp file + rename, so a crash mid-write can never leave a
 * truncated .pdf that looks like a real export.
 * @param {Electron.WebContents} wc
 * @param {{outPath: string}} opts - absolute .pdf destination
 */
async function exportPageToPdf(wc, opts = {}) {
  if (!wc || (typeof wc.isDestroyed === 'function' && wc.isDestroyed())) {
    return { success: false, error: 'webContents unavailable' }
  }
  const outPath = String(opts.outPath || '')
  if (!outPath || !path.isAbsolute(outPath)) {
    return { success: false, error: 'outPath must be an absolute path' }
  }
  const finalPath = /\.pdf$/i.test(outPath) ? outPath : outPath + '.pdf'
  const tmpPath = finalPath + '.tmp'

  let data
  try {
    data = await wc.printToPDF({
      landscape: false,
      printBackground: true,
      preferCSSPageSize: false,
      // Chromium margins are in inches; ~1cm default keeps the print usable.
      margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    })
  } catch (err) {
    return { success: false, error: err?.message || String(err) }
  }

  try {
    fs.mkdirSync(path.dirname(finalPath), { recursive: true })
    fs.writeFileSync(tmpPath, data)
    fs.renameSync(tmpPath, finalPath)
    return { success: true, outPath: finalPath, bytes: data.length }
  } catch (err) {
    // No residue: a failed atomic write removes its own temp file.
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath) } catch {}
    return { success: false, error: err?.message || String(err) }
  }
}

// ── 5. Page watch (pageMonitor integration) ───────────────────────────────
//
// Subscribes to pageMonitor's change notifications — NO loop of its own; the
// monitor's timer does the polling. A change becomes a watch-log entry and,
// when the user has not turned notifications off, a desktop Notification.
// The log is capped so a long-watched page cannot grow the heap forever.

const WATCH_LOG_CAP = 100
const watchLog = []

function defaultMonitorModule() {
  try { return require('./pageMonitor.cjs') } catch { return null }
}

/**
 * Wire pageMonitor change events into notification + log.
 * @param {object} [monitor] - a pageMonitor-like module (injectable for tests)
 * @param {{notificationsAllowed?: () => boolean, showNotification?: (evt) => boolean}} [opts]
 */
function watchPage(monitor, opts = {}) {
  const mod = monitor || defaultMonitorModule()
  if (!mod || typeof mod.onPageChange !== 'function') {
    return { success: false, error: 'monitor does not expose change events' }
  }

  const notificationsAllowed = opts.notificationsAllowed || (() => {
    try { return getSetting('pageWatchNotifications') !== false } catch { return true }
  })
  const showNotification = opts.showNotification || ((evt) => {
    // Guarded: Notification.isSupported() first, then the constructor — a
    // platform without notification support degrades to the log entry only.
    try {
      if (typeof Notification.isSupported === 'function' && !Notification.isSupported()) return false
      new Notification({
        title: 'Yogatik Browser — Page Changed',
        body: `${evt.title || evt.url || 'A watched page'} was just updated.`,
        silent: false,
      }).show()
      return true
    } catch {
      return false
    }
  })

  const off = mod.onPageChange((evt) => {
    const entry = {
      at: Date.now(),
      url: String(evt?.url || ''),
      title: String(evt?.title || ''),
    }
    watchLog.push(entry)
    if (watchLog.length > WATCH_LOG_CAP) watchLog.splice(0, watchLog.length - WATCH_LOG_CAP)
    if (notificationsAllowed()) showNotification(entry)
    // When notifications are gated off, the log entry IS the record — never
    // silently dropped, just quieter.
  })

  return { success: true, stop: off }
}

function getWatchLog(limit = 20) {
  const n = Math.min(Math.max(1, Number(limit) || 20), WATCH_LOG_CAP)
  return watchLog.slice(-n)
}

// ── 6. Tab context menu ───────────────────────────────────────────────────
/**
 * Attach the Yogatik context menu to a page's webContents. Idempotent per
 * webContents. All side effects go through injected hooks so the wiring is
 * testable without Electron.
 *
 * @param {Electron.WebContents} wc
 * @param {{onAskSelection?: (ctx) => void, onSavePdf?: (ctx) => void, onReadPage?: (ctx) => void, showMenu?: (items, ctx) => void}} hooks
 */
function wireTabContextMenu(wc, hooks = {}) {
  if (!wc || typeof wc.on !== 'function') return false
  if (wc.__yogatikPageMenuWired) return true
  wc.__yogatikPageMenuWired = true

  const showMenu = hooks.showMenu || ((items, { x, y } = {}) => {
    try {
      const { Menu } = require('electron')
      if (!Menu) return
      Menu.buildFromTemplate(items).popup({ x, y })
    } catch {}
  })

  wc.on('context-menu', (_event, params = {}) => {
    const hasSelection = !!(params.selectionText && params.selectionText.trim())
    const menuCtx = { wc, params, x: params.x, y: params.y, selection: params.selectionText || '' }
    const items = [
      {
        label: 'Ask Yogatik about selection',
        enabled: hasSelection,
        click: () => { try { hooks.onAskSelection && hooks.onAskSelection(menuCtx) } catch {} },
      },
      {
        label: 'Save page as PDF to Yogatik',
        click: () => { try { hooks.onSavePdf && hooks.onSavePdf(menuCtx) } catch {} },
      },
      { type: 'separator' },
      {
        label: 'Read this page',
        click: () => { try { hooks.onReadPage && hooks.onReadPage(menuCtx) } catch {} },
      },
    ]
    showMenu(items, menuCtx)
  })
  return true
}

// ── Page text extraction ──────────────────────────────────────────────────
/**
 * Visible-text grab for the pipeline, mirroring pageMonitor.readText's shape
 * (normalized whitespace, capped) — self-contained so browserControl's
 * extractor stays where it is.
 */
async function readPageText(wc, maxChars = 12_000) {
  if (!wc || (typeof wc.isDestroyed === 'function' && wc.isDestroyed())) return ''
  try {
    const raw = await wc.executeJavaScript(
      `(document.body ? (document.body.innerText || '') : '').replace(/\\s+/g, ' ').trim().slice(0, ${Number(maxChars) || 12_000})`,
      false,
    )
    return String(raw || '')
  } catch {
    return ''
  }
}

function safeMeta(wc) {
  try { return { title: wc.getTitle() || '', url: wc.getURL() || '' } } catch { return { title: '', url: '' } }
}

// ── 7. IPC action dispatch (bounded) ──────────────────────────────────────
const MAX_QUESTION_CHARS = 2000
const MAX_OUTPATH_CHARS = 500

/**
 * One bounded dispatcher behind the 'browser:page-pipeline' channel. The
 * action whitelist is enforced HERE as well as in the preload — a renderer
 * whitelist alone would let a compromised surface name any channel payload.
 * Raw page text never appears in a return value; only derived results (an
 * answer, a selection the chrome explicitly asked for) do.
 *
 * @param {{action: string, payload?: object}} p
 * @param {object} ctx - { sender, getMainWindow, sessions, layout, syncTabBar }
 */
async function handlePagePipelineAction(p, ctx = {}) {
  const action = p && p.action
  if (!isValidPageAction(action)) {
    return { success: false, error: `Unknown page-pipeline action: ${String(action)}` }
  }

  // Sender bound: only OUR chrome window may call the pipeline. A web page's
  // webContents (or any other surface) gets refused before any work happens.
  const chrome = ctx.getMainWindow && ctx.getMainWindow()
  const sender = ctx.sender
  if (!chrome || !sender || chrome.webContents !== sender) {
    return { success: false, error: 'forbidden sender' }
  }

  const payload = (p.payload && typeof p.payload === 'object') ? p.payload : {}

  const s = ctx.sessions
    ? [...ctx.sessions.values()].find(x => x.win && !x.win.isDestroyed() && x.win.webContents === sender)
    : null
  if (!s) return { success: false, error: 'No active browser session' }
  const tab = s.activeTabId ? s.tabs.get(s.activeTabId) : null
  const wc = tab && tab.view && !tab.view.webContents.isDestroyed() ? tab.view.webContents : null
  if (!wc) return { success: false, error: 'No active browser tab' }

  if (action === 'get-selection') {
    return getSelectionText(wc)
  }

  if (action === 'ask-yogatik-selection') {
    const question = String(payload.question || '').slice(0, MAX_QUESTION_CHARS)
    const meta = safeMeta(wc)
    const grabbed = await getSelectionText(wc)
    const selection = String(payload.selection || grabbed.text || '').slice(0, 8000)
    if (!selection.trim()) {
      return { success: false, error: 'Nothing is selected on the page' }
    }
    const pageText = await readPageText(wc)

    // Route the answer through the companion panel: make it visible, then
    // post the result on the same __setAiResult channel the panel listens on.
    openCompanionPanel(s, ctx)

    const out = await askAboutSelection(selection, pageText, { question, title: meta.title, url: meta.url })
    postAiResult(s, { type: 'selection', result: out.text, via: out.via, model: out.model, title: meta.title, url: meta.url })
    // The chrome gets the ANSWER, not the page text it came from.
    return { success: true, via: out.via, model: out.model, result: out.text, truncated: !!out.truncated }
  }

  if (action === 'export-page-pdf') {
    let outPath = String(payload.outPath || '').slice(0, MAX_OUTPATH_CHARS)
    if (!outPath) {
      try {
        const { app } = require('electron')
        outPath = path.join(app.getPath('downloads'), `Yogatik_Page_${Date.now()}.pdf`)
      } catch (err) {
        return { success: false, error: 'outPath required (downloads dir unavailable)' }
      }
    }
    const res = await exportPageToPdf(wc, { outPath })
    if (res.success) {
      try {
        s.win.webContents.executeJavaScript(
          `window.__setToast && window.__setToast(${JSON.stringify(`📄 Saved page PDF: ${path.basename(res.outPath)}`)})`,
        ).catch(() => {})
      } catch {}
    }
    return res
  }

  return { success: false, error: `Unhandled page-pipeline action: ${String(action)}` }
}

/**
 * Make the AI companion panel visible on the session's chrome and push the
 * nav state so the toolbar reflects it (mirrors the toggle-ai-panel path).
 */
function openCompanionPanel(s, ctx = {}) {
  try {
    if (!s || !s.win || s.win.isDestroyed()) return false
    s.aiPanelOpen = true
    if (typeof ctx.layout === 'function') ctx.layout(s)
    if (typeof ctx.syncTabBar === 'function') ctx.syncTabBar(s)
    return true
  } catch {
    return false
  }
}

/** Post a pipeline result into the companion panel's result channel. */
function postAiResult(s, obj) {
  try {
    if (!s || !s.win || s.win.isDestroyed()) return
    s.win.webContents
      .executeJavaScript(`window.__setAiResult && window.__setAiResult(${JSON.stringify(obj)})`)
      .catch(() => {})
  } catch {}
}

// ── 8. One-call wiring (the main.cjs hook) ────────────────────────────────
/**
 * Wire the whole pipeline from a single main.cjs call:
 *   - the bounded 'browser:page-pipeline' IPC handler,
 *   - the tab context menu on every page webContents,
 *   - pageMonitor change events → notification + watch log.
 *
 * @param {{ipcMain, app, getMainWindow, sessions, layout, syncTabBar}} deps
 */
function wirePagePipeline(deps = {}) {
  const { ipcMain, app } = deps
  if (!ipcMain || typeof ipcMain.handle !== 'function') return { success: false, error: 'ipcMain required' }

  // Bounded handler: one channel, whitelisted actions, chrome-only sender.
  ipcMain.handle('browser:page-pipeline', (event, p = {}) => {
    const ctx = {
      sender: event && event.sender,
      getMainWindow: deps.getMainWindow,
      sessions: deps.sessions,
      layout: deps.layout,
      syncTabBar: deps.syncTabBar,
    }
    return handlePagePipelineAction(p, ctx)
  })

  // Context menu on every PAGE webContents (WebContentsView contents carry a
  // hostWebContents; the chrome's own window webContents does not).
  if (app && typeof app.on === 'function') {
    app.on('web-contents-created', (_event, wc) => {
      try {
        const isPage = (typeof wc.getType === 'function' && wc.getType() === 'browserView') || !!wc.hostWebContents
        if (!isPage) return
        wireTabContextMenu(wc, {
          onAskSelection: (menuCtx) => {
            const senderWc = menuCtx.wc
            // Find the session that owns this tab, then run the selection
            // question through the SAME bounded handler as the bridge.
            const s = deps.sessions
              ? [...deps.sessions.values()].find(x => [...x.tabs.values()].some(t => t.view && t.view.webContents === senderWc))
              : null
            const chrome = deps.getMainWindow && deps.getMainWindow()
            if (!s || !chrome || chrome.webContents !== s.win?.webContents) return
            handlePagePipelineAction(
              { action: 'ask-yogatik-selection', payload: { selection: menuCtx.selection, question: 'Explain this selection in context.' } },
              { sender: chrome.webContents, getMainWindow: deps.getMainWindow, sessions: deps.sessions, layout: deps.layout, syncTabBar: deps.syncTabBar },
            ).catch(() => {})
          },
          onSavePdf: (menuCtx) => {
            const senderWc = menuCtx.wc
            const s = deps.sessions
              ? [...deps.sessions.values()].find(x => [...x.tabs.values()].some(t => t.view && t.view.webContents === senderWc))
              : null
            const chrome = deps.getMainWindow && deps.getMainWindow()
            if (!s || !chrome || chrome.webContents !== s.win?.webContents) return
            handlePagePipelineAction(
              { action: 'export-page-pdf', payload: {} },
              { sender: chrome.webContents, getMainWindow: deps.getMainWindow, sessions: deps.sessions, layout: deps.layout, syncTabBar: deps.syncTabBar },
            ).catch(() => {})
          },
          onReadPage: (menuCtx) => {
            // readerMode does not expose a narration/TTS chain today — when it
            // does, chain it here; until then the reader overlay is the whole
            // feature.
            try {
              const readerMode = require('./readerMode.cjs')
              if (typeof readerMode.narratePage === 'function') {
                readerMode.narratePage(menuCtx.wc)
                return
              }
            } catch {}
            try {
              const readerMode = require('./readerMode.cjs')
              readerMode.toggleReaderMode(menuCtx.wc)
            } catch {}
          },
        })
      } catch {}
    })
  }

  // Page watch: monitor's own timer loop raises changes; we only listen.
  try { watchPage() } catch {}

  return { success: true }
}

module.exports = {
  PAGE_PIPELINE_ACTIONS,
  isValidPageAction,
  applyBudget,
  getSelectionText,
  summarizePage,
  askAboutSelection,
  exportPageToPdf,
  watchPage,
  getWatchLog,
  wireTabContextMenu,
  readPageText,
  handlePagePipelineAction,
  openCompanionPanel,
  wirePagePipeline,
}
