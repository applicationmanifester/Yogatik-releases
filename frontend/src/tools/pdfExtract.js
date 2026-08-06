// pdf.js via CDN — Mozilla's PDF reader
let _pdfjs = null
async function loadPdfJs() {
  if (_pdfjs) return _pdfjs
  const mod = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs')
  mod.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs'
  _pdfjs = mod
  return mod
}

export const pdfExtractTool = {
  schema: {
    description: 'Extract text from a PDF file',
    parameters: { type: 'object', properties: {
      url: { type: 'string', description: 'URL or data URL of the PDF' },
    }, required: ['url'] },
  },
  async execute({ url }) {
    const pdfjsLib = await loadPdfJs()
    const doc = await pdfjsLib.getDocument(url).promise
    let text = ''
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      text += content.items.map(item => item.str).join(' ') + '\n\n'
    }
    return { success: true, tool: 'pdf_extract', text: text.trim(), pages: doc.numPages }
  }
}
