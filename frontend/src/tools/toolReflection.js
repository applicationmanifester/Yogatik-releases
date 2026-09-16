/**
 * toolReflection.js — Dynamic self-correction and reflection hints for agent tool failures.
 * When a tool returns an error, this module provides concrete, contextual guidance
 * so the LLM can immediately auto-correct without looping or failing the turn.
 */

export function enrichToolError(toolName, args = {}, result = {}) {
  if (!result || (!result.error && !result.failed && result.success !== false)) {
    return result
  }

  const errStr = String(result.error || result.message || '').toLowerCase()
  const name = String(toolName || '').toLowerCase()
  let hint = null

  if (name.startsWith('fs_') || name === 'code_execute') {
    if (errStr.includes('old_string not found') || errStr.includes('not unique')) {
      hint = 'The text to replace could not be matched uniquely in the file. Hint: Call fs_read with start_line and end_line around the target area to see the exact current lines and formatting, then re-issue fs_edit or use fs_patch.'
    } else if (errStr.includes('enoent') || (errStr.includes('not found') && !errStr.includes('old_string')) || errStr.includes('no such file')) {
      hint = 'The target file or path does not exist. Hint: Call fs_find_files or fs_list to discover the actual filenames in the workspace before proceeding.'
    } else if (errStr.includes('permission') || errStr.includes('eacces') || result.denied) {
      hint = 'This filesystem operation was denied or restricted. Hint: Explain the permission boundary clearly or request explicit confirmation from the user.'
    } else if (errStr.includes('is a directory')) {
      hint = 'The path points to a directory, not a file. Hint: Use fs_list to inspect contents or specify a file path.'
    }
  } else if (name === 'web_search' || name === 'deep_research') {
    if (errStr.includes('no results') || errStr.includes('empty') || (Array.isArray(result.results) && result.results.length === 0)) {
      hint = 'No search results were found. Hint: Simplify the search terms, remove punctuation, or try broader keywords.'
    } else if (errStr.includes('rate limit') || errStr.includes('429')) {
      hint = 'Search provider rate limited. Hint: Fallback to wikipedia, scholar, or answer based on existing knowledge.'
    }
  } else if (name === 'web_extract' || name === 'link_preview') {
    if (errStr.includes('403') || errStr.includes('bot') || errStr.includes('cloudflare') || errStr.includes('timeout')) {
      hint = 'The target URL could not be retrieved directly. Hint: Try web_search with the site domain and topic to find alternate summaries.'
    }
  } else if (name === 'terminal_run' || name === 'proc_start') {
    if (errStr.includes('not recognized') || errStr.includes('not found')) {
      hint = 'The executable or command was not found in PATH. Hint: Check installed CLI tools or provide an absolute path.'
    }
  } else if (name === 'browser_control') {
    if (errStr.includes('stale ref') || errStr.includes('stale')) {
      hint = 'The element ref is stale because the DOM or page changed. Hint: Call browser_control with action "read" to obtain fresh element refs.'
    } else if (errStr.includes('timed out') || errStr.includes('timeout')) {
      hint = 'Element wait timed out. Hint: Call action "diagnose" to verify page load state and console errors, or "read" to see current elements.'
    }
  }

  if (hint && !result.reflection_hint) {
    return {
      ...result,
      reflection_hint: hint,
    }
  }

  return result
}
