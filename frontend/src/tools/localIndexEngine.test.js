import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  tokenizeText,
  generateFeatureVector,
  cosineSimilarity,
  extractContextualSnippet,
  computeBM25Score,
  extractDomainLinks,
  searchLocalIndex,
} from './localIndexEngine.js'
import * as dbModule from '../db.js'

describe('localIndexEngine', () => {
  describe('tokenizeText', () => {
    it('splits text into clean terms and removes stop words', () => {
      const tokens = tokenizeText('The quick brown fox jumps over the lazy dog!')
      expect(tokens).toContain('quick')
      expect(tokens).toContain('brown')
      expect(tokens).toContain('fox')
      expect(tokens).toContain('jumps')
      expect(tokens).toContain('lazy')
      expect(tokens).toContain('dog')
      // 'the' and 'over' should be filtered out by stop words
      expect(tokens).not.toContain('the')
      expect(tokens).not.toContain('over')
    })

    it('handles empty or special character strings gracefully', () => {
      expect(tokenizeText('')).toEqual([])
      expect(tokenizeText('### @@@ $$$ %%%')).toEqual([])
    })
  })

  describe('generateFeatureVector & cosineSimilarity', () => {
    it('produces a normalized 384-dimensional vector', () => {
      const vec = generateFeatureVector('Artificial intelligence and neural search')
      expect(vec.length).toBe(384)
      // Verify unit normalization: sqrt(sum(v_i^2)) approx 1.0
      let norm = 0
      for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i]
      expect(Math.sqrt(norm)).toBeCloseTo(1.0, 2)
    })

    it('calculates 1.0 similarity for identical vectors and lower for distinct ones', () => {
      const v1 = generateFeatureVector('Quantum computing and physics research')
      const v2 = generateFeatureVector('Quantum computing and physics research')
      const v3 = generateFeatureVector('Recipe for chocolate chip cookies with butter')

      const simIdentical = cosineSimilarity(v1, v2)
      const simDifferent = cosineSimilarity(v1, v3)

      expect(simIdentical).toBeCloseTo(1.0, 4)
      expect(simDifferent).toBeLessThan(simIdentical)
    })
  })

  describe('computeBM25Score', () => {
    it('rewards title and url matches higher than pure body matches', () => {
      const queryTokens = ['react', 'router']
      const docWithTitleMatch = {
        title: 'React Router Documentation & Guide',
        url: 'https://reactrouter.com',
        description: 'Web framework guide',
        content: 'General overview of routing concepts.',
      }
      const docWithBodyOnlyMatch = {
        title: 'Web Design Principles',
        url: 'https://example.com/design',
        description: 'Design principles',
        content: 'You can use react router for page transitions in web apps.',
      }

      const score1 = computeBM25Score({ queryTokens, doc: docWithTitleMatch })
      const score2 = computeBM25Score({ queryTokens, doc: docWithBodyOnlyMatch })

      expect(score1).toBeGreaterThan(score2)
    })
  })

  describe('extractContextualSnippet', () => {
    it('centers snippet around query matches', () => {
      const longText = 'Introduction to web components. ' +
        'Several years ago web components were introduced. ' +
        'Now in the modern era, Yogatik Search Engine provides private on-device crawling and indexing with zero cloud fees. ' +
        'Finally, this concludes the overview chapter.'

      const snippet = extractContextualSnippet(longText, ['yogatik', 'search', 'private'], 100)
      expect(snippet.toLowerCase()).toContain('yogatik')
    })
  })

  describe('extractDomainLinks', () => {
    it('extracts same-domain links and discards external or asset links', () => {
      const html = `
        <html>
          <body>
            <a href="/docs/getting-started">Docs</a>
            <a href="https://example.com/api/v1">API</a>
            <a href="https://otherdomain.com/login">External</a>
            <a href="/downloads/manual.pdf">PDF Manual</a>
            <a href="mailto:support@example.com">Email</a>
            <a href="#section-top">Anchor</a>
          </body>
        </html>
      `
      const links = extractDomainLinks(html, 'https://example.com/home', 'example.com')
      expect(links).toContain('https://example.com/docs/getting-started')
      expect(links).toContain('https://example.com/api/v1')
      expect(links).not.toContain('https://otherdomain.com/login')
      expect(links).not.toContain('https://example.com/downloads/manual.pdf')
      expect(links).not.toContain('mailto:support@example.com')
    })
  })

  describe('searchLocalIndex', () => {
    beforeEach(() => {
      vi.restoreAllMocks()
    })

    it('returns scored and ranked search results matching query', async () => {
      vi.spyOn(dbModule, 'getIndexedPages').mockResolvedValue([
        {
          id: 1,
          url: 'https://docs.yogatik.com/engine',
          domain: 'docs.yogatik.com',
          title: 'Yogatik Private Search Engine Architecture',
          description: 'Local on-device indexing with BM25 and TurboVec',
          content: 'Yogatik search engine uses client-side Dexie IndexedDB for zero-cost private search.',
          vector: generateFeatureVector('Yogatik Private Search Engine Architecture'),
          wordCount: 120,
          updatedAt: Date.now(),
        },
        {
          id: 2,
          url: 'https://cooking.com/pasta',
          domain: 'cooking.com',
          title: 'Creamy Garlic Pasta Recipe',
          description: 'Delicious dinner recipe',
          content: 'Boil water and cook pasta until al dente.',
          vector: generateFeatureVector('Creamy Garlic Pasta Recipe'),
          wordCount: 80,
          updatedAt: Date.now(),
        },
      ])

      const res = await searchLocalIndex({ query: 'Yogatik search engine', count: 5 })
      expect(res.count).toBe(1)
      expect(res.results[0].title).toBe('Yogatik Private Search Engine Architecture')
      expect(res.results[0].engine).toBe('local_index')
      expect(res.results[0].private).toBe(true)
    })
  })
})
