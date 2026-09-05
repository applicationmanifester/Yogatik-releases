// pdf.js via CDN with automatic OCR fallback for scanned/rasterized documents (e.g. IXIGO tickets, receipts, scans)
let _pdfjs = null

const PDFJS_CDNS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs',
  'https://unpkg.com/pdfjs-dist@4.4.168/build/pdf.min.mjs',
]

async function loadPdfJs() {
  if (_pdfjs) return _pdfjs
  let lastErr = null
  for (const cdn of PDFJS_CDNS) {
    try {
      const mod = await import(/* @vite-ignore */ cdn)
      if (mod?.GlobalWorkerOptions) {
        mod.GlobalWorkerOptions.workerSrc = cdn.replace('pdf.min.mjs', 'pdf.worker.min.mjs')
      }
      _pdfjs = mod
      return mod
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr || new Error('Failed to load PDF engine (pdf.js)')
}

export const pdfExtractTool = {
  schema: {
    description: 'Extract text from a PDF file. Automatically falls back to OCR if the PDF is a scan, photo, or image-based document (e.g. ticket, receipt).',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL or data URL of the PDF' },
        maxPages: { type: 'number', description: 'Maximum pages to inspect or OCR (default 15)' },
        ocrFallback: { type: 'boolean', description: 'Run OCR on rendered canvas if text layer is empty (default true)' },
      },
      required: ['url'],
    },
  },
  async execute({ url, maxPages = 15, ocrFallback = true }) {
    if (!url) {
      return { success: false, tool: 'pdf_extract', error: 'PDF url or data URL is required' }
    }

    try {
      const pdfjsLib = await loadPdfJs()
      const loadingTask = pdfjsLib.getDocument(url)
      const doc = await loadingTask.promise

      let text = ''
      const totalPages = doc.numPages || 1
      const pagesToScan = Math.min(totalPages, maxPages)

      // 1. First pass: extract digital text layer
      for (let i = 1; i <= pagesToScan; i++) {
        try {
          const page = await doc.getPage(i)
          const content = await page.getTextContent()
          const pageStr = (content.items || []).map((item) => item.str).join(' ').trim()
          if (pageStr) {
            text += (totalPages > 1 ? `[Page ${i}]\n` : '') + pageStr + '\n\n'
          }
        } catch (pageErr) {
          console.warn(`[pdf_extract] Error reading text on page ${i}:`, pageErr)
        }
      }

      const cleanText = text.trim()

      // If text layer yielded meaningful content, return immediately (fast path)
      if (cleanText.length >= 50) {
        return {
          success: true,
          tool: 'pdf_extract',
          text: cleanText,
          pages: totalPages,
          method: 'digital_text_layer',
        }
      }

      // 2. Second pass: Scanned document, image ticket, or flattened PDF (e.g. IXIGO ticket, passport, invoice scan)
      // Render pages onto offscreen canvas and run OCR
      if (ocrFallback && typeof document !== 'undefined') {
        try {
          const { ocrTool } = await import('./ocr')
          let ocrCombinedText = ''
          const maxOcrPages = Math.min(pagesToScan, 8) // Scan up to 8 pages to balance speed & depth

          for (let i = 1; i <= maxOcrPages; i++) {
            try {
              const page = await doc.getPage(i)
              // 1.75x viewport provides crisp DPI for optical character recognition without memory explosion
              const viewport = page.getViewport({ scale: 1.75 })
              const canvas = document.createElement('canvas')
              canvas.width = Math.round(viewport.width)
              canvas.height = Math.round(viewport.height)
              const ctx = canvas.getContext('2d', { willReadFrequently: true })

              if (ctx) {
                await page.render({ canvasContext: ctx, viewport }).promise
                const dataUrl = canvas.toDataURL('image/png')

                const ocrRes = await ocrTool.execute({ image_url: dataUrl })
                if (ocrRes?.text?.trim()) {
                  ocrCombinedText += (totalPages > 1 ? `[Page ${i} (OCR)]\n` : '') + ocrRes.text.trim() + '\n\n'
                }
              }

              // Release canvas memory immediately
              canvas.width = 0
              canvas.height = 0
            } catch (pageOcrErr) {
              console.warn(`[pdf_extract] Canvas OCR failed on page ${i}:`, pageOcrErr)
            }
          }

          if (ocrCombinedText.trim().length > 0) {
            return {
              success: true,
              tool: 'pdf_extract',
              text: ocrCombinedText.trim(),
              pages: totalPages,
              method: 'ocr_rendered_pages',
            }
          }
        } catch (ocrModuleErr) {
          console.warn('[pdf_extract] OCR fallback module error:', ocrModuleErr)
        }
      }

      // If sparse text was found (even if under 50 chars), return it rather than failing
      if (cleanText.length > 0) {
        return {
          success: true,
          tool: 'pdf_extract',
          text: cleanText,
          pages: totalPages,
          method: 'sparse_text',
        }
      }

      return {
        success: false,
        tool: 'pdf_extract',
        error: 'No extractable text or legible scanned content found in this PDF.',
        pages: totalPages,
      }
    } catch (err) {
      return {
        success: false,
        tool: 'pdf_extract',
        error: err?.message || 'Failed to process PDF',
      }
    }
  },
}
