/**
 * Tool calling for models that lack native function calling or emit text/XML tool calls.
 *
 * Supports:
 *   1. Standard JSON format: ```json {"tool_calls": [...]} ``` or bare {"tool_calls": [...]}
 *   2. Single tool JSON: {"name": "...", "arguments": {...}}
 *   3. Nemotron / Hermes XML syntax: <tool_call> <function=name> <parameter=key>value</parameter> </function> </tool_call>
 *   4. Claude / Antigravity XML syntax: <invoke name="name"><parameter name="key">value</parameter></invoke>
 *   5. XML enclosed JSON: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
 *   6. ReAct syntax: Action: tool_name\nAction Input: {...}
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

// Regex matchers for various tool call formats
const FENCED = /```(?:json)?\s*([\s\S]*?)```/g
const BARE = /\{\s*["“]tool_calls["”]\s*:\s*\[[\s\S]*?\]\s*\}/g
const BARE_SINGLE = /\{\s*["“](?:name|tool|function)["”]\s*:\s*["“][^"”]+["”]\s*,\s*["“](?:arguments|args|parameters)["”]\s*:\s*[\s\S]*?\}/g
const XML_TOOL_CALL = /<tool_call>([\s\S]*?)<\/tool_call>/gi
const XML_FUNCTION_CALL = /<function_call>([\s\S]*?)<\/function_call>/gi
const XML_INVOKE = /<invoke\s+name=["']?([^"'>\s]+)["']?>([\s\S]*?)<\/invoke>/gi
const REACT_ACTION = /Action:\s*([a-zA-Z0-9_-]+)\s*\nAction Input:\s*([\s\S]*?)(?=(?:\n\s*Action:|\n\s*Observation:|\n\s*```|$))/gi

/** Best-effort repair of the almost-JSON weak models emit. */
function repairJson(raw) {
  return raw
    .replace(/,\s*([}\]])/g, '$1')                 // trailing commas
    .replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null')
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")   // smart quotes → straight
}

/** Parses parameter values converting numbers/booleans/JSON when applicable. */
function coerceParamValue(val) {
  const trimmed = String(val ?? '').trim()
  if (!trimmed) return ''
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (trimmed === 'null') return null
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed)
    if (!isNaN(num)) return num
  }
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { return JSON.parse(trimmed) } catch { try { return JSON.parse(repairJson(trimmed)) } catch { /* text */ } }
  }
  // Strip enclosing quotes if any
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * Parses XML/pseudo-XML tag structures like:
 * <function=terminal_run> <parameter=command> ... </parameter> </function>
 * OR <function>terminal_run</function> <arguments>...</arguments>
 */
function parseXmlToolBlock(xmlContent) {
  const calls = []
  const text = String(xmlContent).trim()

  // First check if the XML block simply wraps raw JSON: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const obj = JSON.parse(repairJson(text))
      if (obj.name || obj.tool || obj.function) {
        return [{
          name: String(obj.name || obj.tool || obj.function).trim(),
          args: obj.arguments ?? obj.args ?? obj.parameters ?? {},
        }]
      }
    } catch { /* proceed to XML parser */ }
  }

  // Match <function=name>...</function> or <function name="name">...</function>
  const fnMatches = [...text.matchAll(/<function(?:=|\s+name=)["']?([a-zA-Z0-9_-]+)["']?>([\s\S]*?)<\/function>/gi)]
  if (fnMatches.length > 0) {
    for (const match of fnMatches) {
      const fnName = match[1].trim()
      const fnBody = match[2]
      const args = {}

      // Extract parameters: <parameter=key>val</parameter> or <parameter name="key">val</parameter>
      const paramMatches = [...fnBody.matchAll(/<parameter(?:=|\s+name=)["']?([a-zA-Z0-9_-]+)["']?>([\s\S]*?)<\/parameter>/gi)]
      for (const pMatch of paramMatches) {
        const key = pMatch[1].trim()
        const val = coerceParamValue(pMatch[2])
        args[key] = val
      }
      calls.push({ name: fnName, args })
    }
    return calls
  }

  // Match <function>name</function> and <parameter ...> or <arguments>
  const bareFnMatch = text.match(/<function>([a-zA-Z0-9_-]+)<\/function>/i)
  if (bareFnMatch) {
    const fnName = bareFnMatch[1].trim()
    const args = {}
    const paramMatches = [...text.matchAll(/<parameter(?:=|\s+name=)["']?([a-zA-Z0-9_-]+)["']?>([\s\S]*?)<\/parameter>/gi)]
    for (const pMatch of paramMatches) {
      args[pMatch[1].trim()] = coerceParamValue(pMatch[2])
    }
    calls.push({ name: fnName, args })
    return calls
  }

  return calls
}

/**
 * Extract tool calls from a reply. Tolerant by design: handles JSON, XML, pseudo-XML,
 * ReAct syntax, smart quotes, missing fences, and unclosed <think> blocks.
 *
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

  const tryParseJson = (raw) => {
    for (const candidate of [raw, repairJson(raw)]) {
      try {
        const obj = JSON.parse(candidate)
        const list = obj.tool_calls || obj.tools || (obj.name || obj.tool || obj.function ? [obj] : null)
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

  // 1. Check XML <tool_call> and <function_call> formats (Nemotron, Hermes, Qwen, DeepSeek)
  for (const re of [XML_TOOL_CALL, XML_FUNCTION_CALL]) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(clean))) {
      attempted = true
      const parsedXml = parseXmlToolBlock(m[1])
      if (parsedXml.length > 0) {
        for (const call of parsedXml) {
          found.push({ name: call.name, parsedArgs: call.args, id: `pt_${found.length}` })
        }
        text = text.replace(m[0], '')
      }
    }
  }

  // 2. Check Claude / Antigravity <invoke name="..."> syntax
  if (!found.length) {
    XML_INVOKE.lastIndex = 0
    let inv
    while ((inv = XML_INVOKE.exec(clean))) {
      attempted = true
      const name = inv[1].trim()
      const body = inv[2]
      const args = {}
      const paramMatches = [...body.matchAll(/<parameter(?:=|\s+name=)["']?([a-zA-Z0-9_-]+)["']?>([\s\S]*?)<\/parameter>/gi)]
      for (const p of paramMatches) {
        args[p[1].trim()] = coerceParamValue(p[2])
      }
      found.push({ name, parsedArgs: args, id: `pt_${found.length}` })
      text = text.replace(inv[0], '')
    }
  }

  // 3. Check JSON blocks (fenced and bare)
  if (!found.length) {
    for (const re of [FENCED, BARE, BARE_SINGLE]) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(clean))) {
        attempted = true
        const raw = m[1] || m[0]
        if (tryParseJson(raw)) text = text.replace(m[0], '')
      }
      if (found.length) break
    }
  }

  // 4. Check ReAct style (Action: ... Action Input: ...)
  if (!found.length) {
    REACT_ACTION.lastIndex = 0
    let act
    while ((act = REACT_ACTION.exec(clean))) {
      attempted = true
      const name = act[1].trim()
      const rawInput = act[2].trim()
      let args = {}
      try {
        args = JSON.parse(repairJson(rawInput))
      } catch {
        args = { input: rawInput }
      }
      found.push({ name, parsedArgs: args, id: `pt_${found.length}` })
      text = text.replace(act[0], '')
    }
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
