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
    // Pre-fetch to ensure it's generated
    const resp = await fetch(url)
    if (!resp.ok) return { success: false, error: 'Image generation failed' }
    return { success: true, tool: 'image_generate', image_url: url, prompt }
  }
}
