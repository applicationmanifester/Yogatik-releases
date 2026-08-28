import { describe, it, expect } from 'vitest'
import {
  buildAccessibilitySnapshot,
  resolveSelfHealingSelector,
  extractStructuredContent
} from './stagehandHealing'

describe('Stagehand Self-Healing Automation Suite', () => {
  it('resolves elements by exact text or aria label', () => {
    const elements = [
      { elementId: '1', role: 'button', text: 'Submit Order', ariaLabel: 'Submit Order' },
      { elementId: '2', role: 'link', text: 'Privacy Policy', ariaLabel: 'Privacy' }
    ]
    const match = resolveSelfHealingSelector(elements, 'Submit Order')
    expect(match).toBeDefined()
    expect(match.element.elementId).toBe('1')
    expect(match.strategy).toBe('exact_text_aria')
  })

  it('self-heals through substring & fuzzy token matching when classnames change', () => {
    const elements = [
      { elementId: '3', role: 'button', text: 'Complete Payment Now', ariaLabel: 'Pay' }
    ]
    const match = resolveSelfHealingSelector(elements, 'Payment')
    expect(match).toBeDefined()
    expect(match.element.elementId).toBe('3')
    expect(match.strategy).toBe('substring_fuzzy')
  })

  it('extracts structured key-value fields from text', () => {
    const text = `
      Product: Wireless Headphones
      Price: $99.00
      Rating: 4.8
    `
    const extracted = extractStructuredContent(text, ['Product', 'Price', 'Rating'])
    expect(extracted.Product).toBe('Wireless Headphones')
    expect(extracted.Price).toBe('$99.00')
    expect(extracted.Rating).toBe('4.8')
  })
})
