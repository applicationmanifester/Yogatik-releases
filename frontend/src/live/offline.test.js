import { describe, it, expect } from 'vitest'
import { checkOfflineReadiness, pickOfflineChat, resolveOfflineStack, DEFAULT_WEBLLM_MODEL, OLLAMA_PROVIDER, WEBLLM_PROVIDER } from './offline'

describe('offline readiness', () => {
  it('ready=true when Ollama + whisper + kokoro present', () => {
    const r = checkOfflineReadiness({ ollamaModels: ['llama3'], whisperAvailable: true, kokoroAvailable: true })
    expect(r.ready).toBe(true)
    expect(r.missing.filter(m => m.required).length).toBe(0)
  })
  it('ready=false when no chat model', () => {
    const r = checkOfflineReadiness({ ollamaModels: [], whisperAvailable: true, kokoroAvailable: true })
    expect(r.ready).toBe(false)
    expect(r.blockedOn).toBe('chat')
    expect(r.requiredMissing.map(m => m.component)).toContain('chat')
  })
  it('vision is optional — ready still true without it', () => {
    const r = checkOfflineReadiness({ ollamaModels: ['llama3'], whisperAvailable: true, kokoroAvailable: true, localVisionAvailable: false })
    expect(r.ready).toBe(true)
    expect(r.missing.find(m => m.component === 'vision')?.required).toBe(false)
  })
  it('system TTS counts as local TTS', () => {
    const r = checkOfflineReadiness({ ollamaModels: ['llama3'], whisperAvailable: true, kokoroAvailable: false, systemTtsAvailable: true })
    expect(r.ready).toBe(true)
  })
  it('requiredMissing sorted by chat > stt > tts > vision', () => {
    const r = checkOfflineReadiness({ ollamaModels: [], whisperAvailable: false, kokoroAvailable: false, systemTtsAvailable: false })
    expect(r.requiredMissing.map(m => m.component)).toEqual(['chat', 'stt', 'tts'])
  })
})

describe('pickOfflineChat', () => {
  it('ollama first when models exist', () => {
    const p = pickOfflineChat({ providers: {}, ollamaModels: ['llama3', 'mistral'] })
    expect(p?.provider).toBe(OLLAMA_PROVIDER)
    expect(p?.model).toBe('llama3')
    expect(p?.apiKey).toBe('')
  })
  it('webllm when ollama empty and webllmReady', () => {
    const p = pickOfflineChat({ providers: {}, ollamaModels: [], webllmReady: true, webllmModel: 'custom-q4f16' })
    expect(p?.provider).toBe(WEBLLM_PROVIDER)
    expect(p?.model).toBe('custom-q4f16')
  })
  it('null when neither available', () => {
    expect(pickOfflineChat({ ollamaModels: [], webllmReady: false })).toBeNull()
  })
  it('respects providers allowlist', () => {
    const p = pickOfflineChat({ providers: { local: true }, ollamaModels: [], webllmReady: true })
    expect(p?.provider).toBe(WEBLLM_PROVIDER)
    const p2 = pickOfflineChat({ providers: { ollama: true }, ollamaModels: ['llama3'] })
    expect(p2?.provider).toBe(OLLAMA_PROVIDER)
  })
})

describe('resolveOfflineStack', () => {
  it('fully ready — badge, no refusal', () => {
    const s = resolveOfflineStack({ ollamaModels: ['llama3'], whisperAvailable: true, kokoroAvailable: true, webllmReady: false })
    expect(s.ready).toBe(true)
    expect(s.badge).toMatch(/Fully offline: Ollama ⌁ llama3 · Whisper speech · Kokoro voice — no web tools/)
    expect(s.refusal).toBeNull()
  })
  it('webllm path — badge includes slower note', () => {
    const s = resolveOfflineStack({ ollamaModels: [], webllmReady: true, whisperAvailable: true, kokoroAvailable: true })
    expect(s.ready).toBe(true)
    expect(s.badge).toMatch(/WebLLM/)
    expect(s.degraded.some(d => d.includes('slower'))).toBe(true)
  })
  it('system voice — degraded list includes built-in note', () => {
    const s = resolveOfflineStack({ ollamaModels: ['llama3'], whisperAvailable: true, kokoroAvailable: false })
    expect(s.ready).toBe(true)
    expect(s.degraded.some(d => d.includes('built-in'))).toBe(true)
  })
  it('no local chat — not ready, refusal set', () => {
    const s = resolveOfflineStack({ ollamaModels: [], whisperAvailable: true, kokoroAvailable: true })
    expect(s.ready).toBe(false)
    expect(s.refusal).toMatch(/No local chat model available/)
  })
  it('vision missing is optional — still ready', () => {
    const s = resolveOfflineStack({ ollamaModels: ['llama3'], whisperAvailable: true, kokoroAvailable: true, localVisionAvailable: false })
    expect(s.ready).toBe(true)
    expect(s.vision).toBeNull()
    expect(s.degraded.some(d => d.includes('OCR + describe only'))).toBe(true)
  })
  it('chatLabel shows model base name', () => {
    const s = resolveOfflineStack({ ollamaModels: ['org/llama3.2:latest'], whisperAvailable: true, kokoroAvailable: true })
    expect(s.chat?.model).toBe('org/llama3.2:latest')
    expect(s.chatLabel).toContain('llama3.2:latest')
  })
  it('DEFAULT_WEBLLM_MODEL is the documented constant', () => {
    expect(DEFAULT_WEBLLM_MODEL).toBe('Qwen2.5-0.5B-Instruct-q4f16_1-MLC')
  })
})