/**
 * API shim — replaces all backend calls with browser-native equivalents.
 * Uses IndexedDB for storage, direct LLM API calls, browser tools.
 * Drop-in compatible with existing App.jsx interface.
 */

import * as db from './db'
import { runAgent } from './agent'
import { getProviders as getLLMProviders, registerCustomProviders, fetchLiveModels, chatComplete, proxyAvailable } from './llm'
import { getToolNames } from './tools/index'
import { isDesktop } from './tools/localFs'
import { chunkText } from './retrieval'
import { invalidateDocIndex } from './tools/documents'
import { LIVE_MODELS } from './live/protocol'
import { getCachedVision, looksVisionCapable, probeVision } from './vision/capability'
import { getSharedSpeaker, stopSharedSpeaker } from './live/voice'
import { DEFAULT_VOICE } from './video/speech'
import { getWorkflows, upsertWorkflow, runWorkflow } from './workflows'
import { getSkills, upsertSkill } from './skills'
import { getAgents, upsertAgent } from './agents'

import { signInWithGoogle, checkRedirectResult, logOutGoogle, saveUserApiKey, getUserApiKeys, purgePlaintextKeys, authRedirectPending, saveVault, loadVault, getVaultMeta } from './firebaseAuth'
import { encryptSecret, decryptSecret } from './crypto'

// ─── Auth (Google Sign-In & encrypted Firestore key vault) ───

/**
 * Key vault: the account IS the credential.
 *
 * Keys are sealed with a secret derived from the signed-in account id, so any
 * device unlocks them the moment the same user signs in — nothing to type, no
 * to type. That is encryption at rest rather than zero knowledge — a deliberate
 * trade, because a secret nobody remembers protects a key nobody can use. The
 * Firestore rules scope the document to its owner's uid.
 */
function accountSecret(uid) {
  return uid ? `yogatik.account.v1.${uid}` : null
}

async function vaultSecret() {
  const user = await db.getSetting('user')
  return accountSecret(user?.uid)
}

/** Pull every key this account has and store it on this device. */
export async function pullCloudKeys() {
  const secret = await vaultSecret()
  if (!secret) return { pulled: 0 }
  let pulled = 0
  try {
    const keys = await getUserApiKeys(secret)
    for (const [provider, key] of Object.entries(keys)) {
      if (!key) continue
      if (await db.getSetting(`apikey_${provider}`) === key) continue
      await db.setSetting(`apikey_${provider}`, key)
      pulled++
    }
  } catch { /* offline or rules: local keys still work */ }
  return { pulled }
}

/** Push every key stored on this device up to the account. */
export async function pushCloudKeys() {
  const secret = await vaultSecret()
  if (!secret) return { pushed: 0 }
  await loadCustomProviders()
  let pushed = 0
  for (const id of Object.keys(getLLMProviders())) {
    const key = await db.getSetting(`apikey_${id}`)
    if (!key) continue
    try {
      const res = await saveUserApiKey(id, key, secret)
      if (res?.synced) { await db.setSetting(`synced_${id}`, Date.now()); pushed++ }
    } catch { /* keep going: one provider failing is not a reason to stop */ }
  }
  return { pushed }
}

/** Both directions, newest wins locally. Safe to call on every sign-in. */
export async function syncCloudKeys() {
  const pulled = await pullCloudKeys()
  const pushed = await pushCloudKeys()
  return { ...pulled, ...pushed }
}

// ─── Encrypted conversation + document sync ───
// Opt-in (chat_prefs.cloud_sync). The whole local corpus is exported, encrypted
// with the account secret, and stored as chunks in Firestore — so signing in on
// another device restores your chats. Reuses the tested exportAll/importAll
// merge logic rather than risky per-message live sync.

export function cloudSyncEnabled() {
  return db.getSetting('chat_prefs', {}).then(p => p?.cloud_sync === true)
}

/** Push the local snapshot (encrypted) to the cloud. */
export async function pushCloudData() {
  const secret = await vaultSecret()
  if (!secret) return { synced: false, reason: 'signed-out' }
  const snapshot = await db.exportAll()
  const cipher = await encryptSecret(JSON.stringify(snapshot), secret)
  const res = await saveVault(cipher, {
    conversations: snapshot.conversations.length,
    messages: snapshot.messages.length,
  })
  if (res?.synced) await db.setSetting('cloud_sync_at', Date.now())
  return res
}

