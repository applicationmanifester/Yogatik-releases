/**
 * ToolResultCard contract.
 *
 * Every branch in ToolResultCard reads specific FIELD NAMES off the tool result.
 * When a tool stops returning one, nothing throws at build time: the card renders
 * an empty box, or — if the field holds an object — React #31 takes down the whole
 * app (that is exactly how the diff card crashed it). These tests pin the fields
 * each card actually reads, so drift fails here instead of in production.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { diffTool } from './diff'
import { unitConvertTool } from './unitConvert'
import { hashTool } from './hash'
import { docListTool } from './documents'

// Every value the card puts in JSX text position must be a primitive.
const primitive = (v) => v === undefined || v === null || ['string', 'number', 'boolean'].includes(typeof v)

describe('diff card contract', () => {
  it('reports similarity as a percentage, not a ratio', async () => {
    const r = await diffTool.execute({ text1: 'a\nb\nc', text2: 'a\nb\nc' })
    expect(r.similarity).toBeGreaterThan(1)
    expect(r.similarity).toBeLessThanOrEqual(100)
  })

  it('returns structured hunks, and every scalar the card renders is a primitive', async () => {
    const r = await diffTool.execute({ text1: 'one\ntwo', text2: 'one\nTWO' })
    expect(r.success).toBe(true)
    expect(Array.isArray(r.diff)).toBe(true)
    expect(r.changes).toBe(1)
    // `changes` and `similarity` go straight into the header text.
    expect(primitive(r.changes)).toBe(true)
    expect(primitive(r.similarity)).toBe(true)
    // `diff` is an ARRAY — the card must format it, never render it directly.
    expect(primitive(r.diff)).toBe(false)
  })
})

describe('unit_convert card contract', () => {
  it('returns the formatted string the card shows and copies', async () => {
    const r = await unitConvertTool.execute({ value: 5, from: 'km', to: 'm' })
    expect(r.success).toBe(true)
    expect(r.result).toBe(5000)
    for (const f of ['formatted', 'output', 'formula', 'explanation']) {
      expect(typeof r[f], `missing ${f}`).toBe('string')
      expect(r[f].length).toBeGreaterThan(0)
    }
  })

  it('handles function conversions (temperature) without losing the formatted text', async () => {
    const r = await unitConvertTool.execute({ value: 100, from: 'c', to: 'f' })
    expect(r.result).toBe(212)
    expect(r.formatted).toContain('212')
  })

  it('fails cleanly with an error the error card can show', async () => {
    const r = await unitConvertTool.execute({ value: 1, from: 'km', to: 'kg' })
    expect(r.success).toBe(false)
    expect(typeof r.error).toBe('string')
  })
})

describe('hash card contract', () => {
  it('returns input_length for the card meta line', async () => {
    const r = await hashTool.execute({ text: 'hello', algorithm: 'sha256' })
    expect(r.success).toBe(true)
    expect(r.input_length).toBe(5)
    expect(typeof r.result).toBe('string')
  })
})

describe('doc_list card contract', () => {
  afterEach(() => { vi.resetModules() })

  it('survives a document row saved without a chunks array', async () => {
    vi.resetModules()
    vi.doMock('../db', () => ({
      getDocuments: async () => [
        { name: 'ok.pdf', type: 'pdf', chars: 10, chunks: [1, 2], createdAt: Date.now() },
        { name: 'legacy.txt', type: 'txt', chars: 4, createdAt: Date.now() }, // no chunks
      ],
      getSetting: async () => null,
    }))
    const { docListTool: tool } = await import('./documents')
    const r = await tool.execute({})
    expect(r.success).toBe(true)
    expect(r.count).toBe(2)
    expect(r.documents[1].chunks).toBe(0)
    for (const d of r.documents) expect(primitive(d.chunks)).toBe(true)
  })

  it('is registered with an execute function', () => {
    expect(typeof docListTool.execute).toBe('function')
  })
})

describe('translate card contract', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ responseStatus: 200, responseData: { translatedText: 'hola', match: 1 } }),
    })))
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('returns the source_text/source_lang/target_lang the card renders', async () => {
    const { translateTool } = await import('./translate')
    const r = await translateTool.execute({ text: 'hello', target: 'es', source: 'en' })
    expect(r.success).toBe(true)
    expect(r.source_text).toBe('hello')
    expect(r.source_lang).toBe('en')
    expect(r.target_lang).toBe('es')
    // The originals stay for the model / older consumers.
    expect(r.original).toBe('hello')
    expect(r.target).toBe('es')
  })
})

describe('terminal_run card contract', () => {
  afterEach(() => {
    delete window.__TAURI__
    delete window.__YOGATIK_ELECTRON__
    delete window.__YOGATIK_TERMINAL__
  })

  // Set the bridges on the real jsdom window — replacing `window` wholesale
  // breaks every other module that touched it first.
  const withBridge = (res) => {
    window.__YOGATIK_ELECTRON__ = true
    window.__TAURI__ = { core: { invoke: vi.fn() } }   // isDesktop() reads this
    window.__YOGATIK_TERMINAL__ = { exec: vi.fn(async () => res) }
  }

  it('a non-zero exit is a RESULT, not a tool failure', async () => {
    withBridge({ success: false, exitCode: 1, stdout: 'ran', stderr: 'boom', killed: false })
    const { terminalRunTool } = await import('./terminalRun')
    const r = await terminalRunTool.execute({ command: 'exit 1' })
    expect(r.success).toBe(true)
    expect(r.exitCode).toBe(1)
    expect(r.stderr).toBe('boom')
  })

  it('a command that never started carries an `error` — never "Unknown error"', async () => {
    withBridge({ success: false, exitCode: -1, stdout: '', stderr: 'No working folder for this chat.', killed: false })
    const { terminalRunTool } = await import('./terminalRun')
    const r = await terminalRunTool.execute({ command: 'ls' })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/working folder/i)
  })

  it('explains a timeout instead of reporting an empty result', async () => {
    withBridge({ success: false, exitCode: null, stdout: 'partial', stderr: '', killed: true })
    const { terminalRunTool } = await import('./terminalRun')
    const r = await terminalRunTool.execute({ command: 'sleep 999', timeout: 1000 })
    expect(r.success).toBe(true)
    expect(r.killed).toBe(true)
    expect(r.note).toMatch(/proc_start/)
  })
})
