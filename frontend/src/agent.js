/**
 * Browser-native agentic loop.
 * LLM decides which tools to call → browser executes → results sent back → final answer.
 * Uses OpenAI-compatible function calling (works with Groq, OpenRouter, OpenAI).
 */

import { streamChat } from './llm'
import { getToolSchemas, executeTool } from './tools/index'
import { buildToolPrompt, parseToolCalls, formatToolResults } from './promptedTools'
import { setVisionContext } from './tools/see'
import { describeWithoutModel } from './vision/source'
import { getSetting } from './db'
import { resolveFeatures } from './features'
import { getActiveSkill, skillDisabledTools } from './skills'
import { getActiveAgent, agentDisabledTools } from './agents'
import { getActiveStyleBlock } from './styles'
import { loadProjectInstructions } from './projectInstructions'

/** Durable memories the user asked to keep, injected so the model recalls them
 *  without needing a memory tool call (like ChatGPT/Claude memory). */
async function memoryBlock() {
  try {
    const mem = (await getSetting('user_memory', [])) || []
    if (!mem.length) return ''
    return '\n\nUSER MEMORY — durable facts the user asked you to remember. Use them when ' +
      'relevant; do not recite them unprompted.\n' +
      mem.slice(-20).map(m => `- ${m.text}`).join('\n')
  } catch { return '' }
}

