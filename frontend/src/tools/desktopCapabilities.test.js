import { describe, it, expect, vi, beforeEach } from 'vitest'
import { clipboardAccessTool } from './clipboardAccess'
import { watchFolderTool } from './watchFolder'
import { systemStateTool } from './systemState'
import { processManagerTool } from './processManager'
import { fileDialogTool } from './fileDialog'
import { browserControlTool } from './browserControl'
import { sealKey, openKey, isSealed } from '../desktopKeychain'

const BRIDGES = [
  '__YOGATIK_CLIPBOARD__', '__YOGATIK_WATCHER__', '__YOGATIK_POWER__',
  '__YOGATIK_PROCESS__', '__YOGATIK_DIALOG__', '__YOGATIK_KEYCHAIN__', '__YOGATIK_DESKTOP__',
  '__YOGATIK_BROWSER__',
]

describe('desktop-only capability tools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const b of BRIDGES) delete window[b]
  })

  // ── Web fallback: every tool must return an honest "desktop only" note ──
  it('clipboard_access returns desktop-only note in the browser', async () => {
    const res = await clipboardAccessTool.execute({ action: 'read' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/desktop app/i)
  })

  it('watch_folder returns desktop-only note in the browser', async () => {
    const res = await watchFolderTool.execute({ action: 'list' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/desktop app/i)
  })

  it('system_state returns desktop-only note in the browser', async () => {
    const res = await systemStateTool.execute()
    expect(res.success).toBe(false)
  })

  it('process_manager returns desktop-only note in the browser', async () => {
    const res = await processManagerTool.execute({ action: 'list' })
    expect(res.success).toBe(false)
  })

  it('file_dialog returns desktop-only note in the browser', async () => {
    const res = await fileDialogTool.execute({ action: 'open' })
    expect(res.success).toBe(false)
  })

  it('browser_control returns desktop-only note in the browser', async () => {
    const res = await browserControlTool.execute({ action: 'navigate', url: 'https://example.com' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/desktop app/i)
  })

  it('browser_control rejects an unknown action', async () => {
    window.__YOGATIK_BROWSER__ = { navigate: async () => ({ success: true }) }
    const res = await browserControlTool.execute({ action: 'teleport' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/unsupported/i)
  })

  it('browser_control requires a url to navigate', async () => {
    window.__YOGATIK_BROWSER__ = { navigate: async () => ({ success: true }) }
    const res = await browserControlTool.execute({ action: 'navigate' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/url/i)
  })

  it('browser_control passes the conversation id through as an opaque key', async () => {
    let seen = null
    window.__YOGATIK_BROWSER__ = { read: async (p) => { seen = p; return { success: true, tree: '' } } }
    await browserControlTool.execute({ action: 'read' })
    expect(seen).toHaveProperty('conversationId')
  })

  it('browser_control lets the model override the surface per call', async () => {
    let seen = null
    window.__YOGATIK_BROWSER__ = { read: async (p) => { seen = p; return { success: true } } }
    await browserControlTool.execute({ action: 'read', display: 'panel' })
    expect(seen.display).toBe('panel')
  })

  it('browser_control refuses a click with neither ref nor coordinates', async () => {
    window.__YOGATIK_BROWSER__ = {
      click: async (p) => (p.ref || (typeof p.x === 'number' && typeof p.y === 'number')
        ? { success: true }
        : { success: false, error: 'Provide either a ref (preferred) or x and y' }),
    }
    const res = await browserControlTool.execute({ action: 'click' })
    expect(res.success).toBe(false)
  })

  // ── Desktop behaviour via mocked bridges ──
  it('clipboard_access reads via the bridge', async () => {
    window.__YOGATIK_CLIPBOARD__ = {
      read: vi.fn().mockResolvedValue({ success: true, text: 'copied text', hasImage: false }),
    }
    const res = await clipboardAccessTool.execute({ action: 'read' })
    expect(res.success).toBe(true)
    expect(res.text).toBe('copied text')
  })

  it('clipboard_access write requires text', async () => {
    window.__YOGATIK_CLIPBOARD__ = { write: vi.fn().mockResolvedValue({ success: true }) }
    const missing = await clipboardAccessTool.execute({ action: 'write' })
    expect(missing.success).toBe(false)
    const ok = await clipboardAccessTool.execute({ action: 'write', text: 'hi' })
    expect(ok.success).toBe(true)
    expect(window.__YOGATIK_CLIPBOARD__.write).toHaveBeenCalledWith('hi')
  })

  it('watch_folder starts a watcher via the bridge', async () => {
    window.__YOGATIK_WATCHER__ = {
      start: vi.fn().mockResolvedValue({ success: true, id: 'w1', path: 'src', recursive: true }),
    }
    const res = await watchFolderTool.execute({ action: 'start', path: 'src' })
    expect(res.success).toBe(true)
    expect(res.id).toBe('w1')
    expect(window.__YOGATIK_WATCHER__.start).toHaveBeenCalledWith('src', { recursive: true })
  })

  it('system_state reports idle + battery via the bridge', async () => {
    window.__YOGATIK_POWER__ = { getState: vi.fn().mockResolvedValue({ idleSeconds: 120, onBattery: true }) }
    const res = await systemStateTool.execute()
    expect(res.success).toBe(true)
    expect(res.idleSeconds).toBe(120)
    expect(res.idleMinutes).toBe(2)
    expect(res.onBattery).toBe(true)
  })

  it('process_manager refuses to kill without confirm', async () => {
    window.__YOGATIK_PROCESS__ = { kill: vi.fn().mockResolvedValue({ success: true, pid: 42 }) }
    const refused = await processManagerTool.execute({ action: 'kill', pid: 42 })
    expect(refused.success).toBe(false)
    expect(refused.needsConfirm).toBe(true)
    expect(window.__YOGATIK_PROCESS__.kill).not.toHaveBeenCalled()

    const ok = await processManagerTool.execute({ action: 'kill', pid: 42, confirm: true })
    expect(ok.success).toBe(true)
    expect(window.__YOGATIK_PROCESS__.kill).toHaveBeenCalledWith(42)
  })

  it('file_dialog read picks then reads a file via the bridge', async () => {
    window.__YOGATIK_DIALOG__ = {
      openFile: vi.fn().mockResolvedValue({ success: true, path: '/tmp/x.txt' }),
      readPicked: vi.fn().mockResolvedValue({ success: true, name: 'x.txt', content: 'hello' }),
    }
    const res = await fileDialogTool.execute({ action: 'read' })
    expect(res.success).toBe(true)
    expect(res.content).toBe('hello')
    expect(window.__YOGATIK_DIALOG__.readPicked).toHaveBeenCalledWith('/tmp/x.txt')
  })
})

describe('desktop key vault helpers', () => {
  beforeEach(() => { delete window.__YOGATIK_KEYCHAIN__ })

  it('passes keys through unchanged when no vault bridge exists (web/tests)', async () => {
    expect(await sealKey('sk-secret')).toBe('sk-secret')
    expect(await openKey('sk-secret')).toBe('sk-secret')
  })

  it('seals and opens via the vault bridge, round-trip', async () => {
    const store = new Map()
    window.__YOGATIK_KEYCHAIN__ = {
      available: vi.fn().mockResolvedValue(true),
      encrypt: vi.fn(async (p) => { const t = 'kc.v1:' + btoa(p); store.set(t, p); return t }),
      decrypt: vi.fn(async (v) => (v.startsWith('kc.v1:') ? store.get(v) ?? null : v)),
    }
    const sealed = await sealKey('sk-live-123')
    expect(isSealed(sealed)).toBe(true)
    expect(await openKey(sealed)).toBe('sk-live-123')
  })

  it('a sealed key with no vault to open it returns null (no ciphertext leak)', async () => {
    expect(await openKey('kc.v1:AAAA')).toBe(null)
  })

  it('does not double-seal an already-sealed value', async () => {
    window.__YOGATIK_KEYCHAIN__ = { encrypt: vi.fn(async (p) => 'kc.v1:' + btoa(p)) }
    const once = 'kc.v1:already'
    expect(await sealKey(once)).toBe(once)
    expect(window.__YOGATIK_KEYCHAIN__.encrypt).not.toHaveBeenCalled()
  })
})
