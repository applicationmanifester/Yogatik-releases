/**
 * Local Inference & Serving Engine Tool
 *
 * Provides probing, discovery, model management, latency/throughput benchmarking,
 * and OpenAI-compatible completion bridges for:
 * - Ollama (default: http://127.0.0.1:11434)
 * - LM Studio (default: http://127.0.0.1:1234)
 * - vLLM (default: http://127.0.0.1:8000)
 * - Llama.cpp Server (default: http://127.0.0.1:8080)
 * - SGLang (default: http://127.0.0.1:30000)
 */

export const INFERENCE_PROVIDERS = {
  ollama: {
    name: 'Ollama',
    defaultUrl: 'http://127.0.0.1:11434',
    tagsEndpoint: '/api/tags',
    chatEndpoint: '/api/chat',
    generateEndpoint: '/api/generate',
    type: 'ollama',
  },
  lmstudio: {
    name: 'LM Studio',
    defaultUrl: 'http://127.0.0.1:1234',
    tagsEndpoint: '/v1/models',
    chatEndpoint: '/v1/chat/completions',
    generateEndpoint: '/v1/completions',
    type: 'openai_compatible',
  },
  vllm: {
    name: 'vLLM',
    defaultUrl: 'http://127.0.0.1:8000',
    tagsEndpoint: '/v1/models',
    chatEndpoint: '/v1/chat/completions',
    generateEndpoint: '/v1/completions',
    type: 'openai_compatible',
  },
  llamacpp: {
    name: 'llama.cpp Server',
    defaultUrl: 'http://127.0.0.1:8080',
    tagsEndpoint: '/v1/models',
    healthEndpoint: '/health',
    chatEndpoint: '/v1/chat/completions',
    generateEndpoint: '/completion',
    type: 'llamacpp',
  },
  sglang: {
    name: 'SGLang',
    defaultUrl: 'http://127.0.0.1:30000',
    tagsEndpoint: '/v1/models',
    chatEndpoint: '/v1/chat/completions',
    generateEndpoint: '/generate',
    type: 'sglang',
  },
}

/**
 * Probes a local inference endpoint to verify connectivity, latency, and available models
 */
export async function probeInferenceServer(providerKey = 'ollama', baseUrl = null, timeoutMs = 3000) {
  const provider = INFERENCE_PROVIDERS[providerKey.toLowerCase()]
  if (!provider) {
    return {
      success: false,
      error: `Unknown provider '${providerKey}'. Valid options: ${Object.keys(INFERENCE_PROVIDERS).join(', ')}`,
    }
  }

  const rootUrl = (baseUrl || provider.defaultUrl).replace(/\/+$/, '')
  const startTime = Date.now()

  let timer = null
  try {
    const controller = new AbortController()
    timer = setTimeout(() => controller.abort(), timeoutMs)

    const probeEndpoint = `${rootUrl}${provider.tagsEndpoint}`
    const res = await fetch(probeEndpoint, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    })

    const latencyMs = Date.now() - startTime

    if (!res.ok) {
      return {
        success: false,
        provider: provider.name,
        baseUrl: rootUrl,
        statusCode: res.status,
        latencyMs,
        error: `HTTP ${res.status}: ${res.statusText}`,
      }
    }

    const data = await res.json()
    let models = []

    if (provider.type === 'ollama' && Array.isArray(data.models)) {
      models = data.models.map((m) => ({
        id: m.name || m.model,
        sizeBytes: m.size || 0,
        digest: m.digest?.slice(0, 12),
        modifiedAt: m.modified_at,
        family: m.details?.family || 'unknown',
        parameterSize: m.details?.parameter_size || 'unknown',
        quantizationLevel: m.details?.quantization_level || 'unknown',
      }))
    } else if (Array.isArray(data.data)) {
      models = data.data.map((m) => ({
        id: m.id,
        created: m.created ? new Date(m.created * 1000).toISOString() : null,
        ownedBy: m.owned_by || 'local',
      }))
    } else if (Array.isArray(data.models)) {
      models = data.models.map((m) => ({ id: typeof m === 'string' ? m : m.id || m.name }))
    }

    return {
      success: true,
      provider: provider.name,
      baseUrl: rootUrl,
      online: true,
      latencyMs,
      modelCount: models.length,
      models,
    }
  } catch (err) {
    const latencyMs = Date.now() - startTime
    const isTimeout = err.name === 'AbortError'
    return {
      success: false,
      provider: provider.name,
      baseUrl: rootUrl,
      online: false,
      latencyMs,
      error: isTimeout ? `Timeout after ${timeoutMs}ms (server offline or unreachable)` : err.message,
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Benchmark a local model's throughput (eval tokens per second) and response latency
 */
export async function benchmarkInference({
  providerKey = 'ollama',
  baseUrl = null,
  model = 'llama3',
  prompt = 'Explain the concept of recursion in computer science in exactly 3 concise bullet points.',
  maxTokens = 128,
  temperature = 0.2,
}) {
  const provider = INFERENCE_PROVIDERS[providerKey.toLowerCase()]
  if (!provider) {
    return { success: false, error: `Invalid provider: ${providerKey}` }
  }

  const rootUrl = (baseUrl || provider.defaultUrl).replace(/\/+$/, '')
  const startTime = Date.now()

  try {
    if (provider.type === 'ollama') {
      const res = await fetch(`${rootUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            num_predict: maxTokens,
            temperature,
          },
        }),
      })

      if (!res.ok) {
        throw new Error(`Ollama request failed with HTTP ${res.status}: ${res.statusText}`)
      }

      const result = await res.json()
      const totalTimeMs = Date.now() - startTime
      const evalCount = result.eval_count || 0
      const evalDurationNs = result.eval_duration || (totalTimeMs * 1_000_000)
      const tokensPerSecond = evalDurationNs > 0 ? (evalCount / (evalDurationNs / 1_000_000_000)) : 0

      return {
        success: true,
        provider: provider.name,
        model,
        promptTokens: result.prompt_eval_count || 0,
        completionTokens: evalCount,
        totalTimeMs,
        tokensPerSec: Number(tokensPerSecond.toFixed(2)),
        responseSample: (result.response || '').trim(),
      }
    } else {
      // OpenAI-compatible endpoint (LM Studio, vLLM, llama.cpp)
      const res = await fetch(`${rootUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
          temperature,
        }),
      })

      if (!res.ok) {
        throw new Error(`Inference request failed with HTTP ${res.status}: ${res.statusText}`)
      }

      const result = await res.json()
      const totalTimeMs = Date.now() - startTime
      const usage = result.usage || {}
      const completionTokens = usage.completion_tokens || maxTokens
      const tokensPerSecond = totalTimeMs > 0 ? (completionTokens / (totalTimeMs / 1000)) : 0

      const choice = result.choices?.[0]
      const text = choice?.message?.content || choice?.text || ''

      return {
        success: true,
        provider: provider.name,
        model,
        promptTokens: usage.prompt_tokens || 0,
        completionTokens,
        totalTimeMs,
        tokensPerSec: Number(tokensPerSecond.toFixed(2)),
        responseSample: text.trim(),
      }
    }
  } catch (err) {
    return {
      success: false,
      provider: provider.name,
      model,
      error: err.message,
      totalTimeMs: Date.now() - startTime,
    }
  }
}

