import { describe, it, expect } from 'vitest'
import { calculatorTool } from './calculator'
import { hashTool } from './hash'
import { unitConvertTool } from './unitConvert'
import { dataConvertTool } from './dataConvert'
import { regexTool } from './regex'
import { keywordExtractTool, entityExtractTool, queryRefineTool } from './independentTools'

describe('calculator', () => {
  const val = async (expression) => (await calculatorTool.execute({ expression })).result

  it('evaluates arithmetic and precedence', async () => {
    expect(await val('(2+3)*4')).toBe(20)
    expect(await val('100 % 7')).toBe(2)
    expect(await val('2^10')).toBe(1024)
  })

  it('handles scientific notation', async () => {
    // Regression: string-rewriting turned 1e5 into 1Math.E5
    expect(await val('1e5 + 1')).toBe(100001)
    expect(await val('1.5e-3 * 1000')).toBeCloseTo(1.5)
  })

  it('supports named functions and constants', async () => {
    expect(await val('sqrt(144)')).toBe(12)
    expect(await val('log(1000)')).toBe(3)       // log = base 10
    expect(await val('ln(e)')).toBe(1)
    expect(await val('fact(5)')).toBe(120)
    expect(await val('max(3, 7, 2)')).toBe(7)
    expect(await val('pi')).toBeCloseTo(Math.PI)
  })

  it.each([
    'alert(1)', 'fetch("x")', 'process.exit()', 'window.location',
    '1+1; alert(2)', '[].constructor',
  ])('rejects %s', async (expression) => {
    expect((await calculatorTool.execute({ expression })).success).toBe(false)
  })

  it.each(['constructor', 'constructor.constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'rejects inherited object member %s', async (expression) => {
      // Regression: `'constructor' in FUNCS` was true via the prototype chain
      const r = await calculatorTool.execute({ expression })
      expect(r.success).toBe(false)
      expect(r.error).toMatch(/unknown name/i)
    })

  it('rejects empty and oversized input', async () => {
    expect((await calculatorTool.execute({ expression: '' })).success).toBe(false)
    expect((await calculatorTool.execute({ expression: '1+'.repeat(400) })).success).toBe(false)
  })

  it('reports NaN rather than claiming success', async () => {
    expect((await calculatorTool.execute({ expression: 'sqrt(-1)' })).success).toBe(false)
  })
})

