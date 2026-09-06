import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toSearchQuery, decomposeQuery, scoreDomain, researchTool } from './research'

vi.mock('./http', () => ({
  proxyFetch: vi.fn(),
  proxyText: vi.fn(),
  proxyJson: vi.fn(),
}))

vi.mock('./webSearch', () => ({
  webSearchTool: {
    execute: vi.fn(),
  },
}))

const { proxyText } = await import('./http')
const { webSearchTool } = await import('./webSearch')

describe('Deep Research Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('toSearchQuery & decomposeQuery', () => {
    it('cleans conversational filler words and future year tokens', () => {
      const q = 'Can you please tell me about the state of quantum computing in 2026?'
      const cleaned = toSearchQuery(q)
      expect(cleaned).not.toContain('2026')
      expect(cleaned).not.toContain('please')
      expect(cleaned.toLowerCase()).toContain('quantum')
    })

    it('splits comparative vs queries into focused sub-queries', () => {
      const sub = decomposeQuery('solid-state batteries vs lithium-ion batteries')
      expect(sub.length).toBe(2)
      expect(sub[0]).toContain('solid-state batteries')
      expect(sub[1]).toContain('lithium-ion batteries')
    })

    it('decomposes deep analytical research topics into multiple facets', () => {
      const sub = decomposeQuery('impact of quantum computing on modern cryptography')
      expect(sub.length).toBe(3)
      expect(sub[0]).toContain('quantum computing')
      expect(sub[1]).toContain('architecture')
      expect(sub[2]).toContain('challenges')
    })
  })

  describe('scoreDomain authority ranking', () => {
    it('scores educational, governmental, and academic domains higher', () => {
      expect(scoreDomain('https://arxiv.org/abs/2301.00000')).toBeGreaterThan(2.0)
      expect(scoreDomain('https://cs.stanford.edu/paper')).toBeGreaterThan(2.0)
      expect(scoreDomain('https://wikipedia.org/wiki/AI')).toBeGreaterThan(2.0)
    })

    it('penalizes low-authority / affiliate domains', () => {
      expect(scoreDomain('https://top10best5deals.com')).toBeLessThan(1.0)
    })
  })

  describe('researchTool.execute', () => {
    it('rejects empty queries', async () => {
      const res = await researchTool.execute({ query: '   ' })
      expect(res.error).toBeDefined()
    })

    it('executes multi-engine search and page synthesis', async () => {
      webSearchTool.execute.mockResolvedValue({
        results: [
          { title: 'Nature: Quantum Breakthrough', url: 'https://nature.com/articles/quantum', snippet: 'Breakthrough in fault-tolerant qubits.' },
          { title: 'MIT News: Superconducting Chips', url: 'https://news.mit.edu/chips', snippet: 'Scalable superconducting quantum chips.' },
        ],
        engine: 'duckduckgo+arxiv',
      })

      proxyText.mockResolvedValue(`
        <html>
          <body>
            <h1>Quantum Computing Milestones</h1>
            <p>Researchers have achieved a 99.9% fidelity threshold in superconducting qubits across 1000 qubits.</p>
            <p>Surface code error correction suppresses thermal noise significantly.</p>
            <table>
              <tr><th>Metric</th><th>2024</th><th>2026 Target</th></tr>
              <tr><td>Physical Qubits</td><td>433</td><td>1000</td></tr>
            </table>
          </body>
        </html>
      `)

      const res = await researchTool.execute({ query: 'quantum computing progress', depth: 2 })
      expect(res.success).toBe(true)
      expect(res.tool).toBe('deep_research')
      expect(res.pages.length).toBeGreaterThan(0)
      expect(res.confidence).toBeDefined()
      expect(res.executive_summary).toBeDefined()
      expect(res.executive_summary).toContain('Executive Research Synthesis')
      expect(res.structured_tables).toBeDefined()
      expect(res.structured_tables.length).toBeGreaterThan(0)
    })
  })
})
