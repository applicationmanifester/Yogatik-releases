import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import FDBFactory from 'fake-indexeddb/lib/FDBFactory'
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange'
import Dexie from 'dexie'

globalThis.indexedDB ??= new FDBFactory()
globalThis.IDBKeyRange ??= FDBKeyRange
Dexie.dependencies.indexedDB = globalThis.indexedDB
Dexie.dependencies.IDBKeyRange = globalThis.IDBKeyRange

import { queryProviderModels, fetchLiveModels } from './llm'
import { addProvider } from './api'
import * as db from './db'

describe('Dynamic Model Discovery & Validation Flow', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('queryProviderModels() in llm.js', () => {
    it('successfully queries live models from standard OpenAI-compatible endpoint', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: [
            { id: 'custom-model-2' },
            { id: 'custom-model-1' },
          ],
        }),
      })

      const customProv = {
        name: 'Custom Provider',
        baseUrl: 'https://api.customllm.com/v1',
        needsProxy: false,
      }

      const res = await queryProviderModels('custom', 'sk-test-key-123', customProv)

      expect(res.success).toBe(true)
      expect(res.models).toEqual(['custom-model-1', 'custom-model-2'])
      expect(res.defaultModel).toBe('custom-model-1')
    })

    it('routes through proxy with X-Target-URL when provider has needsProxy: true (e.g. NVIDIA NIM)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: [
            { id: 'meta/llama-3.3-70b-instruct' },
            { id: 'nvidia/llama-3.1-nemotron-70b-instruct' },
          ],
        }),
      })

      const nvidiaProv = {
        name: 'NVIDIA',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        needsProxy: true,
      }

      const res = await queryProviderModels('nvidia', 'nvapi-valid-key', nvidiaProv)

      expect(res.success).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [calledUrl, calledOptions] = fetchMock.mock.calls[0]
      expect(calledOptions.headers['X-Target-URL']).toBe('https://integrate.api.nvidia.com/v1/models')
      expect(calledOptions.headers['Authorization']).toBe('Bearer nvapi-valid-key')
      expect(res.models).toContain('meta/llama-3.3-70b-instruct')
    })

    it('sends appropriate headers for Anthropic direct provider', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: [
            { id: 'claude-3-7-sonnet-20250219' },
          ],
        }),
      })

      const anthropicProv = {
        name: 'Anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
        needsProxy: true,
        isAnthropic: true,
      }

      const res = await queryProviderModels('anthropic', 'sk-ant-test', anthropicProv)

      expect(res.success).toBe(true)
      const [, calledOptions] = fetchMock.mock.calls[0]
      expect(calledOptions.headers['x-api-key']).toBe('sk-ant-test')
      expect(calledOptions.headers['anthropic-version']).toBe('2023-06-01')
      expect(calledOptions.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    })

    it('returns structured error on 401 Unauthorized', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ error: { message: 'Incorrect API key provided' } }),
      })

      const res = await queryProviderModels('openai', 'sk-invalid-key')

      expect(res.success).toBe(false)
      expect(res.error).toMatch(/API key/i)
    })

    it('returns error when endpoint returns empty model list', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: [] }),
      })

      const customProv = {
        name: 'Empty Provider',
        baseUrl: 'https://api.empty.com/v1',
      }

      const res = await queryProviderModels('empty', 'sk-test', customProv)

      expect(res.success).toBe(false)
      expect(res.error).toMatch(/0 models/i)
    })
  })

  describe('addProvider() integration in api.js', () => {
    it('validates key and saves discovered models automatically', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          data: [{ id: 'dynamic-model-a' }, { id: 'dynamic-model-b' }],
        }),
      })

      const result = await addProvider({
        id: 'test-auto-provider',
        name: 'Test Provider',
        base_url: 'https://api.testprovider.com/v1',
        api_key: 'sk-test-valid',
      })

      expect(result.success).toBe(true)
      expect(result.models).toEqual(['dynamic-model-a', 'dynamic-model-b'])

      // Check DB settings were persisted
      const savedKey = await db.getSetting('apikey_test-auto-provider')
      expect(savedKey).toBe('sk-test-valid')

      const savedModels = await db.getSetting('models_test-auto-provider')
      expect(savedModels?.list).toEqual(['dynamic-model-a', 'dynamic-model-b'])

      const activeModel = await db.getSetting('model_test-auto-provider')
      expect(activeModel).toBe('dynamic-model-a')
    })

    it('refuses to add provider if connection check fails', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        text: async () => 'Unauthorized',
      })

      const result = await addProvider({
        id: 'broken-provider',
        name: 'Broken Provider',
        base_url: 'https://api.broken.com/v1',
        api_key: 'sk-bad-key',
      })

      expect(result.success).toBe(false)
      expect(result.error).toMatch(/Could not connect to Broken Provider/i)
    })
  })
})
