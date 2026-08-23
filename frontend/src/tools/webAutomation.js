/**
 * `web_automate` — Web Automation, Batch Extraction, and Monitoring Pipeline.
 * 
 * Provides automated web operations:
 * 1. `batch_extract`: Parallel scraping of multiple URLs with clean content aggregation.
 * 2. `scrape_tables`: Auto-discovers and extracts HTML data tables into structured JSON/CSV.
 * 3. `diff_monitor`: Tracks changes on a web page over time.
 * 4. `rss_feed`: Auto-fetches and parses RSS/Atom feeds for real-time monitoring.
 */

import { proxyText, proxyJson } from './http'
import { extractReadable } from './readability'
import { getSetting, setSetting } from '../db'

/** Parse simple HTML tables into headers and rows */
function parseHtmlTables(html) {
  if (typeof DOMParser === 'undefined') return []
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const tables = doc.querySelectorAll('table')
    const results = []

    tables.forEach((table, tIdx) => {
      const headers = []
      const rows = []
      
      const ths = table.querySelectorAll('th')
      if (ths.length > 0) {
        ths.forEach(th => headers.push(th.textContent.trim()))
      }

      const trs = table.querySelectorAll('tr')
      trs.forEach(tr => {
        const tds = tr.querySelectorAll('td')
        if (tds.length > 0) {
          const rowData = []
          tds.forEach(td => rowData.push(td.textContent.trim()))
          rows.push(rowData)
        }
      })

      if (rows.length > 0) {
        results.push({
          index: tIdx + 1,
          headers: headers.length > 0 ? headers : rows[0].map((_, i) => `Column ${i + 1}`),
          rowCount: rows.length,
          rows: rows.slice(0, 50), // Cap at 50 rows
        })
      }
    })

    return results
  } catch {
    return []
  }
}

/** Simple text diff helper */
function computeDiff(oldText, newText) {
  const oldLines = new Set(oldText.split('\n').map(s => s.trim()).filter(Boolean))
  const newLines = newText.split('\n').map(s => s.trim()).filter(Boolean)
  const added = newLines.filter(l => !oldLines.has(l))
  return {
    hasChanges: added.length > 0,
    addedLinesCount: added.length,
    addedSample: added.slice(0, 10),
  }
}

export const webAutomationTool = {
  schema: {
    description:
      'Execute multi-step web automations: batch extraction from multiple URLs in parallel, ' +
      'HTML table scraping into structured data, change tracking / diff monitoring, or RSS monitoring.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['batch_extract', 'scrape_tables', 'diff_monitor', 'rss_feed'],
          description: 'Automation action to run',
        },
        urls: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of target URLs for batch_extract (max 10)',
        },
        url: {
          type: 'string',
          description: 'Target URL for scrape_tables, diff_monitor, or rss_feed',
        },
        monitorKey: {
          type: 'string',
          description: 'Unique identifier key for diff_monitor state tracking',
        },
      },
      required: ['action'],
    },
  },

  async execute({ action, urls = [], url = '', monitorKey = '' }) {
    // 1. Batch extraction across multiple URLs
    if (action === 'batch_extract') {
      const targetUrls = (urls.length > 0 ? urls : [url]).filter(u => /^https?:\/\//i.test(u)).slice(0, 10)
      if (targetUrls.length === 0) {
        return { success: false, error: 'Provide at least one valid http(s) URL in urls.' }
      }

      const results = await Promise.all(
        targetUrls.map(async (target) => {
          try {
            const html = await proxyText(target)
            const parsed = extractReadable(html, { maxChars: 4000 })
            return {
              url: target,
              success: Boolean(parsed.text && parsed.text.length >= 50),
              title: parsed.title || target,
              text: parsed.text?.slice(0, 3000) || '',
              wordCount: parsed.words || 0,
            }
          } catch (e) {
            return { url: target, success: false, error: e.message }
          }
        })
      )

      return {
        success: true,
        tool: 'web_automate',
        action: 'batch_extract',
        total: targetUrls.length,
        successful: results.filter(r => r.success).length,
        results,
      }
    }

    // 2. Scrape data tables
    if (action === 'scrape_tables') {
      if (!/^https?:\/\//i.test(url)) return { success: false, error: 'Provide a valid http(s) URL.' }
      try {
        const html = await proxyText(url)
        const tables = parseHtmlTables(html)
        return {
          success: true,
          tool: 'web_automate',
          action: 'scrape_tables',
          url,
          tablesFound: tables.length,
          tables,
        }
      } catch (e) {
        return { success: false, error: `Could not parse tables: ${e.message}`, url }
      }
    }

    // 3. Diff and change monitoring
    if (action === 'diff_monitor') {
      if (!/^https?:\/\//i.test(url)) return { success: false, error: 'Provide a valid http(s) URL.' }
      const key = `web_monitor_${monitorKey || url.replace(/[^a-z0-9]/gi, '_')}`
      try {
        const html = await proxyText(url)
        const current = extractReadable(html, { maxChars: 10000 })
        const currentText = current.text || ''
        const previousText = (await getSetting(key, '')) || ''

        await setSetting(key, currentText)

        if (!previousText) {
          return {
            success: true,
            tool: 'web_automate',
            action: 'diff_monitor',
            status: 'initial_snapshot_saved',
            url,
            length: currentText.length,
            title: current.title,
          }
        }

        const diff = computeDiff(previousText, currentText)
        return {
          success: true,
          tool: 'web_automate',
          action: 'diff_monitor',
          url,
          title: current.title,
          hasChanges: diff.hasChanges,
          addedLinesCount: diff.addedLinesCount,
          newContentSample: diff.addedSample,
        }
      } catch (e) {
        return { success: false, error: `Diff monitor error: ${e.message}`, url }
      }
    }

    // 4. RSS Feed Monitor
    if (action === 'rss_feed') {
      if (!/^https?:\/\//i.test(url)) return { success: false, error: 'Provide a valid RSS/Atom feed URL.' }
      try {
        const xmlText = await proxyText(url)
        const items = []
        if (typeof DOMParser !== 'undefined') {
          const doc = new DOMParser().parseFromString(xmlText, 'text/xml')
          const entries = doc.querySelectorAll('item, entry')
          entries.forEach((e, idx) => {
            if (idx >= 15) return
            items.push({
              title: e.querySelector('title')?.textContent?.trim() || 'Untitled',
              link: e.querySelector('link')?.textContent?.trim() || e.querySelector('link')?.getAttribute('href') || '',
              pubDate: e.querySelector('pubDate, published, updated')?.textContent?.trim() || '',
              summary: e.querySelector('description, summary')?.textContent?.trim()?.slice(0, 300) || '',
            })
          })
        }
        return {
          success: true,
          tool: 'web_automate',
          action: 'rss_feed',
          url,
          count: items.length,
          items,
        }
      } catch (e) {
        return { success: false, error: `RSS parsing failed: ${e.message}`, url }
      }
    }

    return { success: false, error: `Unknown automation action: ${action}` }
  },
}
