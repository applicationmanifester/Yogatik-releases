import { describe, it, expect, beforeAll } from 'vitest'
import { rootIdFor } from '../electron/rootsCore.cjs'

describe('rootIdFor', () => {
  it('is stable for the same path', () => {
    expect(rootIdFor('/home/user/work')).toBe(rootIdFor('/home/user/work'))
  })

  it('is 12 hex characters', () => {
    expect(rootIdFor('/home/user/work')).toMatch(/^[0-9a-f]{12}$/)
  })

  it('differs for different paths', () => {
    expect(rootIdFor('/home/a')).not.toBe(rootIdFor('/home/b'))
  })

  it('ignores a trailing separator', () => {
    expect(rootIdFor('/home/user/work/')).toBe(rootIdFor('/home/user/work'))
  })
})
