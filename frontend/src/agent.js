/**
 * Browser-native agentic loop.
 * LLM decides which tools to call → browser executes → results sent back → final answer.
 * Uses OpenAI-compatible function calling (works with Groq, OpenRouter, OpenAI).
 */

import { streamChat, chatComplete } from './llm'
import { visibleAnswer as sharedVisibleAnswer } from './reasoning'
// Readable summaries for the last-resort path. The inline version pasted raw
// JSON — a whole file's contents plus internal bookkeeping — which is barely
// better than the blank bubble it replaced.
import { summariseToolResults } from './toolSummary'
import { getToolSchemas, prioritizeToolSchemas, executeTool } from './tools/index'
import { enrichToolError } from './tools/toolReflection'
import { compactToolResult } from './tools/toolCompactor'
import { buildToolPrompt, parseToolCalls, formatToolResults } from './promptedTools'
import { setVisionContext } from './tools/see'
import { describeWithoutModel } from './vision/source'
import { getSetting } from './db'
import { beginTool, settleTool } from './toolStatus'
import { assessSafety, crisisResourceCard } from './safety'
import { resolveFeatures } from './features'
import { getActiveSkill, skillDisabledTools } from './skills'
import { getActiveAgent, agentDisabledTools } from './agents'
import { getActiveStyleBlock } from './styles'
import { loadProjectInstructions } from './projectInstructions'
import { todoBlock } from './todos'
import { compactHistory } from './compaction'
import { getTodos } from './tools/todo'

/** Durable memories the user asked to keep, injected so the model recalls them
 *  without needing a memory tool call (like ChatGPT/Claude memory). */
async function memoryBlock() {
  try {
    // Structured four-store memory (memory4). If populated, it supersedes the
    // flat block — a salience-ranked companion memory instead of last-20 facts.
    let structured = ''
    try {
      const { memoryBlockFromStores } = await import('./memory4')
      structured = await memoryBlockFromStores('')
    } catch { /* db v5 not ready / empty */ }
    if (structured) return structured

    const mem = (await getSetting('user_memory', [])) || []
    if (!mem.length) return ''
    return '\n\nUSER MEMORY — durable facts the user asked you to remember. Use them when ' +
      'relevant; do not recite them unprompted.\n' +
      mem.slice(-20).map(m => `- ${m.text}`).join('\n')
  } catch { return '' }
}


export function isRealtimeOrSearchQuery(text) {
  if (!text || typeof text !== 'string') return false
  const t = text.trim()
  if (t.length < 2) return false
  // If user pasted text to convert/summarize/build a doc/ppt from, don't run web search
  if (/\b(based on this|based on the following|summarize (this|the following)|build (a|me|the) (ppt|slides|presentation|document|doc|pdf|table|csv)|convert (this|the following) to|format (this|the following))\b/i.test(t.slice(0, 120))) return false
  const patterns = [
    /\b(recent|recently|latest|newest|today|yesterday|tonight|tomorrow|current|currently|upcoming|breaking|trending|at present|nowadays|this week|this month|this year|2024|2025|2026)\b/i,
    /\b(news|updates|release|released|releasing|launch|launched|launching|announcement|announced|announcing)\b/i,
    /\b(who is currently|who is the current|who won|score of|live score|match score|election|stock price|crypto price|exchange rate|weather in|weather forecast)\b/i,
    /\b(did .+ (release|launch|announce|create|build|make|buy|acquire|win|lose))\b/i,
    /\b(what happened (to|in|with)|is .+ (alive|dead|available|out|open|closed))\b/i,
    /\b(search (for|the web|google|bing)|look up|browse for|find info on|google)\b/i,
    /\b(xai|grok|deepseek|chatgpt|openai|gemini|claude 3|llama 3|sora|qwen|mistral)\b/i,
  ]
  return patterns.some(p => p.test(t.slice(0, 300)))
}

