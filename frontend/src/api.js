/**
 * API shim — replaces all backend calls with browser-native equivalents.
 * Uses IndexedDB for storage, direct LLM API calls, browser tools.
 * Drop-in compatible with existing App.jsx interface.
 */

import * as db from './db'
import { runAgent } from './agent'
import { getProviders as getLLMProviders, registerCustomProviders, fetchLiveModels, chatComplete, proxyAvailable } from './llm'
import { getToolNames } from './tools/index'
import { chunkText } from './retrieval'
import { invalidateDocIndex } from './tools/documents'

import { signInWithGoogle, logOutGoogle, saveUserApiKey, getUserApiKeys, purgePlaintextKeys } from './firebaseAuth'

// ─── Auth (Google Sign-In & encrypted Firestore key vault) ───

// Held in memory for the session only — never persisted, never uploaded.
let _passphrase = null
export function setKeyPassphrase(p) { _passphrase = p || null }
export function hasKeyPassphrase() { return !!_passphrase }

export async function loginWithGoogle(passphrase) {
  const user = await signInWithGoogle()
  await db.setSetting('user', user)
  if (passphrase) _passphrase = passphrase
  // Restore cloud keys — only possible when the passphrase can decrypt them
  if (_passphrase) {
    const keys = await getUserApiKeys(_passphrase)
    for (const [provider, key] of Object.entries(keys)) {
      if (key) await db.setSetting(`apikey_${provider}`, key)
    }
  }
  // Scrub any keys stored in plaintext by earlier versions
  try { await purgePlaintextKeys() } catch {}
  return user
}

export async function saveProviderApiKey(provider, apiKey) {
  await db.setSetting(`apikey_${provider}`, apiKey)
  // Cloud sync is opt-in and encrypted; without a passphrase the key stays local.
  if (_passphrase && await db.getSetting('user')) {
    const res = await saveUserApiKey(provider, apiKey, _passphrase)
    if (res?.synced) await db.setSetting(`synced_${provider}`, Date.now())
    return res
  }
  await db.setSetting(`synced_${provider}`, null)
  return { synced: false, reason: _passphrase ? 'signed-out' : 'no-passphrase' }
}

/** What the user can be told about a stored key, without revealing it. */
export async function getKeyInfo(providerId) {
  const key = await db.getSetting(`apikey_${providerId}`)
  if (!key) return { saved: false, masked: '', syncedAt: null }
  return {
    saved: true,
    // Enough to recognise which key it is, not enough to use it.
    masked: key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : '••••',
    syncedAt: await db.getSetting(`synced_${providerId}`),
  }
}

export async function getAllKeyInfo() {
  await loadCustomProviders()
  const out = {}
  for (const id of Object.keys(getLLMProviders())) out[id] = await getKeyInfo(id)
  return out
}

/**
 * Turn on cloud sync: hold the passphrase for this session and push every key
 * already stored on this device, encrypted.
 */
export async function enableCloudSync(passphrase) {
  if (!passphrase) throw new Error('A passphrase is required — it is what encrypts your keys.')
  if (!(await db.getSetting('user'))) throw new Error('Sign in first to sync keys to the cloud.')
  _passphrase = passphrase

  await loadCustomProviders()
  let synced = 0
  for (const id of Object.keys(getLLMProviders())) {
    const key = await db.getSetting(`apikey_${id}`)
    if (!key) continue
    const res = await saveUserApiKey(id, key, passphrase)
    if (res?.synced) { await db.setSetting(`synced_${id}`, Date.now()); synced++ }
  }
  await db.setSetting('cloud_sync_on', true)
  return { synced }
}

export async function disableCloudSync() {
  _passphrase = null
  await db.setSetting('cloud_sync_on', false)
  await loadCustomProviders()
  for (const id of Object.keys(getLLMProviders())) await db.setSetting(`synced_${id}`, null)
}

export async function isCloudSyncOn() {
  return !!(await db.getSetting('cloud_sync_on')) && hasKeyPassphrase()
}

