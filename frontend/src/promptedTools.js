/**
 * Tool calling for models that lack native function calling.
 *
 * Many models — older ones, base models, and several on NVIDIA's free tier —
 * reject a request containing a `tools` array with a 400. Instead of losing
 * every tool for those models, describe the tools in the system prompt and ask
 * for a JSON block, then parse it out of the reply. Less reliable than native
 * calling, but the difference between "no tools" and "most tools".
 */

/** Compact schema rendering: the full JSON Schema wastes context on weak models. */
function renderTool(t) {
  const fn = t.function || t
  const props = fn.parameters?.properties || {}
  const required = new Set(fn.parameters?.required || [])
  const args = Object.entries(props)
    .map(([name, spec]) => {
      const type = spec.enum ? spec.enum.join('|') : (spec.type || 'string')
      return `${name}${required.has(name) ? '' : '?'}: ${type}`
    })
    .join(', ')
  // Only the first sentence — the long guidance is for native-calling models.
  const desc = (fn.description || '').split('. ')[0]
  return `- ${fn.name}(${args}) — ${desc}`
}

export function buildToolPrompt(schemas = []) {
  if (!schemas.length) return ''
  return `

TOOLS — you do not have native function calling, so use this text protocol.

Available tools:
${schemas.map(renderTool).join('\n')}

You MAY think first, but the LAST thing in your reply must be the json block (or plain prose if
no tool is needed). To call tools, end your reply with a fenced json block:

\`\`\`json
{"tool_calls": [{"name": "web_search", "arguments": {"query": "…"}}]}
\`\`\`

Rules:
- Put the block LAST. Any prose before it is discarded; keep reasoning short.
- Use valid JSON: double quotes, no trailing commas, true/false/null (not True/False/None).
- You may list several calls in one block; they run in parallel.
- Results come back as a user message beginning with TOOL_RESULTS. Use them to
  answer normally, in plain prose — do not emit another block unless you need
  more information.
- If no tool is needed, just answer. Never emit an empty tool_calls array.`
}

// Capture the WHOLE fenced body (not up to the first }, which truncates nested JSON).
const FENCED = /```(?:json)?\s*([\s\S]*?)```/g
const BARE = /\{\s*["“]tool_calls["”]\s*:\s*\[[\s\S]*?\]\s*\}/g

/** Best-effort repair of the almost-JSON weak models emit. */
function repairJson(raw) {
  return raw
    .replace(/,\s*([}\]])/g, '$1')                 // trailing commas
    .replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null')
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")   // smart quotes → straight
}

/**
 * Extract tool calls from a reply. Tolerant by design: weak models add prose,
 * wrap reasoning in <think>, forget the fence, add trailing commas, or use
 * Python literals. Returns `malformed:true` when a block was clearly attempted
 * but could not be parsed, so the caller can reprompt once.
 * @returns {{calls: Array, text: string, malformed: boolean}}
 */
export function parseToolCalls(reply = '') {
  const found = []
  // Reasoning-then-format: drop <think>…</think> (and an unclosed one) first.
  const clean = String(reply)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
  let text = clean
  let attempted = false

  const tryParse = (raw) => {
    for (const candidate of [raw, repairJson(raw)]) {
      try {
        const obj = JSON.parse(candidate)
        const list = obj.tool_calls || obj.tools || (obj.name ? [obj] : null)
        if (!Array.isArray(list)) continue
        for (const c of list) {
          let name = c.name || c.tool || c.function
          if (!name) continue
          name = String(name).split('<')[0].split(' ')[0].split(':')[0].trim()
          if (!name) continue
          let args = c.arguments ?? c.args ?? c.parameters ?? {}
          if (typeof args === 'string') {
            try { args = JSON.parse(args) } catch { try { args = JSON.parse(repairJson(args)) } catch { args = {} } }
          }
          found.push({ name, parsedArgs: args, id: `pt_${found.length}` })
        }
        if (found.length) return true
      } catch { /* try next candidate */ }
    }
    return false
  }

  for (const re of [FENCED, BARE]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(clean))) {
      attempted = true
      const raw = m[1] || m[0]
      if (tryParse(raw)) text = text.replace(m[0], '')
    }
    if (found.length) break
  }

  return { calls: found, text: text.trim(), malformed: attempted && found.length === 0 }
}

/** Feed results back in a form a non-tool model can read. */
export function formatToolResults(results = []) {
  const body = results
    .map(({ name, result }) => `### ${name}\n${JSON.stringify(result, null, 1).slice(0, 6000)}`)
    .join('\n\n')
  return `TOOL_RESULTS — here is what the tools returned. Answer the original question using this, in plain prose. Do not emit another tool block unless you genuinely need more information.\n\n${body}`
}
