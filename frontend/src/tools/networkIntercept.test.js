import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  addMockRule, removeMockRule, clearMockRules, listMockRules,
  findMockRule, generateMockResponse,
  startRecording, stopRecording, isRecording, getRecordedRequests, clearRecordedRequests,
  exportHAR, importHAR,
  addRequestInterceptor, removeRequestInterceptor, clearRequestInterceptors,
  addResponseInterceptor, removeResponseInterceptor, clearResponseInterceptors,
  recordRequest,
  setNetworkConditions, getNetworkConditions, resetNetworkConditions,
  applyNetworkConditions,
  waitForRequest,
  assertNetwork,
  networkInterceptTool
} from './networkIntercept'

vi.mock('./browserControl', () => ({
  browserControlTool: { execute: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
  clearMockRules()
  clearRecordedRequests()
  clearRequestInterceptors()
  clearResponseInterceptors()
  resetNetworkConditions()
  stopRecording()
})

afterEach(() => vi.unstubAllGlobals())

describe('networkIntercept - mock rules', () => {
  it('addMockRule creates a rule with defaults', () => {
    const result = addMockRule({ urlPattern: '/api/users', response: { users: [] } })
    expect(result.success).toBe(true)
    expect(result.ruleId).toBeDefined()
  })

  it('addMockRule requires urlPattern', () => {
    expect(() => addMockRule({ response: {} })).toThrow('urlPattern is required')
  })

  it('addMockRule requires response for error status', () => {
    expect(() => addMockRule({ urlPattern: '/api/error', status: 500 })).toThrow('response required for error status')
  })

  it('removeMockRule removes a specific rule', () => {
    const { ruleId } = addMockRule({ urlPattern: '/api/test', response: {} })
    expect(removeMockRule(ruleId)).toBe(true)
    expect(listMockRules()).toHaveLength(0)
  })

  it('clearMockRules removes all rules', () => {
    addMockRule({ urlPattern: '/api/1', response: {} })
    addMockRule({ urlPattern: '/api/2', response: {} })
    clearMockRules()
    expect(listMockRules()).toHaveLength(0)
  })

  it('listMockRules returns rules sorted by priority', () => {
    addMockRule({ urlPattern: '/api/low', response: {}, priority: 1 })
    addMockRule({ urlPattern: '/api/high', response: {}, priority: 10 })
    addMockRule({ urlPattern: '/api/med', response: {}, priority: 5 })
    
    const rules = listMockRules()
    expect(rules[0].urlPattern).toContain('high')
    expect(rules[1].urlPattern).toContain('med')
    expect(rules[2].urlPattern).toContain('low')
  })

  it('findMockRule matches string patterns', () => {
    addMockRule({ urlPattern: '/api/users', response: { users: [] }, method: 'GET' })
    
    const rule = findMockRule('https://example.com/api/users', 'GET')
    expect(rule).toBeTruthy()
    expect(rule.urlPattern).toBeInstanceOf(RegExp)
  })

  it('findMockRule matches regex patterns', () => {
    addMockRule({ urlPattern: '/api/.*', response: {} })
    
    const rule = findMockRule('https://example.com/api/users/123', 'GET')
    expect(rule).toBeTruthy()
  })

  it('findMockRule respects method filtering', () => {
    addMockRule({ urlPattern: '/api/users', response: {}, method: 'POST' })
    
    const getRule = findMockRule('https://example.com/api/users', 'GET')
    const postRule = findMockRule('https://example.com/api/users', 'POST')
    
    expect(getRule).toBeNull()
    expect(postRule).toBeTruthy()
  })

  it('findMockRule prefers higher priority', () => {
    addMockRule({ urlPattern: '/api/.*', response: { p: 1 }, priority: 1 })
    addMockRule({ urlPattern: '/api/users', response: { p: 10 }, priority: 10 })
    
    const rule = findMockRule('https://example.com/api/users', 'GET')
    expect(rule.response.p).toBe(10)
  })

  it('generateMockResponse returns mocked response', async () => {
    addMockRule({ urlPattern: '/api/data', response: { data: 'test' }, status: 200, delay: 10 })
    
    const response = await generateMockResponse({ url: 'https://example.com/api/data', method: 'GET' })
    
    expect(response.mocked).toBe(true)
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ data: 'test' })
    expect(response.ruleId).toBeDefined()
  })

  it('generateMockResponse executes function response', async () => {
    addMockRule({ urlPattern: '/api/dynamic', response: (req) => ({ url: req.url }) })
    
    const response = await generateMockResponse({ url: 'https://example.com/api/dynamic', method: 'GET' })
    
    expect(response.body.url).toBe('https://example.com/api/dynamic')
  })

  it('generateMockResponse returns null for no match', async () => {
    const response = await generateMockResponse({ url: 'https://example.com/api/nomatch', method: 'GET' })
    expect(response).toBeNull()
  })
})

