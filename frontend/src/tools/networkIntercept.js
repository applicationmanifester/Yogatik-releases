/**
 * networkIntercept — Network request interception, mocking, and recording.
 * 
 * Enables:
 * - Mock API responses for testing
 * - Record/replay network traffic (HAR format)
 * - Modify requests/responses on the fly
 * - Simulate network conditions (latency, errors, throttling)
 * - Test offline/flaky network scenarios
 */

import { browserControlTool } from './browserControl'

// In-memory stores (in production, persist to IndexedDB)
const mockRules = new Map() // urlPattern -> mock config
const recordedRequests = [] // HAR-format entries
const requestInterceptors = [] // Functions to modify requests before they go out
const responseInterceptors = [] // Functions to modify responses before they return
let recording = false
let networkConditions = { offline: false, latency: 0, throughput: null }

function getByteLength(str) {
  if (!str) return 0
  const s = typeof str === 'string' ? str : JSON.stringify(str)
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length
  return s.length
}

// Request/response modification pipelines
function applyRequestInterceptors(request) {
  let modified = { ...request }
  for (const interceptor of requestInterceptors) {
    modified = interceptor(modified) || modified
  }
  return modified
}

function applyResponseInterceptors(response) {
  let modified = { ...response }
  for (const interceptor of responseInterceptors) {
    modified = interceptor(modified) || modified
  }
  return modified
}

/**
 * Add a mock rule for a URL pattern
 * @param {Object} rule - Mock configuration
 */