export async function getMe() {
  return db.getSetting('user')
}

export async function logout() {
  _passphrase = null
  if (await db.getSetting('user')) await logOutGoogle()
  await db.setSetting('user', null)
}
export async function isLoggedIn() { return !!(await db.getSetting('user')) }

/**
 * Providers that could serve this message, best first: the chosen one, then any
 * other with a key that does not need a proxy. Free tiers fail often enough
 * that a second option is worth more than a perfect first choice.
 */
export async function getFallbackChain(primary) {
  await loadCustomProviders()
  const chain = [primary]
  for (const [id, p] of Object.entries(getLLMProviders())) {
    if (id === primary) continue
    if (p.needsProxy && !proxyAvailable()) continue
    if (await db.getSetting(`apikey_${id}`)) chain.push(id)
  }
  return chain
}

/** Errors worth trying a different provider for. */
function isProviderFailure(msg = '') {
  return /\b(429|500|502|503|504|520|522|524)\b/.test(msg) ||
    /timeout|no response|not responding|overloaded|rate limit/i.test(msg)
}

// ─── Chat (via browser agent) ───
// Keyed so that a side task (prompt enhancement) cannot have its handle
// clobbered by — or clobber — the main chat stream.
const aborters = new Map()

export async function streamMessage(body, onToken, onSources, onDone, onError, onStatus, onStreamId, onToolsDetected, onToolResult) {
  const provider = body.provider || await getActiveProvider()
  const apiKey = await db.getSetting(`apikey_${provider}`)
  let model = body.model || await db.getSetting(`model_${provider}`, '')

  // Auto-route: choose per message from models measured as working.
  const prefs = await db.getSetting('chat_prefs', {})
  if (prefs.auto_route && !body.model) {
    const routed = await routeModel(provider, body.message || '')
    if (routed) {
      model = routed.model
      onStatus?.(`Routing ${routed.kind} → ${routed.model}`)
    }
  }

  if (!apiKey) {
    const p = getLLMProviders()[provider]
    onError?.(`No API key for ${p?.name || provider}. Open Settings and add one${p?.keyUrl ? ` — free key at ${p.keyUrl}` : ''}.`)
    return
  }

  const channel = body.channel || 'chat'
  aborters.get(channel)?.abort()
  const controller = new AbortController()
  aborters.set(channel, controller)
  onStreamId?.('local-' + Date.now())

  const prefs2 = await db.getSetting('chat_prefs', {})
  const chain = prefs2.fallback === false || channel !== 'chat'
    ? [provider]
    : await getFallbackChain(provider)

  try {
    for (let i = 0; i < chain.length; i++) {
      const pid = chain[i]
      const key = i === 0 ? apiKey : await db.getSetting(`apikey_${pid}`)
      if (!key) continue
      const mdl = i === 0 ? model : await db.getSetting(`model_${pid}`, '')

      let failure = null
      let produced = false

      await runAgent({
        provider: pid, apiKey: key, model: mdl,
        history: body.messages || [],
        userMessage: body.message || body.messages?.[body.messages.length - 1]?.content || '',
        toolsEnabled: body.tools !== false && body.use_tools !== false,
        webEnabled: body.use_web_search !== false,
        disabledTools: await getDisabledTools(),
        persona: body.system_prompt || null,
        temperature: body.temperature || 0.7,
        signal: controller.signal,
        onToken: (t) => { produced = true; onToken?.(t) },
        onStatus,
        onSources,
        onToolStart: (name) => onToolsDetected?.([name]),
        onToolResult: (name, result) => onToolResult?.(name, result),
        onDone: ({ content, sources, aborted }) => {
          if (sources?.length) onSources?.(sources)
          onDone?.(content, { aborted, provider: pid })
        },
        onError: (err) => { failure = err?.message || String(err) },
      })

      if (!failure) return

      // Only switch provider if nothing was shown yet — swapping mid-answer
      // would splice two different models' text together.
      const next = chain[i + 1]
      if (produced || controller.signal.aborted || !isProviderFailure(failure) || !next) {
        onError?.(failure)
        return
      }
      onStatus?.(`${getLLMProviders()[pid]?.name || pid} failed — trying ${getLLMProviders()[next]?.name || next}…`)
    }
    onError?.('No provider with a working key could answer.')
  } catch (err) {
    onError?.(err.message)
  } finally {
    if (aborters.get(channel) === controller) aborters.delete(channel)
  }
}

