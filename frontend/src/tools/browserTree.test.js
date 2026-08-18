import { describe, it, expect } from 'vitest'
import { nodeLabel, isInteractive, truncateText } from '../../electron/browserTree.cjs'

describe('browserTree — node classification', () => {
  it('prefers the accessible name over text', () => {
    expect(nodeLabel({ role: 'button', name: 'Submit form', text: 'Go' })).toBe('Submit form')
  })

  it('falls back to text when there is no name', () => {
    expect(nodeLabel({ role: 'link', name: '', text: 'Read more' })).toBe('Read more')
  })

  it('falls back to the role when there is neither', () => {
    expect(nodeLabel({ role: 'img', name: '', text: '' })).toBe('img')
  })

  it('treats known interactive roles as interactive', () => {
    expect(isInteractive({ role: 'button' })).toBe(true)
    expect(isInteractive({ role: 'link' })).toBe(true)
    expect(isInteractive({ role: 'textbox' })).toBe(true)
    expect(isInteractive({ role: 'generic' })).toBe(false)
  })

  it('honours an explicit interactive flag from the page', () => {
    expect(isInteractive({ role: 'generic', interactive: true })).toBe(true)
  })

  it('truncates long text and marks it', () => {
    expect(truncateText('x'.repeat(200), 10)).toBe('xxxxxxxxxx…')
    expect(truncateText('short', 10)).toBe('short')
  })
})
