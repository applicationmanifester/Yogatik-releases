import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  INFERENCE_PROVIDERS,
  probeInferenceServer,
  benchmarkInference,
  localInferenceTool,
} from './localInference'

describe('Local Inference Tool & Engine Bridge', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('contains definitions for ollama, lmstudio, vllm, llamacpp, sglang', () => {
    expect(INFERENCE_PROVIDERS.ollama).toBeDefined()
    expect(INFERENCE_PROVIDERS.lmstudio).toBeDefined()
    expect(INFERENCE_PROVIDERS.vllm).toBeDefined()
    expect(INFERENCE_PROVIDERS.llamacpp).toBeDefined()
    expect(INFERENCE_PROVIDERS.sglang).toBeDefined()
  })

  it('handles offline / unreachable provider gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:11434'))

    const res = await probeInferenceServer('ollama', null, 500)
    expect(res.success).toBe(false)
    expect(res.online).toBe(false)
    expect(res.error).toContain('ECONNREFUSED')
  })

  it('correctly maps Ollama models when server is online', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        models: [
          {
            name: 'llama3:latest',
            size: 4661224676,
            digest: '365c0b3ced854203e87900b656360c788c0a87ef63bbd0a7a',
            details: {
              family: 'llama',
              parameter_size: '8.0B',
              quantization_level: 'Q4_0',
            },
          },
        ],
      }),
    })

    const res = await probeInferenceServer('ollama')
    expect(res.success).toBe(true)
    expect(res.online).toBe(true)
    expect(res.modelCount).toBe(1)
    expect(res.models[0].id).toBe('llama3:latest')
    expect(res.models[0].parameterSize).toBe('8.0B')
  })

  it('benchmarks Ollama generation speed', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        response: 'Recursion is a function calling itself.',
        eval_count: 50,
        eval_duration: 1_000_000_000, // 1 second in nanoseconds = 50 tok/s
        prompt_eval_count: 15,
      }),
    })

    const bench = await benchmarkInference({
      providerKey: 'ollama',
      model: 'llama3',
    })

    expect(bench.success).toBe(true)
    expect(bench.tokensPerSec).toBe(50)
    expect(bench.completionTokens).toBe(50)
    expect(bench.responseSample).toContain('Recursion')
  })

  it('executes tool actions via localInferenceTool.execute', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: 'gpt-oss-local' }] }),
    })

    const toolRes = await localInferenceTool.execute({
      action: 'list_models',
      provider: 'lmstudio',
    })

    expect(toolRes.success).toBe(true)
    expect(toolRes.models[0].id).toBe('gpt-oss-local')
  })
})
