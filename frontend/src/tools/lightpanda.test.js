import { describe, it, expect } from 'vitest'
import {
  htmlToMarkdown,
  extractInteractiveElements,
  evalJS,
  lightpandaTool,
} from './lightpanda'

describe('Lightpanda Ultra-Fast Headless Browser Suite', () => {
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

  it('safely evaluates JavaScript expressions in sandbox context', () => {
    const res = evalJS('Math.pow(2, 10) + 24')
    expect(res.success).toBe(true)
    expect(res.result).toBe(1048)
  })

  it('lightpandaTool executes eval_js, extract_dom, and cdp_info actions', async () => {
    const cdpRes = await lightpandaTool.execute({ action: 'cdp_info' })
    expect(cdpRes.success).toBe(true)
    expect(cdpRes.engine).toContain('Lightpanda')
    expect(cdpRes.memoryPerTab).toContain('16x')

    const domRes = await lightpandaTool.execute({
      action: 'extract_dom',
      html: '<a href="/dashboard">Dashboard</a><button>Execute</button>',
    })
    expect(domRes.success).toBe(true)
    expect(domRes.totalInteractive).toBe(2)

    const evalRes = await lightpandaTool.execute({
      action: 'eval_js',
      script: '[1, 2, 3, 4].map(x => x * 2)',
    })
    expect(evalRes.success).toBe(true)
    expect(evalRes.result).toEqual([2, 4, 6, 8])
  })
})
