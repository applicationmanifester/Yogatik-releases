/**
 * API shim — replaces all backend calls with browser-native equivalents.
 * Uses IndexedDB for storage, direct LLM API calls, browser tools.
 * Drop-in compatible with existing App.jsx interface.
 */

import * as db from './db'
import { runAgent } from './agent'
import { getProviders as getLLMProviders, getProviderModels, registerCustomProviders, fetchLiveModels } from './llm'
import { getToolNames } from './tools/index'

import { signInWithGoogle, logOutGoogle, saveUserApiKey, getUserApiKeys } from './firebaseAuth'

// ─── Auth (Google Sign-In & Firestore API Key Vault) ───
export async function loginWithGoogle() {
  const user = await signInWithGoogle()
  await db.setSetting('user', user)
  // Restore saved cloud API keys to IndexedDB
  const keys = await getUserApiKeys()
  for (const [provider, key] of Object.entries(keys)) {
    if (key) await db.setSetting(`apikey_${provider}`, key)
  }
  return user
}

export async function saveProviderApiKey(provider, apiKey) {
  await db.setSetting(`apikey_${provider}`, apiKey)
  await saveUserApiKey(provider, apiKey)
}

export async function getMe() {
  return db.getSetting('user')
}

export async function logout() {
  await logOutGoogle()
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
      toolsEnabled: body.tools !== false,
      temperature: body.temperature || 0.7,
      signal: currentAbort.signal,
      onToken,
      onStatus,
      onToolStart: (name) => onToolsDetected?.([name]),
      onToolResult: (name, result) => onToolResult?.(name, result),
      onDone: ({ content, toolResults }) => {
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

// ─── Documents (no-op, RAG not available in browser mode) ───
export async function uploadDocument() {
  return { message: 'Document upload not available in browser-only mode. Paste text directly in chat.' }
}

// ─── Models & Providers (dynamically fetched per provider) ───
async function loadCustomProviders() {
  const custom = await db.getSetting('custom_providers', {})
  registerCustomProviders(custom)
  return custom
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
    if (hasKey && !p.needsProxy) {
      try {
        const fetched = await fetchLiveModels(id, key)
        if (fetched && fetched.length > 0) liveModels = fetched
      } catch {}
    }
    result[id] = {
      name: p.name, type: 'openai_compatible',
      available: hasKey, models: liveModels,
      default_model: p.default || liveModels[0] || '', needs_key: !hasKey,
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
export async function requestTTS(text) {
  if (!('speechSynthesis' in window)) throw new Error('TTS not supported')
  const utter = new SpeechSynthesisUtterance(text)
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utter)
  return { success: true }
}

export async function getTTSVoices() {
  return window.speechSynthesis?.getVoices?.()?.map(v => ({ name: v.name, lang: v.lang })) || []
}
