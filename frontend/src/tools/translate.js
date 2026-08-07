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
    if (!text?.trim()) return { success: false, error: 'Nothing to translate' }
    if (source === target) return { success: false, error: `Source and target are both "${target}"` }

    let data
    try {
      const resp = await fetch(url)
      if (!resp.ok) return { success: false, error: `Translation service returned ${resp.status}` }
      data = await resp.json()
    } catch (e) {
      return { success: false, error: `Could not reach the translation service: ${e.message}` }
    }

    // responseStatus arrives as a number or a string depending on the endpoint.
    if (Number(data.responseStatus) !== 200) {
      return { success: false, error: data.responseDetails || 'Translation failed' }
    }
    const translated = data.responseData?.translatedText
    // MyMemory answers 200 with an empty string once the daily quota is spent —
    // reporting that as success handed the model a blank translation.
    if (!translated) {
      return {
        success: false,
        error: data.quotaFinished
          ? 'Daily translation quota for this network has been used up. Try again tomorrow.'
          : 'The translation service returned nothing.',
      }
    }
    return {
      success: true, tool: 'translate',
      original: text, translated,
      source, target,
      match: data.responseData?.match,
    }
  }
}
