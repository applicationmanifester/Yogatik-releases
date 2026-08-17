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
