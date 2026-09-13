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
      const lang = line.replace(/^```/, '').trim().toLowerCase()
      const buf = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++])
      i++
      if (lang === 'mermaid') {
        out.push(`<div style="margin:16px 0;padding:12px;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:8px;"><div style="font-size:8.5pt;font-weight:700;color:#0284c7;text-transform:uppercase;margin-bottom:6px;letter-spacing:0.5px;">📊 Diagram Structure (Mermaid)</div><pre style="background:#0f172a;color:#f8fafc;padding:10px 14px;border-radius:6px;font-size:9pt;margin:0;"><code>${esc(buf.join('\n'))}</code></pre></div>`)
      } else {
        out.push(`<div style="margin:14px 0;border-radius:8px;overflow:hidden;border:1px solid #334155;"><div style="background:#1e293b;color:#94a3b8;font-size:8pt;font-weight:700;padding:4px 10px;text-transform:uppercase;">${lang || 'CODE'}</div><pre style="background:#0f172a;color:#f8fafc;padding:12px 14px;margin:0;overflow-x:auto;"><code>${esc(buf.join('\n'))}</code></pre></div>`)
      }
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
  @page {
    size: A4 portrait;
    margin: 18mm 16mm 20mm 16mm;
  }
  * { box-sizing: border-box; }
  body {
    font-family: 'Calibri', 'Segoe UI', Inter, -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
    color: #1e293b;
    font-size: 11pt;
    line-height: 1.6;
    margin: 0;
    padding: 0;
    background: #ffffff;
  }
  .doc-header-banner {
    border-bottom: 2px solid #0f172a;
    padding-bottom: 12px;
    margin-bottom: 22px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .doc-header-title {
    font-size: 20pt;
    font-weight: 800;
    color: #0f172a;
    margin: 0;
  }
  .doc-header-meta {
    font-size: 8.5pt;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  h1 { font-size: 20pt; color: #0f172a; border-bottom: 2px solid #2563eb; padding-bottom: 6px; margin: 20px 0 10px; page-break-after: avoid; }
  h2 { font-size: 15pt; color: #1e3a8a; margin: 18px 0 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; page-break-after: avoid; }
  h3 { font-size: 12.5pt; color: #0284c7; margin: 14px 0 6px; page-break-after: avoid; }
  h4 { font-size: 11pt; color: #334155; margin: 10px 0 4px; page-break-after: avoid; }
  p { margin: 0 0 9pt; }
  ul, ol { margin: 0 0 10pt 22pt; }
  li { margin-bottom: 3.5pt; }
  figure { page-break-inside: avoid; margin: 14px 0; }
  img { max-width: 100%; height: auto; border-radius: 6px; }
  code { font-family: 'SFMono-Regular', Consolas, Monaco, monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 88%; color: #0f172a; }
  pre { background: #0f172a; color: #f8fafc; padding: 12px 16px; border-radius: 8px; overflow: auto; page-break-inside: avoid; font-size: 9pt; line-height: 1.45; }
  pre code { background: none; color: inherit; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 14px 0; page-break-inside: avoid; font-size: 9.5pt; }
  th, td { border: 1px solid #cbd5e1; padding: 7px 11px; text-align: left; }
  th { background: #0f172a; color: #ffffff; font-weight: bold; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.5px; }
  tr:nth-child(even) { background: #f8fafc; }
  blockquote { border-left: 4px solid #2563eb; background: #eff6ff; margin: 10pt 0; padding: 8pt 14pt; color: #1e40af; page-break-inside: avoid; font-style: italic; border-radius: 0 6px 6px 0; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 18px 0; }
  a { color: #0284c7; text-decoration: none; }
  .doc-footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 8.5pt; color: #94a3b8; display: flex; justify-content: space-between; }
`

export const mdToPdfTool = {
  schema: {
    description: 'Create, generate, or export a PDF file from Markdown text. ' +
      'USE THIS TOOL whenever the user asks to "create a PDF", "generate a PDF", "make a PDF", "export as PDF", "download as PDF", "save as PDF", or "convert to PDF". ' +
      'Produces a real, polished, downloadable PDF (A4, print-quality, with headings, lists, tables, code blocks, blockquotes). ' +
      'Do NOT use doc_export for PDF — always use this tool for any PDF output.',
    parameters: { type: 'object', properties: {
      markdown: { type: 'string', description: 'Markdown content to convert to PDF' },
      filename: { type: 'string', description: 'Output filename (default document.pdf). Must end in .pdf.' },
    }, required: ['markdown'] },
  },
  async execute({ markdown, filename = 'document.pdf' }) {
    if (typeof markdown !== 'string' || !markdown.trim()) return { success: false, error: 'markdown is required' }
    const outName = String(filename).endsWith('.pdf') ? filename : `${filename}.pdf`

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

    return {
      success: true,
      tool: 'md_to_pdf',
      filename: outName,
      size: `${(blob.size / 1024).toFixed(1)} KB`,
      pdf_data_url: dataUrl,
      message: `PDF '${outName}' generated successfully (${(blob.size / 1024).toFixed(1)} KB). A download button is already presented to the user in the UI. No further tool calls or file writing are required. Summarize your completion to the user.`,
    }
  }
}
