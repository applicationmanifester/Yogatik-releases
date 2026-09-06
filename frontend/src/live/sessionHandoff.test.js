import { describe, it, expect } from 'vitest'
import { extractActionItems, formatLiveSessionRecap, categorizeLiveSession, generateExecutiveSummary } from './sessionHandoff'

describe('sessionHandoff', () => {
  describe('extractActionItems', () => {
    it('extracts action items from spoken sentences', () => {
      const transcripts = [
        { role: 'user', text: 'I think we should write the unit tests today.' },
        { role: 'model', text: 'Sounds good. Make sure to check the database migrations as well.' },
      ]
      const items = extractActionItems(transcripts)
      expect(items.length).toBeGreaterThanOrEqual(1)
      expect(items.some(i => i.toLowerCase().includes('unit tests'))).toBe(true)
    })

    it('returns empty array when no action patterns are present', () => {
      const transcripts = [
        { role: 'user', text: 'The sky is blue.' },
        { role: 'model', text: 'Yes, indeed.' },
      ]
      expect(extractActionItems(transcripts)).toEqual([])
    })
  })

  describe('categorizeLiveSession', () => {
    it('detects engineering sessions from terms', () => {
      const transcripts = [
        { role: 'user', text: 'How do I fix this React component state bug and API call?' },
      ]
      expect(categorizeLiveSession(transcripts)).toBe('engineering')
    })

    it('detects research sessions from terms', () => {
      const transcripts = [
        { role: 'user', text: 'Find the latest arXiv paper on transformer architectures.' },
      ]
      expect(categorizeLiveSession(transcripts)).toBe('research')
    })
  })

  describe('generateExecutiveSummary', () => {
    it('summarizes questions asked by user', () => {
      const transcripts = [
        { role: 'user', text: 'What is the fastest sorting algorithm?' },
        { role: 'model', text: 'Quicksort or Timsort depending on the data shape.' },
      ]
      const summary = generateExecutiveSummary(transcripts)
      expect(summary.length).toBeGreaterThan(0)
      expect(summary[0]).toContain('fastest sorting algorithm')
    })
  })

  describe('formatLiveSessionRecap', () => {
    it('generates a rich markdown briefing with dialogue details and deliverables', () => {
      const recap = formatLiveSessionRecap({
        durationSec: 125,
        transcripts: [
          { role: 'user', text: 'Can you search for the latest arXiv papers on quantum computing?' },
          { role: 'model', text: 'Found 3 relevant papers from today. We should summarize them tomorrow.' },
        ],
        toolsExecuted: [{ name: 'web_search' }],
        provider: 'gemini',
        model: 'gemini-2.5-flash',
      })

      expect(recap).toContain('### 🎙️ Live Session Brief (2m 5s)')
      expect(recap).toContain('`gemini-2.5-flash`')
      expect(recap).toContain('`web_search`')
      expect(recap).toContain('Action Items & Deliverables')
      expect(recap).toContain('View Full Spoken Dialogue')
    })
  })
})