export async function stopGeneration(channel = 'chat') {
  aborters.get(channel)?.abort()
  aborters.delete(channel)
}

// ─── Chat preferences (persisted) ───
export async function getPrefs() {
  return db.getSetting('chat_prefs', {})
}

export async function setPref(key, value) {
  const prefs = await db.getSetting('chat_prefs', {})
  prefs[key] = value
  await db.setSetting('chat_prefs', prefs)
  return prefs
}

// ─── Conversations (IndexedDB) ───
export async function getConversations() {
  return db.getConversations()
}

/** Create a conversation row and return its id. */
export async function createConversation(title) {
  const c = await db.createConversation(title)
  return c.id
}

/** Append a message to a stored conversation. */
export async function saveMessage(conversationId, msg) {
  if (!conversationId) return null
  return db.addMessage(conversationId, msg.role, msg.content, msg.toolResults || null, msg.sources || null)
}

export async function renameConversation(id, title) {
  if (!id) return
  return db.updateConversationTitle(id, title)
}

/** Drop stored messages from index `from` onward (used by regenerate). */
export async function trimConversationFrom(id, from) {
  if (!id) return
  return db.trimMessages(id, from)
}

export async function getConversation(id) {
  return db.getConversation(id)
}

export async function deleteConversation(id) {
  return db.deleteConversation(id)
}

export async function exportConversation(id) {
  const md = await db.exportConversation(id)
  return { content: md, format: 'markdown' }
}

