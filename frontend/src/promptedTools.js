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

To call tools, reply with ONLY a fenced json block and nothing else:

\`\`\`json
{"tool_calls": [{"name": "web_search", "arguments": {"query": "…"}}]}
\`\`\`

Rules:
- Emit the block alone, with no explanation before or after it. Any prose in the
  same reply is discarded.
- You may list several calls in one block; they run in parallel.
- Results come back as a user message beginning with TOOL_RESULTS. Use them to
  answer normally, in plain prose — do not emit another block unless you need
  more information.
- If no tool is needed, just answer. Never emit an empty tool_calls array.`
}

const FENCED = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/g
const BARE = /\{\s*"tool_calls"\s*:\s*\[[\s\S]*?\]\s*\}/g

/**
 * Extract tool calls from a reply. Tolerant by design: weak models add prose,
 * forget the fence, or single-quote things.
 * @returns {{calls: Array, text: string}} text is the reply minus the block
 */
export function parseToolCalls(reply = '') {
  const found = []
  let text = reply

  const tryParse = (raw) => {
    try {
      const obj = JSON.parse(raw)
      const list = obj.tool_calls || obj.tools || (obj.name ? [obj] : null)
      if (!Array.isArray(list)) return false
      for (const c of list) {
        const name = c.name || c.tool || c.function
        if (!name) continue
        let args = c.arguments ?? c.args ?? c.parameters ?? {}
        if (typeof args === 'string') {
          try { args = JSON.parse(args) } catch { args = {} }
        }
        found.push({ name, parsedArgs: args, id: `pt_${found.length}` })
      }
      return found.length > 0
    } catch {
      return false
    }
  }

  for (const re of [FENCED, BARE]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(reply))) {
      const raw = m[1] || m[0]
      if (tryParse(raw)) text = text.replace(m[0], '')
    }
    if (found.length) break
  }

  return { calls: found, text: text.trim() }
}

/** Feed results back in a form a non-tool model can read. */
export function formatToolResults(results = []) {
  const body = results
    .map(({ name, result }) => `### ${name}\n${JSON.stringify(result, null, 1).slice(0, 6000)}`)
    .join('\n\n')
  return `TOOL_RESULTS — here is what the tools returned. Answer the original question using this, in plain prose. Do not emit another tool block unless you genuinely need more information.\n\n${body}`
}