/**
 * Tool definition for Yogatik Tool Registry
 */
export const localInferenceTool = {
  name: 'local_inference',
  description: 'Probes, manages, tests, and benchmarks local LLM inference engines including Ollama, LM Studio, vLLM, llama.cpp, and SGLang.',
  schema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['probe', 'probe_all', 'benchmark', 'list_models'],
        description: 'Action to perform: probe endpoint, probe all local providers, benchmark performance, or list installed models.',
      },
      provider: {
        type: 'string',
        enum: ['ollama', 'lmstudio', 'vllm', 'llamacpp', 'sglang'],
        description: 'Target inference provider (default: ollama).',
      },
      baseUrl: {
        type: 'string',
        description: 'Optional custom base URL (e.g. http://127.0.0.1:11434).',
      },
      model: {
        type: 'string',
        description: 'Model name to test/benchmark (e.g. llama3.2, mistral, qwen2.5-coder).',
      },
      prompt: {
        type: 'string',
        description: 'Optional prompt for benchmarking.',
      },
      maxTokens: {
        type: 'integer',
        description: 'Maximum generation tokens for benchmark (default: 100).',
      },
    },
    required: ['action'],
  },
  async execute(args) {
    const { action = 'probe', provider = 'ollama', baseUrl, model = 'llama3', prompt, maxTokens = 100 } = args

    if (action === 'probe_all') {
      const results = {}
      for (const key of Object.keys(INFERENCE_PROVIDERS)) {
        results[key] = await probeInferenceServer(key, null, 1500)
      }
      const onlineCount = Object.values(results).filter((r) => r.online).length
      return {
        summary: `Scanned 5 local inference engines: ${onlineCount} online.`,
        providers: results,
      }
    }

    if (action === 'probe' || action === 'list_models') {
      return await probeInferenceServer(provider, baseUrl)
    }

    if (action === 'benchmark') {
      return await benchmarkInference({
        providerKey: provider,
        baseUrl,
        model,
        prompt: prompt || 'Explain quantum computing in 2 simple sentences.',
        maxTokens,
      })
    }

    return { error: `Unsupported action '${action}'. Use 'probe', 'probe_all', 'list_models', or 'benchmark'.` }
  },
}