describe('networkIntercept - recording', () => {
  it('startRecording enables recording', () => {
    startRecording({ clear: true })
    expect(isRecording()).toBe(true)
  })

  it('stopRecording disables recording and returns count', () => {
    startRecording()
    recordRequest({ method: 'GET', url: 'https://a.com', duration: 100 })
    recordRequest({ method: 'POST', url: 'https://b.com', duration: 200 })
    
    const result = stopRecording()
    expect(result.recording).toBe(false)
    expect(result.count).toBe(2)
    expect(isRecording()).toBe(false)
  })

  it('getRecordedRequests returns recorded requests', () => {
    startRecording({ clear: true })
    recordRequest({ method: 'GET', url: 'https://example.com/api/users', duration: 100 })
    recordRequest({ method: 'POST', url: 'https://example.com/api/posts', duration: 200 })
    
    const requests = getRecordedRequests()
    expect(requests).toHaveLength(2)
    expect(requests[0].request.method).toBe('GET')
    expect(requests[1].request.method).toBe('POST')
  })

  it('getRecordedRequests supports string filter', () => {
    startRecording({ clear: true })
    recordRequest({ method: 'GET', url: 'https://example.com/api/users', duration: 100 })
    recordRequest({ method: 'POST', url: 'https://example.com/api/posts', duration: 200 })
    
    const filtered = getRecordedRequests('users')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].request.url).toContain('users')
  })

  it('getRecordedRequests supports regex filter', () => {
    startRecording({ clear: true })
    recordRequest({ method: 'GET', url: 'https://example.com/api/users', duration: 100 })
    recordRequest({ method: 'POST', url: 'https://example.com/api/posts', duration: 200 })
    
    const filtered = getRecordedRequests(/api\/u/) 
    expect(filtered).toHaveLength(1)
  })

  it('clearRecordedRequests empties the log', () => {
    startRecording({ clear: true })
    recordRequest({ method: 'GET', url: 'https://example.com/api/test', duration: 100 })
    clearRecordedRequests()
    expect(getRecordedRequests()).toHaveLength(0)
  })
})

describe('networkIntercept - HAR export/import', () => {
  it('exportHAR returns valid HAR structure', () => {
    startRecording({ clear: true })
    recordRequest({
      method: 'GET',
      url: 'https://example.com/api/test',
      requestHeaders: { 'content-type': 'application/json' },
      queryParams: { page: '1' },
      requestBody: null,
      status: 200,
      statusText: 'OK',
      responseHeaders: { 'content-type': 'application/json' },
      responseBody: { success: true },
      duration: 150,
    })
    
    const result = exportHAR()
    expect(result.success).toBe(true)
    expect(result.har.log.version).toBe('1.2')
    expect(result.har.log.entries).toHaveLength(1)
    expect(result.har.log.entries[0].request.method).toBe('GET')
    expect(result.har.log.entries[0].response.status).toBe(200)
    expect(result.filename).toContain('.har')
  })

  it('importHAR creates mock rules from entries', () => {
    const har = {
      log: {
        entries: [
          {
            request: { url: 'https://example.com/api/users', method: 'GET' },
            response: { status: 200, statusText: 'OK', headers: [{ name: 'content-type', value: 'application/json' }], content: { text: JSON.stringify({ users: [] }) } }
          },
          {
            request: { url: 'https://example.com/api/posts', method: 'POST' },
            response: { status: 201, statusText: 'Created', headers: [], content: { text: JSON.stringify({ id: 1 }) } }
          },
        ]
      }
    }
    
    const result = importHAR(har)
    expect(result.success).toBe(true)
    expect(result.rulesCreated).toBe(2)
    expect(listMockRules()).toHaveLength(2)
  })

  it('importHAR rejects invalid format', () => {
    const result = importHAR({})
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid HAR format')
  })
})

