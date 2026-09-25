/**
 * Smart Model Router — Intent-based provider/model selection.
 * Routes every query to the optimal provider/model with optimal settings.
 */

import { getProviders } from './llm'

/**
 * Task type detected from user message
 * @typedef {'speed' | 'code' | 'reasoning' | 'vision' | 'research' | 'local' | 'free' | 'general'} TaskType
 */

/**
 * Routing recommendation
 * @typedef {Object} RoutingRecommendation
 * @property {string} provider
 * @property {string} model
 * @property {TaskType} taskType
 * @property {number} confidence
 * @property {Object} qualityParams - Dynamic quality parameters
 * @property {string} reason
 */

// ─── Lightweight Circuit-Breaker ─────────────────────────────────────────────
// Tracks provider failures and opens the circuit for CIRCUIT_OPEN_MS.
// Agent calls markProviderFailed() on error; router skips open providers.
const CIRCUIT_OPEN_MS = 60_000 // 60 s cool-down
const _providerFailures = new Map() // providerId → { count, openUntil }

export function markProviderFailed(providerId) {
  const now = Date.now()
  const rec = _providerFailures.get(providerId) || { count: 0, openUntil: 0 }
  rec.count++
  // Trip after 2 consecutive failures
  if (rec.count >= 2) rec.openUntil = now + CIRCUIT_OPEN_MS
  _providerFailures.set(providerId, rec)
}

export function markProviderSuccess(providerId) {
  _providerFailures.delete(providerId)
}

export function isProviderHealthy(providerId) {
  const rec = _providerFailures.get(providerId)
  if (!rec) return true
  if (Date.now() > rec.openUntil) { _providerFailures.delete(providerId); return true }
  return false
}

export function getCircuitStatus() {
  const now = Date.now()
  return Object.fromEntries(
    [..._providerFailures.entries()].map(([id, rec]) => [
      id,
      { failures: rec.count, openUntil: rec.openUntil, healthy: now > rec.openUntil },
    ])
  )
}

// ─── Intent Detection Patterns ──────────────────────────────────────────────
const INTENT_PATTERNS = {
  code: [
    /\b(code|function|debug|refactor|api|script|build|test|deploy|compile|lint|typecheck)\b/i,
    /\b(react|vue|next\.js|node|python|typescript|javascript|rust|go|java)\b/i,
    /\b(component|hook|endpoint|database|schema|migration|docker|kubernetes)\b/i,
    /\b(git|github|ci\/cd|pipeline|webpack|vite|eslint|prettier)\b/i,
  ],
  research: [
    /\b(research|analyze|compare|investigate|deep.?dive|literature|survey)\b/i,
    /\b(comprehensive|thorough|detailed|systematic|meta.?analysis)\b/i,
    /\b(sources?|citations?|references?|papers?|studies?)\b/i,
    /\b(benchmark|evaluate|assess|review|state.?of.?the.?art)\b/i,
  ],
  reasoning: [
    /\b(plan|strategy|architecture|design|reason|logic|proof|trade.?off)\b/i,
    /\b(decide|choose|select|evaluate|weigh|pros.?cons)\b/i,
    /\b(complex|multi.?step|step.?by.?step|break.?down|decompose)\b/i,
    /\b(why|how|what.?if|implications|consequences|ramifications)\b/i,
  ],
  vision: [
    /\b(image|screenshot|diagram|chart|visual|photo|ocr|picture)\b/i,
    /\b(design|mockup|wireframe|ui|ux|figma|sketch|draw)\b/i,
    /\b(analyze.?this.?image|what.?in.?this|describe.?this)\b/i,
  ],
  speed: [
    /^(quick|fast|brief|short|simple|yes|no|ok|thanks|thank you)\b/i,
    /\b(just|simply|quickly|instant|one.?liner|tldr)\b/i,
  ],
  local: [
    /\b(private|local|offline|on.?device|no.?cloud|no.?internet)\b/i,
    /\b(sensitive|confidential|secret|proprietary|internal)\b/i,
  ],
  free: [
    /\b(free|no.?cost|without.?paying|gratis)\b/i,
  ],
}

/**
 * Detect task type from user message
 */
export function detectTaskType(message) {
  if (!message || typeof message !== 'string') return 'general'
  
  const text = message.trim().toLowerCase()
  if (text.length < 3) return 'speed'
  
  // Check for explicit intent keywords first
  const scores = {}
  for (const [type, patterns] of Object.entries(INTENT_PATTERNS)) {
    let score = 0
    for (const pattern of patterns) {
      if (pattern.test(text)) score++
    }
    if (score > 0) scores[type] = score
  }
  
  // Return highest scoring type, or 'general' if no strong signal
  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  return top && top[1] >= 1 ? top[0] : 'general'
}