// ─── Backup / restore ───
export async function downloadBackup() {
  const data = await db.exportAll()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `yogatik-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
  return {
    conversations: data.conversations.length,
    messages: data.messages.length,
    documents: data.documents.length,
  }
}

export async function restoreBackup(file, mode = 'merge') {
  const text = await file.text()
  let data
  try { data = JSON.parse(text) } catch { throw new Error('That file is not valid JSON.') }
  const counts = await db.importAll(data, mode)
  invalidateDocIndex()          // retrieval indexes are stale after a restore
  return counts
}

// ─── Templates (stored in IndexedDB) ───
const DEFAULT_TEMPLATES = [
  { id: 'default', name: 'Default', system_prompt: 'You are a helpful AI assistant.' },
  { id: 'coder', name: 'Coder', system_prompt: 'You are an expert programmer. Write clean, efficient code with explanations.' },
  { id: 'writer', name: 'Writer', system_prompt: 'You are a creative writer. Write engaging, well-structured content.' },
]

export async function getTemplates() {
  const custom = await db.getSetting('templates', [])
  return [...DEFAULT_TEMPLATES, ...custom]
}

export async function createTemplate(data) {
  const templates = await db.getSetting('templates', [])
  const t = { id: 'tmpl-' + Date.now(), ...data }
  templates.push(t)
  await db.setSetting('templates', templates)
  return t
}

export async function deleteTemplate(id) {
  const templates = await db.getSetting('templates', [])
  await db.setSetting('templates', templates.filter(t => t.id !== id))
}

// ─── Documents (browser-native retrieval, no backend) ───

/** Text extraction per file type. PDFs go through pdf.js, everything else is read as text. */
async function extractText(file) {
  const name = (file.name || '').toLowerCase()

  if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    const { pdfExtractTool } = await import('./tools/pdfExtract')
    const url = URL.createObjectURL(file)
    try {
      const res = await pdfExtractTool.execute({ url })
      if (!res?.text) throw new Error('No extractable text — the PDF may be a scan. Try the OCR tool.')
      return res.text
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  if (/\.(txt|md|markdown|csv|tsv|json|log|xml|ya?ml|html?|jsx?|tsx?|py|css)$/.test(name) ||
      file.type.startsWith('text/') || file.type === 'application/json') {
    return file.text()
  }

  throw new Error(`Unsupported file type: ${file.type || name}. Supported: PDF, TXT, MD, CSV, JSON, code files.`)
}

const INLINE_LIMIT = 12000 // small docs ride along in the prompt; larger ones are retrieved

export async function uploadDocument(file) {
  if (!file) return { success: false, error: 'No file provided' }

  const text = (await extractText(file)).trim()
  if (!text) return { success: false, error: 'File appears to be empty' }

  const chunks = chunkText(text)
  // Only chunks are ever read back (doc_search joins them); keeping the full
  // text too doubled IndexedDB usage for every upload.
  const doc = await db.addDocument({
    name: file.name, type: file.type || 'text', size: file.size,
    chars: text.length, chunks,
  })
  invalidateDocIndex(doc.id)

  return {
    success: true,
    id: doc.id,
    name: file.name,
    chars: text.length,
    chunks: chunks.length,
    // Short documents are cheaper and more accurate injected whole than retrieved.
    inline: text.length <= INLINE_LIMIT ? text : null,
    message: text.length <= INLINE_LIMIT
      ? `Loaded ${file.name} (${text.length.toLocaleString()} chars).`
      : `Indexed ${file.name} — ${chunks.length} passages searchable via doc_search.`,
  }
}

export async function listDocuments() { return db.getDocuments() }

export async function removeDocument(id) {
  await db.deleteDocument(id)
  invalidateDocIndex(id)
}

// ─── Models & Providers (dynamically fetched per provider) ───
async function loadCustomProviders() {
  const custom = await db.getSetting('custom_providers', {})
  registerCustomProviders(custom)
  return custom
}

const MODEL_TTL = 6 * 60 * 60 * 1000 // 6h

/** Cached live-model lookup: serves cache instantly, refreshes in background. */
async function cachedModels(id, key, fallback) {
  const cache = await db.getSetting(`models_${id}`)
  const fresh = cache && Date.now() - cache.ts < MODEL_TTL && cache.list?.length
  const refresh = async () => {
    try {
      const fetched = await fetchLiveModels(id, key)
      if (fetched?.length) await db.setSetting(`models_${id}`, { ts: Date.now(), list: fetched })
      return fetched
    } catch { return [] }
  }
  if (fresh) { refresh(); return cache.list }              // stale-while-revalidate
  const fetched = await refresh()
  return fetched?.length ? fetched : (cache?.list?.length ? cache.list : fallback)
}

export async function getModels() {
  await loadCustomProviders()
  const providers = getLLMProviders()
  const custom = await db.getSetting('custom_providers', {})
  const result = {}
  for (const [id, p] of Object.entries(providers)) {
    const key = await db.getSetting(`apikey_${id}`)
    const hasKey = !!key
    let liveModels = p.models || []
    if (hasKey || p.publicModels) liveModels = await cachedModels(id, key, liveModels)
    result[id] = {
      name: p.name, type: 'openai_compatible',
      available: hasKey, models: liveModels,
      default_model: (liveModels.includes(p.default) ? p.default : liveModels[0]) || p.default || '',
      needs_key: !hasKey,
      builtin: !custom[id], base_url: p.baseUrl, key_url: p.keyUrl,
    }
  }
  return result
}

/** @deprecated alias kept for callers; identical payload to getModels(). */
export async function getProviders() {
  return getModels()
}

export async function addProvider(data) {
  const id = data.provider_id || data.id
  if (data.api_key) await db.setSetting(`apikey_${id}`, data.api_key)
  // If it has a base_url, it's a custom provider — save config
  if (data.base_url) {
    const custom = await db.getSetting('custom_providers', {})
    custom[id] = {
      name: data.name || id,
      baseUrl: data.base_url,
      models: data.models || [],
      default: data.default_model || data.models?.[0] || '',
    }
    await db.setSetting('custom_providers', custom)
    registerCustomProviders(custom)
  }
  return { success: true }
}

export async function forgetApiKey(providerId) {
  await db.setSetting(`apikey_${providerId}`, null)
  await db.setSetting(`synced_${providerId}`, null)
}

export async function removeProvider(id) {
  await db.setSetting(`apikey_${id}`, null)
  const custom = await db.getSetting('custom_providers', {})
  if (custom[id]) {
    delete custom[id]
    await db.setSetting('custom_providers', custom)
    registerCustomProviders(custom)
  }
  return { success: true }
}

// A connection check must fail fast. Inheriting the chat budget (120s x 3
// retries) left the UI sitting on "Verifying…" for minutes against a slow model.
const TEST_TIMEOUT = 20_000

/** Status is per provider AND per model — a pass only vouches for one model. */
const statusKey = (id, model) => `status_${id}::${model || 'default'}`
const STATUS_TTL = 30 * 60 * 1000

/**
 * Real connection test: a 1-token completion through the same path chat uses,
 * so a pass genuinely means "chat will work with this model" — proxy included.
 */
export async function testProvider(id, modelOverride) {
  const apiKey = await db.getSetting(`apikey_${id}`)
  await loadCustomProviders()
  const p = getLLMProviders()[id]
  const model = modelOverride || await db.getSetting(`model_${id}`) || p?.default || p?.models?.[0]

  const remember = async (res) => {
    await db.setSetting(statusKey(id, model), { ...res, model, at: Date.now() })
    return res
  }

  if (!apiKey) return remember({ success: false, error: 'No API key set' })
  if (!p) return { success: false, error: 'Provider not found' }

  if (p.needsProxy && !proxyAvailable()) {
    return remember({
      success: false,
      error: 'This provider needs a CORS proxy. Deploy the Cloudflare Worker and set VITE_LLM_PROXY_BASE, or pick a provider that works directly from the browser.',
    })
  }

  const started = performance.now()
  try {
    const out = await chatComplete({
      provider: id, apiKey, model,
      messages: [{ role: 'user', content: 'ping' }],
      temperature: 0,
      maxTokens: 1,
      timeoutMs: TEST_TIMEOUT,
      retries: 0,          // a test that needs retries has already failed
    })
    return remember({
      success: true,
      status: 'ok',
      model: out?.model || model,
      latencyMs: Math.round(performance.now() - started),
      response: 'Connected',
    })
  } catch (e) {
    // A retired model must not linger in the picker or stay selected.
    if (isRetiredModelError(e.message)) await pruneRetiredModel(id, model)
    const timedOut = e.name === 'TimeoutError' || /timeout/i.test(e.message || '')
    return remember({
      success: false,
      error: timedOut
        ? `No response in ${TEST_TIMEOUT / 1000}s — this model is too slow to use for chat. Pick a smaller one.`
        : friendlyProviderError(e.message),
      latencyMs: Math.round(performance.now() - started),
    })
  }
}

/**
 * Rank models by how likely they are to be a fast, general chat model.
 * Name heuristics only — providers expose no capability metadata, and this is
 * just an ordering for probing, not a claim about quality.
 */
function candidateScore(id) {
  const m = id.toLowerCase()
  let score = 0
  if (/instruct|chat|-it$|turbo/.test(m)) score += 3
  if (/flash|nano|mini|lite|small|fast|8b|7b|9b|4b|3b|2b|1b/.test(m)) score += 4   // responsive
  if (/70b|72b|90b|120b|123b|253b|340b|405b|550b|large|ultra|pro\b/.test(m)) score -= 4  // slow to first token
  if (/vision|vl|omni|audio|video|reason/.test(m)) score -= 2                       // specialised
  if (/preview|alpha|beta|experimental|deprecated/.test(m)) score -= 2
  return score
}

/**
 * Probe a handful of promising models and select the fastest one that actually
 * answers. Beats making the user guess from a list of 79 names, most of which
 * are unusable on a free tier.
 */
export async function autoPickModel(providerId, { max = 4, timeoutMs = 10_000, onProgress } = {}) {
  const apiKey = await db.getSetting(`apikey_${providerId}`)
  if (!apiKey) throw new Error('Add an API key first.')

  await loadCustomProviders()
  const prov = getLLMProviders()[providerId]
  if (!prov) throw new Error('Unknown provider')

  // Prefer the live catalog; fall back to the built-in list.
  const cached = await db.getSetting(`models_${providerId}`)
  const all = (cached?.list?.length ? cached.list : prov.models) || []
  const ranked = [...all].sort((a, b) => candidateScore(b) - candidateScore(a)).slice(0, max)
  if (!ranked.length) throw new Error('No models available for this provider.')

  onProgress?.(`Testing ${ranked.length} models…`)

  const results = await Promise.all(ranked.map(async (model) => {
    const started = performance.now()
    try {
      await chatComplete({
        provider: providerId, apiKey, model,
        messages: [{ role: 'user', content: 'ping' }],
        temperature: 0, maxTokens: 1,
        timeoutMs, retries: 0,
      })
      return { model, latencyMs: Math.round(performance.now() - started), ok: true }
    } catch (e) {
      if (isRetiredModelError(e.message)) await pruneRetiredModel(providerId, model)
      return { model, ok: false, error: e.message }
    }
  }))

  // Remember every probe so the picker can show what was measured.
  for (const r of results) {
    await db.setSetting(statusKey(providerId, r.model), {
      success: r.ok, model: r.model, latencyMs: r.latencyMs,
      error: r.ok ? null : friendlyProviderError(r.error || ''),
      at: Date.now(),
    })
  }

  const winner = results.filter(r => r.ok).sort((a, b) => a.latencyMs - b.latencyMs)[0]
  if (!winner) {
    const reason = friendlyProviderError(results[0]?.error || '')
    throw new Error(`None of the ${ranked.length} models responded within ${timeoutMs / 1000}s. ${reason}`)
  }

  await db.setSetting(`model_${providerId}`, winner.model)
  return { ...winner, tried: results }
}

/**
 * Classify a prompt cheaply, with keywords — no extra LLM call, no latency.
 * Deliberately coarse: it only has to be right often enough to beat "always
 * use the same model".
 */
export function classifyQuery(text = '') {
  const t = text.toLowerCase()
  const long = text.length > 400

  if (/```|\bcode\b|function |def |class |bug|refactor|regex|sql|typescript|javascript|python|compile|stack trace|error:/.test(t))
    return 'code'
  if (/prove|derive|calculate|solve|equation|theorem|step by step|reason|why does|analy[sz]e|trade-?off|compare in detail/.test(t) || long)
    return 'reasoning'
  if (/write|essay|story|poem|draft|blog|email|summar/.test(t))
    return 'writing'
  return 'quick'
}

