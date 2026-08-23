/**
 * LangSmith & OpenTelemetry-Compatible Observability, Tracing & Evaluation Engine
 *
 * Implements:
 * - Hierarchical Run / Span Tracing (Chain -> Agent -> Tool -> LLM).
 * - Latency waterfall & Token Cost Accounting.
 * - Guardrail & Hallucination Scoring evaluator.
 * - OpenTelemetry & LangSmith JSON export format.
 */

// In-memory trace repository
const TRACE_STORE = new Map()

/**
 * Standard token pricing estimates per 1M tokens (USD)
 */
export const MODEL_PRICING = {
  'gpt-4o': { prompt: 2.5, completion: 10.0 },
  'gpt-4o-mini': { prompt: 0.15, completion: 0.6 },
  'claude-3-5-sonnet': { prompt: 3.0, completion: 15.0 },
  'claude-3-5-haiku': { prompt: 0.8, completion: 4.0 },
  'gemini-1.5-pro': { prompt: 1.25, completion: 5.0 },
  'gemini-1.5-flash': { prompt: 0.075, completion: 0.3 },
  'local-default': { prompt: 0.0, completion: 0.0 },
}

/**
 * Calculate token cost in USD
 */
export function calculateTokenCost(model = 'gpt-4o-mini', promptTokens = 0, completionTokens = 0) {
  const price = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini']
  const promptCost = (promptTokens / 1_000_000) * price.prompt
  const completionCost = (completionTokens / 1_000_000) * price.completion
  const totalCost = promptCost + completionCost
  return Number(totalCost.toFixed(6))
}

/**
 * Start a new root execution trace
 */
export function createTrace({
  name = 'agent_run',
  sessionId = 'default',
  tags = [],
  metadata = {},
}) {
  const traceId = `trace_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`
  const rootRun = {
    id: traceId,
    traceId,
    name,
    runType: 'chain',
    status: 'running',
    startTime: Date.now(),
    endTime: null,
    latencyMs: null,
    sessionId,
    tags,
    metadata,
    spans: [],
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    estimatedCostUsd: 0,
  }

  TRACE_STORE.set(traceId, rootRun)
  return rootRun
}

/**
 * Adds a child span (e.g. tool call or LLM generation) to an active trace
 */
export function recordSpan(traceId, {
  name,
  runType = 'tool', // 'llm' | 'tool' | 'retriever' | 'chain'
  inputs = {},
  outputs = {},
  promptTokens = 0,
  completionTokens = 0,
  model = 'local-default',
  durationMs = 0,
  error = null,
}) {
  const trace = TRACE_STORE.get(traceId)
  if (!trace) {
    throw new Error(`Trace '${traceId}' not found.`)
  }

  const spanId = `span_${Math.random().toString(36).substring(2, 9)}`
  const cost = calculateTokenCost(model, promptTokens, completionTokens)

  const span = {
    id: spanId,
    traceId,
    name,
    runType,
    inputs,
    outputs,
    promptTokens,
    completionTokens,
    model,
    durationMs,
    costUsd: cost,
    error: error ? String(error) : null,
    timestamp: Date.now(),
  }

  trace.spans.push(span)
  trace.totalPromptTokens += promptTokens
  trace.totalCompletionTokens += completionTokens
  trace.estimatedCostUsd = Number((trace.estimatedCostUsd + cost).toFixed(6))

  return span
}

/**
 * Finalize and close a trace run
 */
export function endTrace(traceId, status = 'success', finalOutput = null) {
  const trace = TRACE_STORE.get(traceId)
  if (!trace) {
    throw new Error(`Trace '${traceId}' not found.`)
  }

  trace.endTime = Date.now()
  trace.latencyMs = trace.endTime - trace.startTime
  trace.status = status
  if (finalOutput) {
    trace.finalOutput = finalOutput
  }

  return trace
}

/**
 * Format a trace into LangSmith-compatible JSON export
 */