/**
 * Classify a user query into intent and metadata for speculative routing
 * @param {string} query
 * @returns {{ taskType: TaskType, confidence: number, requiresWeb: boolean, requiresCode: boolean, isComplex: boolean }}
 */
export function classifyQueryIntent(query) {
  const taskType = detectTaskType(query)
  const text = (query || '').toLowerCase()
  const requiresWeb = /(latest|recent|news|current|today|price|who is|what happened|weather)/i.test(text)
  const requiresCode = /(code|fix|bug|implement|function|react|javascript|python|css|html|sql|api)/i.test(text)
  const isComplex = /(explain in detail|step by step|architecture|refactor entire|deep dive|comprehensive)/i.test(text)
  return {
    taskType,
    confidence: text.length > 5 ? 0.85 : 0.6,
    requiresWeb,
    requiresCode,
    isComplex,
  }
}

// ─── Model Routing Table ────────────────────────────────────────────────────
const ROUTING_TABLE = {
  speed: {
    provider: 'cerebras',
    models: ['llama3.3-70b', 'llama3.1-8b', 'llama-3.1-8b-instant', 'gemma2-9b-it'],
    qualityParams: { temperature: 0.2, topP: 0.9 },
    reason: 'Ultra-low latency inference for instant replies',
  },
  code: {
    provider: 'openrouter',
    models: [
      'deepseek/deepseek-chat:free',
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemma-3-27b-it:free',
      'openai/gpt-4o-mini',
    ],
    qualityParams: { temperature: 0.1, topP: 0.95, responseFormat: { type: 'json_object' } },
    reason: 'OpenRouter free tier has excellent code models',
  },
  reasoning: {
    provider: 'openai',
    models: ['o4-mini', 'gpt-4o', 'o3-mini'],
    qualityParams: { temperature: 0.3, reasoningEffort: 'medium' },
    reason: 'OpenAI reasoning models excel at complex logic',
  },
  vision: {
    provider: 'gemini',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
    qualityParams: { temperature: 0.4, safetySettings: 'BLOCK_NONE' },
    reason: 'Gemini has best-in-class vision understanding',
  },
  research: {
    provider: 'perplexity',
    models: ['sonar-pro', 'sonar-reasoning', 'sonar'],
    qualityParams: { temperature: 0.2, topP: 0.9 },
    reason: 'Perplexity provides web-grounded responses with citations',
  },
  local: {
    provider: 'ollama',
    models: ['auto'], // Will be resolved to available local model
    qualityParams: { temperature: 0.3 },
    reason: 'Ollama runs fully local for privacy',
  },
  free: {
    provider: 'openrouter',
    models: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemma-3-27b-it:free',
      'deepseek/deepseek-chat:free',
      'mistralai/mistral-small-3.1-24b-instruct:free',
    ],
    qualityParams: { temperature: 0.3 },
    reason: 'OpenRouter free tier provides capable models at zero cost',
  },
  general: {
    provider: 'gemini',
    models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro'],
    qualityParams: { temperature: 0.4 },
    reason: 'Gemini Flash offers excellent quality/speed/cost balance',
  },
}

/**
 * Get routing recommendation for a message
 * @param {string} message - User's message
 * @param {Object} [context] - Current context
 * @param {string} [context.currentProvider] - Currently selected provider
 * @param {string} [context.currentModel] - Currently selected model
 * @param {boolean} [context.isDesktop] - Whether running in desktop mode
 * @param {Object} [context.userPrefs] - Learned user preferences
 * @returns {RoutingRecommendation}
 */
export function getRoutingRecommendation(message, context = {}) {
  const { currentProvider, currentModel, isDesktop = false, userPrefs = {} } = context
  
  // Detect task type
  const taskType = detectTaskType(message)
  
  // Get routing config
  const routing = ROUTING_TABLE[taskType] || ROUTING_TABLE.general
  
  // Check if current provider/model is already optimal
  const currentMatches = currentProvider === routing.provider && 
    routing.models.some(m => currentModel?.includes(m.replace(':free', '')))
  
  // Apply user preferences (learned favored tools/models)
  let finalProvider = routing.provider
  let finalModels = [...routing.models]
  let finalParams = { ...routing.qualityParams }
  
  // Prefer user's favored provider if it makes sense
  if (userPrefs.favoredProvider && providersHaveModel(userPrefs.favoredProvider, taskType)) {
    finalProvider = userPrefs.favoredProvider
    finalModels = getProviders()[finalProvider]?.preferred || getProviders()[finalProvider]?.models || finalModels
  }
  
  // For desktop, prefer local/ollama if available and task allows
  if (isDesktop && taskType !== 'vision' && taskType !== 'research') {
    const providers = getProviders()
    if (providers.ollama?.models?.length > 0) {
      // Only use local for speed/code/general if user hasn't explicitly chosen cloud
      if (['speed', 'code', 'general'].includes(taskType) && !currentProvider) {
        finalProvider = 'ollama'
        finalModels = providers.ollama.models
        finalParams = { temperature: 0.3 }
      }
    }
  }
  
  // Select best available model
  const selectedModel = selectBestModel(finalProvider, finalModels, taskType)
  
  // Adjust params based on task specifics
  finalParams = adjustParamsForTask(finalParams, taskType, message)
  
  return {
    provider: finalProvider,
    model: selectedModel,
    taskType,
    confidence: currentMatches ? 0.9 : 0.7,
    qualityParams: finalParams,
    reason: routing.reason,
    currentMatches,
  }
}

