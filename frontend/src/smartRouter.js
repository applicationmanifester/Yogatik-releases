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

// ─── Model Routing Table ────────────────────────────────────────────────────
const ROUTING_TABLE = {
  speed: {
    provider: 'groq',
    models: ['llama-3.1-8b-instant', 'gemma2-9b-it', 'llama-3.3-70b-versatile'],
    qualityParams: { temperature: 0.2, topP: 0.9 },
    reason: 'Groq provides sub-second latency for quick responses',
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