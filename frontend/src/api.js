/**
 * API shim — replaces all backend calls with browser-native equivalents.
 * Uses IndexedDB for storage, direct LLM API calls, browser tools.
 * Drop-in compatible with existing App.jsx interface.
 */

import * as db from './db'
import { runAgent } from './agent'
import { getProviders as getLLMProviders, registerCustomProviders, fetchLiveModels } from './llm'
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
    return saveUserApiKey(provider, apiKey, _passphrase)
  }
  return { synced: false, reason: _passphrase ? 'signed-out' : 'no-passphrase' }
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

// ─── Chat (via browser agent) ───
let currentAbort = null

export async function streamMessage(body, onToken, onSources, onDone, onError, onStatus, onStreamId, onToolsDetected, onToolResult) {
  const provider = await db.getSetting('provider', 'nvidia')
  const apiKey = await db.getSetting(`apikey_${provider}`)
  const model = body.model || await db.getSetting(`model_${provider}`, '')

  if (!apiKey) {
    onError?.('API key not set. Go to Settings → enter your API key.')
    return
  }

  currentAbort = new AbortController()
  onStreamId?.('local-' + Date.now())

  try {
    await runAgent({
      provider, apiKey, model,
      history: body.messages || [],
      userMessage: body.message || body.messages?.[body.messages.length - 1]?.content || '',
      toolsEnabled: body.tools !== false && body.use_tools !== false,
      webEnabled: body.use_web_search !== false,
      temperature: body.temperature || 0.7,
      signal: currentAbort.signal,
      onToken,
      onStatus,
      onSources,
      onToolStart: (name) => onToolsDetected?.([name]),
      onToolResult: (name, result) => onToolResult?.(name, result),
      onDone: ({ content, sources }) => {
        if (sources?.length) onSources?.(sources)
        onDone?.(content)
      },
      onError: (err) => onError?.(err.message),
    })
  } catch (err) {
    onError?.(err.message)
  }
}

export async function stopGeneration() {
  currentAbort?.abort()
  currentAbort = null
}

// ─── Conversations (IndexedDB) ───
export async function getConversations() {
  return db.getConversations()
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
  const doc = await db.addDocument({
    name: file.name, type: file.type || 'text', size: file.size,
    chars: text.length, text, chunks,
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

export async function testProvider(id) {
  const apiKey = await db.getSetting(`apikey_${id}`)
  if (!apiKey) return { success: false, error: 'No API key set' }
  try {
    await loadCustomProviders()
    const providers = getLLMProviders()
    const p = providers[id]
    if (!p) return { success: false, error: 'Provider not found' }
    
    // Non-CORS providers (like NVIDIA) cannot be tested via client-side fetch on static web hosting
    if (p.needsProxy && window.location.hostname !== 'localhost') {
      if (apiKey.length < 5) return { success: false, error: 'API key format invalid' }
      return { success: true, status: 'ok', response: 'API Key saved successfully!' }
    }

    const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` }
    if (id === 'openrouter') { headers['HTTP-Referer'] = 'https://yogatik.app'; headers['X-Title'] = 'Yogatik' }
    const url = `${p.baseUrl}/chat/completions`
    const fetchOpts = {
      method: 'POST', headers,
      body: JSON.stringify({ model: p.default || p.models?.[0], messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
    }
    let resp
    if (p.needsProxy && window.location.hostname === 'localhost') {
      resp = await fetch('/api/llm-proxy', { ...fetchOpts, headers: { ...headers, 'X-Target-URL': url } })
    } else {
      resp = await fetch(url, fetchOpts)
    }
    if (!resp.ok) { const t = await resp.text(); return { success: false, error: `HTTP ${resp.status}: ${t.slice(0, 120)}` } }
    return { success: true, status: 'ok', response: 'Connected successfully!' }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// ─── AI Tools (browser-native) ───
export async function getTools() {
  return getToolNames().map(name => ({ name, enabled: true }))
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
