/**
 * A tool result is data we do not fully control: 178 tools, any connected MCP
 * server, and whatever a model talked one of them into returning. Every card
 * branch reads fields positionally, so a wrong type — an array where a string
 * belongs — throws during render.
 *
 * Before the per-card boundary, that throw unmounted the ENTIRE app: React tears
 * down to the nearest boundary and the only one was at the root. A malformed
 * `diff` result did exactly that to a live chat. These tests feed every branch a
 * result whose every field is an object and assert the app survives.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ToolResultCard } from './ToolResultCard'

let host = null
let root = null

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

// Every tool the card has a dedicated branch for.
const BRANCHES = [
  'spawn_agents', 'image_generate', 'sticker_generate', 'chart', 'code_execute',
  'weather', 'translate', 'unit_convert', 'hash', 'ip_lookup', 'whois', 'rss_feed',
  'qr_generate', 'summarize', 'keyword_extract', 'query_refine', 'diff', 'link_preview',
  'md_to_pdf', 'doc_enhance', 'timer', 'alarm', 'social_search', 'job_search',
  'social_post_generator', 'deep_research', 'web_search', 'doc_search', 'doc_list',
  'screen_inspect', 'desktop_action', 'browser_autopilot', 'diagram', 'text_to_audio',
  'podcast_generate', 'audio_overview', 'entity_extract', 'doc_export', 'video_render',
  'calculator',
]

/** A result where every field reads back as an object — the React #31 trigger. */
function hostileResult() {
  return new Proxy({ success: true }, {
    get: (target, key) => {
      if (key in target) return target[key]
      if (typeof key !== 'string' || key.startsWith('_') || key === 'then') return undefined
      return { unexpected: 'object' }
    },
    has: () => true,
  })
}

const renderCard = (tool, result) => act(() => {
  root.render(<ToolResultCard tool={tool} result={result} />)
})

describe('ToolResultCard crash containment', () => {
  for (const tool of BRANCHES) {
    it(`survives a malformed ${tool} result`, () => {
      expect(() => renderCard(tool, hostileResult())).not.toThrow()
      // Either the branch coped, or the boundary caught it — never a blank app.
      expect(host.textContent.length).toBeGreaterThan(0)
    })
  }

  it('shows the raw result when a card cannot render it', () => {
    // `diff` returns an ARRAY of hunks; rendering it as a child is the original crash.
    renderCard('diff', { success: true, similarity: 90, changes: 1, diff: [{ type: 'change' }], extra: { o: 1 } })
    expect(host.textContent).toMatch(/similar|could not be displayed/i)
  })
})

describe('ToolResultCard normal rendering', () => {
  it('renders a diff with formatted hunks and an unscaled percentage', () => {
    renderCard('diff', {
      success: true,
      similarity: 66.7,
      changes: 1,
      diff: [{ type: 'change', line: 2, old: 'two', new: 'TWO' }],
    })
    expect(host.textContent).toContain('66.7% similar')
    expect(host.textContent).toContain('TWO')
  })

  it('renders code_execute output even when the script also wrote to stderr', () => {
    renderCard('code_execute', { success: true, output: 'the answer is 42', stderr: 'DeprecationWarning' })
    expect(host.textContent).toContain('the answer is 42')
    expect(host.textContent).toContain('DeprecationWarning')
  })

  it('renders a failed tool as an error card', () => {
    renderCard('terminal_run', { success: false, error: 'No working folder for this chat.' })
    expect(host.textContent).toMatch(/working folder/i)
    // …and diagnosed as a workspace problem, not as an API-key/provider failure.
    expect(host.textContent).not.toMatch(/model provider/i)
  })
})
