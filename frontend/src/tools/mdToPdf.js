// Markdown → PDF via html2pdf.js. Renders real block structure (headings, lists,
// tables, code, blockquotes, paragraphs) with print-grade typography, and rasterises
// at 2× so text stays crisp.

/** Minimal but correct block-level Markdown → HTML (no external dependency). */
export function mdToHtml(md) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s) => esc(s)
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
    } else if (/^\s*>\s?/.test(line)) {                        // blockquote
      out.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ''))}</blockquote>`)
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {          // hr
      out.push('<hr>')
    } else if (line.trim() === '') {
      /* skip blank */
    } else {                                                   // paragraph (merge until blank)
      const buf = [line]
      i++
      while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+\.\s|\s*>|\s*\|)/.test(lines[i])) buf.push(lines[i++])
      out.push(`<p>${inline(buf.join(' '))}</p>`); continue
    }
    i++
  }
  return out.join('\n')
}

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: Inter, -apple-system, Segoe UI, Roboto, sans-serif; color: #1a2332; font-size: 12pt; line-height: 1.6; }
  h1 { font-size: 22pt; margin: 0 0 .4em; } h2 { font-size: 17pt; margin: 1em 0 .3em; border-bottom: 1px solid #e5e7eb; padding-bottom: .2em; }
  h3 { font-size: 14pt; margin: .9em 0 .3em; } h4 { font-size: 12.5pt; }
  p { margin: .5em 0; } ul, ol { margin: .5em 0 .5em 1.2em; } li { margin: .2em 0; }
  code { font-family: 'SFMono-Regular', Consolas, monospace; background: #f3f4f6; padding: 1px 5px; border-radius: 4px; font-size: 90%; }
  pre { background: #0f172a; color: #e2e8f0; padding: 12px 14px; border-radius: 8px; overflow: auto; page-break-inside: avoid; }
  pre code { background: none; color: inherit; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: .8em 0; page-break-inside: avoid; font-size: 90%; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: left; } th { background: #f3f4f6; }
  blockquote { border-left: 3px solid #ff6b35; margin: .6em 0; padding: .2em 0 .2em 12px; color: #475569; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 1em 0; }
  a { color: #2563eb; } h1, h2, h3 { page-break-after: avoid; }
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
