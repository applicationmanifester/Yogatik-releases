/**
 * Local search sidecar tool — Electron desktop only.
 * Uses the bundled Go binary via the preload bridge.
 * Falls back to the regular webSearchTool if sidecar unavailable.
 */

import { webSearchTool } from './webSearch.js'

function isElectron() {
  return typeof window !== 'undefined' && window.__YOGATIK_ELECTRON__ === true
}

function isSearchSidecarAvailable() {
  return isElectron() && typeof window.__YOGATIK_SEARCH__?.search === 'function'
}

export const localSearchTool = {
  schema: {
    description: 'Search the live web using the local desktop search sidecar (Electron only). Queries multiple engines directly without CORS proxies: DuckDuckGo, Marginalia, Wikipedia. Results merged and ranked by cross-engine agreement.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        count: { type: 'number', description: `Number of results (1-8, default 5)` },
        recency: {
          type: 'string',
          enum: ['any', 'day', 'week', 'month', 'year'],
          description: 'Restrict to recently published pages',
        },
        site: { type: 'string', description: 'Restrict to one domain, e.g. "arxiv.org"' },
        engines: {
          type: 'string',
          enum: ['all', 'web'],
          description: '"all" queries several indexes and merges; "web" uses one engine for speed',
        },
      },
      required: ['query'],
    },
  },
  async execute(args) {
    // If not in Electron or sidecar unavailable, fall back to web search
    if (!isSearchSidecarAvailable()) {
      return webSearchTool.execute(args)
    }

    try {
      return await window.__YOGATIK_SEARCH__.search(args.query, {
        count: args.count,
        recency: args.recency,
        site: args.site,
        engines: args.engines,
      })
    } catch (err) {
      // Fallback to web search on any error
      console.warn('[localSearch] Sidecar failed, falling back to web search:', err.message)
      return webSearchTool.execute(args)
    }
  },
}

// Re-export webSearchTool for non-Electron contexts
export { webSearchTool }