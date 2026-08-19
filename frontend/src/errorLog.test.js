import { describe, it, expect, beforeEach } from 'vitest'
import { logError, getErrorLog, clearErrorLog, diagnoseError, getDiagnosticsReport } from './errorLog'

beforeEach(() => clearErrorLog())

describe('error log ring buffer', () => {
  it('records entries with kind, message and time', () => {
    logError('error', 'boom', 'at x')
    const log = getErrorLog()
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ kind: 'error', message: 'boom' })
    expect(typeof log[0].at).toBe('number')
  })

  it('caps at 50 newest entries', () => {
    for (let i = 0; i < 60; i++) logError('error', `e${i}`)
    const log = getErrorLog()
    expect(log).toHaveLength(50)
    expect(log[0].message).toBe('e10')      // oldest 10 dropped
    expect(log.at(-1).message).toBe('e59')
  })
})

describe('diagnoseError', () => {
  it('diagnoses auth errors and suggests updating key', () => {
    const d = diagnoseError('401 Unauthorized: Invalid API key provided')
    expect(d.type).toBe('auth')
    expect(d.actionType).toBe('settings')
  })

  it('diagnoses rate limit and quota exhaustion', () => {
    const d = diagnoseError('429 Too Many Requests: Rate limit reached')
    expect(d.type).toBe('quota')
    expect(d.actionType).toBe('autopick')
  })

  it('diagnoses retired / not found model', () => {
    const d = diagnoseError('Error 404: The model `gpt-3.5-turbo-0301` has been decommissioned')
    expect(d.type).toBe('model_not_found')
    expect(d.actionType).toBe('autopick')
  })

  it('diagnoses network disconnection', () => {
    const d = diagnoseError('TypeError: Failed to fetch')
    expect(d.type).toBe('network')
    expect(d.actionType).toBe('retry')
  })

  it('generates a valid diagnostics dump', () => {
    logError('error', 'Test error report')
    const report = JSON.parse(getDiagnosticsReport())
    expect(report.errorCount).toBe(1)
    expect(report.recentErrors[0].message).toBe('Test error report')
  })
})

describe('diagnoseError — on-device model storage', () => {
  // The literal string from a real report (WebLLM, provider "local"). It has no
  // provider in it at all: WebLLM streams weights through the Cache API, so this
  // is local disk. It used to fall through to the generic bucket and tell the
  // user "an unexpected response was received from the model provider".
  it('recognises a Cache API write failure as a local download problem', () => {
    const d = diagnoseError("Failed to execute 'add' on 'Cache': Request failed")
    expect(d.type).toBe('model_storage')
    expect(d.category).toBe('On-Device Model Storage')
    expect(d.suggestion).not.toMatch(/provider/i)
  })

  it('reports a browser storage quota failure as disk space, not a rate limit', () => {
    const d = diagnoseError("QuotaExceededError: Failed to execute 'put' on 'Cache': Quota exceeded.")
    expect(d.type).toBe('model_storage')
    // The bare `quota` test would otherwise claim a provider rate limit and
    // offer Auto-Pick, which cannot fix a full disk.
    expect(d.actionType).not.toBe('autopick')
    expect(d.title).toMatch(/space/i)
  })

  it('still treats a genuine provider quota error as a rate limit', () => {
    const d = diagnoseError('429: You exceeded your current quota, please check your plan and billing details')
    expect(d.type).toBe('quota')
    expect(d.actionType).toBe('autopick')
  })
})

describe('tool-argument errors are not provider failures', () => {
  // Field report: fs_search returned "query is required" and the UI announced
  // "Model Execution Failed — an unexpected response was received from the
  // model provider". That sends the user to check their API key over a missing
  // argument the model simply forgot.
  const cases = [
    'query is required',
    'path is required',
    'command is required',
    'Missing required parameter: url',
    'text is required to type',
    'Provide a job title or role to search for.',
    'url is required to navigate',
    'Invalid argument: depth must be a number',
  ]

  for (const msg of cases) {
    it(`classifies "${msg}" as a tool input problem`, () => {
      const d = diagnoseError(msg)
      expect(d.category).not.toMatch(/provider/i)
      expect(d.suggestion).not.toMatch(/model provider/i)
      expect(d.type).toBe('tool_input')
    })
  }

  it('still blames the provider for a genuine provider failure', () => {
    const d = diagnoseError('502 Bad Gateway from upstream')
    expect(d.type).not.toBe('tool_input')
  })

  it('does not hijack an auth error that happens to say "required"', () => {
    const d = diagnoseError('401 Unauthorized: API key required')
    expect(d.type).not.toBe('tool_input')
  })
})