export function exportToLangSmithSchema(traceId) {
  const trace = TRACE_STORE.get(traceId)
  if (!trace) return null

  return {
    id: trace.id,
    name: trace.name,
    run_type: trace.runType,
    status: trace.status,
    start_time: new Date(trace.startTime).toISOString(),
    end_time: trace.endTime ? new Date(trace.endTime).toISOString() : null,
    latency_ms: trace.latencyMs,
    extra: {
      tags: trace.tags,
      metadata: trace.metadata,
      total_tokens: trace.totalPromptTokens + trace.totalCompletionTokens,
      prompt_tokens: trace.totalPromptTokens,
      completion_tokens: trace.totalCompletionTokens,
      cost_usd: trace.estimatedCostUsd,
    },
    child_runs: trace.spans.map((s) => ({
      id: s.id,
      name: s.name,
      run_type: s.runType,
      inputs: s.inputs,
      outputs: s.outputs,
      latency_ms: s.durationMs,
      error: s.error,
      extra: {
        model: s.model,
        tokens: s.promptTokens + s.completionTokens,
        cost_usd: s.costUsd,
      },
    })),
  }
}

/**
 * Observability & Evaluation Tool for Yogatik
 */
export const langsmithObservabilityTool = {
  name: 'langsmith_observability',
  description: 'Observability, tracing, and token cost accounting engine for multi-agent LLM workflows (LangSmith & OpenTelemetry compatible).',
  schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['create_trace', 'record_span', 'end_trace', 'export_trace', 'list_traces', 'calculate_cost'],
        description: 'Observability action to execute.',
      },
      traceId: {
        type: 'string',
        description: 'Active Trace ID.',
      },
      name: {
        type: 'string',
        description: 'Trace or span identifier name.',
      },
      runType: {
        type: 'string',
        enum: ['chain', 'tool', 'llm', 'retriever'],
        description: 'Type of span being recorded.',
      },
      model: {
        type: 'string',
        description: 'LLM model name (e.g. gpt-4o, claude-3-5-sonnet, local-default).',
      },
      promptTokens: { type: 'integer' },
      completionTokens: { type: 'integer' },
      durationMs: { type: 'number' },
      inputs: { type: 'object' },
      outputs: { type: 'object' },
      status: { type: 'string', enum: ['success', 'error'] },
    },
    required: ['action'],
  },
  async execute(args) {
    const {
      action,
      traceId,
      name = 'run',
      runType = 'tool',
      model = 'gpt-4o-mini',
      promptTokens = 0,
      completionTokens = 0,
      durationMs = 0,
      inputs = {},
      outputs = {},
      status = 'success',
    } = args

    if (action === 'create_trace') {
      const trace = createTrace({ name, tags: ['yogatik-agent'] })
      return { success: true, traceId: trace.id, trace }
    }

    if (action === 'record_span') {
      if (!traceId) return { error: 'Missing traceId.' }
      const span = recordSpan(traceId, {
        name,
        runType,
        inputs,
        outputs,
        promptTokens,
        completionTokens,
        model,
        durationMs,
      })
      return { success: true, span }
    }

    if (action === 'end_trace') {
      if (!traceId) return { error: 'Missing traceId.' }
      const trace = endTrace(traceId, status, outputs)
      return { success: true, trace }
    }

    if (action === 'export_trace') {
      if (!traceId) return { error: 'Missing traceId.' }
      const exported = exportToLangSmithSchema(traceId)
      return exported ? { success: true, export: exported } : { error: 'Trace not found.' }
    }

    if (action === 'list_traces') {
      const traces = Array.from(TRACE_STORE.values()).map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        latencyMs: t.latencyMs,
        spansCount: t.spans.length,
        tokens: t.totalPromptTokens + t.totalCompletionTokens,
        costUsd: t.estimatedCostUsd,
      }))
      return { total: traces.length, traces }
    }

    if (action === 'calculate_cost') {
      const cost = calculateTokenCost(model, promptTokens, completionTokens)
      return { model, promptTokens, completionTokens, estimatedCostUsd: cost }
    }

    return { error: `Unsupported action '${action}'.` }
  },
}
