import { describe, it, expect } from 'vitest'
import { csvCell, toCsv, parseCsv } from './dataConvert'
import { mdToHtml } from './mdToPdf'
import { pollinationsUrl } from './imageGen'

describe('CSV (RFC 4180)', () => {
  it('quotes fields with commas/quotes/newlines and doubles quotes', () => {
    expect(csvCell('plain')).toBe('plain')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('she said "hi"')).toBe('"she said ""hi"""')
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"')
  })
  it('serializes with BOM + CRLF and round-trips', () => {
    const rows = [{ name: 'Ann, B', note: 'says "hi"' }, { name: 'Zoë', note: 'x\ny' }]
    const csv = toCsv(rows)
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('\r\n')
    const back = parseCsv(csv)
    expect(back[0]).toEqual(['name', 'note'])
    expect(back[1]).toEqual(['Ann, B', 'says "hi"'])
    expect(back[2]).toEqual(['Zoë', 'x\ny'])
  })
})

describe('Markdown → HTML (PDF)', () => {
  it('renders headings, lists, code, tables', () => {
    const html = mdToHtml('# Title\n\n- one\n- two\n\n```\ncode\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>')
    expect(html).toContain('<pre><code>code</code></pre>')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>A</th>')
  })
  it('escapes HTML and renders inline emphasis/code', () => {
    const html = mdToHtml('a **bold** and `x<y` and <script>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<code>x&lt;y</code>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('image URL quality knobs', () => {
  it('uses flux + enhance + nologo/nofeed by default', () => {
    const url = pollinationsUrl('a cat', { seed: 1 })
    expect(url).toMatch(/model=flux/)
    expect(url).toMatch(/enhance=true/)
    expect(url).toMatch(/nologo=true/)
    expect(url).toMatch(/nofeed=true/)
  })
})