/** Pull the cloud snapshot and MERGE it into this device (never destructive). */
export async function pullCloudData(mode = 'merge') {
  const secret = await vaultSecret()
  if (!secret) return { pulled: 0, reason: 'signed-out' }
  const cipher = await loadVault()
  if (!cipher) return { pulled: 0 }
  const json = await decryptSecret(cipher, secret)
  if (!json) return { pulled: 0, reason: 'decrypt-failed' }
  let data
  try { data = JSON.parse(json) } catch { return { pulled: 0, reason: 'corrupt' } }
  const counts = await db.importAll(data, mode)
  return { pulled: counts.conversations || 0, ...counts }
}

/** Two-way: pull first (so a fresh device gets history), then push the union. */
export async function syncCloudData() {
  if (!(await cloudSyncEnabled())) return { synced: false, reason: 'disabled' }
  const pulled = await pullCloudData('merge').catch(() => ({ pulled: 0 }))
  const pushed = await pushCloudData().catch((e) => ({ synced: false, reason: e?.message }))
  return { ...pulled, ...pushed }
}

export async function cloudSyncStatus() {
  const [enabled, at, meta] = await Promise.all([
    cloudSyncEnabled(), db.getSetting('cloud_sync_at', null),
    getVaultMeta().catch(() => null),
  ])
  return { enabled, at, meta }
}

/**
 * Runs on every startup, so it must not pull the Firebase SDK (~170KB gzipped)
 * for a visitor who has never signed in. Only a pending redirect or an existing
 * session justifies loading it.
 */
export async function checkGoogleRedirect() {
  if (!authRedirectPending() && !(await db.getSetting('user'))) return null
  const user = await checkRedirectResult()
  if (user) {
    await db.setSetting('user', user)
    try { await syncCloudKeys() } catch {}
    try { await purgePlaintextKeys() } catch {}
    try { await syncCloudData() } catch {}
  }
  return user
}

export async function loginWithGoogle() {
  const user = await signInWithGoogle()
  if (user) {
    await db.setSetting('user', user)
    // Signing in IS the sync step — nothing to type, no button to find.
    try { await syncCloudKeys() } catch {}
    try { await purgePlaintextKeys() } catch {}
    try { await syncCloudData() } catch {}
  }
  return user
}

