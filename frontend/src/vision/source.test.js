import { describe, it, expect, beforeEach } from 'vitest'
import {
  setSharedVisualSource, getSharedVisualSource, clearSharedVisualSource,
  isVisualQuestion, needsText, needsMotion, captureProfile,
} from './source'

describe('shared visual source', () => {
  beforeEach(() => clearSharedVisualSource())

  it('hands back the registered source', () => {
    const src = { stopped: false }
    setSharedVisualSource(src)
    expect(getSharedVisualSource()).toBe(src)
  })

  it('ignores a source whose stream has ended', () => {
    setSharedVisualSource({ stopped: true })
    expect(getSharedVisualSource()).toBeNull()
  })

  it('does not clear a source that has already been replaced', () => {
    const a = { stopped: false }
    const b = { stopped: false }
    setSharedVisualSource(a)
    setSharedVisualSource(b)
    clearSharedVisualSource(a)          // late teardown of the old one
    expect(getSharedVisualSource()).toBe(b)
  })
})

describe('question classification', () => {
  it('sends a frame for questions about the here and now', () => {
    for (const q of ['what am I holding', 'how many cups are here', 'read this label', 'what is on my screen']) {
      expect(isVisualQuestion(q)).toBe(true)
    }
  })

  it('does not send a frame for general knowledge', () => {
    for (const q of ['what is the capital of Peru', 'explain quantum tunnelling', '']) {
      expect(isVisualQuestion(q)).toBe(false)
    }
  })

  it('captures big and sharp for text, small and cheap for scenes', () => {
    expect(needsText('read the serial number')).toBe(true)
    const text = captureProfile('read the serial number')
    const scene = captureProfile('what is in front of me')
    expect(text.maxEdge).toBeGreaterThan(scene.maxEdge)
    expect(text.quality).toBeGreaterThan(scene.quality)
    expect(scene.crop).toBe(0)
  })

  it('asks for two frames only for motion questions', () => {
    expect(needsMotion('what am I doing')).toBe(true)
    expect(needsMotion('read what it says now')).toBe(false)   // text wins
    expect(needsMotion('what colour is this')).toBe(false)
  })
})

describe('on-device VLM consent', () => {
  it('refuses to download the weights until the feature is on', async () => {
    const { loadLocalVLM, setLocalVLMConsent } = await import('./localVLM')
    setLocalVLMConsent(false)
    await expect(loadLocalVLM()).rejects.toThrow(/Personalise/)
  })
})
