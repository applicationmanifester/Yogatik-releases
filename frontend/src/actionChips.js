/**
 * actionChips.js — Interactive Action Chips for Proactive Agent Next Steps
 *
 * Extracts and sanitizes structured follow-up action suggestions emitted by
 * AI models (e.g. ```action_chips [...] ``` or <action ... /> tags) so the UI
 * can render sleek, clickable 1-click follow-up buttons.
 */

/**
 * Extracts action chips from raw message text and removes the raw markup
 * so the message renders clean markdown text.
 *
 * @param {string} rawText
 * @returns {{ cleanText: string, chips: Array<{ id: string, label: string, prompt?: string, tool?: string, icon?: string }> }}
 */
export function extractActionChips(rawText = '') {
  if (!rawText || typeof rawText !== 'string') {
    return { cleanText: '', chips: [] }
  }

  let cleanText = rawText
  const chips = []

  // 1. Match code block style: ```action_chips \n [ ... ] \n ``` or ```actions ... ```
  const codeBlockRegex = /```(?:action_chips|actions|quick_actions)\s*([\s\S]*?)```/gi
  let match
  while ((match = codeBlockRegex.exec(rawText)) !== null) {
    const jsonStr = match[1]?.trim()
    try {
      const parsed = JSON.parse(jsonStr)
      if (Array.isArray(parsed)) {
        parsed.forEach((item, idx) => {
          if (item && (item.label || item.prompt)) {
            chips.push({
              id: item.id || `chip_${chips.length + 1}`,
              label: item.label || item.prompt,
              prompt: item.prompt || item.label,
              tool: item.tool,
              icon: item.icon || 'zap',
            })
          }
        })
      }
    } catch {
      // If not strict JSON, parse lines like: - Run tests (npm test)
      const lines = jsonStr.split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('*'))
      for (const line of lines) {
        const clean = line.replace(/^[-*]\s*/, '').trim()
        if (clean) {
          chips.push({
            id: `chip_${chips.length + 1}`,
            label: clean,
            prompt: clean,
            icon: 'zap',
          })
        }
      }
    }
  }
  cleanText = cleanText.replace(codeBlockRegex, '').trim()

  // 2. Match XML-like tag style: <action_chips>...</action_chips>
  const tagBlockRegex = /<action_chips>([\s\S]*?)<\/action_chips>/gi
  while ((match = tagBlockRegex.exec(cleanText)) !== null) {
    const inner = match[1]?.trim()
    try {
      const parsed = JSON.parse(inner)
      if (Array.isArray(parsed)) {
        parsed.forEach(item => {
          if (item && (item.label || item.prompt)) {
            chips.push({
              id: item.id || `chip_${chips.length + 1}`,
              label: item.label || item.prompt,
              prompt: item.prompt || item.label,
              tool: item.tool,
              icon: item.icon || 'zap',
            })
          }
        })
      }
    } catch {}
  }
  cleanText = cleanText.replace(tagBlockRegex, '').trim()

  // 3. Match inline action syntax: [action: Label | prompt: custom prompt]
  const inlineRegex = /\[action:\s*([^|\]]+)(?:\|\s*prompt:\s*([^\]]+))?\]/gi
  while ((match = inlineRegex.exec(cleanText)) !== null) {
    const label = match[1]?.trim()
    const prompt = (match[2] || label)?.trim()
    if (label) {
      chips.push({
        id: `chip_${chips.length + 1}`,
        label,
        prompt,
        icon: 'zap',
      })
    }
  }
  cleanText = cleanText.replace(inlineRegex, '').trim()

  return { cleanText, chips }
}
