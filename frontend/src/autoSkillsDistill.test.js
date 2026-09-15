import { describe, it, expect } from 'vitest'
import { distillWorkflowToSkillMarkdown } from './autoSkills'

describe('Auto-Skill Workflow Distillation Engine', () => {
  it('formats an auto-skill candidate into a compliant SKILL.md document', () => {
    const candidate = {
      id: 'auto_test_123',
      name: 'Legal Contract Review Specialist',
      description: 'Auto-generated from a successful legal contract review session',
      system: 'You are a meticulous legal analyst. Analyze clauses for indemnity and jurisdiction.',
      tools: ['doc_search', 'pdf_extract', 'doc_generator'],
      starters: ['Audit this NDA for non-standard liabilities', 'Extract indemnification clauses'],
      confidence: 0.92,
      createdAt: '2026-09-15T22:00:00.000Z',
    }

    const md = distillWorkflowToSkillMarkdown(candidate)

    expect(md).toContain('name: legal-contract-review-specialist')
    expect(md).toContain('tools: [doc_search, pdf_extract, doc_generator]')
    expect(md).toContain('confidence: 0.92')
    expect(md).toContain('# Legal Contract Review Specialist')
    expect(md).toContain('## System Instructions')
    expect(md).toContain('You are a meticulous legal analyst')
    expect(md).toContain('## Recommended Starters')
    expect(md).toContain('- `Audit this NDA for non-standard liabilities`')
  })

  it('handles sparse or minimal candidate gracefully', () => {
    const md = distillWorkflowToSkillMarkdown({})
    expect(md).toContain('name: custom-skill')
    expect(md).toContain('# Custom Skill')
  })

  it('returns empty string on null candidate', () => {
    expect(distillWorkflowToSkillMarkdown(null)).toBe('')
  })
})
