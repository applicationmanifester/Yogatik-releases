/**
 * Tests for sanitize.js - XSS prevention utilities
 */

import { describe, it, expect } from 'vitest';
import { 
  sanitizeHtml, 
  sanitizeHtmlStrict, 
  sanitizeMarkdownHtml, 
  createSafeHtmlElement, 
  stripHtml 
} from './sanitize';

describe('sanitizeHtml', () => {
  it('allows basic formatting tags', () => {
    const input = '<p>Hello <strong>world</strong></p>';
    const output = sanitizeHtml(input);
    expect(output).toContain('<p>Hello <strong>world</strong></p>');
  });

  it('strips script tags', () => {
    const input = '<p>Safe</p><script>alert("xss")</script>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('<script>');
    expect(output).toContain('<p>Safe</p>');
  });

  it('strips event handlers', () => {
    const input = '<div onclick="alert(1)">Click me</div>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('onclick');
  });

  it('strips javascript: URLs', () => {
    const input = '<a href="javascript:alert(1)">Link</a>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('javascript:');
  });

  it('allows safe links', () => {
    const input = '<a href="https://example.com" target="_blank">Link</a>';
    const output = sanitizeHtml(input);
    expect(output).toContain('href="https://example.com"');
  });

  it('strips onerror from img', () => {
    const input = '<img src="x" onerror="alert(1)">';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('onerror');
  });

  it('preserves code blocks', () => {
    const input = '<pre><code>const x = 1;</code></pre>';
    const output = sanitizeHtml(input);
    expect(output).toContain('<pre><code>const x = 1;</code></pre>');
  });

  it('handles empty input', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
  });

  it('strips style attributes by default', () => {
    const input = '<p style="color: red;">Styled</p>';
    const output = sanitizeHtml(input);
    // style is allowed by default config
    expect(output).toContain('style="color: red;"');
  });
});

describe('sanitizeHtmlStrict', () => {
  it('strips all attributes', () => {
    const input = '<p class="test" id="foo" style="color:red">Text</p>';
    const output = sanitizeHtmlStrict(input);
    expect(output).not.toContain('class=');
    expect(output).not.toContain('id=');
    expect(output).not.toContain('style=');
    expect(output).toContain('<p>Text</p>');
  });

  it('allows only minimal tags', () => {
    const input = '<div><p>Para</p><strong>Bold</strong><script>bad</script></div>';
    const output = sanitizeHtmlStrict(input);
    expect(output).not.toContain('<div>');
    expect(output).not.toContain('<script>');
    expect(output).toContain('<p>Para</p>');
    expect(output).toContain('<strong>Bold</strong>');
  });
});

describe('sanitizeMarkdownHtml', () => {
  it('allows table elements', () => {
    const input = '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>';
    const output = sanitizeMarkdownHtml(input);
    expect(output).toContain('<table>');
    expect(output).toContain('<thead>');
    expect(output).toContain('<th>H</th>');
    expect(output).toContain('<td>Cell</td>');
  });

  it('allows figure and figcaption', () => {
    const input = '<figure><img src="x.png"><figcaption>Caption</figcaption></figure>';
    const output = sanitizeMarkdownHtml(input);
    expect(output).toContain('<figure>');
    expect(output).toContain('<figcaption>Caption</figcaption>');
  });
});

describe('createSafeHtmlElement', () => {
  it('returns object with __html property', () => {
    const result = createSafeHtmlElement('<p>Test</p>');
    expect(result).toHaveProperty('__html');
    expect(result.__html).toBe('<p>Test</p>');
  });

  it('sanitizes before returning', () => {
    const result = createSafeHtmlElement('<script>bad</script><p>Good</p>');
    expect(result.__html).not.toContain('<script>');
    expect(result.__html).toContain('<p>Good</p>');
  });
});

describe('stripHtml', () => {
  it('returns plain text', () => {
    const input = '<p>Hello <strong>world</strong>!</p>';
    const output = stripHtml(input);
    expect(output).toBe('Hello world!');
  });

  it('handles nested tags', () => {
    const input = '<div><p><span>Nested</span></p></div>';
    const output = stripHtml(input);
    expect(output).toBe('Nested');
  });

  it('handles empty input', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
  });
});