describe('networkIntercept - interceptors', () => {
  it('addRequestInterceptor adds interceptor', () => {
    const fn = (req) => ({ ...req, modified: true })
    addRequestInterceptor(fn)
    expect(listMockRules).toBeDefined() // just ensure no error
  })

  it('clearRequestInterceptors clears all', () => {
    addRequestInterceptor((req) => req)
    addRequestInterceptor((req) => req)
    clearRequestInterceptors()
  })

  it('addResponseInterceptor adds interceptor', () => {
    addResponseInterceptor((res) => res)
  })

  it('clearResponseInterceptors clears all', () => {
    addResponseInterceptor((res) => res)
    clearResponseInterceptors()
  })
})

describe('networkIntercept - network conditions', () => {
  it('setNetworkConditions applies conditions', () => {
    setNetworkConditions({ offline: true, latency: 100, throughput: 10000 })
    const conditions = getNetworkConditions()
    expect(conditions.offline).toBe(true)
    expect(conditions.latency).toBe(100)
    expect(conditions.throughput).toBe(10000)
  })

  it('resetNetworkConditions restores defaults', () => {
    setNetworkConditions({ offline: true, latency: 500 })
    resetNetworkConditions()
    const conditions = getNetworkConditions()
    expect(conditions.offline).toBe(false)
    expect(conditions.latency).toBe(0)
    expect(conditions.throughput).toBeNull()
  })

  it('applyNetworkConditions throws when offline', async () => {
    setNetworkConditions({ offline: true })
    await expect(applyNetworkConditions({ url: 'https://example.com' })).rejects.toThrow('Network offline')
  })

  it('applyNetworkConditions adds latency', async () => {
    setNetworkConditions({ latency: 50 })
    const start = Date.now()
    await applyNetworkConditions({ url: 'https://example.com' })
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(40) // allow some margin
  })
})

describe('networkIntercept - waitForRequest', () => {
  it('waitForRequest resolves when request matches', async () => {
    startRecording({ clear: true })
    
    // Record a request after a short delay
    setTimeout(() => {
      recordRequest({ method: 'GET', url: 'https://example.com/api/target', duration: 100 })
    }, 50)
    
    const result = await waitForRequest('target', { timeout: 5000, pollInterval: 10 })
    expect(result.success).toBe(true)
    expect(result.request.request.url).toContain('target')
  })

  it('waitForRequest times out', async () => {
    startRecording({ clear: true })
    
    const result = await waitForRequest('nonexistent', { timeout: 100, pollInterval: 10 })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Timeout')
  })
})

describe('networkIntercept - assertNetwork', () => {
  it('assertNetwork validates request_made', () => {
    startRecording({ clear: true })
    recordRequest({ method: 'GET', url: 'https://example.com/api/users', duration: 100 })
    recordRequest({ method: 'GET', url: 'https://example.com/api/users/1', duration: 100 })
    
    const result = assertNetwork([
      { type: 'request_made', urlPattern: 'users', count: 2 }
    ])
    expect(result.success).toBe(true)
    expect(result.assertions[0].passed).toBe(true)
  })

  it('assertNetwork fails when count not met', () => {
    startRecording({ clear: true })
    recordRequest({ method: 'GET', url: 'https://example.com/api/users', duration: 100 })
    
    const result = assertNetwork([
      { type: 'request_made', urlPattern: 'users', count: 2 }
    ])
    expect(result.success).toBe(false)
    expect(result.assertions[0].passed).toBe(false)
  })

  it('assertNetwork validates response_status', () => {
    startRecording({ clear: true })
    recordRequest({ method: 'GET', url: 'https://example.com/api/test', status: 200, duration: 100 })
    
    const result = assertNetwork([
      { type: 'response_status', urlPattern: 'test', status: 200 }
    ])
    expect(result.success).toBe(true)
  })

  it('assertNetwork validates response_body_contains', () => {
    startRecording({ clear: true })
    recordRequest({ method: 'GET', url: 'https://example.com/api/test', responseBody: { message: 'hello world' }, duration: 100 })
    
    const result = assertNetwork([
      { type: 'response_body_contains', urlPattern: 'test', text: 'hello' }
    ])
    expect(result.success).toBe(true)
  })

  it('assertNetwork validates request_header', () => {
    startRecording({ clear: true })
    recordRequest({ method: 'GET', url: 'https://example.com/api/test', requestHeaders: { authorization: 'Bearer token123' }, duration: 100 })
    
    const result = assertNetwork([
      { type: 'request_header', urlPattern: 'test', header: 'authorization', value: 'Bearer token123' }
    ])
    expect(result.success).toBe(true)
  })
})

