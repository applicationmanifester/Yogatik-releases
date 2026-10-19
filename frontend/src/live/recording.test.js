import { describe, it, expect } from 'vitest'
import { jpegSize, toBytes, coalesceLiveCall, collectArtefacts, collectSources,
  createFrameSampler, MAX_FRAMES_PER_CALL, estimateStorage, bytesLabel, framesBudgetBytes,
  recordingFromCall, frameConsentMessage, ensureFrameConsent, hasFrameConsent,
  grantFrameConsent, revokeFrameConsent, setRecordingConsentPrompter,
  FRAME_MAX_EDGE, FRAME_QUALITY, FRAME_INTERVAL_MS } from './recording'

describe('jpegSize', () => {
  it('parses a valid baseline JPEG SOF0', () => {
    // Minimal valid JPEG header with SOF0 at offset 2, length 17, 8-bit, 100w x 200h
    const buf = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
      0x00, 0xc8, 0x00, 0x64, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9
    ])
    const b64 = btoa(String.fromCharCode(...buf))
    // JPEG stores height at bytes 7-8 (0xc8=200), width at bytes 9-10 (0x64=100)
    expect(jpegSize(b64)).toEqual({ w: 100, h: 200 })
  })
  it('handles dataURL prefix', () => {
    const buf = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08,
      0x00, 0xc8, 0x00, 0x64, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9
    ])
    const b64 = 'data:image/jpeg;base64,' + btoa(String.fromCharCode(...buf))
    expect(jpegSize(b64)).toEqual({ w: 100, h: 200 })
  })
  it('returns null for non-JPEG', () => {
    expect(jpegSize('notjpeg')).toBeNull()
    expect(jpegSize('')).toBeNull()
  })
})

describe('coalesceLiveCall', () => {
  it('normalises times to offsets from startedAt', () => {
    const call = {
      startedAt: 1000,
      transcript: [
        { type: 'message', role: 'user', text: 'hi', time: 1050 },
        { type: 'message', role: 'assistant', text: 'hello', time: 1100 },
      ]
    }
    const r = coalesceLiveCall(call)
    expect(r.turns[0].at).toBe(50)
    expect(r.turns[1].at).toBe(100)
  })
  it('sorts by at', () => {
    const call = { startedAt: 0, transcript: [
      { type: 'message', role: 'assistant', text: 'b', time: 100 },
      { type: 'message', role: 'user', text: 'a', time: 50 },
    ]}
    const r = coalesceLiveCall(call)
    expect(r.turns[0].text).toBe('a')
    expect(r.turns[1].text).toBe('b')
  })
  it('collects tool call and result events', () => {
    const call = { startedAt: 0, transcript: [
      { type: 'tool', name: 'web_search', time: 10 },
      { type: 'toolResult', name: 'web_search', result: { title: 'result' }, time: 50 },
    ]}
    const r = coalesceLiveCall(call)
    expect(r.toolEvents[0].kind).toBe('call')
    expect(r.toolEvents[1].kind).toBe('result')
    expect(r.toolEvents[1].result).toEqual({ title: 'result' })
  })
})

describe('collectArtefacts', () => {
  it('dedupes tool names and includes result titles', () => {
    const events = [
      { name: 'web_search', result: { title: 'Result 1' } },
      { name: 'web_search', result: { title: 'Result 2' } },
      { name: 'other_tool', result: { name: 'Named File' } },
    ]
    const a = collectArtefacts(events)
    expect(a).toContain('web_search')
    expect(a).toContain('other_tool')
    expect(a).toContain('Result 1')
    expect(a).toContain('Result 2')
    expect(a).toContain('Named File')
  })
  it('caps at MAX_ARTEFACTS', () => {
    const events = Array.from({ length: 20 }, (_, i) => ({ name: `tool${i}`, result: { title: `t${i}` } }))
    const a = collectArtefacts(events)
    expect(a.length).toBeLessThanOrEqual(12)
  })
})

describe('collectSources', () => {
  it('finds URLs in tool results', () => {
    const events = [
      { name: 'web_search', result: { sources: ['https://example.com/1', 'https://example.com/2'] } },
      { name: 'other', result: { links: ['https://another.com'] } },
    ]
    const s = collectSources(events)
    expect(s).toContain('https://example.com/1')
    expect(s).toContain('https://example.com/2')
    expect(s).toContain('https://another.com')
  })
  it('dedupes and caps', () => {
    const events = [{ name: 'web_search', result: { sources: Array(50).fill('https://same.com') } }]
    const s = collectSources(events)
    expect(s).toEqual(['https://same.com'])
  })
  it('depth limit protects against circular/large objects', () => {
    const circular = { url: 'https://a.com', self: null }
    circular.self = circular
    const events = [{ name: 't', result: circular }]
    const s = collectSources(events)
    expect(s).toContain('https://a.com')
  })
})

