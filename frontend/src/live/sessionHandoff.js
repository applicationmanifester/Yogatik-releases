/**
 * Post-Live Session Handoff & Executive Deliverable Synthesizer
 *
 * When a Live or Cascade voice session concludes, this module compiles
 * the spoken turns, tools executed, and shared vision context into a concise,
 * structured markdown record, extracts actionable next steps, and classifies the session.
 */

/**
 * Categorizes the session by analyzing primary intents in the dialogue.
 * @param {Array<{role: string, text: string}>} transcripts
 * @returns {'engineering' | 'research' | 'creative' | 'planning' | 'general'}
 */
export function categorizeLiveSession(transcripts = []) {
  const allText = transcripts.map(t => t.text || '').join(' ').toLowerCase()
  if (/\b(bug|code|git|error|function|api|test|build|database|deploy|component)\b/i.test(allText)) {
    return 'engineering'
  }
  if (/\b(paper|arxiv|search|study|source|history|statistics|data|analysis)\b/i.test(allText)) {
    return 'research'
  }
  if (/\b(design|ui|ux|color|layout|logo|font|draft|copy|story)\b/i.test(allText)) {
    return 'creative'
  }
  if (/\b(schedule|meeting|sprint|goal|priority|quarter|launch|deadline)\b/i.test(allText)) {
    return 'planning'
  }
  return 'general'
}

/**
 * Heuristically extracts action items / follow-ups from transcripts.
 * @param {Array<{role: string, text: string}>} transcripts
 * @returns {string[]}
 */
export function extractActionItems(transcripts = []) {
  const items = []
  const actionRegex = /\b(will|should|need to|let's|todo|going to|make sure to|remember to|plan to|follow up on|fix|implement|create|deploy|verify|investigate)\s+([^.?!;\n]+)/i

  for (const t of transcripts) {
    if (!t?.text) continue
    const sentences = t.text.split(/[.?!;\n]+/)
    for (const s of sentences) {
      const match = s.match(actionRegex)
      if (match && match[2] && match[2].trim().length > 8) {
        let verb = match[1].toLowerCase()
        let desc = match[2].trim().replace(/^that\s+/i, '')
        const item = `${verb} ${desc}`
        const clean = item.charAt(0).toUpperCase() + item.slice(1)
        if (!items.includes(clean) && items.length < 8) {
          items.push(clean)
        }
      }
    }
  }
  return items
}

/**
 * Synthesizes 1-3 bullet highlights from the conversation turns.
 * @param {Array<{role: string, text: string}>} transcripts
 * @returns {string[]}
 */
export function generateExecutiveSummary(transcripts = []) {
  const userQuestions = transcripts
    .filter(t => t.role === 'user' && t.text && t.text.includes('?'))
    .map(t => t.text.trim())

  const highlights = []
  if (userQuestions.length > 0) {
    highlights.push(`Explored: "${userQuestions[0]}"`)
    if (userQuestions.length > 1) {
      highlights.push(`Followed up on: "${userQuestions[userQuestions.length - 1]}"`)
    }
  } else if (transcripts.length > 0) {
    const firstTurn = transcripts[0].text.slice(0, 90).trim()
    highlights.push(`Discussion initiated regarding "${firstTurn}…"`)
  }

  return highlights
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
  const category = categorizeLiveSession(transcripts)
  const summaryBullets = generateExecutiveSummary(transcripts)

  let md = `### 🎙️ Live Session Brief (${timeFormatted}) · ${category.toUpperCase()}\n\n`
  md += `* **Model / Mode:** \`${model}\` (${provider})\n`
  md += `* **Exchange:** ${userTurns} user turn${userTurns === 1 ? '' : 's'} · ${modelTurns} assistant response${modelTurns === 1 ? '' : 's'}\n`

  if (toolsExecuted.length > 0) {
    const uniqueTools = [...new Set(toolsExecuted.map(t => `\`${t.name}\``))].join(', ')
    md += `* **Tools Run Live:** ${uniqueTools}\n`
  }

  if (summaryBullets.length > 0) {
    md += `\n**Key Discussion Points:**\n`
    for (const b of summaryBullets) {
      md += `* ${b}\n`
    }
  }

  if (actions.length > 0) {
    md += `\n**Action Items & Deliverables:**\n`
    for (const act of actions) {
      md += `- [ ] ${act}\n`
    }
  }

  if (transcripts.length > 0) {
    md += `\n<details>\n<summary><strong>View Full Spoken Dialogue (${transcripts.length} turns)</strong></summary>\n\n`
    for (const t of transcripts) {
      const isUser = t.role === 'user'
      const label = isUser ? '🗣️ **You**' : '🤖 **Assistant**'
      md += `* ${label}: ${t.text.trim()}\n`
    }
    md += `\n</details>\n`
  }

  return md.trim()
}
