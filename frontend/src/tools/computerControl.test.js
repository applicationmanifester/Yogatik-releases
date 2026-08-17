import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computerControlTool } from './computerControl'
// The key-combo vocabulary lives in the Electron main module; it is pure, so it
// is imported directly here to lock the injection-safety contract.
import { buildSendKeys } from '../../electron/companionInput.cjs'

describe('computer_control tool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete window.__YOGATIK_COMPANION_INPUT__
  })

  it('returns an honest desktop-only note in the browser', async () => {
    const res = await computerControlTool.execute({ action: 'click', x: 10, y: 10 })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/desktop app/i)
  })

  it('clicks at a coordinate via the bridge', async () => {
    window.__YOGATIK_COMPANION_INPUT__ = { click: vi.fn().mockResolvedValue({ success: true }) }
    const res = await computerControlTool.execute({ action: 'click', x: 100, y: 200 })
    expect(res.success).toBe(true)
    expect(window.__YOGATIK_COMPANION_INPUT__.click)
      .toHaveBeenCalledWith({ x: 100, y: 200, button: 'left', double: false })
  })

  it('maps double_click and right_click onto the click bridge', async () => {
    window.__YOGATIK_COMPANION_INPUT__ = { click: vi.fn().mockResolvedValue({ success: true }) }
    await computerControlTool.execute({ action: 'double_click', x: 1, y: 2 })
    expect(window.__YOGATIK_COMPANION_INPUT__.click).toHaveBeenCalledWith({ x: 1, y: 2, button: 'left', double: true })
    await computerControlTool.execute({ action: 'right_click', x: 3, y: 4 })
    expect(window.__YOGATIK_COMPANION_INPUT__.click).toHaveBeenCalledWith({ x: 3, y: 4, button: 'right', double: false })
  })

  it('requires coordinates to move', async () => {
    window.__YOGATIK_COMPANION_INPUT__ = { move: vi.fn() }
    const res = await computerControlTool.execute({ action: 'move' })
    expect(res.success).toBe(false)
    expect(window.__YOGATIK_COMPANION_INPUT__.move).not.toHaveBeenCalled()
  })

  it('requires keys for the key action', async () => {
    window.__YOGATIK_COMPANION_INPUT__ = { key: vi.fn() }
    const res = await computerControlTool.execute({ action: 'key' })
    expect(res.success).toBe(false)
    expect(window.__YOGATIK_COMPANION_INPUT__.key).not.toHaveBeenCalled()
  })

  it('scrolls with a default amount', async () => {
    window.__YOGATIK_COMPANION_INPUT__ = { scroll: vi.fn().mockResolvedValue({ success: true }) }
    await computerControlTool.execute({ action: 'scroll' })
    expect(window.__YOGATIK_COMPANION_INPUT__.scroll).toHaveBeenCalledWith(-3)
  })
})

describe('key combo vocabulary (injection safety)', () => {
  it('builds known combos', () => {
    expect(buildSendKeys('enter')).toBe('{ENTER}')
    expect(buildSendKeys('ctrl+c')).toBe('^c')
    expect(buildSendKeys('ctrl+shift+t')).toBe('^+t')
    expect(buildSendKeys('f5')).toBe('{F5}')
  })

  it('rejects anything outside the vocabulary — no raw text reaches the shell', () => {
    expect(buildSendKeys("a'; Remove-Item C:\\ -Recurse; '")).toBe(null)
    expect(buildSendKeys('$(evil)')).toBe(null)
    expect(buildSendKeys('notakey')).toBe(null)
    expect(buildSendKeys('')).toBe(null)
  })

  it('rejects a modifier with no key', () => {
    expect(buildSendKeys('ctrl')).toBe(null)
  })
})