export async function saveProviderApiKey(provider, apiKey) {
  await db.setSetting(`apikey_${provider}`, apiKey)
  // Signed in => it syncs, encrypted, to every other device of this account.
  const secret = await vaultSecret()
  if (secret) {
    const res = await saveUserApiKey(provider, apiKey, secret)
    if (res?.synced) await db.setSetting(`synced_${provider}`, Date.now())
    return res
  }
  await db.setSetting(`synced_${provider}`, null)
  return { synced: false, reason: 'signed-out' }
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

export async function isCloudSyncOn() {
  return !!(await db.getSetting('user'))
}

export async function getMe() {
  return db.getSetting('user')
}

export async function logout() {
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
    if (p.isLocal) continue          // loading 750MB is not a fallback
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
export const routeCache = new Map()
const ROUTE_CACHE_TTL = 5 * 60 * 1000

export async function streamMessage(body, onToken, onSources, onDone, onError, onStatus, onStreamId, onToolsDetected, onToolResult) {
  const provider = body.provider || await getActiveProvider()
  const apiKey = await db.getSetting(`apikey_${provider}`)
  let model = body.model || await db.getSetting(`model_${provider}`, '')
  if (!model) {
    try { model = await autoPickModel(provider) } catch { /* ignore */ }
  }

  // Auto-route: choose per message from models measured as working.
  const prefs = await db.getSetting('chat_prefs', {})
  if (prefs.auto_route && !body.model) {
    const routed = await routeModel(provider, body.message || '')
    if (routed) {
      model = routed.model
      onStatus?.(`Routing ${routed.kind} → ${routed.model}`)
    }
  }

  const provDef = getLLMProviders()[provider]
  if (!apiKey && !provDef?.noKey) {
    onError?.(`No API key for ${provDef?.name || provider}. Open Settings and add one${provDef?.keyUrl ? ` — free key at ${provDef.keyUrl}` : ''}.`)
    return
  }

  const channel = body.channel || 'chat'
  aborters.get(channel)?.abort()
  const controller = new AbortController()
  aborters.set(channel, controller)
  onStreamId?.(channel)

  const prefs2 = await db.getSetting('chat_prefs', {})
  const chain = prefs2.fallback === false || body.noFallback
    ? [provider]
    : await getFallbackChain(provider)

  try {
    for (let i = 0; i < chain.length; i++) {
      const pid = chain[i]
      const key = i === 0 ? apiKey : await db.getSetting(`apikey_${pid}`)
      if (!key && !getLLMProviders()[pid]?.isLocal) continue
      const mdl = i === 0 ? model : await db.getSetting(`model_${pid}`, '')
      const isLocalProvider = getLLMProviders()[pid]?.isLocal

      let failure = null
      let produced = false

      await runAgent({
        provider: pid, apiKey: key, model: mdl,
        history: body.messages || [],
        userMessage: body.message || body.messages?.[body.messages.length - 1]?.content || '',
        userImage: body.image || null,
        // 1B-class on-device: keep tools on (for web/research) but force
        // prompted mode (text JSON protocol) so streamLocal never sees a
        // native `tools` array that breaks the small WebLLM engine.
        toolsEnabled: body.tools !== false && body.use_tools !== false,
        initialToolMode: isLocalProvider ? 'prompted' : await getToolMode(pid, mdl),
        webEnabled: body.use_web_search !== false,
        // A caller (e.g. a sub-agent) can scope tools further via body.disabledTools.
        disabledTools: [...new Set([...(await getDisabledTools()), ...(body.disabledTools || [])])],
        agentOverride: body.agent_override || null,
        persona: body.system_prompt || null,
        // Probing costs a round-trip, so per message we trust the cache and
        // fall back to the name heuristic; the probe runs when a key is verified.
        modelCanSee: (await getCachedVision(pid, mdl)) ?? looksVisionCapable(mdl),
        localVisionEnabled: prefs2.local_vision !== false,
        onToolModeChange: (mode) => { setToolMode(pid, mdl, mode).catch(() => {}) },
        temperature: body.temperature || 0.7,
        signal: controller.signal,
        onToken: (t) => { produced = true; onToken?.(t) },
        onStatus,
        onSources,
        onToolStart: (name, args) => onToolsDetected?.([name], args),
        onToolResult: (name, result) => onToolResult?.(name, result),
        onDone: ({ content, sources, aborted }) => {
          if (sources?.length) onSources?.(sources)
          recordUsage(pid, mdl, {
            inTokens: estimateTokens(body.message || ''),
            outTokens: estimateTokens(content || ''),
          }).catch(() => {})
          onDone?.(content, { aborted, provider: pid, model: mdl })
        },
        onError: (err) => { failure = err?.message || String(err) },
      })

      if (failure && !produced && !controller.signal.aborted && isProviderFailure(failure)) {
        try {
          const fallbackMdl = await autoPickModel(pid)
          if (fallbackMdl && fallbackMdl !== mdl) {
            onStatus?.(`${mdl || pid} unavailable — trying ${fallbackMdl}…`)
            failure = null
            await runAgent({
              provider: pid, apiKey: key, model: fallbackMdl,
              history: body.messages || [],
              userMessage: body.message || body.messages?.[body.messages.length - 1]?.content || '',
              userImage: body.image || null,
              toolsEnabled: body.tools !== false && body.use_tools !== false,
              initialToolMode: isLocalProvider ? 'prompted' : await getToolMode(pid, fallbackMdl),
              webEnabled: body.use_web_search !== false,
              disabledTools: [...new Set([...(await getDisabledTools()), ...(body.disabledTools || [])])],
              agentOverride: body.agent_override || null,
              persona: body.system_prompt || null,
              modelCanSee: (await getCachedVision(pid, fallbackMdl)) ?? looksVisionCapable(fallbackMdl),
              localVisionEnabled: prefs2.local_vision !== false,
              onToolModeChange: (mode) => { setToolMode(pid, fallbackMdl, mode).catch(() => {}) },
              temperature: body.temperature || 0.7,
              signal: controller.signal,
              onToken: (t) => { produced = true; onToken?.(t) },
              onStatus,
              onSources,
              onToolStart: (name, args) => onToolsDetected?.([name], args),
              onToolResult: (name, result) => onToolResult?.(name, result),
              onDone: ({ content, sources, aborted }) => {
                if (sources?.length) onSources?.(sources)
                recordUsage(pid, fallbackMdl, {
                  inTokens: estimateTokens(body.message || ''),
                  outTokens: estimateTokens(content || ''),
                }).catch(() => {})
                onDone?.(content, { aborted, provider: pid, model: fallbackMdl })
              },
              onError: (err) => { failure = err?.message || String(err) },
            })
          }
        } catch { /* ignore fallback error */ }
      }

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

// ─── Terms acceptance ───
export async function getTermsAcceptance() {
  return db.getSetting('terms_accepted')   // { version, at } | null
}

export async function acceptTerms(version) {
  const record = { version, at: Date.now() }
  await db.setSetting('terms_accepted', record)
  return record
}

/** True when the user has accepted this exact version. */
export async function hasAcceptedTerms(version) {
  const rec = await db.getSetting('terms_accepted')
  return rec?.version === version
}

// ─── Live (face-to-face) ───
// Realtime voice+video runs on Gemini's Live API over a websocket, which is a
// different protocol from chat — hence its own config path.

/** Confirm (once, cached) whether a model really accepts images. */
export async function checkVision(providerId, model) {
  const apiKey = await db.getSetting(`apikey_${providerId}`)
  if (!model) return false
  if (!looksVisionCapable(model)) return false
  return probeVision({ provider: providerId, apiKey, model })
}

export async function getVisionStatus(providerId, model) {
  return {
    cached: await getCachedVision(providerId, model),
    guessed: looksVisionCapable(model),
  }
}

/**
 * Pick the live engine based on the user's active provider.
 * If the active provider is Gemini, use the native realtime socket (true duplex, ~0.8s);
 * otherwise use the cascade engine (recognition → agent → synthesis) which works
 * with every provider including on-device local models.
 */
export async function getLiveConfig() {
  const prefs = await db.getSetting('chat_prefs', {})
  const disabledTools = await getDisabledTools()

  const provider = await getActiveProvider()
  const apiKey = await db.getSetting(`apikey_${provider}`)
  const model = await db.getSetting(`model_${provider}`, '')
  const isLocal = !!getLLMProviders()[provider]?.isLocal

  if (!apiKey && !isLocal) {
    return { available: false, reason: 'no-key' }
  }

  // Gemini native realtime: only when the user has actively chosen Gemini.
  if (provider === 'gemini' && apiKey && prefs.live_engine !== 'cascade') {
    return {
      available: true, engine: 'gemini', provider: 'gemini', apiKey,
      model: prefs.live_model || LIVE_MODELS[0],
      voice: prefs.live_voice || 'Puck',
      modelCanSee: true, disabledTools,
    }
  }

  // Universal cascade: works with Groq, NVIDIA, OpenRouter, OpenAI, on-device, and custom providers.
  // A call is long-lived, so it carries its own fallback chain: a 429 ten
  // minutes in should switch provider, not hang up.
  const fallbacks = []
  for (const pid of await getFallbackChain(provider)) {
    if (pid === provider) continue
    const key = await db.getSetting(`apikey_${pid}`)
    if (!key && !getLLMProviders()[pid]?.isLocal) continue
    const mdl = await db.getSetting(`model_${pid}`, '')
    fallbacks.push({
      provider: pid, apiKey: key, model: mdl,
      modelCanSee: (await getCachedVision(pid, mdl)) ?? looksVisionCapable(mdl),
    })
  }

  return {
    available: true, engine: 'cascade', provider, apiKey, model,
    // Distinct from `live_voice`: that one holds a Gemini voice name, and the
    // two namespaces do not overlap.
    voice: prefs.live_voice_local || DEFAULT_VOICE,
    // Neural (Kokoro, on-device) by default — the system voice is robotic and
    // people hang up on it. Explicit opt-out for slow devices / tight data.
    voiceEngine: prefs.live_voice_engine === 'system' ? 'system' : 'neural',
    fallbacks,
    modelCanSee: (await getCachedVision(provider, model)) ?? looksVisionCapable(model),
    disabledTools,
  }
}

export const LIVE_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr']

// ─── Tool-calling mode per model ───
// Learned once: a model that rejects a tools array keeps using the text
// protocol instead of paying for a failed request on every message.
const toolModeKey = (id, model) => `toolmode_${id}::${model || 'default'}`

export async function getToolMode(providerId, model) {
  return db.getSetting(toolModeKey(providerId, model))
}
export async function setToolMode(providerId, model, mode) {
  return db.setSetting(toolModeKey(providerId, model), mode)
}

// ─── Usage meter ───
// Providers rarely return usage on streamed responses, so this is an estimate
// from characters. Labelled as approximate everywhere it is shown.
const CHARS_PER_TOKEN = 4

export function estimateTokens(text = '') {
  return Math.max(1, Math.round(String(text).length / CHARS_PER_TOKEN))
}

const today = () => new Date().toISOString().slice(0, 10)

export async function recordUsage(providerId, model, { inTokens = 0, outTokens = 0 } = {}) {
  const key = `usage_${today()}`
  const day = await db.getSetting(key, {})
  const bucket = day[providerId] || { in: 0, out: 0, messages: 0, models: {} }
  bucket.in += inTokens
  bucket.out += outTokens
  bucket.messages += 1
  if (model) bucket.models[model] = (bucket.models[model] || 0) + 1
  day[providerId] = bucket
  await db.setSetting(key, day)
  return bucket
}

export async function getUsage(days = 7) {
  const out = []
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    const day = await db.getSetting(`usage_${d}`, {})
    if (Object.keys(day).length) out.push({ date: d, providers: day })
  }
  return out
}

export async function getTodayUsage() {
  return db.getSetting(`usage_${today()}`, {})
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

// ─── Projects ───
export async function getProjects() { return db.getProjects() }
// Returns the id, like createConversation — the two used to disagree, and the
// object form silently became `undefined` wherever an id was expected.
export async function createProject(name, opts) { return (await db.createProject(name, opts)).id }
export async function updateProject(id, patch) { return db.updateProject(id, patch) }
export async function deleteProject(id) { return db.deleteProject(id) }
export async function assignConversation(cid, pid) { return db.assignConversation(cid, pid) }

export async function getActiveProject() { return db.getSetting('active_project', null) }
export async function setActiveProject(id) { return db.setSetting('active_project', id ?? null) }

// ─── Conversations (IndexedDB) ───
export async function getConversations(projectId) {
  return db.getConversations(projectId)
}

/** Create a conversation row and return its id. */
export async function createConversation(title, projectId, provider, model, settings = null) {
 const activeP = provider || await getActiveProvider()
 const activeM = model || await getActiveModel(activeP)
 const c = await db.createConversation(title, projectId ?? await getActiveProject(), activeP, activeM, settings)
 return c.id
}

/**
 * blob: URLs belong to the document that created them and are dead after a
 * reload — persisting one guarantees a broken image later. Drop them, keeping
 * the durable source URL that sits alongside.
 */
function stripBlobUrls(value) {
  if (typeof value === 'string') return value.startsWith('blob:') ? null : value
  if (Array.isArray(value)) return value.map(stripBlobUrls)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      const cleaned = stripBlobUrls(v)
      if (cleaned !== null) out[k] = cleaned
    }
    return out
  }
  return value
}

/** Append a message to a stored conversation. */
export async function saveMessage(conversationId, msg) {
  if (!conversationId) return null
  return db.addMessage(
    conversationId, msg.role, msg.content,
    msg.toolResults ? stripBlobUrls(msg.toolResults) : null,
    msg.sources || null,
  )
}

export async function renameConversation(id, title) {
  if (!id) return
  return db.updateConversationTitle(id, title)
}

export async function updateConversationModel(id, provider, model, settings = null) {
  if (!id) return
  return db.updateConversationModel(id, provider, model, settings)
}

/** Drop stored messages from index `from` onward (used by regenerate). */
export async function trimConversationFrom(id, from) {
  if (!id) return
  return db.trimMessages(id, from)
}

export async function getConversation(id) {
  return db.getConversation(id)
}

/**
 * Fork a conversation at `index`: everything before it is copied into a new
 * conversation, which is where the edited turn will go.
 *
 * Editing an earlier message used to mean destroying every reply after it. A
 * fork keeps the original thread intact, so trying a different question is not
 * a decision you can regret.
 *
 * @returns {Promise<{id:number, title:string, messages:Array}>}
 */
export async function branchConversation(sourceId, index) {
  const source = sourceId ? await db.getConversation(sourceId) : null
  const kept = (source?.messages || []).slice(0, index)
  const baseTitle = (source?.title || 'Chat').replace(/\s*\(\d+\)$/, '')

  const created = await db.createConversation(baseTitle, source?.projectId ?? null, source?.provider ?? null, source?.model ?? null)
  for (const m of kept) {
    await db.addMessage(created.id, m.role, m.content, m.toolResults ?? null, m.sources ?? null)
  }
  return { ...created, messages: await db.getMessages(created.id) }
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

export async function listDocuments(projectId) { return db.getDocuments(projectId) }

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
  const desktop = isDesktop()
  for (const [id, p] of Object.entries(providers)) {
    // Desktop hides the WebLLM on-device provider — Ollama is the local path there.
    if (desktop && p.isLocal) continue
    // Web hides Ollama: a browser at https://…web.app can't reach the user's
    // http://localhost:11434 (Ollama's CORS blocks it). Local models are the
    // desktop app's job, whose main process strips CORS. Skipping it here also
    // stops the console CORS spam from probing /v1/models on every load.
    if (!desktop && p.isOllama) continue
    const key = await db.getSetting(`apikey_${id}`)
    const hasKey = !!key || !!p.noKey
    let liveModels = p.models || []
    if (p.isLocal) {
      const { LOCAL_MODELS } = await import('./localLLM')
      liveModels = Object.keys(LOCAL_MODELS)
    } else if (hasKey || p.publicModels) {
      liveModels = await cachedModels(id, key, liveModels)
    }
    // Ollama is "available" only when the local daemon actually answered with
    // models — otherwise it shows Ready but every message fails (daemon down).
    const available = p.isOllama ? liveModels.length > 0 : hasKey
    result[id] = {
      name: p.name, type: 'openai_compatible',
      available, models: liveModels,
      default_model: (liveModels.includes(p.default) ? p.default : liveModels[0]) || p.default || '',
      needs_key: !hasKey,
      is_ollama: !!p.isOllama,
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

  if (!apiKey && !p?.noKey) return remember({ success: false, error: 'No API key set' })
  if (!p) return { success: false, error: 'Provider not found' }

  if (p.isLocal) {
    return remember({
      success: true,
      status: 'ok',
      model,
      response: 'On-device model ready',
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
        ? `No response in ${TEST_TIMEOUT / 1000}s — this model is too slow to use for chat. Pick another different modal.`
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
  // Parse the parameter count (e.g. "8b", "49b", "0.5b") to size-tier the model.
  const b = parseFloat((m.match(/(\d+(?:\.\d+)?)\s*b\b/) || [])[1])
  if (/flash|nano|lite|fast/.test(m) || (b >= 7 && b <= 15)) score += 4   // responsive sweet spot
  if (b >= 70 || /large|ultra|pro\b/.test(m)) score -= 4                  // slow to first token
  // Sub-5B models are too weak to drive tools/agentic turns reliably — they
  // accept a call then 400 the result, or answer incoherently. Keep them last.
  if ((b && b < 5) || /\bmini\b/.test(m)) score -= 6
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

  // Probe only models the provider currently serves. The built-in list ages
  // out — probing it produced 404s for models NVIDIA has since removed.
  let cached = await db.getSetting(`models_${providerId}`)
  if (!cached?.list?.length) {
    const live = await fetchLiveModels(providerId, apiKey).catch(() => [])
    if (live.length) {
      cached = { ts: Date.now(), list: live }
      await db.setSetting(`models_${providerId}`, cached)
    }
  }
  const all = (cached?.list?.length ? cached.list : prov.models) || []
  // Probe the curated known-good models FIRST (those the provider still serves),
  // then fall back to the name-heuristic ranking. Stops a fresh key from landing
  // on a weak/broken free model just because it answered a 1-token ping fastest.
  const preferred = (prov.preferred || []).filter(m => all.includes(m))
  const rest = all.filter(m => !preferred.includes(m)).sort((a, b) => candidateScore(b) - candidateScore(a))
  const ranked = [...preferred, ...rest].slice(0, Math.max(max, preferred.length))
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

  // Cache the winner's tool-calling mode NOW, so its first real chat never pays
  // the native→prompted 400 round-trip. A model that 400s on a tools array is
  // marked 'prompted'; one that accepts it is 'native'. (Runtime still demotes
  // models that accept the call but reject the tool RESULT — see agent.js.)
  try {
    await chatComplete({
      provider: providerId, apiKey, model: winner.model,
      messages: [{ role: 'user', content: 'ping' }],
      tools: [{ type: 'function', function: {
        name: 'noop', description: 'probe', parameters: {
          type: 'object', properties: { q: { type: 'string' } }, required: [],
        },
      } }],
      temperature: 0, maxTokens: 1, timeoutMs, retries: 0,
    })
    await setToolMode(providerId, winner.model, 'native')
  } catch (e) {
    if (/\b400\b/.test(e?.message || '')) await setToolMode(providerId, winner.model, 'prompted')
    // Any other error (429/network): leave unset; the agent detects at runtime.
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

  const kind = classifyQuery(message)
  const cacheKey = `${providerId}::${kind}`
  const cachedRoute = routeCache.get(cacheKey)
  if (cachedRoute && Date.now() - cachedRoute.at < ROUTE_CACHE_TTL) {
    return cachedRoute.value
  }

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

  const { prefer } = ROUTE_PREFS[kind] || ROUTE_PREFS.quick

  const matching = measured.filter(m => prefer.test(m.model.toLowerCase()))
  const pool = matching.length ? matching : measured

  // Within the right category, fastest wins.
  const pick = pool.sort((a, b) => a.latencyMs - b.latencyMs)[0]
  const value = pick ? { model: pick.model, kind, latencyMs: pick.latencyMs } : null
  routeCache.set(cacheKey, { at: Date.now(), value })
  return value
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
  return /\b410\b/.test(msg) ||
    /end of life|no longer available/i.test(msg) ||
    // NVIDIA answers 404 "page not found" for a model it does not serve.
    (/\b404\b/.test(msg) && /not found/i.test(msg)) ||
    // …and 400 "The model X does not exist" when it renames/withdraws one.
    (/model/i.test(msg) && /does not exist|no such model|unknown model|invalid model/i.test(msg))
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
  // First provider that can actually answer right now: has a key (or needs
  // none) and no proxy. NEVER 'local' — that default silently pointed a fresh
  // install at a 750MB download with tools and web forced off.
  await loadCustomProviders()
  for (const [id, p] of Object.entries(getLLMProviders())) {
    if (p.isLocal || (p.needsProxy && !proxyAvailable())) continue
    if (p.noKey || await db.getSetting(`apikey_${id}`)) return id
  }
  return 'groq'
}

/** True once any real provider has a key — i.e. the user is not empty-handed. */
export async function hasAnyProviderKey() {
  await loadCustomProviders()
  for (const [id, p] of Object.entries(getLLMProviders())) {
    if (p.isLocal) continue
    if (await db.getSetting(`apikey_${id}`)) return true
  }
  return false
}

/** The provider the user actually chose, or null. Never the computed default. */
export async function getStoredProvider() {
  return db.getSetting('provider')
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

// ─── Scheduler / Cron Daemon (Electron desktop only) ───
/**
 * Execute a scheduled job by type. Called from the Electron main process
 * via the __YOGATIK_SCHEDULER__ bridge when a cron job fires.
 */
export async function executeScheduledJob({ type, payload }) {
  try {
    switch (type) {
      case 'workflow': {
        const { workflowId, variables = {} } = payload || {}
        const workflows = await getWorkflows()
        const wf = workflows.find(w => w.id === workflowId)
        if (!wf) throw new Error(`Workflow not found: ${workflowId}`)
        
        let output = ''
        await runWorkflow(wf, variables, async (prompt, index) => {
          // For scheduled jobs, we stream but don't need UI callbacks
          return new Promise((resolve) => {
            streamMessage(
              { message: prompt, messages: [], use_tools: true, use_web_search: true },
              (t) => { output += t },
              null,
              () => resolve(output),
              (err) => resolve(`Error: ${err}`)
            )
          })
        })
        return { success: true, output, workflow: wf.name }
      }
      
      case 'skill': {
        const { skillId, prompt } = payload || {}
        const skills = await getSkills()
        const skill = skills.find(s => s.id === skillId)
        if (!skill) throw new Error(`Skill not found: ${skillId}`)
        
        let output = ''
        await new Promise((resolve) => {
          streamMessage(
            { 
              message: prompt, 
              messages: [], 
              use_tools: true, 
              use_web_search: true,
              system_prompt: skill.system 
            },
            (t) => { output += t },
            null,
            () => resolve(output),
            (err) => resolve(`Error: ${err}`)
          )
        })
        return { success: true, output, skill: skill.name }
      }
      
      case 'agent': {
        const { agentId, task } = payload || {}
        const agents = await getAgents()
        const agent = agents.find(a => a.id === agentId)
        if (!agent) throw new Error(`Agent not found: ${agentId}`)
        
        let output = ''
        await new Promise((resolve) => {
          streamMessage(
            { 
              message: task, 
              messages: [], 
              use_tools: true, 
              use_web_search: true,
              system_prompt: agent.system,
              disabledTools: agent.tools?.length ? [] : undefined // Will be scoped by agent logic
            },
            (t) => { output += t },
            null,
            () => resolve(output),
            (err) => resolve(`Error: ${err}`)
          )
        })
        return { success: true, output, agent: agent.name }
      }
      
      case 'backup': {
        const data = await db.exportAll()
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `yogatik-backup-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)
        return { success: true, conversations: data.conversations.length, messages: data.messages.length }
      }
      
      case 'briefing': {
        const { topic, format = 'markdown' } = payload || {}
        const briefingPrompt = `Generate a ${format} briefing on: ${topic || 'Today\'s top AI and tech news'}. 
Include: key headlines, notable developments, and a summary. Use deep_research for current facts.`
        
        let output = ''
        await new Promise((resolve) => {
          streamMessage(
            { message: briefingPrompt, messages: [], use_tools: true, use_web_search: true },
            (t) => { output += t },
            null,
            () => resolve(output),
            (err) => resolve(`Error: ${err}`)
          )
        })
        return { success: true, output, topic: topic || 'AI & Tech News' }
      }
      
      case 'custom': {
        const { prompt, model, provider, system_prompt } = payload || {}
        let output = ''
        await new Promise((resolve) => {
          streamMessage(
            { 
              message: prompt, 
              messages: [], 
              model, 
              provider, 
              system_prompt,
              use_tools: true, 
              use_web_search: true 
            },
            (t) => { output += t },
            null,
            () => resolve(output),
            (err) => resolve(`Error: ${err}`)
          )
        })
        return { success: true, output }
      }
      
      default:
        throw new Error(`Unknown job type: ${type}`)
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * Check if we can execute scheduled jobs (Electron desktop)
 */
export function canExecuteScheduledJobs() {
  return isDesktop() && !!window.__YOGATIK_SCHEDULER__
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
  wikipedia: 'Knowledge', scholar: 'Knowledge', stackoverflow: 'Knowledge',
  hackernews: 'Knowledge', archive: 'Knowledge', dictionary: 'Knowledge', books: 'Knowledge',
  package_info: 'Data', gutenberg: 'Data', geocode: 'Data', currency: 'Data', earthquake: 'Data',
  doc_search: 'Documents', doc_list: 'Documents', pdf_extract: 'Documents',
  ocr: 'Documents', summarize: 'Documents', md_to_pdf: 'Documents',
  keyword_extract: 'Utility', entity_extract: 'Utility', query_refine: 'Utility',
  code_execute: 'Compute', calculator: 'Compute', data_convert: 'Compute',
  unit_convert: 'Compute', regex: 'Compute', hash: 'Compute', diff: 'Compute',
  image_generate: 'Media', chart: 'Media', diagram: 'Media', image_info: 'Media',
  color_palette: 'Media', qr_generate: 'Media', qr_read: 'Media', audio_edit: 'Media',
  tts: 'Voice', stt: 'Voice',
  weather: 'Utility', translate: 'Utility',
}

// ─── TTS (Web Speech API) ───
/**
 * Read a message aloud in the same on-device voice the call uses. Long replies
 * are spoken sentence by sentence so playback starts immediately instead of
 * after the whole thing has been synthesised.
 */
export async function requestTTS(text, { onEnd } = {}) {
  const prefs = await db.getSetting('chat_prefs', {})
  const speaker = getSharedSpeaker({
    engine: prefs.live_voice_engine === 'system' ? 'system' : 'neural',
    voice: prefs.live_voice_local || DEFAULT_VOICE,
    onEnd: () => onEnd?.(),
  })
  speaker.cancel()   // a second play button stops the first
  for (const part of splitForSpeech(text)) speaker.speak(part)
  return { success: true }
}

/** ~200 characters keeps each synthesis short without chopping sentences. */
function splitForSpeech(text, max = 200) {
  const out = []
  let buf = ''
  for (const s of String(text ?? '').split(/(?<=[.!?…])\s+|\n+/)) {
    if ((buf + ' ' + s).trim().length > max && buf) { out.push(buf.trim()); buf = s }
    else buf = `${buf} ${s}`
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

export function stopTTS() {
  stopSharedSpeaker()
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

export async function getTTSVoices() {
  return window.speechSynthesis?.getVoices?.()?.map(v => ({ name: v.name, lang: v.lang })) || []
}
