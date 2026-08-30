import { describe, it, expect } from 'vitest'
import { extractActionItems, formatLiveSessionRecap } from './sessionHandoff'

describe('sessionHandoff', () => {
  describe('extractActionItems', () => {
    it('extracts action items from spoken sentences', () => {
      const transcripts = [
        { role: 'user', text: 'I think we should write the unit tests today.' },
        { role: 'model', text: 'Sounds good. Make sure to check the database migrations as well.' },
      ]
      const items = extractActionItems(transcripts)
      expect(items.length).toBeGreaterThanOrEqual(1)
      expect(items.some(i => i.includes('unit tests'))).toBe(true)
    })

    it('returns empty array when no action patterns are present', () => {
      const transcripts = [
        { role: 'user', text: 'The sky is blue.' },
        { role: 'model', text: 'Yes, indeed.' },
      ]
      expect(extractActionItems(transcripts)).toEqual([])
    })
  })

  describe('formatLiveSessionRecap', () => {
    it('generates a rich markdown briefing with dialogue details', () => {
      const recap = formatLiveSessionRecap({
        durationSec: 125,
        transcripts: [
          { role: 'user', text: 'Can you search for the latest arXiv papers on quantum computing?' },
          { role: 'model', text: 'Found 3 relevant papers from today.' },
        ],
        toolsExecuted: [{ name: 'web_search' }],
        provider: 'gemini',
        model: 'gemini-2.5-flash',
      })

      expect(recap).toContain('### 🎙️ Live Session Recap (2m 5s)')
      expect(recap).toContain('`gemini-2.5-flash`')
      expect(recap).toContain('`web_search`')
      expect(recap).toContain('View Full Spoken Dialogue')
    })
  })
})