/** Which model names suit each class. Again: name heuristics, not metadata. */
const ROUTE_PREFS = {
  code:      { prefer: /coder|code|codestral|starcoder|codegemma|devstral|granite.*code/, minSize: 0 },
  reasoning: { prefer: /reason|think|r1|nemotron|70b|72b|120b|large|pro\b|ultra/, minSize: 0 },
  writing:   { prefer: /instruct|chat|creative|palmyra|writer/, minSize: 0 },
  quick:     { prefer: /flash|nano|mini|lite|small|fast|8b|7b|9b|4b|3b|1b|instant/, minSize: 0 },
}

/**
 * Pick a model for one specific message, preferring models we have MEASURED
 * as working. Falls back to the user's selection when nothing qualifies.
 */
export async function routeModel(providerId, message) {
  await loadCustomProviders()
  const prov = getLLMProviders()[providerId]
  if (!prov) return null

  const cached = await db.getSetting(`models_${providerId}`)
  const all = (cached?.list?.length ? cached.list : prov.models) || []
  if (!all.length) return null

  // Only consider models with a recent successful probe; an unmeasured model
  // could be the 5-minute one.
  const measured = []
  for (const m of all) {
    const st = await db.getSetting(statusKey(providerId, m))
    if (st?.success) measured.push({ model: m, latencyMs: st.latencyMs ?? 9e9 })
  }
  if (!measured.length) return null

  const kind = classifyQuery(message)
  const { prefer } = ROUTE_PREFS[kind] || ROUTE_PREFS.quick

  const matching = measured.filter(m => prefer.test(m.model.toLowerCase()))
  const pool = matching.length ? matching : measured

  // Within the right category, fastest wins.
  const pick = pool.sort((a, b) => a.latencyMs - b.latencyMs)[0]
  return pick ? { model: pick.model, kind, latencyMs: pick.latencyMs } : null
}

