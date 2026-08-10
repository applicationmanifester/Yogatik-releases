import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../llm', () => ({ getProxyEndpoint: vi.fn(() => 'https://proxy.test') }))

const { getProxyEndpoint } = await import('../llm')
const { proxyFetch, resetRelayHealth } = await import('./http')

const ok = (body = 'hi') => ({ ok: true, status: 200, text: async () => body, headers: new Headers() })
const bad = (status, headers = {}) => ({ ok: false, status, text: async () => '', headers: new Headers(headers) })
/** What our worker returns when it merely relayed the target's status. */
const relayed = (status) => bad(status, { 'x-yogatik-proxy': 'upstream' })

beforeEach(() => {
  vi.clearAllMocks()
  resetRelayHealth()
  getProxyEndpoint.mockReturnValue('https://proxy.test')
  globalThis.fetch = vi.fn()
})

describe('proxyFetch', () => {
  it('uses our own proxy first, passing the target as a header', async () => {
    fetch.mockResolvedValue(ok())
    await proxyFetch('https://example.com/page')

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://proxy.test')
    expect(init.headers['X-Target-URL']).toBe('https://example.com/page')
  })

  it('falls back to a public relay when our proxy rejects the target', async () => {
    fetch.mockResolvedValueOnce(bad(403)).mockResolvedValueOnce(ok())
    await proxyFetch('https://example.com')

    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1][0]).toContain('example.com')
  })

  it('never sends a credential through a public relay', async () => {
    getProxyEndpoint.mockReturnValue(null)
    await expect(proxyFetch('https://api.example.com', { credentials: true }))
      .rejects.toThrow(/refusing to send credentials/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends credentials through our own proxy', async () => {
    fetch.mockResolvedValue(ok())
    await proxyFetch('https://api.example.com', { credentials: true, headers: { Authorization: 'Bearer k' } })
    expect(fetch.mock.calls[0][0]).toBe('https://proxy.test')
  })

  it('honours Retry-After on 429, once', async () => {
    fetch.mockResolvedValueOnce(bad(429, { 'retry-after': '1' })).mockResolvedValueOnce(ok())
    const resp = await proxyFetch('https://example.com')
    expect(resp.ok).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1][0]).toBe('https://proxy.test')
  })

  it('ignores an absurd Retry-After instead of sleeping on it', async () => {
    fetch.mockResolvedValueOnce(bad(429, { 'retry-after': '3600' })).mockResolvedValueOnce(ok())
    const t = Date.now()
    await proxyFetch('https://example.com')
    expect(Date.now() - t).toBeLessThan(1000)
  })

  it('skips a relay that just failed instead of retrying it every call', async () => {
    fetch.mockResolvedValueOnce(bad(429)).mockResolvedValueOnce(ok())
    await proxyFetch('https://example.com')       // proxy 429s -> public relay
    fetch.mockClear()

    fetch.mockResolvedValue(ok())
    await proxyFetch('https://example.com/2')     // proxy is on cooldown
    expect(fetch.mock.calls[0][0]).not.toBe('https://proxy.test')
  })

  it('keeps using our proxy when the 429 came from the target, not from us', async () => {
    fetch.mockResolvedValueOnce(relayed(429)).mockResolvedValueOnce(ok())
    await proxyFetch('https://lite.duckduckgo.com/lite/?q=x')   // target throttles us
    fetch.mockClear()

    fetch.mockResolvedValue(ok())
    await proxyFetch('https://example.com/other')
    // Our worker is fine — only the target was rate limited.
    expect(fetch.mock.calls[0][0]).toBe('https://proxy.test')
  })

  it('reports the last relay failure when every relay is down', async () => {
    fetch.mockResolvedValue(bad(503))
    await expect(proxyFetch('https://example.com')).rejects.toThrow(/503/)
  })

  it('stops hammering a host that beat every relay', async () => {
    fetch.mockResolvedValue(bad(403))
    await expect(proxyFetch('https://www.youtube.com/watch?v=x')).rejects.toThrow()
    const attempts = fetch.mock.calls.length
    fetch.mockClear()

    // Same host again: fail fast instead of printing four more CORS errors.
    await expect(proxyFetch('https://www.youtube.com/watch?v=y')).rejects.toThrow(/refusing proxied/i)
    expect(fetch).not.toHaveBeenCalled()
    expect(attempts).toBeGreaterThan(1)
  })

  it('keeps serving other hosts while one is blocked', async () => {
    fetch.mockResolvedValue(bad(403))
    await expect(proxyFetch('https://www.youtube.com/watch?v=x')).rejects.toThrow()

    fetch.mockClear()
    fetch.mockResolvedValue(ok())
    const resp = await proxyFetch('https://example.com')
    expect(resp.ok).toBe(true)
  })
})
