import { describe, it, expect } from 'vitest'
import {
  calculateTokenCost,
  createTrace,
  recordSpan,
  endTrace,
  exportToLangSmithSchema,
  langsmithObservabilityTool,
} from './langsmithObservability'

describe('LangSmith Observability & Tracing Engine', () => {
  it('calculates token costs accurately based on model pricing', () => {
    const cost = calculateTokenCost('gpt-4o-mini', 1_000_000, 1_000_000)
    // 0.15 + 0.6 = 0.75 USD
    expect(cost).toBe(0.75)
  })

  it('creates, records spans, and closes a trace run', () => {
    const trace = createTrace({ name: 'code_refactoring_agent' })
    expect(trace.id).toBeDefined()
    expect(trace.status).toBe('running')

    const span1 = recordSpan(trace.id, {
      name: 'fetch_git_status',
      runType: 'tool',
      durationMs: 120,
    })
    expect(span1.id).toBeDefined()

    const span2 = recordSpan(trace.id, {
      name: 'generate_patch',
      runType: 'llm',
      model: 'gpt-4o',
      promptTokens: 500,
      completionTokens: 200,
      durationMs: 850,
    })
    expect(span2.costUsd).toBeGreaterThan(0)

    const finalized = endTrace(trace.id, 'success', { result: 'Patch applied successfully' })
    expect(finalized.status).toBe('success')
    expect(finalized.spans.length).toBe(2)
    expect(finalized.totalPromptTokens).toBe(500)
    expect(finalized.totalCompletionTokens).toBe(200)
  })

  it('exports traces in LangSmith-compatible JSON schema', () => {
    const trace = createTrace({ name: 'qa_agent_test' })
    recordSpan(trace.id, { name: 'tool_call', runType: 'tool' })
    endTrace(trace.id, 'success')

    const exported = exportToLangSmithSchema(trace.id)
    expect(exported.run_type).toBe('chain')
    expect(exported.child_runs.length).toBe(1)
    expect(exported.child_runs[0].name).toBe('tool_call')
  })

  it('executes via langsmithObservabilityTool.execute', async () => {
    const res = await langsmithObservabilityTool.execute({
      action: 'calculate_cost',
      model: 'claude-3-5-sonnet',
      promptTokens: 100_000,
      completionTokens: 20_000,
    })

    expect(res.estimatedCostUsd).toBeGreaterThan(0)
  })
})