/** Every model we have timed for a provider, for the picker. */
export async function getMeasuredModels(providerId) {
  const all = await db.getAllSettings()
  const prefix = `status_${providerId}::`
  const out = {}
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(prefix) && v) out[k.slice(prefix.length)] = v
  }
  return out
}

/** Test only if we have no fresh result for this exact provider+model. */
export async function ensureTested(id, model) {
  const cached = await db.getSetting(statusKey(id, model))
  if (cached && Date.now() - cached.at < STATUS_TTL) return cached
  return testProvider(id, model)
}

/** Providers retire models without warning; 410 means this one is gone. */
export function isRetiredModelError(msg = '') {
  return /\b410\b/.test(msg) || /end of life|no longer available/i.test(msg)
}

/**
 * Forget a retired model: drop the cached catalog so the next fetch is fresh,
 * and clear the selection so the app falls back to a model that still exists.
 */
export async function pruneRetiredModel(providerId, model) {
  const cache = await db.getSetting(`models_${providerId}`)
  if (cache?.list?.length) {
    await db.setSetting(`models_${providerId}`, { ts: 0, list: cache.list.filter(m => m !== model) })
  }
  if (await db.getSetting(`model_${providerId}`) === model) {
    await db.setSetting(`model_${providerId}`, '')
  }
  await db.setSetting(statusKey(providerId, model), null)
}

