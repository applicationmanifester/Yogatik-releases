import { describe, it, expect, beforeEach } from 'vitest'
import { logError, getErrorLog, clearErrorLog } from './errorLog'

describe('error log ring buffer', () => {
  beforeEach(() => clearErrorLog())

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
