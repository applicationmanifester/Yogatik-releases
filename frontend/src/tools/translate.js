// MyMemory Translation API — free, CORS-friendly, no key needed
export const translateTool = {
  schema: {
    description: 'Translate text between languages',
    parameters: { type: 'object', properties: {
      text: { type: 'string', description: 'Text to translate' },
      target: { type: 'string', description: 'Target language code (e.g., es, fr, ja, de)' },
      source: { type: 'string', description: 'Source language code (default: auto-detect)' },
    }, required: ['text', 'target'] },
  },
  async execute({ text, target, source = 'en' }) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}`
    const resp = await fetch(url)
    const data = await resp.json()
    if (data.responseStatus !== 200) return { success: false, error: data.responseDetails }
    return {
      success: true, tool: 'translate',
      original: text, translated: data.responseData.translatedText,
      source, target,
    }
  }
}