/** Turn raw provider HTTP errors into something a user can act on. */
function friendlyProviderError(msg = '') {
  if (isRetiredModelError(msg)) {
    const detail = msg.match(/"detail":"([^"]+)"/)?.[1]
    return detail
      ? `${detail} Pick a different model.`
      : 'This model has been retired by the provider. Pick a different model.'
  }
  if (/\b401\b|invalid api key|unauthorized/i.test(msg)) return 'Invalid API key — check you pasted the whole key.'
  if (/\b403\b/i.test(msg)) return 'Key rejected (403). It may lack permission or be from the wrong account.'
  if (/\b404\b|model.*not found/i.test(msg)) return 'Model not found for this provider — pick a different model.'
  if (/\b429\b/i.test(msg)) return 'Rate limited (429). The key works, but you are over quota right now.'
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Could not reach the provider — network or CORS proxy issue.'
  return msg.slice(0, 200)
}

export async function getProviderStatus(id, model) {
  return db.getSetting(statusKey(id, model))
}

/** Connection state for every provider, scoped to its currently selected model. */
export async function getAllProviderStatus() {
  await loadCustomProviders()
  const out = {}
  for (const [id, p] of Object.entries(getLLMProviders())) {
    const hasKey = !!(await db.getSetting(`apikey_${id}`))
    const selected = await db.getSetting(`model_${id}`) || p.default || p.models?.[0] || ''
    const status = await db.getSetting(statusKey(id, selected))
    out[id] = {
      hasKey,
      selected,
      state: !hasKey ? 'no-key'
        : !status ? 'untested'
        : status.success ? 'connected' : 'failed',
      error: status?.success ? null : status?.error || null,
      latencyMs: status?.latencyMs,
      model: status?.model || selected,
      at: status?.at,
    }
  }
  return out
}