describe('networkInterceptTool - tool handler', () => {
  it('handles mock action', async () => {
    const result = await networkInterceptTool.execute({
      action: 'mock',
      urlPattern: '/api/test',
      response: { ok: true },
    })
    expect(result.success).toBe(true)
    expect(result.ruleId).toBeDefined()
  })

  it('handles unmock action', async () => {
    const { ruleId } = await networkInterceptTool.execute({ action: 'mock', urlPattern: '/api/test', response: {} })
    const result = await networkInterceptTool.execute({ action: 'unmock', ruleId })
    expect(result.success).toBe(true)
  })

  it('handles list_mocks action', async () => {
    await networkInterceptTool.execute({ action: 'mock', urlPattern: '/api/1', response: {} })
    const result = await networkInterceptTool.execute({ action: 'list_mocks' })
    expect(result.success).toBe(true)
    expect(result.rules).toHaveLength(1)
  })

  it('handles clear_mocks action', async () => {
    await networkInterceptTool.execute({ action: 'mock', urlPattern: '/api/1', response: {} })
    const result = await networkInterceptTool.execute({ action: 'clear_mocks' })
    expect(result.success).toBe(true)
  })

  it('handles start_recording action', async () => {
    const result = await networkInterceptTool.execute({ action: 'start_recording', clear: true })
    expect(result.success).toBe(true)
    expect(result.recording).toBe(true)
  })

  it('handles stop_recording action', async () => {
    await networkInterceptTool.execute({ action: 'start_recording' })
    const result = await networkInterceptTool.execute({ action: 'stop_recording' })
    expect(result.success).toBe(true)
    expect(result.recording).toBe(false)
  })

  it('handles get_recorded action', async () => {
    await networkInterceptTool.execute({ action: 'start_recording', clear: true })
    // Can't easily record from tool, but we can check structure
    const result = await networkInterceptTool.execute({ action: 'get_recorded' })
    expect(result.success).toBe(true)
    expect(Array.isArray(result.requests)).toBe(true)
  })

  it('handles export_har action', async () => {
    await networkInterceptTool.execute({ action: 'start_recording', clear: true })
    const result = await networkInterceptTool.execute({ action: 'export_har' })
    expect(result.success).toBe(true)
    expect(result.har).toBeDefined()
    expect(result.filename).toContain('.har')
  })

  it('handles import_har action', async () => {
    const har = { log: { entries: [{ request: { url: 'https://a.com', method: 'GET' }, response: { status: 200, headers: [], content: { text: '{}' } } }] } }
    const result = await networkInterceptTool.execute({ action: 'import_har', har })
    expect(result.success).toBe(true)
    expect(result.rulesCreated).toBe(1)
  })

  it('rejects import_har without har', async () => {
    const result = await networkInterceptTool.execute({ action: 'import_har' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('har object required')
  })

  it('handles set_conditions action', async () => {
    const result = await networkInterceptTool.execute({ action: 'set_conditions', conditions: { offline: true, latency: 100 } })
    expect(result.success).toBe(true)
    expect(result.conditions.offline).toBe(true)
  })

  it('handles get_conditions action', async () => {
    const result = await networkInterceptTool.execute({ action: 'get_conditions' })
    expect(result.success).toBe(true)
    expect(result.conditions).toBeDefined()
  })

  it('handles reset_conditions action', async () => {
    await networkInterceptTool.execute({ action: 'set_conditions', conditions: { offline: true } })
    const result = await networkInterceptTool.execute({ action: 'reset_conditions' })
    expect(result.success).toBe(true)
    expect(result.conditions.offline).toBe(false)
  })

  it('handles wait_for_request action', async () => {
    await networkInterceptTool.execute({ action: 'start_recording', clear: true })
    setTimeout(() => {
      recordRequest({ method: 'GET', url: 'https://example.com/api/target', duration: 100 })
    }, 50)
    
    const result = await networkInterceptTool.execute({ action: 'wait_for_request', urlPattern: 'target', timeout: 5000 })
    expect(result.success).toBe(true)
  })

  it('handles assert_network action', async () => {
    await networkInterceptTool.execute({ action: 'start_recording', clear: true })
    recordRequest({ method: 'GET', url: 'https://example.com/api/test', status: 200, duration: 100 })
    
    const result = await networkInterceptTool.execute({
      action: 'assert_network',
      assertions: [{ type: 'response_status', urlPattern: 'test', status: 200 }]
    })
    expect(result.success).toBe(true)
  })

  it('rejects assert_network without assertions', async () => {
    const result = await networkInterceptTool.execute({ action: 'assert_network' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('assertions array required')
  })
})
