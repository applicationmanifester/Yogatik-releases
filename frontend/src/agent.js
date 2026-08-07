/**
 * Browser-native agentic loop.
 * LLM decides which tools to call → browser executes → results sent back → final answer.
 * Uses OpenAI-compatible function calling (works with Groq, OpenRouter, OpenAI).
 */

import { streamChat } from './llm'
import { getToolSchemas, executeTool } from './tools/index'

function buildSystemPrompt({ webEnabled, persona }) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return `You are Yogatik, a helpful AI assistant with access to powerful browser-native tools.
Today's date is ${today}.

You can generate images, execute Python, create charts and diagrams, look up weather,
translate text, read QR codes, convert units, and more.

WHEN TO USE TOOLS:
- Call a tool only when it does something you cannot do by writing text. Most messages —
  explanations, opinions, summaries, code you can simply write out — need no tools at all.
  Answer those directly.
- Never call a tool to deliver, narrate, announce or format your own reply. In particular
  do NOT call tts to read your answer aloud; the user is reading it and has a play button.
- Never call a tool "just in case" or to look busy. A wrong tool call costs the user time
  and, for tts/stt, hijacks their speakers or microphone.
- When you do need several independent tools, request them in one turn — they run in
  parallel — rather than one at a time.

${webEnabled ? `RESEARCH — you have live internet access:
- Your training data is stale. For anything time-sensitive (news, prices, releases,
  schedules, "latest"/"current"/"today", or any fact that could have changed), you MUST
  call deep_research before answering. Do not answer such questions from memory, and do
  not tell the user you cannot browse the web — you can.
- deep_research runs a search AND reads the top pages in one call. Prefer it over
  web_search + web_extract chains. Use web_search alone when you only need links, and
  web_extract when the user gives you a specific URL.
- Read what the pages actually say. Ground every factual claim in the retrieved text
  rather than your priors, and quote figures and dates exactly as they appear.
- Cite sources inline as [n] matching the numbered pages you were given, and note when
  sources disagree or when the information looks outdated.
- If research returns nothing useful, say so plainly instead of guessing.
- Prefer the specialised source over a general search when one fits: wikipedia for
  definitions and background, scholar for research claims and evidence, stackoverflow
  for error messages and API usage, hackernews for practitioner opinion, archive for
  dead or paywalled links, books for literature, dictionary for word meanings.
  They return structured, attributable data instead of scraped page text.
- Live data that cannot come from memory: package_info for library versions and whether
  a project is still maintained, currency for exchange rates, geocode for coordinates,
  earthquake for recent seismic events, gutenberg for public-domain full texts.`
    : `Web access is currently disabled by the user. Answer from your own knowledge, and
say clearly when something may be out of date or when you are unsure.`}

Format with markdown when it aids clarity. Be concise.
If a tool fails, explain what happened and suggest an alternative.${persona ? `

PERSONA — the user selected this style; follow it for tone and depth, but never let
it override the tool and research rules above:
${persona}` : ''}`
}

/**
 * Build the history window under a character budget, newest-first.
 *
 * The old rule cut every message to 3000 chars, which silently shredded
 * inlined document text on the second turn. Instead we keep recent messages
 * whole and stop once the budget is spent, truncating only the single oldest
 * message that straddles the limit.
 */
const HISTORY_BUDGET = 24000
const MAX_TURNS = 20

function windowHistory(history, budget = HISTORY_BUDGET) {
  const out = []
  let used = 0

  for (const m of history.slice(-MAX_TURNS).reverse()) {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
    if (used + content.length <= budget) {
      out.push({ role: m.role, content })
      used += content.length
    } else {
      const room = budget - used
      // Only worth keeping a partial message if a useful amount survives.
      // The ellipsis counts against the budget, hence room - 1.
      if (room > 500) {
        out.push({ role: m.role, content: '…' + content.slice(-(room - 1)) })
      }
      break
    }
  }
  return out.reverse()
}

/** Tools that surface citable web sources */
const SOURCE_TOOLS = new Set(['deep_research', 'web_search', 'web_extract', 'link_preview'])

function collectSources(result) {
  if (!result || typeof result !== 'object') return []
  const out = []
  if (Array.isArray(result.sources)) out.push(...result.sources)
  if (Array.isArray(result.results)) out.push(...result.results)
  if (Array.isArray(result.pages)) out.push(...result.pages)
  if (result.url) out.push({ title: result.title || result.url, url: result.url })
  return out
    .filter(s => s?.url)
    .map(s => ({ title: s.title || s.url, url: s.url, snippet: s.snippet }))
}

