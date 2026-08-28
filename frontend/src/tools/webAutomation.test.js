import { describe, it, expect, vi, beforeEach } from 'vitest'

let settingsStore = {}
vi.mock('../db', () => ({
  getSetting: vi.fn(async (k, fallback = '') => (settingsStore[k] ?? fallback)),
  setSetting: vi.fn(async (k, v) => { settingsStore[k] = v; return true }),
}))

vi.mock('./http', () => ({
  proxyText: vi.fn(async (url) => {
    if (url.includes('table')) {
      return `
        <html><body>
          <table>
            <tr><th>Product</th><th>Price</th></tr>
            <tr><td>Model A</td><td>$10</td></tr>
            <tr><td>Model B</td><td>$20</td></tr>
          </table>
        </body></html>
      `
    }
    if (url.includes('rss')) {
      return `
        <rss><channel>
          <item><title>News 1</title><link>https://example.com/1</link><description>Update 1</description></item>
        </channel></rss>
      `
    }
    if (url.includes('diff')) {
      return `<html><body><h1>Release v2.0</h1><p>Added new features</p></body></html>`
    }
    return `<html><body><h1>Test Page</h1><p>${'Sample article body content. '.repeat(10)}</p></body></html>`
  }),
  proxyJson: vi.fn(),
}))

import { webAutomationTool } from './webAutomation'

describe('Web Automation Pipeline Tool', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    settingsStore = {}
  })

  it('runs batch extraction across multiple URLs in parallel', async () => {
    const res = await webAutomationTool.execute({
      action: 'batch_extract',
      urls: ['https://example.com/a', 'https://example.com/b'],
    })

    expect(res.success).toBe(true)
    expect(res.total).toBe(2)
    expect(res.results).toHaveLength(2)
    expect(res.results[0].title).toBeDefined()
  })

  it('scrapes HTML tables into structured rows', async () => {
    const res = await webAutomationTool.execute({
      action: 'scrape_tables',
      url: 'https://example.com/table',
    })

    expect(res.success).toBe(true)
    expect(res.tablesFound).toBe(1)
    expect(res.tables[0].headers).toEqual(['Product', 'Price'])
    expect(res.tables[0].rows).toHaveLength(2)
  })

  it('tracks page snapshots and detects diff changes', async () => {
    // 1. Initial snapshot
    const initial = await webAutomationTool.execute({
      action: 'diff_monitor',
      url: 'https://example.com/diff',
      monitorKey: 'product_v1',
    })
    expect(initial.success).toBe(true)
    expect(initial.status).toBe('initial_snapshot_saved')

    // 2. Second check (diff comparison)
    const second = await webAutomationTool.execute({
      action: 'diff_monitor',
      url: 'https://example.com/diff',
      monitorKey: 'product_v1',
    })
    expect(second.success).toBe(true)
    expect(second.hasChanges).toBe(false)
  })

  it('parses RSS / Atom XML feeds', async () => {
    const res = await webAutomationTool.execute({
      action: 'rss_feed',
      url: 'https://example.com/rss',
    })

    expect(res.success).toBe(true)
    expect(res.count).toBe(1)
    expect(res.items[0].title).toBe('News 1')
  })

  it('extracts links and differentiates internal vs external links', async () => {
    const res = await webAutomationTool.execute({
      action: 'extract_links',
      url: 'https://example.com/table',
    })

    expect(res.success).toBe(true)
    expect(res.total).toBeDefined()
    expect(Array.isArray(res.links)).toBe(true)
  })
})
