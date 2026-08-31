// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  resolveCapability, offlineReport, missingDownloads, capabilityBlock,
  MODE, KIND, ENGINES,
} from './capabilities'

describe('local-only never reaches the network', () => {
  it('refuses instead of quietly calling the cloud', () => {
    // The whole point. A privacy promise that degrades silently is worse than
    // no promise, because the user acts on it.
    const r = resolveCapability('chat', { mode: MODE.LOCAL_ONLY, ready: id => id === 'cloud' })
    expect(r.refused).toBe(true)
    expect(r.reason).toMatch(/local-only/i)
  })

  it('names the engine to install, and its size', () => {
    // "Not installed" and "impossible" are different problems. Reporting the
    // wrong one sends the user to install something that will not help.
    const r = resolveCapability('stt', { mode: MODE.LOCAL_ONLY, ready: () => false })
    expect(r.reason).toMatch(/Whisper/)
    expect(r.reason).toMatch(/40MB/)
  })

  it('says plainly that the live web has no on-device equivalent', () => {
    const r = resolveCapability('web_search', { mode: MODE.LOCAL_ONLY, ready: () => true })
    expect(r.refused).toBe(true)
    expect(r.reason).toMatch(/no on-device equivalent/)
  })

  it('but searching YOUR OWN documents does work offline', () => {
    // Merging these two under one "search" capability would report "search
    // works offline" to someone asking about today's news, and "search is
    // unavailable" to someone asking about their own PDF. Both lies.
    const r = resolveCapability('vault_search', { mode: MODE.LOCAL_ONLY, ready: id => id === 'vault', online: false })
    expect(r.id).toBe('vault')
    expect(r.local).toBe(true)
  })
})

describe('Web Speech is not on-device, whatever it looks like', () => {
  it('is classified hybrid, not local', () => {
    // Chrome STREAMS MICROPHONE AUDIO TO GOOGLE. It needs no key and has no
    // download, so every surface property says "local" — and it is the default
    // input for Live's cascade engine. Filing it as local would make the app's
    // own privacy claim false.
    expect(ENGINES.stt.find(e => e.id === 'webspeech').kind).toBe(KIND.HYBRID)
  })

  it('cannot satisfy local-only mode', () => {
    expect(resolveCapability('stt', { mode: MODE.LOCAL_ONLY, ready: id => id === 'webspeech' }).refused).toBe(true)
  })
})

describe('local-first tells the truth about what it did', () => {
  it('flags a remote fallback as degraded, with a reason', () => {
    const r = resolveCapability('vision', { mode: MODE.LOCAL_FIRST, ready: id => id === 'model' })
    expect(r.id).toBe('model')
    expect(r.degraded).toBe(true)
    expect(r.reason).toMatch(/no on-device engine/i)
  })

  it('is not degraded when a local engine served', () => {
    const r = resolveCapability('vision', { mode: MODE.LOCAL_FIRST, ready: () => true })
    expect(r.id).toBe('ocr')
    expect(r.degraded).toBe(false)
  })
})

describe('platform gating', () => {
  it('never offers Ollama on the web build', () => {
    expect(resolveCapability('chat', { mode: MODE.LOCAL_ONLY, ready: id => id === 'ollama', desktop: false }).refused).toBe(true)
    expect(resolveCapability('chat', { mode: MODE.LOCAL_ONLY, ready: id => id === 'ollama', desktop: true }).id).toBe('ollama')
  })

  it('skips remote engines entirely when offline', () => {
    expect(resolveCapability('chat', { mode: MODE.AUTO, ready: () => true, online: false }).id).toBe('webllm')
  })
})

describe('the offline report', () => {
  it('is honest when nothing is installed', () => {
    const r = offlineReport({ ready: () => false })
    expect(r.fullyOffline).toBe(false)
    expect(r.capabilities.chat.works).toBe(false)
    expect(r.capabilities.stt.installable.map(i => i.id)).toContain('whisper')
  })

  it('claims fully-offline only when chat, speech in AND speech out are local', () => {
    const r = offlineReport({ ready: id => ['webllm', 'whisper', 'kokoro', 'ocr', 'vault', 'bm25'].includes(id) })
    expect(r.fullyOffline).toBe(true)
    expect(r.capabilities.vault_search.works).toBe(true)
    expect(r.capabilities.web_search.works).toBe(false)   // never, by nature
  })
})

describe('downloads are decisions, not fallbacks', () => {
  it('lists each missing engine once, and omits those needing no download', () => {
    const ids = missingDownloads({ ready: () => false }).map(x => x.id)
    expect(ids.length).toBe(new Set(ids).size)
    expect(ids).toEqual(expect.arrayContaining(['whisper', 'kokoro']))
    expect(ids).not.toContain('system')   // the OS voice ships with the OS
    expect(ids).not.toContain('bm25')     // pure code, no weights
  })
})

describe('the system prompt cannot promise what the mode forbids', () => {
  it('names the missing capabilities and forbids offering them', () => {
    // Telling a local-only user "I'll search the web for that" and then failing
    // is the platformBlock() failure one layer up.
    const rep = offlineReport({ ready: id => ['webllm', 'whisper', 'kokoro'].includes(id) })
    const b = capabilityBlock(MODE.LOCAL_ONLY, rep)
    expect(b).toMatch(/LOCAL-ONLY/)
    expect(b).toMatch(/web_search/)
    expect(b).toMatch(/Do not offer or claim/)
  })

  it('adds nothing in auto mode', () => {
    expect(capabilityBlock(MODE.AUTO, offlineReport({ ready: () => true }))).toBe('')
  })
})
