// Tesseract.js — OCR in the browser via CDN
let workerReady = null

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract
  const script = document.createElement('script')
  script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
  document.head.appendChild(script)
  await new Promise((res, rej) => { script.onload = res; script.onerror = rej })
  return window.Tesseract
}

export const ocrTool = {
  schema: {
    description: 'Extract text from an image using OCR',
    parameters: { type: 'object', properties: {
      image_url: { type: 'string', description: 'URL or data URL of the image' },
      lang: { type: 'string', description: 'Language code (default eng)' },
    }, required: ['image_url'] },
  },
  async execute({ image_url, lang = 'eng' }) {
    const Tesseract = await loadTesseract()
    const { data: { text, confidence } } = await Tesseract.recognize(image_url, lang)
    return { success: true, tool: 'ocr', text: text.trim(), confidence, lang }
  }
}