export function isPresentationQuery(text) {
  if (!text || typeof text !== 'string') return false
  return /\b(ppt|pptx|powerpoint|slides?|slide deck|presentation|pitch deck)\b/i.test(text.slice(0, 150))
}

export function isDocumentQuery(text) {
  if (!text || typeof text !== 'string') return false
  return /\b(word doc|word document|\.docx?|\.doc\b|executive report|whitepaper|formal document|generate doc|write document)\b/i.test(text.slice(0, 150))
}

export function isSpreadsheetQuery(text) {
  if (!text || typeof text !== 'string') return false
  return /\b(csv|spreadsheet|excel sheet|data table|export to csv|generate spreadsheet)\b/i.test(text.slice(0, 150))
}

export function isSocialQuery(text) {
  if (!text || typeof text !== 'string') return false
  const t = text.trim()
  if (t.length < 5) return false
  // If user pasted a long block of text with 'based on this' or 'format this', it's document processing, not social search
  if (/\b(based on this|based on the following|summarize (this|the following)|build (a|me|the)|make a|create a|format (this|the following))\b/i.test(t.slice(0, 100))) return false
  const prefix = t.slice(0, 150)
  const isSocialTarget = /\b(instagram|reels|tiktok|tweets?|twitter|reddit|subreddit|pinterest|bluesky|mastodon|threads)\b/i.test(prefix)
  const isSocialAction = /\b(search|find|show|look up|check|browse|what('s| is| are)|trending|viral|posts?|discussion|latest|recent)\b/i.test(prefix)
  return isSocialTarget && isSocialAction
}

// What the model is ALLOWED to believe about its own reach. Without this the
// prompt said "browser-native tools" on every surface, so the desktop build
// confidently refused real work — "I have no shell/terminal access, no Node.js
// runtime" — while holding a real shell, filesystem and browser. It was
// believing the prompt, not malfunctioning.
function isDesktopRuntime() {
  if (typeof window === 'undefined') return false
  return !!(window.__YOGATIK_ELECTRON__ || window.__TAURI__)
}

// The companion window installs an action gate. When one is present EVERY tool
// call is checked before it runs, which is what makes autopilot's rail real
// rather than advisory. The main window installs none, so ordinary chat is
// untouched.
//
// Fails CLOSED: a gate that throws blocks the call. A rail that opens when it
// breaks is not a rail.
async function gateAllows(name, args) {
  const gate = (typeof window !== 'undefined' && window.__YOGATIK_ACTION_GATE__) || null
  if (typeof gate !== 'function') return { allowed: true }
  try {
    const d = await gate({ tool: name, action: args?.action, args, label: args?.label })
    return { allowed: !!d?.allowed, reason: d?.reason || '' }
  } catch (e) {
    return { allowed: false, reason: `The action gate failed (${e?.message || e}), so the call was not made.` }
  }
}

function platformBlock() {
  if (isDesktopRuntime()) {
    return `RUNTIME: You are running inside the Yogatik DESKTOP APP, with REAL access to this computer.
You CAN: run shell commands (terminal_run for commands that finish quickly, proc_start for
long-running ones such as dev servers, watch-mode tests and streaming builds), read and write the
user's files (fs_read/fs_write/fs_list/fs_search), drive a real web browser (browser_control),
control the mouse and keyboard (computer_control), read the clipboard, and inspect processes.
NEVER say you have no shell, no terminal, no filesystem, or no Node.js runtime — you have all of them.
File and terminal tools act inside folders the user granted for THIS chat. When none is granted the
tool says so: ask the user to grant a folder, do not declare the task impossible.
Do not tell the user to run a command themselves when you can run it.`
  }
  return `RUNTIME: You are running as a web app inside the user's browser, so you have no shell,
no filesystem and no host OS. Tools marked "desktop app only" (terminal_run, proc_start, fs_*,
browser_control, computer_control, clipboard_access) WILL REFUSE here. If the user needs one, say
plainly that it requires the Yogatik desktop app — never improvise or pretend you ran it.`
}

// Key order must not make two identical calls look different, so sort it.
function callSignature(name, args) {
  const stable = (v) => {
    if (Array.isArray(v)) return v.map(stable)
    if (v && typeof v === 'object') {
      return Object.keys(v).sort().reduce((acc, k) => { acc[k] = stable(v[k]); return acc }, {})
    }
    return v
  }
  let payload
  try { payload = JSON.stringify(stable(args ?? {})) } catch { payload = String(args) }
  return `${name}::${payload}`
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

  return `You are Yogatik, a helpful AI assistant with access to a powerful toolset.
${platformBlock()}
CURRENT SYSTEM CLOCK: ${today} at ${time} (${timeZone}).
CRITICAL TIME INSTRUCTION: If the user asks for the current time, date, or timezone, you MUST report this exact local time: ${time} on ${today} (${timeZone}). Do NOT invent any other time.

You can generate images, execute Python, create charts and diagrams, look up weather,
translate text, read QR codes, convert units, search social media, and search the live web.

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
  without, or could reasonably mean very different things, ask ONE short clarifying question.

WHEN TO USE TOOLS:
- CRITICAL REAL-TIME & LIVE SEARCH DIRECTIVE: You have LIVE INTERNET ACCESS. For queries about recent events, latest releases, news, tech companies (e.g., xAI, OpenAI, Google, Meta, Anthropic), prices, people, or any post-2023 developments, ALWAYS use search results or call web_search/deep_research. NEVER guess or claim a current company or AI model does not exist without searching.
- For YouTube links, use the youtube tool first. If it returns a transcript, summarize that transcript.
- To MAKE or GENERATE a VIDEO, call video_render with a scenes array.
- To set a TIMER, ALARM, or REMINDER, you CAN and MUST call the timer tool.
- To SEARCH SOCIAL MEDIA (Instagram, X/Twitter, LinkedIn, Reddit, TikTok, Facebook, YouTube) for posts, viral content, links, trends, or creator updates, call social_search.
- To FIND JOBS OR CAREER OPPORTUNITIES on Naukri, Indeed, LinkedIn Jobs, or Glassdoor, call job_search.
- To GENERATE SOCIAL POSTS, X threads, LinkedIn posts, Instagram captions, or TikTok video scripts, call social_post_generator.
- To RUN JavaScript, use js_execute; for Python use code_execute. To remember facts, use the memory tool.
- When the user wants to LISTEN to something as a saved file, use text_to_audio.

DELEGATE AUTOMATICALLY WITH SUB-AGENTS (spawn_agents):
- For tasks spanning MULTIPLE distinct sub-tasks (research + write, gather data + analyse + chart), call spawn_agents.
- Send ONE sub-task per independent piece of work — as many as the job actually has. Do NOT
  default to three. Six independent questions means six sub-tasks in a single spawn_agents
  call; they run concurrently under a shared budget, so more sub-tasks finish sooner, not later.
- Repeat the SAME specialist as often as useful: five researcher sub-tasks on five different
  questions is normal and runs five instances at once.

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
- Cite sources inline as [n] matching the numbered pages you were given.
- If research returns nothing useful, say so plainly instead of guessing.`
    : `Web access is currently disabled by the user. Answer from your own knowledge, and
say clearly when something may be out of date or when you are unsure.`}

SELF-CHECK before finalizing: for multi-step or factual answers, verify your work against the
tool results you actually received.
CONFIRM BEFORE IRREVERSIBLE ACTIONS: if a step would delete data or overwrite files, ask first.${planMode ? `
PLAN MODE IS ON: for any non-trivial multi-step task, FIRST reply with a short numbered plan.` : ''}

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
  initialToolMode = null, onToolModeChange = null, agentOverride = null, onSafety = null,
}) {
  // On-device safety screen (crisis + professional-boundary). Pure, zero-latency,
  // offline. Feeds the system prompt and surfaces a resource card to the UI.
  let safetyDirective = ''
  try {
    const verdict = assessSafety(typeof userMessage === 'string' ? userMessage : '')
    safetyDirective = verdict.systemDirective
    if (verdict.hasConcern) onSafety?.(verdict, crisisResourceCard(verdict))
  } catch { /* safety must never block a turn */ }
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
  // Defaults to 8; user-tunable up to 30 in Personalise / chat settings.
  const maxRounds = Math.max(1, Math.min(30, Number(chatPrefs.max_tool_rounds) || 8))

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

  // The model's own task list, so a long job keeps its thread across turns.
  let taskBlock = ''
  try { taskBlock = todoBlock(await getTodos()) } catch { taskBlock = '' }

  const systemBase = (isLocalProvider
    ? buildLocalSystemPrompt({ persona }) + skillBlock + agentBlock + styleBlock + projectBlock + taskBlock + (await memoryBlock())
    : buildSystemPrompt({ webEnabled: webAvailable, persona, planMode }) + skillBlock + agentBlock + styleBlock + projectBlock + taskBlock + (await memoryBlock())
  ) + safetyDirective

  const hBudget = isLocalProvider ? LOCAL_HISTORY_BUDGET : HISTORY_BUDGET
  const hTurns = isLocalProvider ? LOCAL_MAX_TURNS : MAX_TURNS

  let pastHistory = history
  if (userMessage && history.length > 0) {
    const last = history[history.length - 1]
    if (last.role === 'user' && (last.content === userMessage || (typeof last.content === 'string' && typeof userMessage === 'string' && last.content.trim() === userMessage.trim()))) {
      pastHistory = history.slice(0, -1)
    }
  }

  // Summarize turns that fall out of the window instead of truncating them —
  // the old behaviour silently destroyed the start of a long conversation.
  // Best-effort: on any failure this degrades to the plain window.
  const windowed = await compactHistory(pastHistory, {
    budget: hBudget,
    maxTurns: hTurns,
    // On-device models are too small to summarize usefully and have no HTTP
    // endpoint here, so they keep the plain window (compactHistory falls back
    // when summarize throws).
    summarize: async (prompt) => {
      if (isLocalProvider) throw new Error('no compaction for local models')
      const resp = await chatComplete({
        provider, model, apiKey,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 400, temperature: 0.2, timeoutMs: 30000, retries: 0,
      })
      // chatComplete returns the raw OpenAI response, not a string.
      return resp?.choices?.[0]?.message?.content || ''
    },
  })

  const messages = [
    { role: 'system', content: systemBase },
    ...windowed,
    ...(userMessage ? [{ role: 'user', content: userMessage }] : []),
  ]

  // An attached image follows the same policy as the camera: hand it to the
  // model when it can see, otherwise read it here (OCR / on-device VLM) and
  // pass the description as text. Never silently drop it.
  if (userImage) {
    const turn = messages[messages.length - 1]
    if (modelCanSee) {
      turn.content = [
        { type: 'image_url', image_url: { url: userImage } },
        { type: 'text', text: userMessage || 'Analyze and describe this image in detail.' },
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

  const isAskingTime = /time|date|clock|day is it|what hour|timezone|current year/i.test(userMessage || '')
  if (isAskingTime) {
    const now = new Date()
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const tzStr = Intl.DateTimeFormat().resolvedOptions().timeZone
    messages[0].content += `\n\n[System Time Info]: Current Local Time is ${timeStr} on ${dateStr} (${tzStr}). Ground your answer in this exact timestamp.`
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
  }

  if (isPresentationQuery(userMessage)) {
    messages[0].content += `\n\n[CRITICAL PRESENTATION GENERATION INSTRUCTION]:\n` +
      `The user requested an executive PowerPoint presentation / slide deck.\n` +
      `You MUST format your output with high-density, visually structured markdown slides:\n` +
      `# Slide 1: [Executive Presentation Title]\n` +
      `[Compelling Subtitle & Executive Context]\n\n` +
      `# Slide 2: [Action-Oriented Slide Title]\n` +
      `- **Key Concept 1**: Crisp technical/strategic explanation with quantitative data.\n` +
      `- **Key Concept 2**: Concrete architectural tradeoff or operational benchmark.\n` +
      `- **Strategic Verdict**: High-impact takeaway for decision-makers.\n\n` +
      `# Slide 3: [Deep Dive or Comparison Table]\n` +
      `| Category | Traditional Approach | Modern Solution | Impact |\n` +
      `| :--- | :--- | :--- | :--- |\n` +
      `| Architecture | Monolithic / Legacy | Cloud-Native / Edge | +40% Speed |\n\n` +
      `# Slide 4: ... (Provide at least 6-8 structured slides with deep analytical content)\n\n` +
      `At the end of your answer, include this direct download link:\n` +
      `[Download Presentation (.pptx)](presentation.pptx)\n`
  } else if (isDocumentQuery(userMessage)) {
    messages[0].content += `\n\n[CRITICAL EXECUTIVE DOCUMENT INSTRUCTION]:\n` +
      `The user requested a formal Word Document / Whitepaper / Executive Report.\n` +
      `Structure the report with McKinsey/Bain-level quality:\n` +
      `# [Executive Report Title]\n` +
      `> **Executive Thesis**: High-level verdict, strategic rationale, and target outcomes.\n\n` +
      `## 1. Background & Context\n` +
      `Detailed industry/technical background with clear problem definition.\n\n` +
      `## 2. Comprehensive Comparative Analysis\n` +
      `Provide a multi-column Markdown comparison table with clear feature breakdown and metrics.\n\n` +
      `## 3. Implementation Blueprint & Architecture\n` +
      `Concrete technical/operational steps with bold lead-ins.\n\n` +
      `## 4. Risk Assessment & Mitigations\n` +
      `Actionable mitigation table.\n\n` +
      `At the end of your answer, include these direct download links:\n` +
      `[Download Word Document (.doc)](document.doc) · [Download PDF (.pdf)](document.pdf)\n`
  } else if (isSpreadsheetQuery(userMessage)) {
    messages[0].content += `\n\n[CRITICAL SPREADSHEET / CSV INSTRUCTION]:\n` +
      `The user requested a structured Spreadsheet / CSV data table.\n` +
      `Provide a comprehensive multi-column Markdown table with at least 5 columns and 8+ realistic data rows, including headers, formatted numbers, and a Summary/Total calculation row at the bottom.\n\n` +
      `At the end of your answer, include this direct download link:\n` +
      `[Download CSV Spreadsheet (.csv)](spreadsheet.csv)\n`
  }

  const toolResults = {}
  const sources = []
  // Every distinct tool call made this turn, keyed by name + arguments, so an
  // identical one is answered from here instead of being run again.
  const seenCalls = new Map()

  if (webAvailable && userMessage) {
    if (isSocialQuery(userMessage)) {
      throwIfAborted()
      onStatus?.('Searching social media for live posts…')
      try {
        const socialRes = await executeTool('social_search', { query: userMessage })
        throwIfAborted()
        if (socialRes?.results?.length) {
          toolResults['social_search'] = socialRes
          traceRef.push({ tool: 'social_search', args: { query: userMessage }, status: 'done' })
          onToolStart?.('social_search', { query: userMessage })
          onToolResult?.('social_search', socialRes)
          const topResults = socialRes.results.slice(0, 6).map(r => `${r.title} (${r.url}): ${r.snippet}`).join('\n\n')
          messages[0].content += `\n\nREAL-TIME SOCIAL MEDIA SEARCH RESULTS (GROUND TRUTH):\n${topResults}\n\nCRITICAL: Provide direct clickable markdown links [Title](URL) for the social posts found above. Never say you cannot access social posts.`
          if (socialRes.results.some(r => r.url)) {
            sources.push(...socialRes.results.filter(r => r.url).map(r => ({ title: r.title, url: r.url, snippet: r.snippet })))
            onSources?.(sources)
          }
        }
      } catch (e) {
        if (e.name === 'AbortError') throw e
      }
    } else if (isLocalProvider || isRealtimeOrSearchQuery(userMessage)) {
      throwIfAborted()
      onStatus?.('Searching the web for latest information…')
      try {
        const searchRes = await executeTool('web_search', { query: userMessage })
        throwIfAborted()
        if (searchRes?.results?.length) {
          toolResults['web_search'] = searchRes
          traceRef.push({ tool: 'web_search', args: { query: userMessage }, status: 'done' })
          onToolStart?.('web_search', { query: userMessage })
          onToolResult?.('web_search', searchRes)
          const topResults = searchRes.results.slice(0, 6).map(r => `${r.title} (${r.url}): ${r.snippet}`).join('\n\n')
          messages[0].content += `\n\nREAL-TIME WEB SEARCH RESULTS (GROUND TRUTH — fetched live):\n${topResults}\n\nCRITICAL: Base your answer directly on the verified real-time search results above. Cite facts, dates, and names accurately. Never claim a company, product, or release mentioned above does not exist.`
          if (searchRes.results.some(r => r.url)) {
            sources.push(...searchRes.results.filter(r => r.url).map(r => ({ title: r.title, url: r.url, snippet: r.snippet })))
            onSources?.(sources)
          }
        }
      } catch (e) {
        if (e.name === 'AbortError') throw e
      }
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
  const rawSchemas = toolsEnabled ? getToolSchemas(effectiveDisabled) : null
  // ALWAYS go through the prioritiser: it both ranks and caps. Sending the whole
  // registry was ~32k tokens of schemas on every turn (and over OpenAI's 128-tool
  // limit); the ranking above decides which ones survive the cap.
  const schemas = rawSchemas ? prioritizeToolSchemas(rawSchemas, userMessage || '') : rawSchemas

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

  // Reasoning is not an answer: a reply that is only <think>…</think> leaves
  // the user with a blank bubble. Shared with the bubble and the activity panel.
  const visibleAnswer = (text) => sharedVisibleAnswer(text)

  let fullContent = ''   // everything shown to the user, across all rounds
  let roundContent = ''  // text from the current round only
  let toolCallsToProcess = []
  let forcedFinal = false  // a 'stop using tools, answer now' pass already ran

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
      // Cap at max 3 tools per round to prevent runaway storms
      const round = toolCallsToProcess
        .slice(0, 3)
        .map((tc, i) => ({
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
      const statusIds = []
      round.forEach((tc, i) => {
        onToolStart?.(tc.name, tc.parsedArgs)
        statusIds[i] = beginTool(tc.name, tc.parsedArgs)
        traceRef.push({ tool: tc.name, args: tc.parsedArgs || undefined, status: 'running' })
      })

      // Independent calls run concurrently — a 3-page research round finishes in
      // the time of its slowest fetch instead of the sum of all of them.
      // Race the round against Stop: the tools' own fetches are aborted through
      // the ambient signal, and the loop does not wait for the stragglers.
      const results = await Promise.race([
        Promise.all(round.map(async (tc) => {
          try {
            let args = tc.parsedArgs || {}
            if ((tc.name === 'web_search' || tc.name === 'deep_research') && (!args.query && !args.q && !args.search_query && !args.keyword && !args.text)) {
              args = { query: userMessage, ...args }
            }
            // A model that re-issues a call it already made this turn is stuck,
            // not making progress: running it again costs a round, can cost
            // money, and returns the same thing. Hand back what it already got,
            // labelled, so it either uses the result or changes approach.
            const sig = callSignature(tc.name, args)
            if (seenCalls.has(sig)) {
              const prev = seenCalls.get(sig)
              return {
                ...prev,
                repeated: true,
                note: `You already called ${tc.name} with exactly these arguments in this turn. ` +
                  'This is the result you were given. Do not call it again — use it, try ' +
                  'materially different arguments, or answer with what you have.',
              }
            }
            const decision = await gateAllows(tc.name, args)
            if (!decision.allowed) {
              // Report it as a normal tool result so the model can adapt —
              // announce, choose another route, or ask the user directly.
              const blocked = {
                success: false,
                blocked: true,
                error: `Not run — the user did not approve this action. ${decision.reason || ''}`.trim(),
              }
              seenCalls.set(sig, blocked)
              return blocked
            }
            const result = await executeTool(tc.name, args, { signal })
            seenCalls.set(sig, result)
            return result
          } catch (e) {
            return { error: e?.message || String(e) }
          }
        })),
        whenAborted(),
      ])

      round.forEach((tc, i) => {
        const rawResult = results[i]
        const result = enrichToolError(tc.name, tc.parsedArgs, rawResult)
        toolResults[tc.name] = result
        settleTool(statusIds[i], result)
        onToolResult?.(tc.name, result)
        const step = [...traceRef].reverse().find(s => s.tool === tc.name && s.status === 'running')
        if (step) step.status = result?.error ? 'error' : 'done'

        if (SOURCE_TOOLS.has(tc.name)) {
          for (const s of collectSources(result)) {
            if (!sources.some(existing => existing.url === s.url)) sources.push(s)
          }
        }

        if (toolMode !== 'prompted') {
          const maxLen = tc.name === 'deep_research' ? 24000 : 12000
          messages.push({
            role: 'tool', tool_call_id: tc.id, name: tc.name,
            // Research payloads are large but valuable; give them more room.
            // Image/binary payloads are stripped and compacted cleanly.
            content: compactToolResult(stripImage(result), maxLen),
          })
        }
      })

      if (toolMode === 'prompted') {
        messages.push({
          role: 'user',
          content: formatToolResults(round.map((tc, i) => ({ name: tc.name, result: stripImage(enrichToolError(tc.name, tc.parsedArgs, results[i])) }))),
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
      tools = null // Crucial: strip tool schemas so LLM is forced to generate prose synthesis
      messages.push({
        role: 'user',
        content: 'You have reached the tool-use limit for this turn. Do NOT request any ' +
          'more tools. Give your best, complete final answer now in clear markdown using everything gathered ' +
          'so far, and note briefly if anything remained uncertain.',
      })
      onStatus?.('Finalizing answer…')
      forcedFinal = true
      await processStream()
      if (toolMode === 'prompted') harvestPromptedCalls()
    }

    // A turn that ends with nothing visible is indistinguishable from a crash.
    // Weak/quantised models routinely fall silent after tool results, and some
    // emit only <think>. The cap-hit path above already forces a synthesis pass;
    // this is the same failure when the cap was never reached. Ask once, then be
    // honest rather than blank.
    throwIfAborted()
    if (!visibleAnswer(fullContent)) {
      // Only ask again if the cap-hit path has not already asked. Stacking two
      // identical "answer now" passes just burns a round on a model that is
      // already failing to answer.
      if (!forcedFinal) {
        toolCallsToProcess = []
        tools = null // Strip tools so the model cannot emit another tool call
        messages.push({
          role: 'user',
          content: 'You produced no visible answer. Do NOT request any more tools and do ' +
            'not reply with reasoning alone. Give your best, complete final answer now in ' +
            'plain prose, using the tool results already gathered.',
        })
        onStatus?.('Finalizing answer…')
        forcedFinal = true
        await processStream()
        if (toolMode === 'prompted') harvestPromptedCalls()
      }

      if (!visibleAnswer(fullContent)) {
        // If the model produced text during the last round (e.g. outside <think> tags), recover it
        let recovered = ''
        if (roundContent) {
          const stripped = roundContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
          if (stripped && visibleAnswer(stripped)) recovered = stripped
        }

        if (recovered) {
          fullContent = recovered
          onToken?.(recovered)
        } else {
          const gathered = summariseToolResults(toolResults)
          const fallback = gathered
            ? 'Based on the tool results gathered:\n\n' + gathered
            : 'I could not produce an answer this turn. Please try Regenerate, or switch to a stronger model.'
          fullContent = fallback
          onToken?.(fallback)
        }
      }
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