export function addMockRule(rule) {
  const {
    urlPattern,           // String, RegExp, or function(url) -> boolean
    method = '*',         // HTTP method to match, or '*' for all
    response,             // Static response object or function(request) -> response
    status = 200,
    headers = {},
    delay = 0,            // Simulated latency in ms
    matchQuery = false,   // Whether to include query string in matching
    priority = 0,         // Higher priority rules match first
  } = rule

  if (!urlPattern) throw new Error('urlPattern is required')
  if (!response && status >= 400) throw new Error('response required for error status')

  const id = `mock_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const compiledRule = {
    id,
    urlPattern: typeof urlPattern === 'string' ? new RegExp(urlPattern.replace('*', '.*')) : urlPattern,
    method: method.toUpperCase(),
    response,
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
    delay,
    matchQuery,
    priority,
    createdAt: Date.now(),
    hitCount: 0,
  }

  mockRules.set(id, compiledRule)
  return { success: true, ruleId: id }
}

/**
 * Remove a mock rule
 */
export function removeMockRule(ruleId) {
  return mockRules.delete(ruleId)
}

/**
 * Clear all mock rules
 */
export function clearMockRules() {
  mockRules.clear()
  return { success: true }
}

/**
 * List all mock rules
 */
export function listMockRules() {
  return Array.from(mockRules.values())
    .sort((a, b) => b.priority - a.priority)
    .map(r => ({
      id: r.id,
      urlPattern: r.urlPattern.toString(),
      method: r.method,
      status: r.status,
      delay: r.delay,
      hitCount: r.hitCount,
      priority: r.priority,
    }))
}

/**
 * Find matching mock rule for a request
 */
export function findMockRule(url, method) {
  const urlObj = new URL(url)
  const pathToMatch = urlObj.pathname + (urlObj.search || '')
  
  let bestMatch = null
  let bestPriority = -Infinity

  for (const rule of mockRules.values()) {
    // Method match
    if (rule.method !== '*' && rule.method !== method.toUpperCase()) continue

    // URL match
    let matches = false
    if (typeof rule.urlPattern === 'function') {
      matches = rule.urlPattern(url)
    } else if (rule.urlPattern instanceof RegExp) {
      matches = rule.matchQuery ? rule.urlPattern.test(pathToMatch) : rule.urlPattern.test(urlObj.pathname)
    }

    if (matches && rule.priority > bestPriority) {
      bestMatch = rule
      bestPriority = rule.priority
    }
  }

  return bestMatch
}

/**
 * Generate mock response for a request
 */
export async function generateMockResponse(request) {
  const rule = findMockRule(request.url, request.method)
  if (!rule) return null

  rule.hitCount++

  // Simulate delay
  if (rule.delay > 0) {
    await new Promise(r => setTimeout(r, rule.delay))
  }

  // Generate response
  let responseBody
  if (typeof rule.response === 'function') {
    responseBody = await rule.response(request)
  } else {
    responseBody = rule.response
  }

  return {
    status: rule.status,
    headers: rule.headers,
    body: responseBody,
    mocked: true,
    ruleId: rule.id,
  }
}

/**
 * Start/stop recording network traffic
 */
export function startRecording(options = {}) {
  const { clear = true, filter = null } = options
  if (clear) recordedRequests.length = 0
  recording = true
  return { success: true, recording: true }
}

export function stopRecording() {
  recording = false
  return { success: true, recording: false, count: recordedRequests.length }
}

export function isRecording() {
  return recording
}

export function getRecordedRequests(filter = null) {
  let requests = [...recordedRequests]
  if (filter) {
    if (typeof filter === 'string') {
      requests = requests.filter(r => r.request.url.includes(filter))
    } else if (filter instanceof RegExp) {
      requests = requests.filter(r => filter.test(r.request.url))
    } else if (typeof filter === 'function') {
      requests = requests.filter(filter)
    }
  }
  return requests
}

export function clearRecordedRequests() {
  recordedRequests.length = 0
  return { success: true }
}

/**
 * Export recorded requests as HAR file
 */
export function exportHAR() {
  const har = {
    log: {
      version: '1.2',
      creator: { name: 'Yogatik Network Intercept', version: '1.0' },
      entries: recordedRequests.map(entry => ({
        startedDateTime: new Date(entry.timestamp).toISOString(),
        time: entry.duration,
        request: {
          method: entry.request.method,
          url: entry.request.url,
          httpVersion: 'HTTP/1.1',
          headers: Object.entries(entry.request.headers || {}).map(([name, value]) => ({ name, value })),
          queryString: Object.entries(entry.request.queryParams || {}).map(([name, value]) => ({ name, value })),
          cookies: [],
          headersSize: -1,
          bodySize: entry.request.body ? getByteLength(entry.request.body) : 0,
          postData: entry.request.body ? {
            mimeType: entry.request.headers?.['content-type'] || 'application/json',
            text: entry.request.body,
          } : undefined,
        },
        response: {
          status: entry.response.status,
          statusText: entry.response.statusText,
          httpVersion: 'HTTP/1.1',
          headers: Object.entries(entry.response.headers || {}).map(([name, value]) => ({ name, value })),
          cookies: [],
          content: {
            size: entry.response.body ? getByteLength(entry.response.body) : 0,
            mimeType: entry.response.headers?.['content-type'] || 'application/json',
            text: entry.response.body ? JSON.stringify(entry.response.body) : '',
          },
          redirectURL: '',
          headersSize: -1,
          bodySize: entry.response.body ? getByteLength(entry.response.body) : 0,
        },
        cache: {},
        timings: {
          blocked: 0,
          dns: 0,
          connect: 0,
          send: 0,
          wait: entry.duration,
          receive: 0,
          ssl: 0,
        },
      })),
    },
  }
  return { success: true, har, filename: `yogatik-network-${Date.now()}.har` }
}

/**
 * Import HAR file and create mock rules from it
 */
export function importHAR(har) {
  if (!har?.log?.entries) return { success: false, error: 'Invalid HAR format' }

  let created = 0
  for (const entry of har.log.entries) {
    const { request, response } = entry
    const urlPattern = request.url
    
    addMockRule({
      urlPattern,
      method: request.method,
      response: response.content?.text ? JSON.parse(response.content.text) : {},
      status: response.status,
      headers: Object.fromEntries((response.headers || []).map(h => [h.name, h.value])),
      priority: 10, // HAR-imported rules get medium priority
    })
    created++
  }

  return { success: true, rulesCreated: created }
}

/**
 * Add a request interceptor (modify requests before they're sent)
 */
export function addRequestInterceptor(fn) {
  requestInterceptors.push(fn)
  return { success: true, interceptorCount: requestInterceptors.length }
}
export function removeRequestInterceptor(fn) {
  const idx = requestInterceptors.indexOf(fn)
  if (idx >= 0) requestInterceptors.splice(idx, 1)
  return { success: true, interceptorCount: requestInterceptors.length }
}
export function clearRequestInterceptors() {
  requestInterceptors.length = 0
  return { success: true }
}

/**
 * Add a response interceptor (modify responses before returning)
 */
export function addResponseInterceptor(fn) {
  responseInterceptors.push(fn)
  return { success: true, interceptorCount: responseInterceptors.length }
}
export function removeResponseInterceptor(fn) {
  const idx = responseInterceptors.indexOf(fn)
  if (idx >= 0) responseInterceptors.splice(idx, 1)
  return { success: true, interceptorCount: responseInterceptors.length }
}
export function clearResponseInterceptors() {
  responseInterceptors.length = 0
  return { success: true }
}

/**
 * Record a request/response pair (called from browser bridge)
 */
export function recordRequest(entry) {
  if (!recording) return
  recordedRequests.push({
    timestamp: Date.now(),
    duration: entry.duration || 0,
    request: {
      method: entry.method,
      url: entry.url,
      headers: entry.requestHeaders,
      queryParams: entry.queryParams,
      body: entry.requestBody,
    },
    response: {
      status: entry.status,
      statusText: entry.statusText,
      headers: entry.responseHeaders,
      body: entry.responseBody,
    },
  })
}

/**
 * Simulate network conditions
 */
export function setNetworkConditions(conditions) {
  networkConditions = {
    offline: conditions.offline || false,
    latency: Math.max(0, conditions.latency || 0),
    throughput: conditions.throughput || null, // bytes/sec
  }
  return { success: true, conditions: networkConditions }
}

export function getNetworkConditions() {
  return { ...networkConditions }
}

export function resetNetworkConditions() {
  networkConditions = { offline: false, latency: 0, throughput: null }
  return { success: true, conditions: networkConditions }
}

/**
 * Apply network conditions to a request (simulate latency/throttling)
 */
export async function applyNetworkConditions(request) {
  if (networkConditions.offline) {
    throw new Error('Network offline (simulated)')
  }
  if (networkConditions.latency > 0) {
    await new Promise(r => setTimeout(r, networkConditions.latency))
  }
  // Throughput throttling would require stream manipulation - omitted for simplicity
  return request
}

/**
 * Wait for a specific request to be made
 */
export async function waitForRequest(urlPattern, options = {}) {
  const { timeout = 10000, method = '*', pollInterval = 100 } = options
  const start = Date.now()

  while (Date.now() - start < timeout) {
    const requests = getRecordedRequests(r => {
      const matchesUrl = typeof urlPattern === 'string' 
        ? r.request.url.includes(urlPattern)
        : urlPattern instanceof RegExp
          ? urlPattern.test(r.request.url)
          : urlPattern(r.request.url)
      const matchesMethod = method === '*' || r.request.method.toUpperCase() === method.toUpperCase()
      return matchesUrl && matchesMethod
    })

    if (requests.length > 0) {
      return { success: true, request: requests[requests.length - 1] }
    }
    await new Promise(r => setTimeout(r, pollInterval))
  }

  return { success: false, error: `Timeout waiting for request matching ${urlPattern}` }
}

/**
 * Assert on recorded network traffic
 */
export function assertNetwork(assertions) {
  const requests = getRecordedRequests()
  const results = { assertions: [] }

  for (const assertion of assertions) {
    const { type, ...params } = assertion
    let passed = false
    let message = ''

    switch (type) {
      case 'request_made': {
        const { urlPattern, method = '*', count = 1 } = params
        const matches = requests.filter(r => {
          const urlMatch = typeof urlPattern === 'string'
            ? r.request.url.includes(urlPattern)
            : urlPattern instanceof RegExp
              ? urlPattern.test(r.request.url)
              : urlPattern(r.request.url)
          const methodMatch = method === '*' || r.request.method.toUpperCase() === method.toUpperCase()
          return urlMatch && methodMatch
        })
        passed = matches.length >= count
        message = `Expected ${count} request(s) matching ${urlPattern}, found ${matches.length}`
        break
      }
      case 'response_status': {
        const { urlPattern, status, method = '*' } = params
        const matches = requests.filter(r => {
          const urlMatch = typeof urlPattern === 'string'
            ? r.request.url.includes(urlPattern)
            : urlPattern instanceof RegExp
              ? urlPattern.test(r.request.url)
              : urlPattern(r.request.url)
          const methodMatch = method === '*' || r.request.method.toUpperCase() === method.toUpperCase()
          const statusMatch = r.response.status === status
          return urlMatch && methodMatch && statusMatch
        })
        passed = matches.length > 0
        message = passed ? `Found response with status ${status}` : `No response with status ${status} for ${urlPattern}`
        break
      }
      case 'response_body_contains': {
        const { urlPattern, text, method = '*' } = params
        const matches = requests.filter(r => {
          const urlMatch = typeof urlPattern === 'string'
            ? r.request.url.includes(urlPattern)
            : urlPattern instanceof RegExp
              ? urlPattern.test(r.request.url)
              : urlPattern(r.request.url)
          const methodMatch = method === '*' || r.request.method.toUpperCase() === method.toUpperCase()
          const bodyMatch = r.response.body && JSON.stringify(r.response.body).includes(text)
          return urlMatch && methodMatch && bodyMatch
        })
        passed = matches.length > 0
        message = passed ? `Found response containing "${text}"` : `No response containing "${text}" for ${urlPattern}`
        break
      }
      case 'request_header': {
        const { urlPattern, header, value, method = '*' } = params
        const matches = requests.filter(r => {
          const urlMatch = typeof urlPattern === 'string'
            ? r.request.url.includes(urlPattern)
            : urlPattern instanceof RegExp
              ? urlPattern.test(r.request.url)
              : urlPattern(r.request.url)
          const methodMatch = method === '*' || r.request.method.toUpperCase() === method.toUpperCase()
          const headerMatch = r.request.headers?.[header.toLowerCase()] === value
          return urlMatch && methodMatch && headerMatch
        })
        passed = matches.length > 0
        message = passed ? `Found request with header ${header}=${value}` : `No request with header ${header}=${value} for ${urlPattern}`
        break
      }
      default:
        passed = false
        message = `Unknown assertion type: ${type}`
    }

    results.assertions.push({ type, passed, message, ...params })
  }

  const allPassed = results.assertions.every(a => a.passed)
  return { success: allPassed, assertions: results.assertions }
}

// Export all as a tool
export const networkInterceptTool = {
  schema: {
    type: 'function',
    function: {
      name: 'network_intercept',
      description: 'Intercept, mock, record, and assert on network requests. Enables API mocking, HAR recording/replay, and network condition simulation.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'mock', 'unmock', 'list_mocks', 'clear_mocks',
              'start_recording', 'stop_recording', 'get_recorded', 'clear_recorded',
              'export_har', 'import_har',
              'add_request_interceptor', 'remove_request_interceptor', 'clear_request_interceptors',
              'add_response_interceptor', 'remove_response_interceptor', 'clear_response_interceptors',
              'set_conditions', 'get_conditions', 'reset_conditions',
              'wait_for_request', 'assert_network',
            ],
            description: 'Action to perform',
          },
          // Mock
          urlPattern: { type: 'string', description: 'URL pattern to mock (string, regex, or function)' },
          method: { type: 'string', description: 'HTTP method (default: *)' },
          response: { description: 'Mock response body or function(request) -> body' },
          status: { type: 'number', description: 'HTTP status (default: 200)' },
          headers: { type: 'object', description: 'Response headers' },
          delay: { type: 'number', description: 'Simulated latency in ms' },
          priority: { type: 'number', description: 'Rule priority (higher = first match)' },
          ruleId: { type: 'string', description: 'Rule ID for unmock' },
          // Recording
          clear: { type: 'boolean', description: 'Clear existing recordings' },
          filter: { type: 'string', description: 'Filter for get_recorded' },
          // HAR
          har: { description: 'HAR object for import_har' },
          // Interceptors
          interceptor: { description: 'Interceptor function (stringified)' },
          // Conditions
          conditions: { type: 'object', description: 'Network conditions { offline, latency, throughput }' },
          // Wait
          timeout: { type: 'number', description: 'Timeout in ms' },
          pollInterval: { type: 'number', description: 'Poll interval in ms' },
          // Assert
          assertions: { type: 'array', items: { type: 'object' }, description: 'Assertion objects for assert_network' },
        },
        required: ['action'],
      },
    },
  },
  async execute(params) {
    const { action, ...rest } = params

    switch (action) {
      case 'mock':
        return addMockRule(rest)
      case 'unmock':
        if (!rest.ruleId) return { success: false, error: 'ruleId required' }
        return { success: removeMockRule(rest.ruleId) }
      case 'list_mocks':
        return { success: true, rules: listMockRules() }
      case 'clear_mocks':
        return clearMockRules()
      case 'start_recording':
        return startRecording(rest)
      case 'stop_recording':
        return stopRecording()
      case 'get_recorded':
        return { success: true, requests: getRecordedRequests(rest.filter), recording: isRecording() }
      case 'clear_recorded':
        return clearRecordedRequests()
      case 'export_har':
        return exportHAR()
      case 'import_har':
        if (!rest.har) return { success: false, error: 'har object required' }
        return importHAR(rest.har)
      case 'add_request_interceptor':
        return { success: true, message: 'Interceptor registration requires function reference - use from main process' }
      case 'remove_request_interceptor':
        return { success: true, message: 'Interceptor removal requires function reference' }
      case 'clear_request_interceptors':
        return clearRequestInterceptors()
      case 'add_response_interceptor':
        return { success: true, message: 'Interceptor registration requires function reference - use from main process' }
      case 'remove_response_interceptor':
        return { success: true, message: 'Interceptor removal requires function reference' }
      case 'clear_response_interceptors':
        return clearResponseInterceptors()
      case 'set_conditions':
        return setNetworkConditions(rest.conditions || {})
      case 'get_conditions':
        return { success: true, conditions: getNetworkConditions() }
      case 'reset_conditions':
        return resetNetworkConditions()
      case 'wait_for_request':
        return await waitForRequest(rest.urlPattern, rest)
      case 'assert_network':
        if (!rest.assertions?.length) return { success: false, error: 'assertions array required' }
        return assertNetwork(rest.assertions)
      default:
        return { success: false, error: `Unknown action: ${action}` }
    }
  },
}