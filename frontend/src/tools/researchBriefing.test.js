import { describe, it, expect } from 'vitest'
import { generateStudyGuide, researchBriefingTool } from './researchBriefing'

describe('Research Briefing & NotebookLM Study Guide Suite', () => {
  it('generates executive summary, key takeaways, FAQs, and a 4-speaker discussion script', () => {
    const rawResearch = `
      Quantum computing utilizes qubits that can exist in multiple states simultaneously through superposition.
      Entanglement allows qubits to be correlated with one another, exponentially increasing computational bandwidth.
      However, quantum decoherence and thermal noise remain major engineering hurdles to fault-tolerant scaling.
      Cryogenic cooling and surface code error correction are the leading approaches to stabilizing quantum architectures.
    `
    const guide = generateStudyGuide(rawResearch, 'Quantum Computing Architecture')

    expect(guide.topic).toBe('Quantum Computing Architecture')
    expect(guide.keyTakeaways.length).toBeGreaterThan(0)
    expect(guide.faq.length).toBeGreaterThan(0)
    expect(guide.discussionScript.length).toBeGreaterThanOrEqual(4)

    const speakers = guide.discussionScript.map(s => s.speaker)
    expect(speakers).toContain('Host')
    expect(speakers).toContain('Expert')
    expect(speakers).toContain('Skeptic')
    expect(speakers).toContain('Clarifier')
  })

  it('researchBriefingTool executes cleanly with valid output', async () => {
    const res = await researchBriefingTool.execute({
      topic: 'Neural Memory Networks',
      content: 'Memory-augmented neural networks maintain external key-value stores for long-horizon planning.'
    })
    expect(res.success).toBe(true)
    expect(res.tool).toBe('research_briefing')
    expect(res.topic).toBe('Neural Memory Networks')
  })
})