/**
 * Check if provider has suitable models for task type
 */
function providersHaveModel(providerId, taskType) {
  const providers = getProviders()
  const provider = providers[providerId]
  if (!provider) return false
  
  const models = provider.preferred || provider.models || []
  if (!models.length) return false
  
  // Vision tasks need vision-capable models
  if (taskType === 'vision') {
    return models.some(m => /vision|gemini|gpt-4o|claude-3|pixtral/i.test(m))
  }
  
  return true
}

/**
 * Select best available model from provider's model list
 */
function selectBestModel(providerId, preferredModels, taskType) {
  const providers = getProviders()
  const provider = providers[providerId]
  if (!provider) return preferredModels[0] || ''
  
  const available = provider.models || []
  if (!available.length) return preferredModels[0] || ''
  
  // Find first preferred model that's available
  for (const pref of preferredModels) {
    const match = available.find(m => m.includes(pref.replace(':free', '')))
    if (match) return match
  }
  
  // Fall back to first available
  return available[0] || preferredModels[0] || ''
}

/**
 * Adjust quality parameters based on task specifics
 */
function adjustParamsForTask(params, taskType, message) {
  const adjusted = { ...params }
  const text = message.toLowerCase()
  
  // Lower temperature for factual/code tasks
  if (taskType === 'code' || taskType === 'research') {
    adjusted.temperature = Math.min(adjusted.temperature, 0.2)
  }
  
  // Higher temperature for creative tasks
  if (text.includes('creative') || text.includes('story') || text.includes('poem') || text.includes('brainstorm')) {
    adjusted.temperature = Math.max(adjusted.temperature, 0.7)
  }
  
  // JSON mode for structured output requests
  if (text.includes('json') || text.includes('structured') || text.includes('format as') || text.includes('schema')) {
    adjusted.responseFormat = { type: 'json_object' }
  }
  
  return adjusted
}

/**
 * Get display name for task type
 */
export function getTaskTypeLabel(type) {
  const labels = {
    speed: '⚡ Speed',
    code: '💻 Code',
    reasoning: '🧠 Reasoning',
    vision: '👁️ Vision',
    research: '🔬 Research',
    local: '🔒 Local',
    free: '🆓 Free',
    general: '💬 General',
  }
  return labels[type] || '💬 General'
}

/**
 * Get all available routing options for UI
 */
export function getAllRoutingOptions() {
  return Object.entries(ROUTING_TABLE).map(([type, config]) => ({
    type,
    label: getTaskTypeLabel(type),
    provider: config.provider,
    models: config.models,
    reason: config.reason,
  }))
}

/**
 * Like getRoutingRecommendation but skips providers with open circuit breakers.
 * Falls back through all routing candidates until a healthy provider is found.
 * @param {string} message
 * @param {Object} context - same as getRoutingRecommendation
 * @returns {RoutingRecommendation}
 */
export function getHealthyRoute(message, context = {}) {
  const taskType = detectTaskType(message)

  // Walk primary → general routing tables, skip tripped providers
  const tables = [ROUTING_TABLE[taskType], ROUTING_TABLE.general].filter(Boolean)
  for (const routing of tables) {
    if (isProviderHealthy(routing.provider)) {
      const selectedModel = selectBestModel(routing.provider, routing.models, taskType)
      const finalParams = adjustParamsForTask({ ...routing.qualityParams }, taskType, message)
      return {
        provider: routing.provider,
        model: selectedModel,
        taskType,
        confidence: 0.85,
        qualityParams: finalParams,
        reason: routing.reason,
        currentMatches: false,
      }
    }
  }

  // All primary candidates tripped — fall back to any healthy built-in
  const fallbackOrder = ['groq', 'gemini', 'openrouter', 'nvidia', 'ollama', 'openai']
  for (const pid of fallbackOrder) {
    if (isProviderHealthy(pid)) {
      const prov = getProviders()[pid]
      const model = prov?.preferred?.[0] || prov?.models?.[0] || ''
      return {
        provider: pid, model, taskType,
        confidence: 0.5,
        qualityParams: { temperature: 0.4 },
        reason: 'Fallback — primary providers temporarily unavailable',
        currentMatches: false,
      }
    }
  }

  // Absolute last resort
  return getRoutingRecommendation(message, context)
}