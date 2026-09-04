import { describe, it, expect, vi, afterEach } from 'vitest'
import { htmlToMarkdown, extractInteractiveElements, fetchMarkdown, lightpandaTool } from './lightpanda'

// This suite used to encode the exact bug it should have caught: it asserted
// cdp_info's fabricated `memoryPerTab`/`cdpEndpoint`/dockerImage as if they
// were real — proof this app was actually connected to a Zig+V8 CDP browser
// process it never spawned. Fixed 2026-09-04 (see lightpanda.js's header):
// cdp_info is gone, fetchMarkdown goes through the real proxy layer instead
// of a bare fetch, and eval_js delegates to jsExecTool's real sandbox
// instead of an unsandboxed `new Function`. This file now tests the honest
// behaviour, not the fabricated one.
describe('lightpanda: HTML-to-Markdown + interactive-element extraction', () => {
  it('converts raw HTML into clean semantic Markdown without script clutter', () => {
    const rawHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Lightpanda AI Benchmarks</title>
        <style>body { background: #000; }</style>
        <script>console.log('tracking');</script>
      </head>
      <body>
        <h1>Ultra-Fast Headless Browser</h1>
        <p>Lightpanda is written in <b>Zig</b> and uses <i>V8</i>.</p>
        <ul>
          <li>16x less memory</li>
          <li>10x faster startup</li>
        </ul>
        <a href="https://lightpanda.io">Visit Website</a>
      </body>
      </html>
    `

    const parsed = htmlToMarkdown(rawHtml)
    expect(parsed.title).toBe('Lightpanda AI Benchmarks')
    expect(parsed.markdown).toContain('# Ultra-Fast Headless Browser')
    expect(parsed.markdown).toContain('- 16x less memory')
    expect(parsed.markdown).toContain('- 10x faster startup')
    expect(parsed.markdown).toContain('[Visit Website](https://lightpanda.io)')
    expect(parsed.markdown).not.toContain('console.log')
  })

  it('extracts interactive DOM elements with selectors for agent autopilot', () => {
    const sampleDom = `
      <div class="nav">
        <a href="/login">Sign In</a>
        <a href="/pricing">Pricing</a>
      </div>
      <form action="/submit">
        <input name="email" placeholder="Enter your email" />
        <button type="submit">Get Started</button>
      </form>
    `

    const res = extractInteractiveElements(sampleDom)
    expect(res.totalInteractive).toBe(4)
    expect(res.elements.some(e => e.type === 'link' && e.href === '/login')).toBe(true)
    expect(res.elements.some(e => e.type === 'input' && e.name === 'email')).toBe(true)
    expect(res.elements.some(e => e.type === 'button' && e.text === 'Get Started')).toBe(true)
  })

  describe('fetchMarkdown / fetch_markdown — routed through the real proxy layer', () => {
    const originalFetch = global.fetch
    afterEach(() => { global.fetch = originalFetch; vi.unstubAllGlobals() })

    it('fetches through proxyText (not a bare fetch) and reports the static-HTML limit', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '<title>Example</title><h1>Hi</h1>',
      })
      const res = await fetchMarkdown('https://example.com')
      expect(res.success).toBe(true)
      expect(res.title).toBe('Example')
      expect(res.note).toMatch(/JavaScript-rendered page/)
      expect(global.fetch).toHaveBeenCalled()
    })

    it('reports a failed fetch honestly rather than throwing', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('network disabled in test'))
      const res = await fetchMarkdown('https://example.com')
      expect(res.success).toBe(false)
      expect(res.error).toBeTruthy()
    })
  })

  it('cdp_info no longer exists — the tool never claims a real CDP browser process', async () => {
    const res = await lightpandaTool.execute({ action: 'cdp_info' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Unknown action/)
  })

  it('extract_dom works directly on supplied HTML', async () => {
    const domRes = await lightpandaTool.execute({
      action: 'extract_dom',
      html: '<a href="/dashboard">Dashboard</a><button>Execute</button>',
    })
    expect(domRes.success).toBe(true)
    expect(domRes.totalInteractive).toBe(2)
  })

  it('eval_js delegates to the real sandboxed runner (jsExecTool), not an unsandboxed eval', async () => {
    // jsdom has neither Worker nor a desktop bridge, so the real jsExecTool
    // honestly declines here — which is itself proof this is no longer the
    // old bare `new Function` path (that ran fine with no sandbox at all).
    const evalRes = await lightpandaTool.execute({
      action: 'eval_js',
      script: '[1, 2, 3, 4].map(x => x * 2)',
    })
    expect(evalRes.success).toBe(false)
    expect(evalRes.error).toMatch(/Web Workers|Desktop app/)
  })

  it('eval_js with no script names the missing argument', async () => {
    const res = await lightpandaTool.execute({ action: 'eval_js' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/script/)
  })
})