/**
 * Run the agent loop.
 * @param {Object} opts
 * @param {string} opts.provider
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {Array} opts.history - Previous messages [{role, content}]
 * @param {string} opts.userMessage
 * @param {boolean} opts.toolsEnabled
 * @param {number} opts.temperature
 * @param {AbortSignal} opts.signal
 * @param {Function} opts.onToken - Streaming text callback
 * @param {Function} opts.onStatus - Status message callback
 * @param {Function} opts.onToolStart - Called when tool execution starts
 * @param {Function} opts.onToolResult - Called with tool result
 * @param {Function} opts.onDone - Called with final { content, toolResults, sources }
 * @param {Function} opts.onError - Error callback
 */
export async function runAgent({
  provider, apiKey, model, history = [], userMessage,
  toolsEnabled = true, webEnabled = true, disabledTools = [], persona = null, temperature = 0.7, signal,
  onToken, onStatus, onToolStart, onToolResult, onDone, onError, onSources,
}) {
  // Web research is only truly available if tools are on, the toggle is on,
  // and the research tools themselves have not been disabled.
  const webAvailable = toolsEnabled && webEnabled &&
    !['deep_research', 'web_search'].every(t => disabledTools.includes(t))

  const messages = [
    { role: 'system', content: buildSystemPrompt({ webEnabled: webAvailable, persona }) },
    ...windowHistory(history),
    { role: 'user', content: userMessage },
  ]

  const tools = toolsEnabled ? getToolSchemas(disabledTools) : null
  const toolResults = {}
  const sources = []
  let fullContent = ''   // everything shown to the user, across all rounds
  let roundContent = ''  // text from the current round only
  let toolCallsToProcess = []

  const processStream = () => new Promise((resolve, reject) => {
    toolCallsToProcess = []
    roundContent = ''
    streamChat({
      provider, apiKey, model, messages, tools, temperature, signal,
      onToken: (t) => { roundContent += t; fullContent += t; onToken?.(t) },
      onToolCall: (tc) => { toolCallsToProcess.push(tc) },
      onDone: () => resolve(),
      onError: (e) => reject(e),
    })
  })

  try {
    // First LLM call — may return text or tool calls
    await processStream()

    // Tool execution loop (max 5 rounds to prevent infinite loops)
    let rounds = 0
    while (toolCallsToProcess.length > 0 && rounds < 5) {
      rounds++
      const round = toolCallsToProcess.map((tc, i) => ({
        ...tc, id: tc.id || `call_${rounds}_${i}`,
      }))

      // One assistant message carrying every tool_call of this round,
      // followed by one tool message per call — the shape OpenAI-compatible
      // providers validate against (NVIDIA rejects interleaved pairs).
      messages.push({
        role: 'assistant',
        content: roundContent || null,
        tool_calls: round.map(tc => ({
          id: tc.id, type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.parsedArgs || {}) },
        })),
      })

      onStatus?.(round.length > 1
        ? `Running ${round.length} tools…`
        : `Using ${round[0].name}…`)
      round.forEach(tc => onToolStart?.(tc.name))

      // Independent calls run concurrently — a 3-page research round finishes in
      // the time of its slowest fetch instead of the sum of all of them.
      const results = await Promise.all(round.map(async (tc) => {
        try {
          return await executeTool(tc.name, tc.parsedArgs || {})
        } catch (e) {
          return { error: e?.message || String(e) }
        }
      }))

      round.forEach((tc, i) => {
        const result = results[i]
        toolResults[tc.name] = result
        onToolResult?.(tc.name, result)

        if (SOURCE_TOOLS.has(tc.name)) {
          for (const s of collectSources(result)) {
            if (!sources.some(existing => existing.url === s.url)) sources.push(s)
          }
        }

        messages.push({
          role: 'tool', tool_call_id: tc.id, name: tc.name,
          // Research payloads are large but valuable; give them more room.
          content: JSON.stringify(result).slice(0, tc.name === 'deep_research' ? 24000 : 12000),
        })
      })

      if (sources.length) onSources?.(sources)

      // Call LLM again with tool results
      onStatus?.('Thinking...')
      await processStream()
    }

    onDone?.({ content: fullContent, toolResults, sources })
  } catch (err) {
    if (err.name === 'AbortError') {
      // User pressed Stop: keep whatever was generated instead of dropping it.
      onDone?.({ content: fullContent, toolResults, sources, aborted: true })
    } else {
      onError?.(err)
    }
  }
}
