import { describe, it, expect, vi } from 'vitest'
import { translateTool } from './translate'

describe('translateTool', () => {
  it('normalizes language names to 2-letter ISO codes', async () => {
    const res = await translateTool.execute({ text: 'Hello', target: 'Spanish', source: 'English' })
    expect(res.success).toBe(true)
    expect(res.target).toBe('es')
    expect(res.source).toBe('en')
    expect(res.translated.toLowerCase()).toContain('hola')
  }, 15000)

  it('translates text to French', async () => {
    const res = await translateTool.execute({ text: 'Hello', target: 'French' })
    expect(res.success).toBe(true)
    expect(res.target).toBe('fr')
    expect(res.translated.toLowerCase()).toContain('bonjour')
  }, 15000)

  it('translates text to German', async () => {
    const res = await translateTool.execute({ text: 'Hello', target: 'de' })
    expect(res.success).toBe(true)
    expect(res.target).toBe('de')
    expect(res.translated.toLowerCase()).toContain('hallo')
  }, 15000)

  it('translates text to Hindi', async () => {
    const res = await translateTool.execute({ text: 'Hello', target: 'Hindi' })
    expect(res.success).toBe(true)
    expect(res.target).toBe('hi')
    expect(res.translated).toBeTruthy()
  }, 15000)

  it('translates text to Telugu', async () => {
    const res = await translateTool.execute({ text: 'Hello', target: 'Telugu' })
    expect(res.success).toBe(true)
    expect(res.target).toBe('te')
    expect(res.translated).toBeTruthy()
  }, 15000)

  it('translates text to Japanese', async () => {
    const res = await translateTool.execute({ text: 'Hello', target: 'ja' })
    expect(res.success).toBe(true)
    expect(res.target).toBe('ja')
    expect(res.translated).toBeTruthy()
  }, 15000)

  it('rejects empty text', async () => {
    const res = await translateTool.execute({ text: '', target: 'es' })
    expect(res.success).toBe(false)
    expect(res.error).toBe('Nothing to translate')
  })
})
