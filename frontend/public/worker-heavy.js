/**
 * worker-heavy — dedicated lazy-loaded Web Worker for heavy on-device tools.
 *
 * Served from public/ so it keeps a stable URL (/worker-heavy.js) in dev,
 * production and the packaged desktop build. Same pattern as
 * public/worker-pyodide.js: postMessage multiplexed by id, ArrayBuffers as
 * transferables (zero-copy), and a STATEFUL kernel — the Tesseract worker and
 * any loaded engines persist across calls instead of re-downloading per call.
 *
 * Supported messages (all `{ id, type, ... }` → `{ id, success, ... }`):
 * - { type:'ping' } → { success:true, ready, engines }
 * - { type:'ocr', image:{ buffer, width, height } | { dataUrl }, lang }
 *   → posts back { success:true, text, confidence } (best-effort; the tool
 *   layer falls back to its main-thread pipeline when the engine CDN is
 *   unreachable from a worker context).
 * - { type:'hash', buffer } → { success:true, digest } (SHA-256 over a
 *   transferred buffer — proves the transferable path without a model).
 * - { type:'reset' } → drops stateful engines (memory pressure).
 */

let tesseractPromise = null
let tesseractLang = null

async function getTesseract(lang = 'eng') {
  if (tesseractPromise && tesseractLang === lang) return tesseractPromise
  tesseractPromise = (async () => {
    // Tesseract.js UMD inside a worker: importScripts keeps this off the
    // main thread entirely, including the traineddata fetch.
    if (typeof importScripts === 'function' && typeof self.Tesseract === 'undefined') {
      importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js')
    }
    const T = self.Tesseract
    if (!T) throw new Error('OCR engine unavailable in worker')
    const worker = await T.createWorker(lang)
    tesseractLang = lang
    return worker
  })()
  try {
    return await tesseractPromise
  } catch (e) {
    tesseractPromise = null
    tesseractLang = null
    throw e
  }
}

async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function bufferToDataUrl(buffer, mime = 'image/png') {
  // FileReaderSync exists only in workers; fall back to base64 loop otherwise.
  try {
    if (typeof FileReaderSync !== 'undefined') {
      const reader = new FileReaderSync()
      return reader.readAsDataURL(new Blob([buffer], { type: mime }))
    }
  } catch { /* fall through */ }
  const bytes = new Uint8Array(buffer)
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return `data:${mime};base64,${btoa(bin)}`
}

self.onmessage = async (e) => {
  const { id, type, ...args } = e.data || {}
  const reply = (payload) => self.postMessage({ id, ...payload })
  try {
    switch (type) {
      case 'ping': {
        reply({ success: true, type: 'pong', ready: true, engines: { tesseract: !!tesseractPromise } })
        break
      }
      case 'hash': {
        // `buffer` arrives as a transferable — zero-copy, no clone cost.
        if (!args.buffer) throw new Error('hash needs a transferred buffer')
        reply({ success: true, type: 'hashed', digest: await sha256(args.buffer) })
        break
      }
      case 'ocr': {
        const { lang = 'eng', image } = args
        if (!image) throw new Error('ocr needs an image')
        const engine = await getTesseract(lang)
        const target = image.buffer
          ? bufferToDataUrl(image.buffer, image.mime || 'image/png')
          : image.dataUrl
        if (!target) throw new Error('ocr needs image.buffer or image.dataUrl')
        const { data } = await engine.recognize(target)
        reply({ success: true, type: 'ocr-result', text: (data?.text || '').trim(), confidence: data?.confidence ?? 0 })
        break
      }
      case 'reset': {
        try {
          const w = tesseractPromise ? await tesseractPromise.catch(() => null) : null
          await w?.terminate?.()
        } catch { /* already gone */ }
        tesseractPromise = null
        tesseractLang = null
        reply({ success: true, type: 'reset-done' })
        break
      }
      default:
        reply({ success: false, type: 'error', error: `Unknown heavy-worker message: ${type}` })
    }
  } catch (err) {
    reply({ success: false, type: 'error', error: err?.message || String(err) })
  }
}

self.postMessage({ type: 'worker-loaded' })
