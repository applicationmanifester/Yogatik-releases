import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { jsExecTool } from './jsExec'

describe('jsExecTool', () => {
  const originalDesktop = window.__YOGATIK_DESKTOP__
  const originalElectron = window.__YOGATIK_ELECTRON__

  afterEach(() => {
    window.__YOGATIK_DESKTOP__ = originalDesktop
    window.__YOGATIK_ELECTRON__ = originalElectron
  })

  it('fails gracefully when no code is provided', async () => {
    const res = await jsExecTool.execute({ code: '' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/no code provided/i)
  })

  it('executes via __YOGATIK_DESKTOP__.evalJs when available', async () => {
    window.__YOGATIK_ELECTRON__ = true
    window.__YOGATIK_DESKTOP__ = {
      evalJs: async (code) => {
        return {
          success: true,
          result: 42,
          output: '42',
          logs: ['calculated 42'],
        }
      },
    }

    const res = await jsExecTool.execute({ code: 'return 40 + 2;' })
    expect(res.success).toBe(true)
    expect(res.result).toBe(42)
    expect(res.logs).toContain('calculated 42')
  })

  it('handles arbitrary length code without length limitation errors', async () => {
    window.__YOGATIK_ELECTRON__ = true
    let receivedLength = 0
    window.__YOGATIK_DESKTOP__ = {
      evalJs: async (code) => {
        receivedLength = code.length
        return {
          success: true,
          result: 'ok',
          output: 'ok',
          logs: [],
        }
      },
    }

    // Generate 25,000 characters of JavaScript
    const bigScript = 'const padding = ' + JSON.stringify('x'.repeat(25000)) + ';\nreturn padding.length;'
    const res = await jsExecTool.execute({ code: bigScript })
    expect(res.success).toBe(true)
    expect(receivedLength).toBeGreaterThan(25000)
  })

  it('captures evaluation errors cleanly', async () => {
    window.__YOGATIK_ELECTRON__ = true
    window.__YOGATIK_DESKTOP__ = {
      evalJs: async () => {
        return {
          success: false,
          error: 'ReferenceError: nonExistent is not defined',
          logs: [],
        }
      },
    }

    const res = await jsExecTool.execute({ code: 'nonExistent()' })
    expect(res.success).toBe(false)
    expect(res.error).toContain('ReferenceError')
  })
})
