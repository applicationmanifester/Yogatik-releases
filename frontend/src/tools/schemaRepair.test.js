import { describe, it, expect } from 'vitest'
import { repairToolArguments } from './schemaRepair'

describe('repairToolArguments', () => {
  it('unpacks stringified JSON payloads', () => {
    const raw = JSON.stringify({ q: 'React 19 release date', max: '5' })
    const schema = {
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
    }
    const repaired = repairToolArguments('web_search', raw, schema)
    expect(repaired.query).toBe('React 19 release date')
    expect(repaired.limit).toBe(5)
  })

  it('resolves parameter synonyms and aliases', () => {
    const raw = { script: 'console.log("hello")', target_path: '/src/main.js' }
    const schema = {
      properties: {
        code: { type: 'string' },
        path: { type: 'string' },
      },
    }
    const repaired = repairToolArguments('code_execute', raw, schema)
    expect(repaired.code).toBe('console.log("hello")')
    expect(repaired.path).toBe('/src/main.js')
  })

  it('coerces string numbers and booleans to expected schema types', () => {
    const raw = { is_active: 'true', count: '42', enabled: '0' }
    const schema = {
      properties: {
        is_active: { type: 'boolean' },
        count: { type: 'number' },
        enabled: { type: 'boolean' },
      },
    }
    const repaired = repairToolArguments('custom_tool', raw, schema)
    expect(repaired.is_active).toBe(true)
    expect(repaired.count).toBe(42)
    expect(repaired.enabled).toBe(false)
  })

  it('handles array coercion from string or element', () => {
    const raw = { tasks: JSON.stringify([{ agent: 'coder', task: 'test' }]) }
    const schema = {
      properties: {
        tasks: { type: 'array' },
      },
    }
    const repaired = repairToolArguments('spawn_agents', raw, schema)
    expect(Array.isArray(repaired.tasks)).toBe(true)
    expect(repaired.tasks[0].agent).toBe('coder')
  })
})
