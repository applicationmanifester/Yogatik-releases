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

  // Checked early and on an unambiguous phrase (only agent.js's own
  // checkCanaryForLeak ever writes this exact wording), for the same reason
  // the entitlement bucket sits above tool_input: a security event reported
  // as "the model provider returned an unexpected response" sends the user
  // to re-enter an API key for a problem that has nothing to do with one.
  if (lower.includes('canary leak detected')) {
    return {
      type: 'prompt_injection',
      category: 'Prompt-Injection Defense',
      title: 'Possible Prompt-Injection Attempt Blocked',
      suggestion: 'A reply echoed an internal marker it was told never to reveal — usually a sign that '
        + 'something in a web page, file, or tool result the model read contained a hidden instruction. '
        + 'The leaked marker was redacted before the reply was shown. If this keeps happening on the same '
        + 'source, avoid having the model read that page or file, or treat its content as untrusted going forward.',
      actionType: 'dismiss',
      actionLabel: 'Got it',
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

  // File edit / patch mismatches: when an agent passes an old_string that doesn't match
  if (/old_string not found|old_string is not unique|target string not found|replacement failed/i.test(msg)) {
    const isUnique = /not unique/i.test(msg)
    return {
      type: 'fs_edit_mismatch',
      category: 'File Edit Mismatch',
      title: isUnique ? 'Multiple Matches Found in File' : 'Target Text Not Found in File',
      suggestion: isUnique
        ? 'The text snippet to replace appears multiple times in this file. Specify a start_line/end_line range, add more surrounding lines as context, or set replace_all: true.'
        : 'The text snippet to replace (old_string) was not found in the file. Inspect the file with fs_read first to confirm the exact lines, formatting, and indentation before editing.',
      actionType: 'none',
      actionLabel: '',
    }
  }

  const isModelNotFound =
    /model.*not found|not found.*model|model.*does not exist|model_not_found|no models provided|decommissioned|retired|model.*deprecated/i.test(msg) ||
    ((lower.includes('404') || lower.includes('not found') || lower.includes('does not exist') || lower.includes('object object')) &&
      !/file|folder|path|directory|old_string|element|command|module|package|variable|table|entry/i.test(msg))

  if (isModelNotFound) {
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


  // Stream stall: the provider connected and began streaming but then froze
  // mid-response. Distinct from "failed to reach the provider" (network error)
  // — the key here is that tokens were already flowing, so internet is fine.
  if (lower.includes('stream stalled') || lower.includes('no tokens received') ||
      /stalled.*provider|provider.*stalled|stream.*timeout/i.test(msg)) {
    return {
      type: 'stream_stall',
      category: 'Model Stalled',
      title: 'The Model Stopped Responding Mid-Stream',
      suggestion: 'The provider sent some tokens then stopped. This usually means the model is overloaded or the response was very long. Try regenerating, or switch to a faster/smaller model.',
      actionType: 'autopick',
      actionLabel: 'Auto-Pick Faster Model',
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
  // ORDER MATTERS AND IT IS SUBTLE. This must come BEFORE the tool_input bucket
  // below: a locked capability says "Yogatik Pro is required for file access",
  // and `/\b[a-z_]+ is required\b/i` matches "Pro is required" — so the paywall
  // would be reported as the model forgetting an argument, with a Try Again
  // button that can only fail again. It must also come before the workspace
  // bucket, whose /desktop app/ regex would report it as "Not Available in This
  // Build" and send the user to install an app they are already running.
  if (/yogatik pro is required|subscription is not active|trial has ended/i.test(msg)) {
    return {
      type: 'entitlement',
      category: 'Subscription',
      title: 'Yogatik Pro Required',
      suggestion: 'Your trial has ended or the subscription is not active. File, shell, browser and screen-control tools are locked until it is renewed — everything else keeps working.',
      actionType: 'upgrade',
      actionLabel: 'View Plans',
    }
  }

  if (
    /\b(?:[a-z_]+(?:\s+and\s+[a-z_]+)*)\s+(?:is|are)\s+required\b/i.test(msg) ||
    /\b(?:is|are)\s+required\b/i.test(msg) ||
    /missing required (parameter|argument|field)/i.test(msg) ||
    /\brequired to \w+/i.test(msg) ||
    /invalid argument/i.test(msg) ||
    /\bprovide a \w+/i.test(msg) ||
    /\bmust be a\b/i.test(msg) ||
    // A tool refusing an ACTION belongs in this bucket too, not a near-duplicate
    // one beside it. MEASURED: browser_control answered `refresh` with
    // "Unsupported action" and the card said "Model Execution Failed — an
    // unexpected response was received from the model provider", pointing the
    // user at their API key, network and credit balance for a bug that is none
    // of those.
    /unsupported action|unknown action|invalid action|valid actions are/i.test(msg) ||
    /unsupported (operation|git operation)/i.test(msg) ||
    // A browser wait that expired, or an element that was not found, is a fact
    // about the PAGE. Reported as "Model Execution Failed — an unexpected
    // response was received from the model provider" it sent the user to check
    // their API key for a selector that did not match.
    /timed out after \d+ms waiting for|element not found|no such tab|stale ref/i.test(msg)
  ) {
    const badAction = /unsupported action|unknown action|invalid action|valid actions are|unsupported (operation|git operation)/i.test(msg)
    const pageIssue = /timed out after \d+ms waiting for|element not found|no such tab|stale ref/i.test(msg)
    if (pageIssue) {
      return {
        type: 'tool_input',
        category: 'Page Not Ready',
        title: 'The Page Did Not Match',
        suggestion: 'The browser could not find what it was told to wait for. The error names the page it was looking at — the app may not have rendered, or the selector may be wrong. This is not a problem with your API key or provider.',
        actionType: 'retry',
        actionLabel: 'Try Again',
      }
    }
    return {
      type: 'tool_input',
      category: 'Tool Input',
      title: badAction ? 'The Tool Rejected That Request' : 'Tool Called Without a Required Value',
      suggestion: badAction
        ? 'The model asked a tool for something it does not support. The tool named what it does support, so asking again usually resolves it — this is not a problem with your API key, network or provider.'
        : 'The model left out something the tool needs. This is usually fixed by retrying — ask again, or say more specifically what you want.',
      actionType: 'retry',
      actionLabel: 'Try Again',
    }
  }

  // Workspace / desktop-capability refusals. These are the most common tool
  // failures in the desktop build and they are not provider failures at all:
  // "No working folder for this chat" used to be reported as "Model Execution
  // Failed — an unexpected response was received from the model provider",
  // sending the user to re-enter an API key when the fix is to grant a folder.
  if (
    /working folder|no folder granted|not granted|fs_grant|fs_add_folder/i.test(msg) ||
    /desktop app|desktop only|electron build/i.test(msg) ||
    /escapes the granted folder|absolute paths are not allowed/i.test(msg) ||
    /ENOENT|no such file or directory|file not found|path does not exist/i.test(msg) ||
    /path is a directory|is a directory|eisdir/i.test(msg) ||
    /permission denied|operation not permitted|eacces|eperm/i.test(msg)
  ) {
    const isDir = /path is a directory|is a directory|eisdir/i.test(msg)
    if (isDir) {
      return {
        type: 'fs_directory',
        category: 'Directory Specified',
        title: 'Path Is a Directory, Not a File',
        suggestion: 'You specified a directory path for a file reading operation. Use fs_list or fs_file_tree to inspect the folder contents, or specify a file inside this directory.',
        actionType: 'none',
        actionLabel: '',
      }
    }
    const isPerm = /permission denied|operation not permitted|eacces|eperm/i.test(msg)
    if (isPerm) {
      return {
        type: 'fs_permission',
        category: 'File Permissions',
        title: 'Permission Denied',
        suggestion: 'The desktop app lacks permission to access or modify this path on your computer.',
        actionType: 'none',
        actionLabel: '',
      }
    }
    const isNotFound = /ENOENT|no such file or directory|file not found|path does not exist/i.test(msg)
    const needsFolder = /working folder|no folder granted|not granted|fs_grant|fs_add_folder/i.test(msg)
    if (isNotFound) {
      return {
        type: 'fs_not_found',
        category: 'File Not Found',
        title: 'File Not Found on Disk',
        suggestion: 'The requested file does not exist in the granted workspace folder. Use fs_list or fs_find_files to see existing files.',
        actionType: 'none',
        actionLabel: '',
      }
    }
    return {
      type: 'workspace',
      category: 'Workspace Access',
      title: needsFolder ? 'No Working Folder for This Chat' : 'Not Available in This Build',
      suggestion: needsFolder
        ? 'This tool needs a folder on your computer. Use the folder button in the header to add one to this chat, then ask again.'
        : 'This capability exists only in the Yogatik desktop app, and the browser build cannot provide it.',
      actionType: needsFolder ? 'retry' : 'none',
      actionLabel: needsFolder ? 'Try Again' : '',
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
