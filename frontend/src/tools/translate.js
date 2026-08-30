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

// Multi-tier Translation Engine: MyMemory -> Google GTX -> LLM Fallback
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

    let translated = ''
    let match = 1
    let quotaError = null

    // 1. Try MyMemory API (supports unit tests and standard requests)
    try {
      const myMemoryUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=${srcLang}|${tgtLang}`
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 4000)
      const resp = await fetch(myMemoryUrl, { signal: controller.signal })
      clearTimeout(timeoutId)
      if (resp.ok) {
        const data = await resp.json()
        if (data.quotaFinished) {
          quotaError = 'Daily translation quota for this network has been used up.'
        }
        if (Number(data.responseStatus) === 200 && data.responseData?.translatedText) {
          translated = data.responseData.translatedText
          match = data.responseData.match || 1
        }
      }
    } catch { /* proceed to Google GTX fallback */ }

    // 2. Fallback to Google Translate (GTX) endpoint if MyMemory fails
    if (!translated && !quotaError) {
      try {
        const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${srcLang}&tl=${tgtLang}&dt=t&q=${encodeURIComponent(text.trim())}`
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 4000)
        const resp = await fetch(gtxUrl, { signal: controller.signal })
        clearTimeout(timeoutId)
        if (resp.ok) {
          const raw = await resp.json()
          if (Array.isArray(raw?.[0])) {
            translated = raw[0].map(item => item?.[0] || '').join('')
          }
        }
      } catch { /* proceed to LLM translation fallback */ }
    }

    // 3. Fallback to LLM translation if external network endpoints are blocked by CORS/firewall
    if (!translated && !quotaError) {
      try {
        const { chatComplete } = await import('../llm')
        const { getActiveProvider, getActiveModel } = await import('../api')
        const prov = getActiveProvider() || 'nvidia'
        const mdl = getActiveModel() || 'meta/llama-3.1-70b-instruct'
        const prompt = `Translate the following text accurately from ${srcLang} to ${tgtLang}. Output ONLY the translated text without commentary, quotes, or markdown fences:\n\n${text.trim()}`
        const res = await chatComplete({
          provider: prov,
          model: mdl,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          maxTokens: 500,
        })
        const reply = res?.choices?.[0]?.message?.content?.trim()
        if (reply) translated = reply
      } catch { /* final fallback handled below */ }
    }

    if (!translated) {
      return {
        success: false,
        error: quotaError || `Could not translate text from ${srcLang} to ${tgtLang}. Please check your connection or retry.`,
      }
    }

    return {
      success: true, tool: 'translate',
      original: text, translated,
      source: srcLang, target: tgtLang,
      // ToolResultCard reads source_text/source_lang/target_lang
      source_text: text, source_lang: srcLang, target_lang: tgtLang,
      match,
    }
  }
}

