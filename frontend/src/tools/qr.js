// QR code generate + read via CDN
async function loadQRCode() {
  if (window.QRCode) return window.QRCode
  const script = document.createElement('script')
  script.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js'
  document.head.appendChild(script)
  await new Promise((res, rej) => { script.onload = res; script.onerror = rej })
  return window.QRCode
}

async function loadJsQR() {
  if (window.jsQR) return window.jsQR
  const script = document.createElement('script')
  script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'
  document.head.appendChild(script)
  await new Promise((res, rej) => { script.onload = res; script.onerror = rej })
  return window.jsQR
}

export const qrGenerateTool = {
  schema: {
    description: 'Generate a QR code from text/URL',
    parameters: { type: 'object', properties: {
      data: { type: 'string', description: 'Text or URL to encode' },
    }, required: ['data'] },
  },
  async execute({ data }) {
    const QRCode = await loadQRCode()
    const dataUrl = await QRCode.toDataURL(data, { width: 300, margin: 2, color: { dark: '#ff6b35', light: '#0a0e14' } })
    return { success: true, tool: 'qr_generate', image_url: dataUrl, data }
  }
}

export const qrReadTool = {
  schema: {
    description: 'Read/decode a QR code from an image',
    parameters: { type: 'object', properties: {
      image_url: { type: 'string', description: 'URL or data URL of image containing QR code' },
    }, required: ['image_url'] },
  },
  async execute({ image_url }) {
    const jsQR = await loadJsQR()
    const img = new Image(); img.crossOrigin = 'anonymous'
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = image_url })
    const canvas = document.createElement('canvas')
    canvas.width = img.width; canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height)
    if (!code) return { success: false, error: 'No QR code found in image' }
    return { success: true, tool: 'qr_read', data: code.data }
  }
}
