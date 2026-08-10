import { describe, it, expect } from 'vitest'
import { isEcho } from './cascade'

describe('echo guard', () => {
  it('recognises the synthesiser being picked up by the microphone', () => {
    const spoken = 'Sure, the kettle is on the left side of the counter.'
    expect(isEcho('the kettle is on the left', spoken)).toBe(true)
    expect(isEcho('Sure the kettle is on the left side', spoken)).toBe(true)
  })

  it('lets a real interruption through', () => {
    const spoken = 'Sure, the kettle is on the left side of the counter.'
    expect(isEcho('no wait, stop', spoken)).toBe(false)
    expect(isEcho('what about the fridge', spoken)).toBe(false)
  })

  it('is inert when nothing is being spoken', () => {
    expect(isEcho('hello there', '')).toBe(false)
    expect(isEcho('', 'anything')).toBe(false)
  })
})