describe('createFrameSampler', () => {
  it('stores frames and caps at MAX_FRAMES_PER_CALL', () => {
    const sampler = createFrameSampler({ cap: 3 })
    sampler.add({ at: 100, thumb: 'a' })
    sampler.add({ at: 200, thumb: 'b' })
    sampler.add({ at: 300, thumb: 'c' })
    sampler.add({ at: 400, thumb: 'd' })
    expect(sampler.count()).toBe(3)
    expect(sampler.frames().length).toBe(3)
  })
  it('drops interior frame with largest gap on overflow', () => {
    const sampler = createFrameSampler({ cap: 3 })
    sampler.add({ at: 0, thumb: 'first' })
    sampler.add({ at: 100, thumb: 'middle' })
    sampler.add({ at: 200, thumb: 'last' })
    sampler.add({ at: 1000, thumb: 'newlast' })
    const frames = sampler.frames()
    expect(frames.map(f => f.thumb)).toEqual(['first', 'last', 'newlast'])
  })
  it('never drops first or last', () => {
    const sampler = createFrameSampler({ cap: 3 })
    for (let i = 0; i < 10; i++) sampler.add({ at: i * 100, thumb: i })
    const frames = sampler.frames()
    expect(frames[0].thumb).toBe('0')
    expect(frames[frames.length - 1].thumb).toBe('9')
  })
})

describe('estimateStorage / bytesLabel', () => {
  it('estimates turns + tools + frames', () => {
    const est = estimateStorage({
      turns: [{ text: 'hello world' }],
      toolEvents: [{ name: 'web_search' }],
      frames: [{ thumb: 'a'.repeat(1000) }]
    })
    expect(est).toBeGreaterThan(0)
  })
  it('bytesLabel formats KB/MB', () => {
    expect(bytesLabel(500)).toBe('1 KB')
    expect(bytesLabel(1536)).toBe('2 KB')
    expect(bytesLabel(2_500_000)).toBe('2.4 MB')
    expect(bytesLabel(0)).toBe('0 KB')
  })
  it('framesBudgetBytes > 0', () => {
    expect(framesBudgetBytes()).toBeGreaterThan(0)
  })
})

describe('recordingFromCall', () => {
  it('produces a row with relative at values', () => {
    const row = recordingFromCall({
      transcript: [{ type: 'message', role: 'user', text: 'hi', time: 1050 }],
      frames: [{ at: 50, thumb: 'x', w: 320, h: 240 }],
      startedAt: 1000,
      endedAt: 2000,
    })
    expect(row.turns[0].at).toBe(50)
    expect(row.frames[0].at).toBe(50)
    expect(row.durationSec).toBe(1)
    expect(row.sizeBytes).toBeGreaterThan(0)
  })
})

describe('frame consent store', () => {
  it('has/grant/revoke round-trip', () => {
    revokeFrameConsent()
    expect(hasFrameConsent()).toBe(false)
    grantFrameConsent()
    expect(hasFrameConsent()).toBe(true)
    revokeFrameConsent()
    expect(hasFrameConsent()).toBe(false)
  })
})

describe('frameConsentMessage', () => {
  it('includes MAX_FRAMES_PER_CALL and size label', () => {
    const msg = frameConsentMessage(2_500_000)
    expect(msg).toContain(String(MAX_FRAMES_PER_CALL))
    expect(msg).toContain('2.4 MB')
    expect(msg).toContain('Nothing is uploaded')
  })
})

describe('ensureFrameConsent (with stub prompter)', () => {
  it('returns true immediately when already granted', async () => {
    grantFrameConsent()
    const ok = await ensureFrameConsent(1000)
    expect(ok).toBe(true)
  })
  it('calls prompter when not granted', async () => {
    revokeFrameConsent()
    let called = false
    setRecordingConsentPrompter(async () => { called = true; return false })
    const ok = await ensureFrameConsent(1000)
    expect(called).toBe(true)
    expect(ok).toBe(false)
  })
  it('grants on accepted', async () => {
    revokeFrameConsent()
    setRecordingConsentPrompter(async () => true)
    const ok = await ensureFrameConsent(1000)
    expect(ok).toBe(true)
    expect(hasFrameConsent()).toBe(true)
  })
})