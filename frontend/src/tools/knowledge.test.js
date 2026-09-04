import { describe, it, expect, vi, afterEach } from 'vitest'
import { archiveTool } from './knowledge'

// Coverage for the wayback-machine tool. This absorbed openApis.js's
// waybackArchiveTool (retired 2026-09-04 as a duplicate — same endpoint,
// near-identical output) — `timestamp` is accepted as an alias for `date` so
// nothing that used to call the retired tool's param name breaks.
describe('archive (Wayback Machine)', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('returns an archived snapshot when one exists', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        archived_snapshots: {
          closest: { available: true, url: 'http://web.archive.org/web/20240101/https://example.com', timestamp: '20240101120000' },
        },
      }),
    })
    const res = await archiveTool.execute({ url: 'example.com' })
    expect(res.success).toBe(true)
    expect(res.archived_url).toContain('web.archive.org')
    expect(res.captured).toBe('2024-01-01')
  })

  it('reports honestly when nothing is archived', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ archived_snapshots: {} }) })
    const res = await archiveTool.execute({ url: 'https://nowhere.example' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/No archived snapshot/)
  })

  it('accepts `timestamp` as an alias for `date` (the retired tool\'s param name)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ archived_snapshots: { closest: { available: true, url: 'http://web.archive.org/web/20150101/https://example.com', timestamp: '20150101000000' } } }),
    })
    const res = await archiveTool.execute({ url: 'example.com', timestamp: '20150101' })
    expect(res.success).toBe(true)
    expect(global.fetch.mock.calls[0][0]).toContain('timestamp=20150101')
  })

  it('gives a friendly message on a real Internet Archive rate limit', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('429 Too Many Requests'))
    const res = await archiveTool.execute({ url: 'example.com' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/rate-limiting/)
  })
})
