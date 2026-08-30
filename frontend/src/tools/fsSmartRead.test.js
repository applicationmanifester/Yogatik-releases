import { describe, it, expect } from 'vitest'
import { extractFileSymbols } from './fsSmartRead'

describe('fsSmartRead / extractFileSymbols', () => {
  it('extracts JavaScript/TypeScript functions, components, and classes', () => {
    const jsCode = `
import React from 'react'

export async function loadWeather(city) {
  return { temp: 72 }
}

export const WeatherWidget = ({ city }) => {
  return <div>{city}</div>
}

class WeatherAPI extends BaseClient {
  fetchData() {}
}
`
    const symbols = extractFileSymbols(jsCode, 'jsx')
    expect(symbols.length).toBe(3)
    expect(symbols[0]).toEqual({
      name: 'loadWeather',
      type: 'function',
      line: 4,
      signature: 'function loadWeather(city)',
    })
    expect(symbols[1]).toEqual({
      name: 'WeatherWidget',
      type: 'component',
      line: 8,
      signature: 'const WeatherWidget = ({ city }) =>',
    })
    expect(symbols[2]).toEqual({
      name: 'WeatherAPI',
      type: 'class',
      line: 12,
      signature: 'class WeatherAPI extends BaseClient',
    })
  })

  it('extracts Python functions and classes', () => {
    const pyCode = `
class DataEngine:
    def __init__(self):
        pass

async def process_batch(items):
    return len(items)
`
    const symbols = extractFileSymbols(pyCode, 'py')
    expect(symbols.length).toBe(3)
    expect(symbols[0].name).toBe('DataEngine')
    expect(symbols[1].name).toBe('__init__')
    expect(symbols[2].name).toBe('process_batch')
  })
})