function buildSystemPrompt({ webEnabled, persona, planMode }) {
  const now = new Date()
  const today = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const time = now.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
  })
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  return `You are Yogatik, a helpful AI assistant with access to powerful browser-native tools.
CURRENT SYSTEM CLOCK: ${today} at ${time} (${timeZone}).
CRITICAL TIME INSTRUCTION: If the user asks for the current time, date, or timezone, you MUST report this exact local time: ${time} on ${today} (${timeZone}). Do NOT invent any other time.

You can generate images, execute Python, create charts and diagrams, look up weather,
translate text, read QR codes, convert units, and more.

Guidelines:
- Answer directly, accurately, and concisely.
- For weather, forecast, temperature, or climate queries, ALWAYS invoke the 'weather' tool to fetch accurate real-time data and render interactive weather cards.
- For coding, produce complete, runnable blocks.
- Highlight key facts with bold text.
- STRICT ANTI-HALLUCINATION & FACT-GROUNDING RULES:
  1. GROUND ALL FACTS: Never invent URLs, domain links, paper titles, prices, statistics, or synthetic citations.
  2. TOOL RESULT INTEGRITY: Base all technical, news, financial, and scientific assertions strictly on tool outputs or verified knowledge.
  3. HONEST UNCERTAINTY: If web tools return empty or broken results, state what was found or missing honestly instead of guessing or hallucinating plausible answers.
  4. HYPERLINK SAFETY: Only output markdown hyperlinks ([title](url)) if the URL was explicitly returned in tool outputs or verified sources. Never construct fake URL paths.
  5. EXACT ACCURACY: Quote statistics, numbers, dates, and technical specifications exactly as returned by tools.
- ASK WHEN GENUINELY AMBIGUOUS: if the request is missing something you truly cannot proceed
  without, or could reasonably mean very different things (a name matching several people, an
  unspecified target/format/scope for a real task), ask ONE short clarifying question instead
  of guessing. Otherwise do not stall — make the most reasonable assumption, state it in one
  line ("Assuming you mean X…"), and proceed. Never ask a question you can answer yourself, and
  never ask more than one at a time. Simple factual questions never need clarification.

WHEN TO USE TOOLS:
- Call a tool only when it does something you cannot do by writing text. Most messages —
  explanations, opinions, summaries, code you can simply write out — need no tools at all.
  Answer those directly.
- For YouTube links, use the youtube tool first. If it returns a transcript, summarize
  that transcript. If it only returns metadata, tell the user the transcript was not
  available instead of inventing video content.
- To MAKE or GENERATE a VIDEO, you CAN — call video_render with a scenes array (title,
  text/bullets, image, and bars scene types). Add a "narration" line to each scene and it
  is spoken by an on-device voice with burnt-in subtitles; call image_generate first if you
  want generated visuals. This produces a real MP4 on the device. Never tell the user you
  cannot create videos — build the scene list and call the tool.
- To RUN JavaScript, use js_execute; for Python use code_execute. To remember or recall a
  durable user fact/preference across sessions, use the memory tool.
- When the user wants to LISTEN to something as a saved file (audio summary, read-aloud,
  audio overview), use text_to_audio — it returns a downloadable narrated WAV. Use tts only
  for an immediate speak-aloud with no file.
- Use keyword_extract for keywords, tags, themes, or search terms from longer text.
- Use entity_extract when you need names, places, dates, numbers, emails, or URLs from text.
- Use query_refine to turn a messy prompt into a cleaner search query or a few focused subqueries.
- Never call a tool to deliver, narrate, announce or format your own reply. In particular
  do NOT call tts to read your answer aloud; the user is reading it and has a play button.
- Never call a tool "just in case" or to look busy. A wrong tool call costs the user time
  and, for tts/stt, hijacks their speakers or microphone.
- When you do need several independent tools, request them in one turn — they run in
  parallel — rather than one at a time.

DELEGATE AUTOMATICALLY WITH SUB-AGENTS (spawn_agents):
- For any task that spans MULTIPLE distinct sub-tasks — e.g. research + write, gather data
  + analyse + chart, or build several independent parts — call spawn_agents WITHOUT being
  asked. Hand each sub-task to the right specialist: researcher (find/cite facts), coder
  (write/run code), analyst (analyse/chart data), writer (draft/polish prose), planner
  (break down a goal). They run in parallel; you then synthesize their results into one
  coherent answer. This is autonomous, expected behaviour — the user should not have to
  request it.
- Judge scope honestly: a single-step question (one fact, one short answer, one snippet)
  needs NO delegation — answer it directly. Delegation is for genuinely multi-part work.
- After the sub-agents return, integrate their outputs yourself; do not just paste them.

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

SELF-CHECK before finalizing: for multi-step or factual answers, verify your work against the
tool results you actually received. If a result contradicts your draft, correct the draft rather
than repeating your first guess. If you could not complete part of the task, say so plainly.
CONFIRM BEFORE IRREVERSIBLE OR COSTLY ACTIONS: if a step would delete data, overwrite the user's
files, spend money, or send something on their behalf, describe exactly what you will do and ask
for a yes before doing it — never assume permission.${planMode ? `
PLAN MODE IS ON: for any non-trivial multi-step task, FIRST reply with a short numbered plan of
what you will do and which tools you will use, then STOP and ask the user to confirm before
executing. Skip the plan only for simple one-step requests.` : ''}

Format with markdown when it aids clarity. Be concise.
If a tool fails, explain what happened and suggest an alternative.${persona ? `

PERSONA — the user selected this style; follow it for tone and depth, but never let
it override the tool and research rules above:
${persona}` : ''}`
}

function buildLocalSystemPrompt({ persona }) {
  const now = new Date()
  const today = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const time = now.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
  })
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  return `You are Yogatik, a helpful on-device AI assistant.
Current Time: ${time} on ${today} (${timeZone}).

Strict Output Rules:
- Synthesize a direct, natural answer in your own words.
- NEVER output or repeat system section titles (like "FACTUAL BACKGROUND INFORMATION" or "Web Search Results").
- NEVER copy-paste raw search result bullet lists verbatim. Extract the relevant weather or factual info and answer concisely.
- For weather requests, state the condition, temperature, and forecast clearly.${persona ? `\n\nPersona:\n${persona}` : ''}`
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
const LOCAL_HISTORY_BUDGET = 4000
const MAX_TURNS = 20
const LOCAL_MAX_TURNS = 6

