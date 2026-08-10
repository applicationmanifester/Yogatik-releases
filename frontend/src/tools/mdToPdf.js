// Markdown to PDF using html2pdf.js (browser-native)
export const mdToPdfTool = {
  schema: {
    description: 'Convert markdown text to a downloadable PDF',
    parameters: { type: 'object', properties: {
      markdown: { type: 'string', description: 'Markdown content' },
      filename: { type: 'string', description: 'Output filename (default document.pdf)' },
    }, required: ['markdown'] },
  },
  async execute({ markdown, filename = 'document.pdf' }) {
    const outName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
    let html = markdown
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>')

    const container = document.createElement('div')
    container.innerHTML = html
    container.style.cssText = 'font-family:Inter,sans-serif;padding:40px;color:#1a2332;font-size:14px;line-height:1.6'

    if (!window.html2pdf) {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js'
      document.head.appendChild(s)
      await new Promise((res, rej) => { s.onload = res; s.onerror = rej })
    }
    const blob = await window.html2pdf().from(container).set({
      margin: 10, filename: outName, jsPDF: { unit: 'mm', format: 'a4' }
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
      size: `${(blob.size/1024).toFixed(1)} KB`,
      pdf_data_url: dataUrl
    }
  }
}
