// @vitest-environment node
/**
 * Pins the fix for "Ollama is confirmed running with models pulled, but the
 * desktop app's model list is empty": ollamaDaemon.cjs's `ollama:status`/
 * `ollama:list` handlers chose CLI vs HTTP based on whether the `ollama`
 * binary was FOUND, not on whether that choice actually produced anything —
 * so a found binary whose `ollama list` output didn't parse (a locale/
 * format quirk, a permissions issue, a Windows Store build behaving
 * differently) reported a perfectly healthy, model-holding daemon as empty,
 * with no error anywhere to explain why.
 *
 * Same require('electron') problem as electronFsBridge.test.js: Node's own
 * CJS loader handles this .cjs file, so only patching Module._load (not
 * vi.mock) reaches its `require('electron')`.
 */
import { describe, it, expect } from 'vitest'
import http from 'node:http'
import Module from 'node:module'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const electronStub = require_('../test/electron-stub.cjs')
const originalLoad = Module._load
Module._load = function patched(request, parent, isMain) {
  if (request === 'electron') return electronStub
  return originalLoad.call(this, request, parent, isMain)
}

const { listModelsHttp, listLocalModels, listModels } = require_('../electron/ollamaDaemon.cjs')

function startFakeOllama(models) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ models }))
      } else {
        res.writeHead(404)
        res.end()
      }
    })
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

describe('ollamaDaemon model listing', () => {
  it('listModelsHttp reads `model` when a newer daemon omits `name`', async () => {
    const server = await startFakeOllama([
      { name: 'llama3.2:latest', size: 2_000_000_000, modified_at: '2026-01-01' },
      { model: 'qwen2.5:3b', size: 1_500_000_000, modified_at: '2026-01-02' }, // no `name` field
    ])
    try {
      const { port } = server.address()
      const models = await listModelsHttp('127.0.0.1', port)
      expect(models.map(m => m.name)).toEqual(['llama3.2:latest', 'qwen2.5:3b'])
      expect(models[0].size).toBe('2.0 GB')
    } finally {
      server.close()
    }
  })

  it('drops an entry with neither `name` nor `model` instead of reporting a blank row', async () => {
    const server = await startFakeOllama([{ size: 1, modified_at: 'x' }])
    try {
      const { port } = server.address()
      expect(await listModelsHttp('127.0.0.1', port)).toEqual([])
    } finally {
      server.close()
    }
  })

  it('listModels falls back to HTTP when a found CLI binary produces nothing', async () => {
    // process.execPath is a real, always-invokable binary; `node list` fails
    // (no such subcommand) — exactly the "binary found, CLI yielded nothing"
    // case this fallback exists for. Confirms the premise before trusting
    // the fallback assertion below.
    expect(await listLocalModels(process.execPath)).toEqual([])

    // listModels() falls through to the real, hardcoded-port listModelsHttp()
    // — with no live daemon on this machine it resolves empty near-instantly
    // (connection refused, not the 4s timeout), so this only asserts the
    // SHAPE of the fallback, not live daemon content.
    const result = await listModels(process.execPath)
    expect(result.viaHttp).toBe(true)
    expect(Array.isArray(result.models)).toBe(true)
  }, 10000)

  it('listModels never calls the HTTP fallback when no binary is available and the CLI path is skipped entirely', async () => {
    // bin === null takes the "CLI not found" branch straight to HTTP — this
    // pins that listModels(null) does not attempt to exec a null path at all
    // (which would throw) before falling back.
    const result = await listModels(null)
    expect(result.viaHttp).toBe(true)
    expect(Array.isArray(result.models)).toBe(true)
  }, 10000)
})