function windowHistory(history, budget = HISTORY_BUDGET, maxTurns = MAX_TURNS) {
  const out = []
  let used = 0

  for (const m of history.slice(-maxTurns).reverse()) {
    // Multimodal turns are arrays of parts. Stringifying them inlines a whole
    // base64 image into the prompt as text — megabytes of garbage tokens.
    if (Array.isArray(m.content)) {
      const textLen = m.content.reduce((n, p) => n + (p.text?.length || 0), 0)
      if (used + textLen > budget) break
      out.push({ role: m.role, content: m.content })
      used += textLen
      continue
    }
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

/**
 * Drop payloads the model must never see as text: base64 frames (megabytes of
 * garbage tokens) and blob: URLs, which the model happily pastes into its reply
 * as a link that is dead the moment the page reloads.
 */
function stripImage(result) {
  if (!result || typeof result !== 'object') return result
  if (!result.image && !result.images && !result.video_url) return result
  const { image, images, video_url, ...rest } = result
  return rest
}

/**
 * Keep only the most recent image in context.
 * Frames are ~1.1k tokens each; three turns of looking otherwise evicts the
 * entire conversation, and stale frames make the model answer about the past.
 */
const MAX_IMAGES_IN_CONTEXT = 1
function pruneOldImages(messages) {
  const withImages = messages
    .map((m, i) => (Array.isArray(m.content) && m.content.some(p => p.type === 'image_url') ? i : -1))
    .filter(i => i >= 0)
  for (const i of withImages.slice(0, -MAX_IMAGES_IN_CONTEXT)) {
    const text = messages[i].content.filter(p => p.type === 'text').map(p => p.text).join(' ')
    messages[i] = { role: messages[i].role, content: `${text} [earlier camera frame, no longer shown]` }
  }
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
  provider, apiKey, model, history = [], userMessage, userImage = null,
  toolsEnabled = true, webEnabled = true, disabledTools = [], persona = null, temperature = 0.7, signal,
  modelCanSee = false, localVisionEnabled = true,
  onToken, onStatus, onToolStart, onToolResult, onDone, onError, onSources,
  initialToolMode = null, onToolModeChange = null, agentOverride = null,
}) {
  const abortError = () => Object.assign(new Error('Aborted'), { name: 'AbortError' })
  const throwIfAborted = () => { if (signal?.aborted) throw abortError() }
  const whenAborted = () => new Promise((_, reject) => {
    if (!signal) return                        // never settles: harmless in a race
    if (signal.aborted) return reject(abortError())
    signal.addEventListener('abort', () => reject(abortError()), { once: true })
  })

  const traceRef = []

  // Web research is only truly available if tools are on, the toggle is on,
  // and the research tools themselves have not been disabled.
  const webAvailable = toolsEnabled && webEnabled &&
    !['deep_research', 'web_search'].every(t => disabledTools.includes(t))

  let chatPrefs = {}
  try { chatPrefs = await getSetting('chat_prefs', {}) || {} } catch { /* defaults */ }
  const planMode = resolveFeatures(chatPrefs)?.planMode === true
  // How many tool rounds the agent may take before it must give a final answer.
  // Raised from the old hard 5 so complex, multi-step tasks can keep refining;
  // clamped so a runaway model can't loop forever. User-tunable in Personalise.
  const maxRounds = Math.max(1, Math.min(20, Number(chatPrefs.max_tool_rounds) || 8))

  // An active Skill shapes the assistant: its system prompt is appended, and its
  // optional tool allowlist scopes what the model may call this turn.
  let activeSkill = null
  try { activeSkill = await getActiveSkill() } catch { /* none */ }
  const skillBlock = activeSkill?.system ? `\n\nACTIVE SKILL — "${activeSkill.name}":\n${activeSkill.system}` : ''

  // Active agent (or an explicit override from a sub-agent / autonomous step)
  // shapes the assistant and scopes its tools, like a Skill but role-centric.
  let activeAgent = agentOverride
  if (!activeAgent) { try { activeAgent = await getActiveAgent() } catch { /* none */ } }
  const agentBlock = activeAgent?.system ? `\n\nACTIVE AGENT — "${activeAgent.name}" (${activeAgent.role || 'agent'}):\n${activeAgent.system}` : ''

  let styleBlock = ''
  try { styleBlock = await getActiveStyleBlock() } catch { /* default */ }

  const isLocalProvider = provider === 'local' || provider === 'webllm'

  // Conventions from the chat's working folders (YOGATIK.md / AGENTS.md / …),
  // so guidance lives with the project instead of only on this device.
  const projectBlock = await loadProjectInstructions()

  const systemBase = isLocalProvider
    ? buildLocalSystemPrompt({ persona }) + skillBlock + agentBlock + styleBlock + projectBlock + (await memoryBlock())
    : buildSystemPrompt({ webEnabled: webAvailable, persona, planMode }) + skillBlock + agentBlock + styleBlock + projectBlock + (await memoryBlock())

  const hBudget = isLocalProvider ? LOCAL_HISTORY_BUDGET : HISTORY_BUDGET
  const hTurns = isLocalProvider ? LOCAL_MAX_TURNS : MAX_TURNS

  const lastHistoryMsg = history[history.length - 1]
  const lastContent = typeof lastHistoryMsg?.content === 'string' ? lastHistoryMsg.content : ''
  const isCurrentMessageInHistory = lastHistoryMsg &&
    lastHistoryMsg.role === 'user' &&
    (lastContent === userMessage || (userImage && Array.isArray(lastHistoryMsg.content)))

  const pastHistory = isCurrentMessageInHistory ? history.slice(0, -1) : history

  const messages = [
    { role: 'system', content: systemBase },
    ...windowHistory(pastHistory, hBudget, hTurns),
    { role: 'user', content: userMessage },
  ]

  // An attached image follows the same policy as the camera: hand it to the
  // model when it can see, otherwise read it here (OCR / on-device VLM) and
  // pass the description as text. Never silently drop it.
  if (userImage) {
    const turn = messages[messages.length - 1]
    if (modelCanSee) {
      turn.content = [
        { type: 'text', text: userMessage || 'Look at this image.' },
        { type: 'image_url', image_url: { url: userImage } },
      ]
    } else {
      onStatus?.('Reading the image on this device…')
      try {
        const { via, text } = await describeWithoutModel(userImage, userMessage)
        turn.content = `${userMessage || 'Describe this image.'}\n\n` +
          `[The attached image was read on-device with ${via === 'ocr' ? 'OCR & layout analysis' : 'a local vision model'} ` +
          `because ${model || 'this model'} cannot see images natively. Synthesize and analyze the structured content below carefully.]\n\n` +
          `IMAGE CONTENT:\n${text}`
      } catch (e) {
        turn.content = `${userMessage || ''}\n\n[An image was attached but could not be read: ${e.message}. ` +
          `Tell the user to switch to a vision-capable model or turn on On-device vision in Personalise.]`
      }
    }
  }

  const isAskingTime = /time|date|clock|day is it|what hour|timezone/i.test(userMessage || '')
  if (isLocalProvider && isAskingTime) {
    const now = new Date()
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const tzStr = Intl.DateTimeFormat().resolvedOptions().timeZone
    messages[0].content += `\n\n[System Time Info]: Current Local Time is ${timeStr} on ${dateStr} (${tzStr}).`
  }

  // Pre-fetch YouTube transcript/details when a URL is present so every provider
  // sees the same grounded context instead of guessing from the bare link.
  const ytMatch = userMessage && userMessage.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (ytMatch) {
    throwIfAborted()
    onStatus?.('Fetching YouTube video details…')
    try {
      const ytRes = await executeTool('youtube', { url: ytMatch[0] })
      throwIfAborted()
      if (ytRes && (ytRes.title || ytRes.transcript)) {
        let details = `Video Title: ${ytRes.title || 'YouTube Video'}\nChannel: ${ytRes.author || 'Unknown'}`
        if (ytRes.transcript) {
          details += `\n\nTranscript:\n${ytRes.transcript.slice(0, 8000)}`
        } else {
          details += `\n\nNote: Direct transcript closed captions are unavailable for this video. Use the video title and details above to summarize.`
        }
        messages[0].content += `\n\n[YouTube Video Information]:\n${details}`
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e
      try {
        throwIfAborted()
        const extRes = await executeTool('web_extract', { url: ytMatch[0] })
        throwIfAborted()
        if (extRes?.content) {
          messages[0].content += `\n\n[Web Page Content]:\n${extRes.content.slice(0, 8000)}`
        }
      } catch (err) {
        if (err.name === 'AbortError') throw err
      }
    }
  } else if (isLocalProvider && webAvailable && userMessage) {
    throwIfAborted()
    onStatus?.('Searching the web for latest information…')
    try {
      const searchRes = await executeTool('web_search', { query: userMessage })
      throwIfAborted()
      if (searchRes?.results?.length) {
        const topResults = searchRes.results.slice(0, 5).map(r => `${r.title}: ${r.snippet}`).join('\n\n')
        messages[0].content += `\n\nFACTUAL BACKGROUND DATA (Do not output raw bullets or repeat this section title, synthesize an answer directly):\n${topResults}`
        if (searchRes.results.some(r => r.url)) {
          sources.push(...searchRes.results.filter(r => r.url).map(r => ({ title: r.title, url: r.url })))
          onSources?.(sources)
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') throw e
    }
  }

  // Tells the `see` tool whether to hand back pixels (this model can look) or
  // a text observation from the on-device VLM (it cannot).
  setVisionContext({ modelCanSee, allowLocal: localVisionEnabled })

  // Fold the active skill's + active agent's tool allowlists into the disabled set.
  let effectiveDisabled = disabledTools
  if (activeSkill?.tools?.length || activeAgent?.tools?.length) {
    const allToolNames = getToolSchemas([]).map(s => s.function.name)
    effectiveDisabled = [...new Set([
      ...disabledTools,
      ...skillDisabledTools(activeSkill, allToolNames),
      ...agentDisabledTools(activeAgent, allToolNames),
    ])]
  }
  const schemas = toolsEnabled ? getToolSchemas(effectiveDisabled) : null

  // 'native' → OpenAI-style tools array. 'prompted' → JSON protocol in the
  // system prompt, for models that 400 on a tools array.
  let toolMode = toolsEnabled ? (initialToolMode || 'native') : 'off'
  let tools = toolMode === 'native' ? schemas : null

  /** Switch to the text protocol and re-run the round. */
  const enablePromptedTools = () => {
    toolMode = 'prompted'
    tools = null
    messages[0] = {
      role: 'system',
      content: systemBase + buildToolPrompt(schemas),
    }
    onStatus?.('This model lacks native tool calling — using the text protocol')
    onToolModeChange?.('prompted')
  }

  /**
   * Some models accept a tools array and emit a call, then 400 when the tool
   * RESULT is sent back (they reject role:"tool"/tool_calls history). Switching
   * to prompted mid-loop is useless unless the native tool turns already in
   * `messages` are rewritten into the plain-turn form the text protocol uses.
   */
  const demoteToPrompted = () => {
    enablePromptedTools()
    for (let i = 1; i < messages.length; i++) {
      const m = messages[i]
      if (m.role === 'assistant' && m.tool_calls) {
        messages[i] = { role: 'assistant', content: m.content || '' }
      } else if (m.role === 'tool') {
        let result
        try { result = JSON.parse(m.content) } catch { result = m.content }
        messages[i] = { role: 'user', content: formatToolResults([{ name: m.name, result }]) }
      }
    }
  }

  const toolResults = {}
  const sources = []
  let fullContent = ''   // everything shown to the user, across all rounds
  let roundContent = ''  // text from the current round only
  let toolCallsToProcess = []

  const processStream = () => new Promise((resolve, reject) => {
    toolCallsToProcess = []
    roundContent = ''
    let rejectedTools = false

    streamChat({
      provider, apiKey, model, messages, tools, temperature, signal,
      // In prompted mode the reply may BE a tool call, so it is buffered and
      // only shown once we know it is prose.
      onToken: (t) => {
        roundContent += t
        if (toolMode !== 'prompted') { fullContent += t; onToken?.(t) }
      },
      onToolCall: (tc) => { toolCallsToProcess.push(tc) },
      onToolsRejected: toolMode === 'native' ? () => { rejectedTools = true } : null,
      onDone: () => resolve({ rejectedTools }),
      onError: (e) => reject(e),
    })
  })

  /** In prompted mode, pull any tool calls out of the reply text. */
  let promptedRepairTried = false
  // Returns true when a tool block was attempted but unparseable AND we have not
  // yet retried — the caller then reprompts for valid JSON once.
  const harvestPromptedCalls = () => {
    if (toolMode !== 'prompted') return false
    const { calls, text, malformed } = parseToolCalls(roundContent)
    if (calls.length) { toolCallsToProcess = calls; return false }
    if (text && (!malformed || promptedRepairTried)) {
      // Genuine prose (or repair fallback): release it to the UI.
      fullContent += text
      onToken?.(text)
    }
    if (malformed && !promptedRepairTried) return true
    return false
  }

  /** Reprompt once for valid JSON when the model emitted a malformed tool block. */
  const harvestOrRepair = async () => {
    if (!harvestPromptedCalls()) return
    promptedRepairTried = true
    messages.push({
      role: 'user',
      content: 'Your previous tool block was not valid JSON and could not be run. ' +
        'Re-send ONLY a fenced ```json block: double-quoted keys and string values, ' +
        'no trailing commas, true/false/null (not True/False/None). If no tool is ' +
        'needed, just answer in plain prose.',
    })
    onStatus?.('Fixing the tool format…')
    await processStream()
    harvestPromptedCalls()
  }

  try {
    // First LLM call — may return text or tool calls
    let first = await processStream()
    if (first?.rejectedTools) {
      enablePromptedTools()
      first = await processStream()
    }
    await harvestOrRepair()
    // If native tool call was rejected and we switched to prompted mode without tool calls,
    // harvestPromptedCalls was called inside harvestOrRepair. Ensure prose is released.
    if (toolMode === 'prompted' && !toolCallsToProcess.length && roundContent && !fullContent) {
      harvestPromptedCalls()
    }
    throwIfAborted()

    // Tool execution loop (maxRounds cap prevents infinite loops)
    let rounds = 0
    while (toolCallsToProcess.length > 0 && rounds < maxRounds) {
      throwIfAborted()
      rounds++
      const round = toolCallsToProcess.map((tc, i) => ({
        ...tc,
        name: String(tc.name || '').split('<')[0].split(' ')[0].split(':')[0].trim(),
        id: tc.id || `call_${rounds}_${i}`,
      }))

      // One assistant message carrying every tool_call of this round,
      // followed by one tool message per call — the shape OpenAI-compatible
      // providers validate against (NVIDIA rejects interleaved pairs).
      if (toolMode === 'prompted') {
        // No tool_calls/tool roles available — replay as ordinary turns.
        messages.push({ role: 'assistant', content: roundContent })
      } else {
        messages.push({
          role: 'assistant',
          content: roundContent || null,
          tool_calls: round.map(tc => ({
            id: tc.id, type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.parsedArgs || {}) },
          })),
        })
      }

      onStatus?.(round.length > 1
        ? `Running ${round.length} tools…`
        : `Using ${round[0].name}…`)
      round.forEach(tc => {
        onToolStart?.(tc.name, tc.parsedArgs)
        traceRef.push({ tool: tc.name, args: tc.parsedArgs || undefined, status: 'running' })
      })

      // Independent calls run concurrently — a 3-page research round finishes in
      // the time of its slowest fetch instead of the sum of all of them.
      // Race the round against Stop: the tools' own fetches are aborted through
      // the ambient signal, and the loop does not wait for the stragglers.
      const results = await Promise.race([
        Promise.all(round.map(async (tc) => {
          try {
            return await executeTool(tc.name, tc.parsedArgs || {}, { signal })
          } catch (e) {
            return { error: e?.message || String(e) }
          }
        })),
        whenAborted(),
      ])

      round.forEach((tc, i) => {
        const result = results[i]
        toolResults[tc.name] = result
        onToolResult?.(tc.name, result)
        const step = [...traceRef].reverse().find(s => s.tool === tc.name && s.status === 'running')
        if (step) step.status = result?.error ? 'error' : 'done'

        if (SOURCE_TOOLS.has(tc.name)) {
          for (const s of collectSources(result)) {
            if (!sources.some(existing => existing.url === s.url)) sources.push(s)
          }
        }

        if (toolMode !== 'prompted') {
          messages.push({
            role: 'tool', tool_call_id: tc.id, name: tc.name,
            // Research payloads are large but valuable; give them more room.
            // `image` is stripped: JSON.stringify would inline ~50KB of base64
            // as plain text, which the model cannot read and pays for anyway.
            content: JSON.stringify(stripImage(result)).slice(0, tc.name === 'deep_research' ? 24000 : 12000),
          })
        }
      })

      if (toolMode === 'prompted') {
        messages.push({
          role: 'user',
          content: formatToolResults(round.map((tc, i) => ({ name: tc.name, result: stripImage(results[i]) }))),
        })
      }

      // Any tool that produced a frame gets it shown to the model as an actual
      // image part — the only way a vision model can read it.
      const frames = modelCanSee
        ? results.flatMap(r => (r?.images?.length ? r.images : r?.image ? [r.image] : []))
        : []
      if (frames.length) {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: frames.length > 1
                ? 'Here is what the camera sees, oldest frame first. Answer from these images.'
                : 'Here is what the camera sees right now. Answer from this image.',
            },
            ...frames.map(url => ({ type: 'image_url', image_url: { url } })),
          ],
        })
        pruneOldImages(messages)
      }

      if (sources.length) onSources?.(sources)

      // Call LLM again with tool results
      throwIfAborted()
      onStatus?.('Thinking...')
      let next = await processStream()
      // Model accepted the tool CALL but rejects the tool RESULT (weak models).
      // Rewrite history to the text protocol and retry so the turn still lands.
      if (next?.rejectedTools && toolMode === 'native') {
        demoteToPrompted()
        next = await processStream()
      }
      await harvestOrRepair()
    }

    // Cap reached but the model still wants more tools: force one final pass so
    // the user always gets a synthesized answer instead of a cut-off / empty reply.
    if (toolCallsToProcess.length > 0) {
      throwIfAborted()
      toolCallsToProcess = []
      messages.push({
        role: 'user',
        content: 'You have reached the tool-use limit for this turn. Do NOT request any ' +
          'more tools. Give your best, complete final answer now using everything gathered ' +
          'so far, and note briefly if anything remained uncertain.',
      })
      onStatus?.('Finalizing answer…')
      await processStream()
      if (toolMode === 'prompted') harvestPromptedCalls()
    }

    throwIfAborted()
    onDone?.({ content: fullContent, toolResults, sources, toolMode, trace: traceRef ? [...traceRef] : undefined })
  } catch (err) {
    if (err.name === 'AbortError') {
      // User pressed Stop: keep whatever was generated instead of dropping it.
      onDone?.({ content: fullContent, toolResults, sources, aborted: true, trace: traceRef ? [...traceRef] : undefined })
    } else {
      onError?.(err)
    }
  }
}
