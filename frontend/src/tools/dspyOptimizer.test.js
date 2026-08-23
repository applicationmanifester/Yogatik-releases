import { describe, it, expect } from 'vitest'
import {
  parseSignature,
  compileZeroShotPrompt,
  compileFewShotPrompt,
  proposeInstructionCandidates,
  evaluatePromptMetric,
  dspyOptimizerTool,
} from './dspyOptimizer'

describe('DSPy Optimizer & Prompt Compiler', () => {
  it('parses valid DSPy signatures', () => {
    const sig = parseSignature('context, question -> answer, confidence')
    expect(sig.inputs).toEqual(['context', 'question'])
    expect(sig.outputs).toEqual(['answer', 'confidence'])
  })

  it('throws on invalid DSPy signatures', () => {
    expect(() => parseSignature('invalid_without_arrow')).toThrow()
  })

  it('compiles zero-shot structured prompts', () => {
    const prompt = compileZeroShotPrompt('query -> sql_query', 'Translate natural language to SQL')
    expect(prompt).toContain('Task Instructions: Translate natural language to SQL')
    expect(prompt).toContain('query: [QUERY]')
    expect(prompt).toContain('sql_query: [Generated sql_query]')
  })

  it('compiles few-shot prompts with demonstrations and CoT', () => {
    const compiled = compileFewShotPrompt({
      signature: 'question -> answer',
      taskDescription: 'Solve math riddles',
      examples: [
        { question: 'What is 2+2?', reasoning: 'Add numbers directly.', answer: '4' },
      ],
      constraints: ['No external web lookups', 'Output integer values'],
    })

    expect(compiled).toContain('--- DEMONSTRATIONS (FEW-SHOT EXAMPLES) ---')
    expect(compiled).toContain('question: What is 2+2?')
    expect(compiled).toContain('rationale: Add numbers directly.')
    expect(compiled).toContain('answer: 4')
    expect(compiled).toContain('Operational Constraints:')
    expect(compiled).toContain('1. No external web lookups')
  })

  it('proposes MIPRO instruction candidates', () => {
    const proposals = proposeInstructionCandidates('Summarize financial earnings', 'finance')
    expect(proposals.length).toBe(4)
    expect(proposals.some((p) => p.style === 'Direct & Concise')).toBe(true)
    expect(proposals.some((p) => p.style === 'Expert Domain Practitioner')).toBe(true)
  })

  it('evaluates responses against quantitative criteria', () => {
    const validResponse = `rationale: Analyzed the quarterly revenue growth.\nanswer: Total revenue increased by 14%.`
    const evalResult = evaluatePromptMetric(validResponse, {
      requiredFields: ['rationale', 'answer'],
      expectedKeywords: ['revenue', '14%'],
      maxWords: 50,
    })

    expect(evalResult.passed).toBe(true)
    expect(evalResult.score).toBeGreaterThanOrEqual(0.8)
    expect(evalResult.findings.length).toBe(0)
  })

  it('executes via dspyOptimizerTool.execute', async () => {
    const res = await dspyOptimizerTool.execute({
      action: 'compile_signature',
      signature: 'doc -> summary',
      taskDescription: 'Extract key points',
    })
    expect(res.signature.inputs).toEqual(['doc'])
    expect(res.compiledPrompt).toContain('summary: [Generated summary]')
  })
})
