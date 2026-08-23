// Image metadata extraction using Canvas + EXIF
export const imageInfoTool = {
  schema: {
    description: 'Get image dimensions, size, and basic metadata',
    parameters: { type: 'object', properties: {
      url: { type: 'string', description: 'Image URL or data URL' },
    }, required: ['url'] },
  },
  async execute({ url }) {
    if (typeof url !== 'string' || !url.trim()) return { success: false, error: 'url is required' }
    const img = new Image(); img.crossOrigin = 'anonymous'
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url })
    const resp = await fetch(url)
    const blob = await resp.blob()
    return {
      success: true, tool: 'image_info',
      width: img.naturalWidth, height: img.naturalHeight,
      aspectRatio: `${img.naturalWidth}:${img.naturalHeight}`,
      size: `${(blob.size / 1024).toFixed(1)} KB`,
      type: blob.type,
    }
  }
}
