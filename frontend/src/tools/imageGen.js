// Pollinations.ai — free, no key, CORS-friendly
export const imageGenTool = {
  schema: {
    description: 'Generate an image from a text prompt',
    parameters: { type: 'object', properties: {
      prompt: { type: 'string', description: 'Image description' },
      width: { type: 'number', description: 'Width in pixels (default 1024)' },
      height: { type: 'number', description: 'Height in pixels (default 1024)' },
    }, required: ['prompt'] },
  },
  async execute({ prompt, width = 1024, height = 1024 }) {
    const seed = Math.floor(Math.random() * 999999)
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=true`
    // Pollinations renders on first request, so we must fetch once to trigger
    // generation — keep those bytes as a blob URL instead of throwing them away
    // and making the <img> download the same megabyte all over again.
    const resp = await fetch(url)
    if (!resp.ok) return { success: false, error: `Image generation failed (${resp.status})` }
    const blob = await resp.blob()
    if (!blob.size) return { success: false, error: 'Image generation returned no data' }
    return {
      success: true, tool: 'image_generate', prompt,
      image_url: URL.createObjectURL(blob),
      source_url: url,
      bytes: blob.size,
    }
  }
}
