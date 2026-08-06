// pdf.js — Mozilla's PDF reader, runs in browser
export const pdfExtractTool = {
  schema: {
    description: 'Extract text from a PDF file',
    parameters: { type: 'object', properties: {
      url: { type: 'string', description: 'URL or data URL of the PDF' },
    }, required: ['url'] },
  },
  async execute({ url }) {
    const pdfjsLib = await import('pdfjs-dist')
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
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
