/**
 * schemaRepair.js — Self-healing tool argument sanitizer & type-coercer.
 * Resolves parameter aliases, unpacks stringified JSON, and coerces types
 * so LLM tool calling never crashes from minor schema hallucinations.
 */

const COMMON_ALIASES = {
  query: ['q', 'searchTerm', 'search_term', 'search', 'query_string', 'keyword', 'keywords', 'term', 'question', 'topic', 'subject', 'input', 'find', 'ask'],
  code: ['script', 'source', 'snippet', 'code_snippet', 'program', 'source_code'],
  url: ['link', 'href', 'target_url', 'uri', 'address', 'page_url', 'endpoint'],
  text: ['content', 'message', 'data_string', 'input_text', 'prompt_text'],
  path: ['file_path', 'filepath', 'filename', 'target_path', 'file_name', 'file', 'target', 'target_file', 'TargetFile'],
  limit: ['max', 'max_results', 'count', 'size', 'top_k', 'num_results'],
  tasks: ['subtasks', 'sub_tasks', 'task_list', 'delegations'],
  target: ['to', 'dest', 'destination', 'target_lang', 'target_language'],
  prompt: ['instruction', 'input_prompt', 'description_prompt'],
  old_string: ['oldString', 'old', 'old_str', 'oldStr', 'find', 'search', 'original', 'TargetContent', 'targetContent', 'target_content', 'before', 'from'],
  new_string: ['newString', 'new', 'new_str', 'newStr', 'replace', 'replacement', 'new_text', 'newText', 'content', 'ReplacementContent', 'replacementContent', 'replacement_content', 'after', 'to'],
}

/**
 * Safely parse raw arguments if passed as a string.
 */
function unpackRawArgs(raw) {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        return JSON.parse(trimmed)
      } catch {}
    }
    // Single string parameter fallback
    return { query: trimmed, text: trimmed, input: trimmed }
  }
  return {}
}

/**
 * Repairs, normalizes, and type-coerces tool arguments against the tool's schema.
 *
 * @param {string} toolName - Name of the tool being executed
 * @param {any} rawArgs - The raw arguments object or string from the LLM
 * @param {object} [schema] - The OpenAI-compatible parameter schema
 * @returns {object} Cleaned and repaired arguments object
 */
export function repairToolArguments(toolName, rawArgs, schema = null) {
  const args = unpackRawArgs(rawArgs)
  const properties = schema?.parameters?.properties || schema?.properties || {}
  const expectedKeys = Object.keys(properties)

  // 1. Resolve Aliases for Expected Keys
  for (const expectedKey of expectedKeys) {
    if (args[expectedKey] === undefined) {
      // Check known global aliases
      const aliases = COMMON_ALIASES[expectedKey] || []
      for (const alias of aliases) {
        if (args[alias] !== undefined) {
          args[expectedKey] = args[alias]
          break
        }
      }

      // Check case-insensitive / snake_case matching
      if (args[expectedKey] === undefined) {
        const lowerKey = expectedKey.toLowerCase().replace(/_/g, '')
        for (const [k, v] of Object.entries(args)) {
          if (k.toLowerCase().replace(/_/g, '') === lowerKey) {
            args[expectedKey] = v
            break
          }
        }
      }
    }
  }

  // 2. Type Coercion based on Schema Properties
  for (const [key, prop] of Object.entries(properties)) {
    const val = args[key]
    if (val === undefined || val === null) continue

    const targetType = prop.type || (Array.isArray(prop.enum) ? 'string' : undefined)

    if (targetType === 'number' || targetType === 'integer') {
      if (typeof val === 'string') {
        const parsed = Number(val)
        if (!Number.isNaN(parsed)) args[key] = parsed
      }
    } else if (targetType === 'boolean') {
      if (typeof val === 'string') {
        const lower = val.toLowerCase().trim()
        if (lower === 'true' || lower === '1' || lower === 'yes') args[key] = true
        else if (lower === 'false' || lower === '0' || lower === 'no') args[key] = false
      } else if (typeof val === 'number') {
        args[key] = val !== 0
      }
    } else if (targetType === 'string') {
      if (typeof val === 'number' || typeof val === 'boolean') {
        args[key] = String(val)
      } else if (typeof val === 'object' && val !== null) {
        try { args[key] = JSON.stringify(val) } catch {}
      }
    } else if (targetType === 'array') {
      if (!Array.isArray(val)) {
        if (typeof val === 'string') {
          // If stringified JSON array, try parsing
          const trimmed = val.trim()
          if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
            try { args[key] = JSON.parse(trimmed) } catch { args[key] = [val] }
          } else {
            args[key] = [val]
          }
        } else if (val !== undefined && val !== null) {
          args[key] = [val]
        }
      }
    }
  }

  // 3. Tool-Specific Required Argument Auto-Healing
  const tName = String(toolName || '').toLowerCase()
  if (tName === 'fs_search' || tName === 'web_search' || tName === 'doc_search' || tName === 'knowledge_search') {
    if (!args.query && !args.q && !args.searchTerm) {
      args.query = args.pattern || args.text || args.input || args.keyword || '*'
    }
  }

  if (tName === 'fs_list' || tName === 'fs_file_tree') {
    if (!args.path && !args.filePath && !args.filename) {
      args.path = args.target || args.dir || './'
    }
  } else if (tName === 'fs_read' || tName === 'fs_file_info') {
    if (!args.path && !args.filePath && !args.filename) {
      args.path = args.target || args.file || ''
    }
  }

  if (tName === 'terminal_run' || tName === 'terminal_exec' || tName === 'proc_start') {
    if (!args.command && !args.cmd) {
      args.command = args.script || args.code || 'echo [no command provided]'
    }
  }

  if (tName === 'web_extract' || tName === 'web_read' || tName === 'read_url' || tName === 'fetch_url') {
    if (!args.url) {
      args.url = args.link || args.uri || args.href || args.target || args.webpage || args.address || ''
    }
  }

  return args
}
