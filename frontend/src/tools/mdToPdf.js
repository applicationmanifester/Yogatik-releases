// Markdown → PDF via html2pdf.js. Renders real block structure (headings, lists,
// tables, code, blockquotes, paragraphs) with print-grade typography, and rasterises
// at 2× so text stays crisp.

/** Minimal but correct block-level Markdown → HTML (no external dependency). */
export function mdToHtml(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s) => esc(s)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<figure style="margin:16px 0;text-align:center;"><img src="$2" alt="$1" style="max-width:100%;height:auto;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,0.1);"/><figcaption style="font-size:9pt;color:#64748b;margin-top:6px;font-style:italic;">$1</figcaption></figure>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (/^```/.test(line)) {                                   // fenced code
      const buf = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++])
      i++
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`)
    } else if (/^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/.test(line)) { // standalone image
      const m = line.match(/^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/)
      out.push(`<figure style="margin:18px 0;text-align:center;"><img src="${m[2]}" alt="${esc(m[1])}" style="max-width:100%;height:auto;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,0.1);"/>${m[1] ? `<figcaption style="font-size:9pt;color:#64748b;margin-top:6px;font-style:italic;">${esc(m[1])}</figcaption>` : ''}</figure>`)
    } else if (/^#{1,6}\s/.test(line)) {                       // heading
      const level = line.match(/^#+/)[0].length
      out.push(`<h${level}>${inline(line.replace(/^#+\s/, ''))}</h${level}>`)
    } else if (/^\s*[-*+]\s/.test(line)) {                     // unordered list
      const items = []
      while (i < lines.length && /^\s*[-*+]\s/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*[-*+]\s/, ''))}</li>`)
      out.push(`<ul>${items.join('')}</ul>`); continue
    } else if (/^\s*\d+\.\s/.test(line)) {                     // ordered list
      const items = []
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*\d+\.\s/, ''))}</li>`)
      out.push(`<ol>${items.join('')}</ol>`); continue
    } else if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[-:\s|]+\|\s*$/.test(lines[i + 1] || '')) { // table
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
      const head = cells(line)
      i += 2
      const body = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(cells(lines[i++]))
      out.push(`<table><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${
        body.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
      continue
    } else if (/^\s*>\s?/.test(line)) {                        // blockquote / callout
      const clean = line.replace(/^\s*>\s?/, '')
      if (/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i.test(clean)) {
        const type = clean.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i)[1].toUpperCase()
        const text = clean.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, '')
        const color = type === 'TIP' ? '#10b981' : type === 'WARNING' || type === 'CAUTION' ? '#f59e0b' : '#38bdf8'
        out.push(`<div style="border-left:4px solid ${color};background:#f8fafc;padding:10px 14px;border-radius:0 8px 8px 0;margin:12px 0;"><strong style="color:${color};font-size:9.5pt;display:block;margin-bottom:3px;">${type}</strong><div>${inline(text)}</div></div>`)
      } else {
        out.push(`<blockquote>${inline(clean)}</blockquote>`)
      }
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {          // hr
      out.push('<hr>')
    } else if (line.trim() === '') {
      /* skip blank */
    } else {                                                   // paragraph (merge until blank)
      const buf = [line]
      i++
      while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+\.\s|\s*>|\s*\||!\[)/.test(lines[i])) buf.push(lines[i++])
      out.push(`<p>${inline(buf.join(' '))}</p>`); continue
    }
    i++
  }
  return out.join('\n')
}

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; font-size: 11.5pt; line-height: 1.6; }
  h1 { font-size: 22pt; color: #0f172a; border-bottom: 2px solid #38bdf8; padding-bottom: 6px; margin: 0 0 .5em; }
  h2 { font-size: 16pt; color: #1e3a8a; margin: 1.2em 0 .3em; border-bottom: 1px solid #e2e8f0; padding-bottom: .2em; page-break-after: avoid; }
  h3 { font-size: 13.5pt; color: #0284c7; margin: 1em 0 .3em; page-break-after: avoid; }
  h4 { font-size: 12pt; color: #334155; }
  p { margin: .5em 0; } ul, ol { margin: .5em 0 .5em 1.4em; } li { margin: .25em 0; }
  figure { page-break-inside: avoid; }
  img { max-width: 100%; height: auto; }
  code { font-family: 'SFMono-Regular', Consolas, Monaco, monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 90%; color: #0f172a; }
  pre { background: #0f172a; color: #f8fafc; padding: 12px 16px; border-radius: 8px; overflow: auto; page-break-inside: avoid; font-size: 9.5pt; }
  pre code { background: none; color: inherit; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; page-break-inside: avoid; font-size: 90%; }
  th, td { border: 1px solid #cbd5e1; padding: 7px 11px; text-align: left; }
  th { background: #1e293b; color: #ffffff; font-weight: bold; }
  tr:nth-child(even) { background: #f8fafc; }
  blockquote { border-left: 4px solid #38bdf8; background: #f0f9ff; margin: .8em 0; padding: .4em .8em .4em 14px; color: #0369a1; page-break-inside: avoid; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 1.2em 0; }
  a { color: #0284c7; text-decoration: none; } h1, h2, h3 { page-break-after: avoid; }
`

export const mdToPdfTool = {
  schema: {
    description: 'Convert markdown text to a polished, downloadable PDF (headings, lists, tables, code, blockquotes).',
    parameters: { type: 'object', properties: {
      markdown: { type: 'string', description: 'Markdown content' },
      filename: { type: 'string', description: 'Output filename (default document.pdf)' },
    }, required: ['markdown'] },
  },
  async execute({ markdown, filename = 'document.pdf' }) {
    const outName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`

    const container = document.createElement('div')
    container.innerHTML = `<style>${PRINT_CSS}</style>${mdToHtml(markdown)}`
    container.style.cssText = 'padding:16mm 14mm; background:#fff;'

    if (!window.html2pdf) {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js'
      document.head.appendChild(s)
      await new Promise((res, rej) => { s.onload = res; s.onerror = rej })
    }
    const blob = await window.html2pdf().from(container).set({
      margin: 0,
      filename: outName,
      // 2× raster keeps text sharp; CSS/soft page breaks avoid cutting blocks.
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).outputPdf('blob')

    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.readAsDataURL(blob)
    })

    return { success: true, tool: 'md_to_pdf', filename: outName, size: `${(blob.size / 1024).toFixed(1)} KB`, pdf_data_url: dataUrl }
  }
}
