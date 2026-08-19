/**
 * On-device error log — a capped ring buffer of the last N runtime errors and
 * unhandled promise rejections, kept in localStorage. No backend, no telemetry
 * leaves the device; it exists so a user (or you, from a screenshot) can see
 * what actually broke instead of debugging blind.
 */
const KEY = 'yogatik.errorlog'
const MAX = 50

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}
function write(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))) } catch { /* full / private */ }
}

export function logError(kind, message, stack, meta = null) {
  const entry = {
    kind,
    message: String(message || '').slice(0, 800),
    stack: String(stack || '').slice(0, 2000),
    meta: meta || undefined,
    at: Date.now()
  }
  write([...read(), entry])
  return entry
}

export function getErrorLog() { return read() }
export function clearErrorLog() { write([]) }

/**
 * Intelligent error diagnostics engine — analyzes error messages from LLM providers,
 * WebGPU, network, and tools to classify the failure and recommend concrete actions.
 */
export function diagnoseError(error) {
  const msg = typeof error === 'string' ? error : (error?.message || String(error || ''))
  const lower = msg.toLowerCase()

  // On-device model storage, checked FIRST because its wording is unambiguous
  // and two later tests would otherwise claim it. WebLLM streams its weights
  // through the Cache API, so a failure here is the local disk with no provider
  // involved: "Failed to execute 'add' on 'Cache'" fell through to the generic
  // bucket and blamed "the model provider", while a QuotaExceededError was
  // caught by the bare `quota` test below and reported as a provider rate limit
  // offering Auto-Pick — an action that cannot free disk space.
  if (
    lower.includes("on 'cache'") ||
    lower.includes('quotaexceedederror') ||
    lower.includes('exceeded the quota') ||
    (lower.includes('storage') && lower.includes('full'))
  ) {
    const outOfSpace = lower.includes('quota') || lower.includes('full')
    return {
      type: 'model_storage',
      category: 'On-Device Model Storage',
      title: outOfSpace ? 'Not Enough Space for the Model' : 'Model Download Interrupted',
      suggestion: outOfSpace
        ? 'The on-device weights could not be saved — this site is out of browser storage. Free up disk space, or remove a downloaded model in Settings, then retry.'
        : 'The on-device weights could not be saved, so the download stopped partway. Retry to resume — the parts already downloaded are kept.',
      actionType: 'retry',
      actionLabel: 'Retry Download',
    }
  }

  if (lower.includes('401') || lower.includes('invalid api key') || lower.includes('unauthorized') || lower.includes('incorrect api key') || lower.includes('authentication') || lower.includes('invalid_api_key')) {
    return {
      type: 'auth',
      category: 'Authentication',
      title: 'Invalid or Missing API Key',
      suggestion: 'Your API key was rejected by the provider. Please update or re-enter your key in Settings.',
      actionType: 'settings',
      actionLabel: 'Update API Key',
    }
  }

  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota') || lower.includes('resource_exhausted') || lower.includes('too many requests') || lower.includes('credit balance') || lower.includes('insufficient_quota')) {
    return {
      type: 'quota',
      category: 'Rate Limit / Quota',
      title: 'Rate Limit or Quota Exceeded',
      suggestion: 'The provider rate limited requests or your free credits were reached. Switch to another provider or auto-pick a fast model.',
      actionType: 'autopick',
      actionLabel: 'Auto-Pick Active Model',
    }
  }

  if (lower.includes('404') || lower.includes('not found') || lower.includes('deprecated') || lower.includes('decommissioned') || lower.includes('retired') || lower.includes('does not exist') || lower.includes('model_not_found') || lower.includes('no models provided') || lower.includes('object object')) {
    return {
      type: 'model_not_found',
      category: 'Model Availability',
      title: 'Model Not Available or Retired',
      suggestion: 'This model ID is no longer active on the provider. Click Auto-Pick to switch to the fastest active model.',
      actionType: 'autopick',
      actionLabel: 'Auto-Pick Active Model',
    }
  }

  if (lower.includes('context_length_exceeded') || lower.includes('maximum context length') || lower.includes('too long') || lower.includes('token limit') || lower.includes('max_tokens')) {
    return {
      type: 'context_length',
      category: 'Context Window',
      title: 'Conversation Exceeds Token Limit',
      suggestion: 'The conversation is too long for this model. Try starting a new chat or trimming earlier turns.',
      actionType: 'new_chat',
      actionLabel: 'Start New Chat',
    }
  }

  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('offline') || lower.includes('timeout') || lower.includes('abort') || lower.includes('connection refused') || lower.includes('err_connection')) {
    return {
      type: 'network',
      category: 'Network / Connection',
      title: 'Network or Connection Problem',
      suggestion: 'Could not reach the provider endpoint. Please check your internet connection or VPN and retry.',
      actionType: 'retry',
      actionLabel: 'Retry',
    }
  }

  if (lower.includes('webgpu') || lower.includes('gpu') || lower.includes('vram') || lower.includes('device lost')) {
    return {
      type: 'webgpu',
      category: 'On-Device / WebGPU',
      title: 'GPU Execution Error',
      suggestion: 'The local model could not run on your GPU. Try switching to a cloud provider in Settings.',
      actionType: 'settings',
      actionLabel: 'Open Provider Settings',
    }
  }

  // A tool rejecting its own arguments is not a provider failure. This used to
  // fall through to the generic bucket below and announce "Model Execution
  // Failed — an unexpected response was received from the model provider",
  // which sends the user to check an API key over an argument the model simply
  // forgot. Checked late, so a genuine 401/429/5xx above still wins.
  if (
    /\b[a-z_]+ is required\b/i.test(msg) ||
    /missing required (parameter|argument|field)/i.test(msg) ||
    /\brequired to \w+/i.test(msg) ||
    /invalid argument/i.test(msg) ||
    /\bprovide a \w+/i.test(msg) ||
    /\bmust be a\b/i.test(msg)
  ) {
    return {
      type: 'tool_input',
      category: 'Tool Input',
      title: 'Tool Called Without a Required Value',
      suggestion: 'The model left out something the tool needs. This is usually fixed by retrying — ask again, or say more specifically what you want.',
      actionType: 'retry',
      actionLabel: 'Try Again',
    }
  }

  return {
    type: 'general',
    category: 'Provider / Execution Error',
    title: 'Model Execution Failed',
    suggestion: 'An unexpected response was received from the model provider.',
    actionType: 'retry',
    actionLabel: 'Retry',
  }
}

/** Formats a complete diagnostics dump suitable for copying to clipboard or bug reports */
export function getDiagnosticsReport() {
  const log = getErrorLog()
  const info = {
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    onLine: typeof navigator !== 'undefined' ? navigator.onLine : true,
    timestamp: new Date().toISOString(),
    errorCount: log.length,
    recentErrors: log.slice(-10),
  }
  return JSON.stringify(info, null, 2)
}

/** Attach global handlers once. Ignores noisy cross-origin "Script error." */
export function installErrorLog() {
  if (typeof window === 'undefined' || window.__yogatikErrLog) return
  window.__yogatikErrLog = true
  window.addEventListener('error', (e) => {
    if (e?.message === 'Script error.' && !e.filename) return   // opaque cross-origin
    logError('error', e?.message || 'error', e?.error?.stack || `${e?.filename}:${e?.lineno}`)
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e?.reason
    logError('unhandledrejection', r?.message || String(r), r?.stack)
  })
}