describe('hash', () => {
  it('base64 round-trips unicode', async () => {
    // Regression: btoa() is Latin-1 only and threw on any non-ASCII input
    const text = 'héllo 🌍 café'
    const enc = await hashTool.execute({ text, algorithm: 'base64_encode' })
    expect(enc.success).toBe(true)
    const dec = await hashTool.execute({ text: enc.result, algorithm: 'base64_decode' })
    expect(dec.result).toBe(text)
  })

  it('computes sha256', async () => {
    const r = await hashTool.execute({ text: 'abc', algorithm: 'sha256' })
    expect(r.result).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('rejects an unsupported algorithm with a useful message', async () => {
    const r = await hashTool.execute({ text: 'x', algorithm: 'md5' })
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/sha256/)
  })

  it('reports invalid base64 instead of throwing', async () => {
    const r = await hashTool.execute({ text: '!!!not base64!!!', algorithm: 'base64_decode' })
    expect(r.success).toBe(false)
  })
})

describe('unit_convert', () => {
  it('converts common units', async () => {
    expect((await unitConvertTool.execute({ value: 1, from: 'km', to: 'm' })).result).toBe(1000)
  })

  it('reports unknown pairs rather than returning NaN', async () => {
    const r = await unitConvertTool.execute({ value: 1, from: 'banana', to: 'm' })
    expect(r.success).toBe(false)
  })
})

describe('data_convert', () => {
  it('converts json to csv', async () => {
    const r = await dataConvertTool.execute({
      data: JSON.stringify([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]),
      operation: 'json_to_csv',
    })
    // RFC-4180 output: UTF-8 BOM prefix + CRLF row endings.
    expect(r.result.replace(/^﻿/, '').split('\r\n')[0]).toBe('a,b')
  })

  it('fails cleanly on malformed json', async () => {
    const r = await dataConvertTool.execute({ data: '{not json', operation: 'prettify' })
    expect(r.success).toBe(false)
  })
})

describe('regex', () => {
  it('finds matches', async () => {
    const r = await regexTool.execute({ text: 'a1 b2 c3', pattern: '[a-z]\\d', operation: 'find' })
    expect(r.result.map(m => m.match)).toEqual(['a1', 'b2', 'c3'])
  })

  it('returns an error for an invalid pattern instead of throwing', async () => {
    const r = await regexTool.execute({ text: 'x', pattern: '([', operation: 'find' })
    expect(r.success).toBe(false)
  })
})

describe('keyword_extract', () => {
  it('returns useful keywords and phrases', async () => {
    const r = await keywordExtractTool.execute({
      text: 'React compiler optimizes components. React compiler improves rendering performance.',
      max_keywords: 5,
      max_phrases: 3,
    })
    expect(r.success).toBe(true)
    expect(r.keywords.map(k => k.term)).toContain('react')
    expect(r.search_query).toMatch(/react/)
  })
})

describe('entity_extract', () => {
  it('extracts basic entities and metadata', async () => {
    const r = await entityExtractTool.execute({
      text: 'Sam Altman met OpenAI in San Francisco on Jan 5, 2024. Contact hello@example.com or https://openai.com.',
    })
    expect(r.success).toBe(true)
    expect(r.people.join(' ')).toMatch(/Sam Altman/i)
    expect(r.organizations.join(' ')).toMatch(/OpenAI/i)
    expect(r.locations.join(' ')).toMatch(/San Francisco/i)
    expect(r.dates.join(' ')).toMatch(/2024|Jan/i)
    expect(r.emails).toContain('hello@example.com')
    expect(r.urls).toContain('https://openai.com')
  })
})

describe('query_refine', () => {
  it('creates a cleaner search query and suggested tools', async () => {
    const r = await queryRefineTool.execute({ query: 'can you compare groq vs openai for coding?', max_subqueries: 2 })
    expect(r.success).toBe(true)
    expect(r.intent).toBe('compare')
    expect(r.subqueries.length).toBeGreaterThanOrEqual(2)
    expect(r.suggested_tools).toContain('code_execute')
  })
})

describe('timer & alarms', () => {
  it('sets a timer by duration', async () => {
    const { timerTool } = await import('./timer')
    const r = await timerTool.execute({ duration: '10 minutes', label: 'Check oven' })
    expect(r.success).toBe(true)
    expect(r.tool).toBe('timer')
    expect(r.seconds).toBe(600)
    expect(r.label).toBe('Check oven')
    expect(r.id).toBeDefined()
  })

  it('lists and cancels active timers', async () => {
    const { timerTool } = await import('./timer')
    const created = await timerTool.execute({ duration: '30 seconds', label: 'Stand up' })
    const listRes = await timerTool.execute({ action: 'list' })
    expect(listRes.success).toBe(true)
    expect(listRes.timers.some(t => t.id === created.id)).toBe(true)

    const cancelRes = await timerTool.execute({ action: 'cancel', id: created.id })
    expect(cancelRes.success).toBe(true)
    expect(cancelRes.message).toMatch(/cancelled/i)
  })
})

describe('tts robustness', () => {
  it('handles missing or undefined text without throwing unhandled exceptions', async () => {
    const { ttsTool } = await import('./tts')
    const r = await ttsTool.execute({})
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/No text provided/i)
  })
})

describe('executeTool alias resolution', () => {
  it('resolves common LLM tool aliases seamlessly', async () => {
    const { executeTool } = await import('./index')
    const rSchedule = await executeTool('schedule', { duration: '5m', label: 'Meeting' })
    expect(rSchedule.success).toBe(true)

    const rTimer = await executeTool('set_alarm', { duration: '15m', label: 'Tea' })
    expect(rTimer.success).toBe(true)
  })
})

