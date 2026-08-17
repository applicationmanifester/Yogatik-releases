import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  hasCompanionCapabilities,
  executeScreenInspect,
  executeDesktopAction,
  executeBrowserAutopilot,
} from './desktopCompanion'

describe('desktopCompanion tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete window.__YOGATIK_COMPANION__
  })

  it('detects companion capabilities correctly', () => {
    expect(hasCompanionCapabilities()).toBe(false)
    window.__YOGATIK_COMPANION__ = { captureScreen: vi.fn() }
    expect(hasCompanionCapabilities()).toBe(true)
  })

  it('falls back gracefully in browser mode for screen_inspect', async () => {
    const res = await executeScreenInspect()
    expect(res.success).toBe(true)
    expect(res.activeApp).toBeDefined()
  })

  it('captures screen and active window when running under desktop Electron', async () => {
    window.__YOGATIK_COMPANION__ = {
      captureScreen: vi.fn().mockResolvedValue({
        success: true,
        name: 'Display 1',
        dataUrl: 'data:image/jpeg;base64,mock',
        width: 1920,
        height: 1080,
      }),
      getActiveWindow: vi.fn().mockResolvedValue({
        appName: 'Code',
        title: 'Yogatik - index.js',
        pid: 1234,
      }),
    }

    const res = await executeScreenInspect({ includeOcr: false })
    expect(res.success).toBe(true)
    expect(res.activeApp).toBe('Code')
    expect(res.activeTitle).toBe('Yogatik - index.js')
    expect(res.screenWidth).toBe(1920)
  })

  it('handles desktop actions under desktop companion bridge', async () => {
    window.__YOGATIK_COMPANION__ = {
      executeAction: vi.fn().mockResolvedValue({
        success: true,
        action: 'type',
        text: 'hello world',
      }),
    }

    const res = await executeDesktopAction({ action: 'type', text: 'hello world' })
    expect(res.success).toBe(true)
    expect(res.action).toBe('type')
    expect(window.__YOGATIK_COMPANION__.executeAction).toHaveBeenCalledWith({
      type: 'type',
      text: 'hello world',
      keys: undefined,
      targetUrl: undefined,
      targetApp: undefined,
    })
  })

  it('validates URLs for browser_autopilot', async () => {
    const res = await executeBrowserAutopilot({ url: 'invalid-url' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/valid http\/https URL/i)
  })
})
