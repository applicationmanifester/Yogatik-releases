import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserControlTool } from './browserControl'

afterEach(() => vi.unstubAllGlobals())

describe('browser_control submission guard', () => {
  it('does not press Enter to submit until the user approval is explicit', async () => {
    const type = vi.fn()
    vi.stubGlobal('window', { __YOGATIK_BROWSER__: { type } })

    const res = await browserControlTool.execute({
      action: 'type', ref: 'ref_1_0', text: 'hello', submit: true,
    })

    expect(res).toMatchObject({ success: false, requires_confirmation: true })
    expect(type).not.toHaveBeenCalled()
  })

  it('passes an explicitly confirmed submission to the native browser bridge', async () => {
    const type = vi.fn(async () => ({ success: true, submitted: true }))
    vi.stubGlobal('window', { __YOGATIK_BROWSER__: { type } })

    const res = await browserControlTool.execute({
      action: 'type', ref: 'ref_1_0', text: 'hello', submit: true, confirmed: true,
    })

    expect(res).toMatchObject({ success: true, submitted: true })
    expect(type).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello', submit: true }))
  })
})

describe('browser_control — zoom / find / downloads', () => {
  it('zoom_in/zoom_out/zoom_reset each pass the right direction through', async () => {
    const zoom = vi.fn(async ({ direction }) => ({ success: true, zoomFactor: 1.1, zoomPercent: 110, direction }))
    vi.stubGlobal('window', { __YOGATIK_BROWSER__: { zoom } })

    await browserControlTool.execute({ action: 'zoom_in' })
    await browserControlTool.execute({ action: 'zoom_out' })
    await browserControlTool.execute({ action: 'zoom_reset' })

    expect(zoom.mock.calls.map(c => c[0].direction)).toEqual(['in', 'out', 'reset'])
  })

  it('refuses zoom on a bridge that does not support it, rather than crashing', async () => {
    vi.stubGlobal('window', { __YOGATIK_BROWSER__: {} })
    const res = await browserControlTool.execute({ action: 'zoom_in' })
    expect(res).toMatchObject({ success: false })
    expect(res.error).toMatch(/zoom/i)
  })

  it('find_text requires text and calls the bridge with forward+findNext true', async () => {
    const find = vi.fn(async () => ({ success: true, matches: 3, activeMatchOrdinal: 1 }))
    vi.stubGlobal('window', { __YOGATIK_BROWSER__: { find } })

    const missing = await browserControlTool.execute({ action: 'find_text' })
    expect(missing).toMatchObject({ success: false })
    expect(find).not.toHaveBeenCalled()

    const res = await browserControlTool.execute({ action: 'find_text', text: 'invoice' })
    expect(res).toMatchObject({ success: true, matches: 3 })
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ text: 'invoice', forward: true, findNext: true }))
  })

  it('the "find"/"search_page" aliases reach find_text, not a shadowed action', async () => {
    const { ACTION_ALIASES, VALID_ACTIONS } = await import('./browserControl')
    expect(ACTION_ALIASES.find).toBe('find_text')
    expect(ACTION_ALIASES.search_page).toBe('find_text')
    for (const alias of Object.keys(ACTION_ALIASES)) {
      expect(VALID_ACTIONS, `${alias} shadows a real action`).not.toContain(alias)
    }
  })

  it('list_downloads passes the limit through to the bridge', async () => {
    const downloads = vi.fn(async () => ({ success: true, downloads: [] }))
    vi.stubGlobal('window', { __YOGATIK_BROWSER__: { downloads } })

    await browserControlTool.execute({ action: 'list_downloads', limit: 5 })

    expect(downloads).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }))
  })

  it('wait_for_download polls until the matching download completes, then returns its savePath', async () => {
    vi.useFakeTimers()
    try {
      let call = 0
      const downloads = vi.fn(async () => {
        call++
        if (call < 3) return { success: true, downloads: [{ filename: 'report.pdf', state: 'progressing', receivedBytes: 100 }] }
        return { success: true, downloads: [{ filename: 'report.pdf', state: 'completed', savePath: '/tmp/report.pdf', receivedBytes: 5000 }] }
      })
      vi.stubGlobal('window', { __YOGATIK_BROWSER__: { downloads } })

      const p = browserControlTool.execute({ action: 'wait_for_download', text: 'report' })
      // Each poll iteration awaits a 400ms setTimeout; advance past several.
      await vi.advanceTimersByTimeAsync(400 * 5)
      const res = await p

      expect(res).toMatchObject({ success: true, savePath: '/tmp/report.pdf', filename: 'report.pdf' })
      expect(call).toBeGreaterThanOrEqual(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('wait_for_download reports a clear timeout when nothing matching ever appears', async () => {
    vi.useFakeTimers()
    try {
      const downloads = vi.fn(async () => ({ success: true, downloads: [] }))
      vi.stubGlobal('window', { __YOGATIK_BROWSER__: { downloads } })

      const p = browserControlTool.execute({ action: 'wait_for_download', text: 'nope', timeout: 1000 })
      await vi.advanceTimersByTimeAsync(1500)
      const res = await p

      expect(res.success).toBe(false)
      expect(res.error).toMatch(/no download/i)
    } finally {
      vi.useRealTimers()
    }
  })

  it('wait_for_download reports the real reason when the download was cancelled', async () => {
    vi.useFakeTimers()
    try {
      const downloads = vi.fn(async () => ({ success: true, downloads: [{ filename: 'x.zip', state: 'cancelled' }] }))
      vi.stubGlobal('window', { __YOGATIK_BROWSER__: { downloads } })

      const p = browserControlTool.execute({ action: 'wait_for_download' })
      await vi.advanceTimersByTimeAsync(500)
      const res = await p

      expect(res).toMatchObject({ success: false, state: 'cancelled' })
    } finally {
      vi.useRealTimers()
    }
  })
})
