// @vitest-environment node
/**
 * Sprint 2 Performance & Trust gate.
 *
 * Heavy tools (Pyodide, Tesseract, video encode) must not run on the main
 * thread and must not ride the initial bundle. This pins the mechanism:
 * worker-first execution with transferables, dynamic imports at the tool
 * boundary, and dedicated vite chunks — so a future static import cannot
 * silently re-jank the UI or re-bloat first paint.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { lazyTool, HEAVY_TOOL_MODULES, HEAVY_CHUNK_BUDGET_KB } from './tools/heavyLazy'

const SRC = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8')

describe('lazyTool', () => {
  it('resolves through the dynamically loaded executor', async () => {
    const tool = lazyTool({ description: 't', parameters: {} }, async () => ({
      execute: async (args) => ({ ok: true, args }),
    }))
    await expect(tool.execute({ a: 1 })).resolves.toEqual({ ok: true, args: { a: 1 } })
  })
  it('throws honestly when the module has no execute()', async () => {
    const tool = lazyTool({ description: 't' }, async () => ({}))
    await expect(tool.execute({})).rejects.toThrow(/no execute/)
  })
  it('rejects a missing loader up front', () => {
    expect(() => lazyTool(null)).toThrow()
  })
})

describe('heavy-tool registry', () => {
  it('pins the async-chunked modules so drift is visible', () => {
    for (const m of ['tools/codeExec', 'tools/ocr', 'tools/videoRender']) {
      expect(HEAVY_TOOL_MODULES).toContain(m)
    }
    expect(HEAVY_CHUNK_BUDGET_KB).toBeLessThanOrEqual(900)
  })
})

describe('bundle gate: no heavy static imports on the hot path', () => {
  it('codeExec runs worker-first, main thread is fallback-only', () => {
    const src = read('tools/codeExec.js')
    expect(src).toContain('pyodideWorkerClient')
    expect(src).toContain('runInWorker')
    // Worker path returns before the main-thread fallback ever loads Pyodide.
    expect(src.indexOf('runInWorker(code')).toBeLessThan(src.indexOf('py = await getPyodide()'))
  })
  it('ocr loads its vision pipeline dynamically, never at import time', () => {
    const src = read('tools/ocr.js')
    expect(src).not.toMatch(/^import .*vision\/imageStats/m)
    expect(src).not.toMatch(/^import .*vision\/preprocess/m)
    expect(src).toContain("import('../vision/imageStats')")
    expect(src).toContain("import('../vision/preprocess')")
  })
  it('videoRender loads draw/encode/speech dynamically, never at import time', () => {
    const src = read('tools/videoRender.js')
    expect(src).not.toMatch(/^import .*video\/encode/m)
    expect(src).not.toMatch(/^import .*video\/draw/m)
    expect(src).toContain("import('../video/encode')")
    expect(src).toContain("import('../video/draw')")
    expect(src).toContain("import('../video/speech')")
  })
  it('vite splits heavy engines into dedicated chunks', () => {
    const cfg = fs.readFileSync(path.join(SRC, '..', 'vite.config.js'), 'utf8')
    for (const chunk of ['code-exec', 'ocr-tools', 'video-pipeline', 'heavy-workers']) {
      expect(cfg).toContain(chunk)
    }
  })
  it('the heavy worker speaks postMessage with transferables + stateful kernel', () => {
    const worker = fs.readFileSync(path.join(SRC, '..', 'public', 'worker-heavy.js'), 'utf8')
    expect(worker).toContain('postMessage')
    expect(worker).toContain('onmessage')
    // Stateful: the engine persists across calls (no per-call re-download).
    expect(worker).toMatch(/tesseractPromise|let .* = null/)
    expect(worker).toContain('reset')
  })
})

describe('heavy worker client (no-Worker env)', () => {
  it('fails honestly with workerUnavailable instead of crashing', async () => {
    const client = await import('./workers/heavyToolsWorkerClient')
    expect(client.workerSupported()).toBe(false)
    expect(client.getHeavyWorker()).toBeNull()
    await expect(client.callHeavyWorker('ping')).rejects.toMatchObject({ workerUnavailable: true })
  })
  it('pyodide worker client fails the same honest way', async () => {
    const client = await import('./workers/pyodideWorkerClient')
    expect(client.pyodideWorkerSupported()).toBe(false)
    await expect(client.runPyodideInWorker('1+1')).rejects.toMatchObject({ workerUnavailable: true })
  })
})
