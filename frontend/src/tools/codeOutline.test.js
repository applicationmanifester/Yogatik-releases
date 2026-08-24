import { describe, it, expect } from 'vitest'
import { extractSymbolsFromCode, codeOutlineTool } from './codeOutline'

describe('codeOutline Engine', () => {
  it('extracts JS/TS functions, classes, interfaces and types', () => {
    const code = `
export interface UserConfig {
  id: string
}

export type Theme = 'dark' | 'light'

export class SessionManager {
  constructor() {}
}

export async function authenticateUser(token) {
  return true
}

const formatOutput = (val) => val.trim()
`
    const symbols = extractSymbolsFromCode(code, 'session.ts')
    expect(symbols.length).toBe(5)
    expect(symbols.some(s => s.name === 'UserConfig' && s.kind === 'interface')).toBe(true)
    expect(symbols.some(s => s.name === 'Theme' && s.kind === 'type')).toBe(true)
    expect(symbols.some(s => s.name === 'SessionManager' && s.kind === 'class')).toBe(true)
    expect(symbols.some(s => s.name === 'authenticateUser' && s.kind === 'function')).toBe(true)
    expect(symbols.some(s => s.name === 'formatOutput' && s.kind === 'function')).toBe(true)
  })

  it('extracts Python functions and classes', () => {
    const code = `
class NeuralNetwork:
    def __init__(self):
        pass

async def train_step(batch, lr=0.001):
    pass
`
    const symbols = extractSymbolsFromCode(code, 'model.py')
    expect(symbols.length).toBe(3)
    expect(symbols[0].name).toBe('NeuralNetwork')
    expect(symbols[0].kind).toBe('class')
    expect(symbols[1].name).toBe('__init__')
    expect(symbols[1].kind).toBe('function')
    expect(symbols[2].name).toBe('train_step')
    expect(symbols[2].kind).toBe('function')
  })

  it('extracts Rust structs and functions', () => {
    const code = `
pub struct AppState {
    pub count: u32,
}

pub async fn run_server(port: u16) {
}
`
    const symbols = extractSymbolsFromCode(code, 'main.rs')
    expect(symbols.length).toBe(2)
    expect(symbols[0].name).toBe('AppState')
    expect(symbols[0].kind).toBe('struct')
    expect(symbols[1].name).toBe('run_server')
    expect(symbols[1].kind).toBe('function')
  })

  it('executes codeOutlineTool cleanly', async () => {
    const res = await codeOutlineTool.execute({
      code: 'function compute() { return 42; }',
      path: 'calc.js',
    })
    expect(res.success).toBe(true)
    expect(res.symbolsCount).toBe(1)
    expect(res.symbols[0].name).toBe('compute')
  })
})
