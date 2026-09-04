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
import { weatherTool } from './weather'

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
    // The real terminal:exec handler (electron/main.cjs, delegating to the
    // shared runBlock) reports a pre-flight failure via `error`, with
    // exitCode left null — NOT via stderr with exitCode -1. That was true of
    // an older implementation this mock used to match; -1 now means the
    // OPPOSITE (a command that DID run and was force-killed but never
    // confirmed dead — see the next describe block).
    withBridge({ success: false, exitCode: null, stdout: '', stderr: '', error: 'No working folder for this chat.', killed: false })
    const { terminalRunTool } = await import('./terminalRun')
    const r = await terminalRunTool.execute({ command: 'ls' })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/working folder/i)
  })

  it('exitCode -1 means force-killed-but-unconfirmed, not "never started"', async () => {
    withBridge({ success: false, exitCode: -1, stdout: 'partial output', stderr: '', killed: true })
    const { terminalRunTool } = await import('./terminalRun')
    const r = await terminalRunTool.execute({ command: 'some-stubborn-command' })
    expect(r.success).toBe(false)
    expect(r.error).not.toMatch(/could not be started/i)
    expect(r.error).toMatch(/force-killed/i)
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


describe('weather card contract', () => {
  /**
   * The card printed "°C" and "km/h" as literal text in the markup. That was
   * true only while the request was always metric — the moment units follow the
   * user's region, hardcoded labels turn a correct 72°F reading into "72°C".
   * The units have to travel with the numbers.
   */
  const ORIGINAL_FETCH = globalThis.fetch

  afterEach(() => { globalThis.fetch = ORIGINAL_FETCH })

  it('returns the unit labels the card renders', async () => {
    globalThis.fetch = vi.fn(async (url) => ({
      json: async () => (String(url).includes('geocoding')
        ? { results: [{ latitude: 1, longitude: 2, name: 'Testville', country: 'Testland' }] }
        : {
          current: {
            temperature_2m: 72, apparent_temperature: 70, relative_humidity_2m: 40,
            wind_speed_10m: 8, weather_code: 0,
          },
          daily: {
            time: ['2026-08-25'], weather_code: [0],
            temperature_2m_max: [75], temperature_2m_min: [60],
          },
        }),
    }))

    const r = await weatherTool.execute({ location: 'Testville', units: 'imperial' })
    expect(r.success).toBe(true)
    // The card reads exactly these two, with metric fallbacks.
    expect(r.temperature_unit).toBe('°F')
    expect(r.wind_unit).toBe('mph')
    expect(primitive(r.temperature_unit)).toBe(true)
    expect(primitive(r.wind_unit)).toBe(true)

    // And the request actually asked the API for those units, rather than
    // relabelling metric numbers — which would be worse than the old bug.
    const called = globalThis.fetch.mock.calls.map(c => String(c[0])).join(' ')
    expect(called).toContain('temperature_unit=fahrenheit')
    expect(called).toContain('wind_speed_unit=mph')
  })

  it('asks for metric when the caller says metric', async () => {
    globalThis.fetch = vi.fn(async (url) => ({
      json: async () => (String(url).includes('geocoding')
        ? { results: [{ latitude: 1, longitude: 2, name: 'X', country: 'Y' }] }
        : {
          current: { temperature_2m: 20, apparent_temperature: 19, relative_humidity_2m: 50, wind_speed_10m: 5, weather_code: 0 },
          daily: { time: ['2026-08-25'], weather_code: [0], temperature_2m_max: [22], temperature_2m_min: [15] },
        }),
    }))
    const r = await weatherTool.execute({ location: 'X', units: 'metric' })
    expect(r.temperature_unit).toBe('°C')
    expect(r.wind_unit).toBe('km/h')
  })
})
