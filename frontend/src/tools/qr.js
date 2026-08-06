// QR code generate (qrcode lib) + read (jsQR)
export const qrGenerateTool = {
  schema: {
    description: 'Generate a QR code from text/URL',
    parameters: { type: 'object', properties: {
      data: { type: 'string', description: 'Text or URL to encode' },
    }, required: ['data'] },
  },
  async execute({ data }) {
    const QRCode = (await import('qrcode')).default
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
    const jsQR = (await import('jsqr')).default
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
