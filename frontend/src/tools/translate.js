const LANG_MAP = {
  english: 'en', spanish: 'es', french: 'fr', german: 'de', italian: 'it', portuguese: 'pt',
  japanese: 'ja', chinese: 'zh', mandarin: 'zh', cantonese: 'zh', hindi: 'hi', telugu: 'te',
  tamil: 'ta', korean: 'ko', russian: 'ru', arabic: 'ar', dutch: 'nl', polish: 'pl',
  turkish: 'tr', vietnamese: 'vi', greek: 'el', swedish: 'sv', czech: 'cs', romanian: 'ro',
  danish: 'da', finnish: 'fi', hungarian: 'hu', indonesian: 'id', thai: 'th', ukrainian: 'uk',
  bengali: 'bn', marathi: 'mr', urdu: 'ur', punjabi: 'pa', gujarati: 'gu', malayalam: 'ml',
  kannada: 'kn', persian: 'fa', hebrew: 'he', swahili: 'sw', filipino: 'tl', tagalog: 'tl',
}

function normLang(l, fallback = 'en') {
  if (!l) return fallback
  const s = String(l).trim().toLowerCase()
  if (s.length === 2) return s
  return LANG_MAP[s] || s.slice(0, 2)
}

// MyMemory Translation API — free, CORS-friendly, no key needed
export const translateTool = {
  schema: {
    description: 'Translate text between languages',
    parameters: { type: 'object', properties: {
      text: { type: 'string', description: 'Text to translate' },
      target: { type: 'string', description: 'Target language name or ISO code (e.g., es, French, ja, German, Hindi, Japanese)' },
      source: { type: 'string', description: 'Source language name or ISO code (default: auto-detect or en)' },
    }, required: ['text', 'target'] },
  },
  async execute({ text, target, source = 'en' }) {
    if (!text?.trim()) return { success: false, error: 'Nothing to translate' }
    const srcLang = normLang(source, 'en')
    const tgtLang = normLang(target, 'es')

    if (srcLang === tgtLang) return { success: false, error: `Source and target are both "${tgtLang}"` }

    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=${srcLang}|${tgtLang}`

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
      source: srcLang, target: tgtLang,
      // ToolResultCard reads source_text/source_lang/target_lang; without these
      // aliases the card rendered "Translation (undefined → undefined)".
      source_text: text, source_lang: srcLang, target_lang: tgtLang,
      match: data.responseData?.match,
    }
  }
}