// ─── Active provider / model (persisted — the agent reads these) ───
export async function getActiveProvider() {
  const saved = await db.getSetting('provider')
  if (saved) return saved
  // No stored choice: prefer a provider that already has a key, and never
  // default to one that needs a proxy the user may not have deployed.
  await loadCustomProviders()
  const providers = getLLMProviders()
  for (const [id, p] of Object.entries(providers)) {
    if (p.needsProxy && !proxyAvailable()) continue
    if (await db.getSetting(`apikey_${id}`)) return id
  }
  return 'groq'
}

export async function setActiveProvider(id) {
  await db.setSetting('provider', id)
}

export async function getActiveModel(providerId) {
  return db.getSetting(`model_${providerId}`, '')
}

export async function setActiveModel(providerId, model) {
  await db.setSetting(`model_${providerId}`, model || '')
}

// ─── AI Tools (browser-native) ───

/**
 * Per-tool enable/disable. Stored as a map of the *disabled* names so tools
 * added in future releases are on by default rather than silently missing.
 */
/**
 * Tools that grab hardware and annoy the user when a model over-calls them.
 * Both are already available as UI buttons (speaker on each message, mic in
 * the composer), so the agent does not need them by default.
 */
const DEFAULT_DISABLED = ['tts', 'stt']

export async function getDisabledTools() {
  const saved = await db.getSetting('disabled_tools')
  if (saved) return saved
  await db.setSetting('disabled_tools', DEFAULT_DISABLED)
  return DEFAULT_DISABLED
}

export async function setToolEnabled(name, enabled) {
  const disabled = new Set(await getDisabledTools())
  if (enabled) disabled.delete(name)
  else disabled.add(name)
  await db.setSetting('disabled_tools', [...disabled])
  return [...disabled]
}

export async function setToolsEnabledBulk(names, enabled) {
  const disabled = new Set(await getDisabledTools())
  for (const n of names) enabled ? disabled.delete(n) : disabled.add(n)
  await db.setSetting('disabled_tools', [...disabled])
  return [...disabled]
}

export async function getTools() {
  const disabled = new Set(await getDisabledTools())
  return getToolNames().map(name => ({
    name,
    enabled: !disabled.has(name),
    group: TOOL_GROUPS[name] || 'Other',
  }))
}

/** Grouping drives the settings UI only — the agent sees a flat list. */
export const TOOL_GROUPS = {
  web_search: 'Web', deep_research: 'Web', web_extract: 'Web', link_preview: 'Web',
  rss_feed: 'Web', youtube: 'Web', whois: 'Web', ip_lookup: 'Web',
  doc_search: 'Documents', doc_list: 'Documents', pdf_extract: 'Documents',
  ocr: 'Documents', summarize: 'Documents', md_to_pdf: 'Documents',
  code_execute: 'Compute', calculator: 'Compute', data_convert: 'Compute',
  unit_convert: 'Compute', regex: 'Compute', hash: 'Compute', diff: 'Compute',
  image_generate: 'Media', chart: 'Media', diagram: 'Media', image_info: 'Media',
  color_palette: 'Media', qr_generate: 'Media', qr_read: 'Media', audio_edit: 'Media',
  tts: 'Voice', stt: 'Voice',
  weather: 'Utility', translate: 'Utility',
}

// ─── TTS (Web Speech API) ───
export async function requestTTS(text, { onEnd } = {}) {
  if (!('speechSynthesis' in window)) throw new Error('TTS not supported')
  const utter = new SpeechSynthesisUtterance(text)
  utter.onend = () => onEnd?.()
  utter.onerror = () => onEnd?.()
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utter)
  return { success: true }
}

export function stopTTS() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

export async function getTTSVoices() {
  return window.speechSynthesis?.getVoices?.()?.map(v => ({ name: v.name, lang: v.lang })) || []
}
