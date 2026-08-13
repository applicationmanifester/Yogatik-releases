import { describe, it, expect } from 'vitest'
import { uuidTool, passwordTool, numberBaseTool, cronTool, timezoneTool } from './moretools'

describe('uuid', () => {
  it('generates the requested count of valid v4 UUIDs', async () => {
    const r = await uuidTool.execute({ count: 3 })
    expect(r.success).toBe(true)
    expect(r.ids).toHaveLength(3)
    for (const id of r.ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })
})

describe('password_generate', () => {
  it('honours length and reports entropy', async () => {
    const r = await passwordTool.execute({ length: 24 })
    expect(r.success).toBe(true)
    expect(r.value).toHaveLength(24)
    expect(r.entropy_bits).toBeGreaterThan(80)
  })
  it('builds a passphrase when words is set', async () => {
    const r = await passwordTool.execute({ words: 4 })
    expect(r.value.split('-')).toHaveLength(4)
  })
})

describe('number_base', () => {
  it('converts and auto-detects 0x/0b prefixes', async () => {
    expect((await numberBaseTool.execute({ value: '255' })).hex).toBe('FF')
    expect((await numberBaseTool.execute({ value: '0xFF' })).decimal).toBe('255')
    expect((await numberBaseTool.execute({ value: '0b1010' })).decimal).toBe('10')
  })
  it('rejects invalid input', async () => {
    expect((await numberBaseTool.execute({ value: 'zzz', from_base: 10 })).success).toBe(false)
  })
})

describe('cron_next', () => {
  it('lists upcoming runs for a valid expression', async () => {
    const r = await cronTool.execute({ expression: '0 9 * * 1-5', count: 3 })
    expect(r.success).toBe(true)
    expect(r.next_runs).toHaveLength(3)
  })
  it('rejects a malformed expression', async () => {
    expect((await cronTool.execute({ expression: '99 9 *' })).success).toBe(false)
  })
})

describe('timezone', () => {
  it('shows the same instant across zones', async () => {
    const r = await timezoneTool.execute({ time: '2025-01-01 12:00', from: 'UTC', to: ['Asia/Kolkata', 'Europe/London'] })
    expect(r.success).toBe(true)
    expect(r.times['Asia/Kolkata']).toMatch(/5:30/)   // UTC+5:30
  })
})
