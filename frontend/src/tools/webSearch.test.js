import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./http', () => ({
  proxyFetch: vi.fn(),
  proxyText: vi.fn(),
  proxyJson: vi.fn(),
}))
vi.mock('../db', () => ({ getSetting: vi.fn() }))

const { proxyText, proxyFetch } = await import('./http')
const { getSetting } = await import('../db')

// Mock global fetch for Wikipedia API calls
globalThis.fetch = vi.fn()

const { webSearchTool } = await import('./webSearch')

const DDG_HTML = `
<html><body><table>
  <tr><td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fbuild.nvidia.com%2F&rut=abc" class="result-link">Try NVIDIA NIM APIs</a></td></tr>
  <tr><td class="result-snippet">Experience the leading models to build enterprise generative AI.</td></tr>
  <tr><td><a rel="nofollow" href="https://developer.nvidia.com/nim" class="result-link">NIM for Developers</a></td></tr>
  <tr><td class="result-snippet">NVIDIA NIM provides containers to self-host models.</td></tr>
</table></body></html>`

beforeEach(() => {
  vi.clearAllMocks()
  getSetting.mockResolvedValue(null)
  globalThis.fetch.mockResolvedValue({ ok: false })
})

describe('web_search (DuckDuckGo)', () => {
  it('parses titles, snippets and unwraps uddg redirects', async () => {
    proxyText.mockResolvedValue(DDG_HTML)
    const res = await webSearchTool.execute({ query: 'nvidia nim', count: 5 })

    expect(res.engine).toBe('duckduckgo')
    expect(res.results).toHaveLength(2)
    expect(res.results[0]).toMatchObject({
      title: 'Try NVIDIA NIM APIs',
      url: 'https://build.nvidia.com/',
      snippet: 'Experience the leading models to build enterprise generative AI.',
    })
    expect(res.results[1].url).toBe('https://developer.nvidia.com/nim')
  })

  it('clamps count to the allowed range', async () => {
    proxyText.mockResolvedValue(DDG_HTML)
    expect((await webSearchTool.execute({ query: 'x', count: 99 })).results.length).toBeLessThanOrEqual(8)
    expect((await webSearchTool.execute({ query: 'x', count: 0 })).results).toHaveLength(1)
  })

  it('rejects an empty query without hitting the network', async () => {
    const res = await webSearchTool.execute({ query: '   ' })
    expect(res.error).toBeDefined()
    expect(proxyText).not.toHaveBeenCalled()
  })

  it('reports no results rather than throwing on empty markup', async () => {
    proxyText.mockResolvedValue('<html><body>nothing here</body></html>')
    const res = await webSearchTool.execute({ query: 'obscure' })
    expect(res.results).toEqual([])
    expect(res.note).toMatch(/no results/i)
  })

  it('handles network failures gracefully without crashing', async () => {
    proxyText.mockRejectedValue(new Error('proxy down'))
    const res = await webSearchTool.execute({ query: 'anything' })
    expect(res).toHaveProperty('note')
    expect(res.results).toEqual([])
  })

  it('supports alias argument formats (q, search_query, and raw string)', async () => {
    proxyText.mockResolvedValue(DDG_HTML)
    const res1 = await webSearchTool.execute({ q: 'nvidia nim' })
    expect(res1.results).toHaveLength(2)

    const res2 = await webSearchTool.execute({ search_query: 'nvidia nim' })
    expect(res2.results).toHaveLength(2)

    const res3 = await webSearchTool.execute('nvidia nim')
    expect(res3.results).toHaveLength(2)
  })
})

describe('web_search (Brave)', () => {
  it('uses the Brave API when a key is configured', async () => {
    getSetting.mockResolvedValue('brave-key-123')
    proxyFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ web: { results: [{ title: 'T', url: 'https://e.com', description: 'a <b>bold</b> desc' }] } }),
    })
    proxyText.mockResolvedValue('<html><body></body></html>')

    const res = await webSearchTool.execute({ query: 'test' })

    expect(res.engine).toBe('brave')
    expect(res.results[0].snippet).toBe('a bold desc')
    const [, opts] = proxyFetch.mock.calls[0]
    expect(opts.credentials).toBe(true)
    expect(opts.headers['X-Subscription-Token']).toBe('brave-key-123')
  })
})