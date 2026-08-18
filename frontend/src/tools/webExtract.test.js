/**
 * web_extract fetches static HTML, so a JavaScript-only page legitimately yields
 * nothing. The failure it reported was honest but a dead end: on the desktop
 * build browser_control CAN render that page, and the model was not told so — it
 * simply concluded the content was unreadable. Same shape as the youtube tool's
 * transcript_note: put the next step in the RESULT, where the model will act on it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./http', () => ({ proxyText: vi.fn() }))

const { proxyText } = await import('./http')
const { webExtractTool } = await import('./webExtract')

const SPA = '<html><head><title>Yogatik</title></head><body><div id="root"></div></body></html>'

beforeEach(() => vi.clearAllMocks())
afterEach(() => { delete window.__YOGATIK_BROWSER__ })

describe('web_extract on a JavaScript-only page', () => {
  it('points at browser_control when the desktop browser is available', async () => {
    window.__YOGATIK_BROWSER__ = {}
    proxyText.mockResolvedValue(SPA)

    const res = await webExtractTool.execute({ url: 'https://yogatik.web.app/' })
    expect(res.success).toBe(false)
    expect(res.next_step).toMatch(/browser_control/)
    expect(res.can_render).toBe(true)
  })

  it('does NOT promise a tool the web build does not have', async () => {
    proxyText.mockResolvedValue(SPA)

    const res = await webExtractTool.execute({ url: 'https://yogatik.web.app/' })
    expect(res.success).toBe(false)
    expect(res.can_render).toBe(false)
    expect(res.next_step || '').not.toMatch(/browser_control/)
    expect(res.next_step).toMatch(/desktop app/i)
  })

  it('still keeps the honest reason and the title it did find', async () => {
    proxyText.mockResolvedValue(SPA)
    const res = await webExtractTool.execute({ url: 'https://yogatik.web.app/' })
    expect(res.error).toMatch(/JavaScript-only|paywall/i)
    expect(res.title).toBe('Yogatik')
  })

  it('adds no hint when extraction actually worked', async () => {
    proxyText.mockResolvedValue(
      `<html><head><title>Real</title></head><body><article>${'word '.repeat(200)}</article></body></html>`,
    )
    const res = await webExtractTool.execute({ url: 'https://example.com/a' })
    expect(res.success).toBe(true)
    expect(res.next_step).toBeUndefined()
  })
})
