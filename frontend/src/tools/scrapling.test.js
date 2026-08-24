import { describe, it, expect } from 'vitest'
import {
  calculateTextSimilarity,
  calculateSetSimilarity,
  createElementFingerprint,
  scoreCandidateMatch,
  querySelectorAdaptive,
  detectAntiBotChallenge,
  extractStructuredData,
  generateScraplingScript,
  scraplingTool,
} from './scrapling'

describe('Scrapling Adaptive Engine & Similarity', () => {
  it('calculates text similarity correctly', () => {
    expect(calculateTextSimilarity('iPhone 15 Pro Max 256GB', 'iPhone 15 Pro Max 256GB')).toBe(1.0)
    expect(calculateTextSimilarity('Hello World', 'Hello World!')).toBeGreaterThan(0.8)
    expect(calculateTextSimilarity('Apple iPhone', 'Samsung Galaxy')).toBeLessThan(0.3)
  })

  it('calculates set similarity for CSS classes and attributes', () => {
    expect(calculateSetSimilarity(['btn', 'btn-primary', 'active'], ['btn', 'btn-primary', 'active'])).toBe(1.0)
    expect(calculateSetSimilarity(['card', 'product-item', 'shadow'], ['card', 'product-item', 'border'])).toBeGreaterThan(0.4)
    expect(calculateSetSimilarity(['header'], ['footer'])).toBe(0.0)
  })

  it('detects anti-bot challenges accurately', () => {
    const cfHtml = '<div id="cf-turnstile" class="cf-turnstile"></div><title>Just a moment...</title>'
    const ddHtml = '<script src="https://geo.captcha-delivery.com/dd.js"></script>'
    const normalHtml = '<div class="content"><h1>Welcome to my website</h1></div>'

    expect(detectAntiBotChallenge(cfHtml).blocked).toBe(true)
    expect(detectAntiBotChallenge(ddHtml).blocked).toBe(true)
    expect(detectAntiBotChallenge(normalHtml).blocked).toBe(false)
  })

  it('generates executable standalone Python Scrapling scripts', () => {
    const script = generateScraplingScript('https://quotes.toscrape.com', {
      quote: '.quote span.text',
      author: '.quote small.author',
    })

    expect(script).toContain('from scrapling import StealthyFetcher')
    expect(script).toContain('https://quotes.toscrape.com')
    expect(script).toContain('page.css(".quote span.text::text")')
    expect(script).toContain('if __name__ == "__main__":')
  })

  it('adapts and self-heals when class names mutate in DOM', () => {
    // Create a mock DOM document
    const parser = new DOMParser()
    const originalHtml = `
      <div class="product-list">
        <div class="product-card-v1" id="prod-123" data-testid="main-product">
          <h2 class="title">Nike Air Max 90</h2>
          <span class="price-val">$120.00</span>
        </div>
      </div>
    `
    const docOriginal = parser.parseFromString(originalHtml, 'text/html')
    const originalEl = docOriginal.querySelector('.product-card-v1')
    const fingerprint = createElementFingerprint(originalEl, '.product-card-v1')

    expect(fingerprint.tag).toBe('div')
    expect(fingerprint.testId).toBe('main-product')

    // Now test mutated HTML (class changed to .obfuscated_product_8x9a, ID stripped)
    const mutatedHtml = `
      <div class="catalog-wrap">
        <div class="obfuscated_product_8x9a" data-testid="main-product">
          <h2 class="heading-mod">Nike Air Max 90</h2>
          <span class="cost">$120.00</span>
        </div>
      </div>
    `
    const docMutated = parser.parseFromString(mutatedHtml, 'text/html')

    // Direct old selector fails
    expect(docMutated.querySelector('.product-card-v1')).toBeNull()

    // Adaptive selector successfully relocates the element!
    const match = querySelectorAdaptive(docMutated, '.product-card-v1', fingerprint)
    expect(match.element).not.toBeNull()
    expect(match.method).toBe('adaptive_healed')
    expect(match.confidence).toBeGreaterThan(0.7)
    expect(match.element.textContent).toContain('Nike Air Max 90')
  })

  it('extracts structured data with multiple keys and adaptive matching', () => {
    const parser = new DOMParser()
    const html = `
      <div class="article">
        <h1 class="headline">Breaking Technology News</h1>
        <p class="summary">AI agents transform browser automation and web extraction.</p>
        <ul class="tags">
          <li>AI</li>
          <li>Scraping</li>
          <li>Automation</li>
        </ul>
      </div>
    `
    const doc = parser.parseFromString(html, 'text/html')
    const { data } = extractStructuredData(doc, {
      title: 'h1.headline',
      description: 'p.summary',
      tags: { selector: '.tags li', multiple: true },
    })

    expect(data.title).toBe('Breaking Technology News')
    expect(data.description).toBe('AI agents transform browser automation and web extraction.')
    expect(data.tags).toEqual(['AI', 'Scraping', 'Automation'])
  })
})
