import { describe, it, expect } from 'vitest'
import { visualVerifyTool, htmlToSvgDataUrl } from './visualVerify'

describe('visualVerifyTool', () => {
  it('generates an SVG data URL from HTML and CSS', () => {
    const dataUrl = htmlToSvgDataUrl('<div class="card">Hello</div>', '.card { color: red; }', 400, 300)
    expect(dataUrl.startsWith('data:image/svg+xml')).toBe(true)
    expect(dataUrl).toContain('foreignObject')
    expect(dataUrl).toContain('Hello')
  })

  it('executes visual verification and returns image payload', async () => {
    const res = await visualVerifyTool.execute({
      html: '<h1>Dashboard Metric</h1><p>Value: 42%</p>',
      css: 'h1 { font-size: 24px; color: #38bdf8; }',
      width: 600,
      height: 400,
    })
    expect(res.success).toBe(true)
    expect(res.image).toBeDefined()
    expect(res.dimensions.width).toBe(600)
    expect(res.dimensions.height).toBe(400)
  })

  it('rejects empty html input', async () => {
    const res = await visualVerifyTool.execute({ html: '' })
    expect(res.success).toBe(false)
    expect(res.error).toBeDefined()
  })
})
