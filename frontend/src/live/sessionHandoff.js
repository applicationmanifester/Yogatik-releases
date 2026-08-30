/**
 * Post-Live Session Handoff & Memory Synthesizer
 *
 * When a Live or Cascade voice session concludes, this module compiles
 * the spoken turns, tools executed, and shared vision context into a concise,
 * structured markdown record and extracts actionable next steps.
 */

/**
 * Heuristically extracts action items / follow-ups from transcripts.
 * @param {Array<{role: string, text: string}>} transcripts
 * @returns {string[]}
 */
export function extractActionItems(transcripts = []) {
  const items = []
  const actionRegex = /\b(will|should|need to|let's|todo|going to|make sure to|remember to|plan to)\s+([^.?!;\n]+)/i

  for (const t of transcripts) {
    if (!t?.text) continue
    const sentences = t.text.split(/[.?!;\n]+/)
    for (const s of sentences) {
      const match = s.match(actionRegex)
      if (match && match[2] && match[2].trim().length > 8) {
        const item = `${match[1].toLowerCase()} ${match[2].trim()}`
        if (!items.includes(item) && items.length < 5) {
          items.push(item)
        }
      }
    }
  }
  return items
}

/**
 * Formats a live session transcript and tool log into a structured markdown recap.
 * @param {Object} options
 * @param {number} [options.durationSec]
 * @param {Array<{role: 'user'|'model'|'assistant'|'system', text: string}>} [options.transcripts]
 * @param {Array<{name: string, result?: any}>} [options.toolsExecuted]
 * @param {string} [options.provider]
 * @param {string} [options.model]
 * @returns {string}
 */
export function formatLiveSessionRecap({
  durationSec = 0,
  transcripts = [],
  toolsExecuted = [],
  provider = 'live',
  model = 'default',
} = {}) {
  const mins = Math.floor(durationSec / 60)
  const secs = Math.floor(durationSec % 60)
  const timeFormatted = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`

  const userTurns = transcripts.filter(t => t.role === 'user').length
  const modelTurns = transcripts.filter(t => t.role === 'model' || t.role === 'assistant').length
  const actions = extractActionItems(transcripts)

  let md = `### 🎙️ Live Session Recap (${timeFormatted})\n\n`
  md += `* **Model / Mode:** \`${model}\` (${provider})\n`
  md += `* **Exchange:** ${userTurns} user turn${userTurns === 1 ? '' : 's'} · ${modelTurns} assistant response${modelTurns === 1 ? '' : 's'}\n`

  if (toolsExecuted.length > 0) {
    md += `* **Tools Run Live:** ${[...new Set(toolsExecuted.map(t => `\`${t.name}\``))].join(', ')}\n`
  }

  if (actions.length > 0) {
    md += `\n**Key Action Items & Follow-ups:**\n`
    for (const act of actions) {
      md += `- [ ] ${act.charAt(0).toUpperCase() + act.slice(1)}\n`
    }
  }

  if (transcripts.length > 0) {
    md += `\n<details>\n<summary><strong>View Full Spoken Dialogue (${transcripts.length} entries)</strong></summary>\n\n`
    for (const t of transcripts) {
      const isUser = t.role === 'user'
      const label = isUser ? '🗣️ **You**' : '🤖 **Assistant**'
      md += `* ${label}: ${t.text.trim()}\n`
    }
    md += `\n</details>\n`
  }

  return md.trim()
}
