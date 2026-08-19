/**
 * The rail that makes "give it a goal and walk away" survivable.
 *
 * Autopilot drives real mouse, keyboard, shell and browser against the user's
 * REAL accounts, and there is no undo for a sent email or a placed order. So
 * every proposed step is classified before it runs: reversible work proceeds
 * untouched, and a short list of irreversible categories always stops for a
 * human, even in autopilot.
 *
 * Pure and DOM-free on purpose — this is the one module whose correctness the
 * user's data depends on, so it must be testable without an app around it.
 */

/** Verbs that end something, spend something, or tell someone. */
const IRREVERSIBLE_WORDS = [
  'send', 'submit', 'publish', 'post', 'tweet', 'reply', 'delete', 'remove',
  'erase', 'discard', 'buy', 'purchase', 'checkout', 'pay', 'transfer',
  'confirm', 'accept', 'agree', 'deploy', 'merge',
  'unsubscribe', 'uninstall', 'wipe',
]

// Words too ambiguous to match alone. "Ascending ORDER by name" and a plain
// "Cancel" button are everyday UI; stopping on those would make autopilot
// useless through sheer noise, and a rail people learn to click through is
// worse than no rail. These are matched as whole phrases instead.
const IRREVERSIBLE_PHRASES = [
  'place order', 'order now', 'confirm order', 'complete order',
  'cancel subscription', 'cancel order', 'cancel plan',
  'sign contract', 'sign document', 'sign and send',
  'format drive', 'archive all',
]

/** Shell fragments that destroy or exfiltrate, regardless of wording. */
const DESTRUCTIVE_SHELL = [
  /\brm\s+-[a-z]*r/i, /\brmdir\b/i, /\bdel\s+\/[sq]/i, /\bformat\s+[a-z]:/i,
  /\bmkfs\b/i, /\bdd\s+if=/i, /\bshutdown\b/i, /\breboot\b/i,
  /\bgit\s+push\b/i, /\bgit\s+reset\s+--hard\b/i, /\bnpm\s+publish\b/i,
  /\bcurl\b[^|]*\|\s*(ba)?sh/i, /\bkill(all)?\b/i, /:\(\)\s*\{.*\}\s*;:/,
]

/** Tools that can never run unattended, whatever the arguments say. */
const ALWAYS_CONFIRM_TOOLS = new Set(['process_manager', 'proc_stop'])

/** Tools that only read. Cheap to let run at full speed. */
const READ_ONLY_TOOLS = new Set([
  'screen_inspect', 'fs_read', 'fs_list', 'fs_search', 'fs_file_tree',
  'web_search', 'web_extract', 'deep_research', 'doc_search', 'doc_list',
  'weather', 'calculator', 'memory', 'clipboard_access', 'git_status',
  'git_log', 'git_diff', 'system_state', 'proc_output', 'list_tabs',
])

function textOf(value, depth = 0) {
  if (value == null || depth > 3) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((v) => textOf(v, depth + 1)).join(' ')
  if (typeof value === 'object') return Object.values(value).map((v) => textOf(v, depth + 1)).join(' ')
  return ''
}

/** Does any irreversible verb appear as a WHOLE word? */
function namesIrreversibleAct(text) {
  const hay = String(text || '').toLowerCase()
  const phrase = IRREVERSIBLE_PHRASES.find((p) => hay.includes(p))
  if (phrase) return phrase
  return IRREVERSIBLE_WORDS.find((w) => new RegExp(String.raw`\b${w}\b`, 'i').test(hay)) || null
}

/**
 * Classify one proposed step.
 * @returns {{ risk: 'safe'|'confirm', reason: string }}
 */
export function classifyAction({ tool, action, args, label } = {}) {
  const name = String(tool || '')

  if (ALWAYS_CONFIRM_TOOLS.has(name)) {
    return { risk: 'confirm', reason: `${name} can stop other programs — always confirmed.` }
  }

  // Shell is judged on the command itself, never on how it was described.
  if (name === 'terminal_run' || name === 'proc_start') {
    const cmd = String(args?.command || '')
    const hit = DESTRUCTIVE_SHELL.find((re) => re.test(cmd))
    if (hit) return { risk: 'confirm', reason: `The command looks destructive or outward-facing: ${cmd.slice(0, 80)}` }
    return { risk: 'safe', reason: 'Shell command with no destructive pattern.' }
  }

  // Typing that ends in Enter is a submit, whatever the field was.
  if (name === 'browser_control' && action === 'type' && args?.submit) {
    return { risk: 'confirm', reason: 'Typing with submit:true sends the form.' }
  }

  // A click is judged by what it is clicking. The tree gives us the label.
  if (name === 'browser_control' || name === 'computer_control') {
    const target = `${label || ''} ${textOf(args)}`
    const verb = namesIrreversibleAct(target)
    if (verb) return { risk: 'confirm', reason: `Target looks like a "${verb}" control.` }
    return { risk: 'safe', reason: 'Navigation or an ordinary control.' }
  }

  // Deleting or overwriting user files.
  if (name === 'fs_write' || name === 'fs_edit') {
    return { risk: 'safe', reason: 'File writes are journalled and can be undone with fs_undo.' }
  }
  if (name === 'fs_delete' || name === 'fs_remove') {
    return { risk: 'confirm', reason: 'Deleting a file is not journalled.' }
  }

  if (READ_ONLY_TOOLS.has(name)) return { risk: 'safe', reason: 'Read-only.' }

  // Anything unrecognised, judged on its arguments. Unknown + irreversible
  // wording is exactly the case where guessing wrong is expensive.
  const verb = namesIrreversibleAct(textOf(args))
  if (verb) return { risk: 'confirm', reason: `Arguments mention "${verb}".` }
  return { risk: 'safe', reason: 'No irreversible signal.' }
}

/** Convenience for the runner. */
export function needsConfirmation(step) {
  return classifyAction(step).risk === 'confirm'
}

export const _internals = { IRREVERSIBLE_WORDS, IRREVERSIBLE_PHRASES, DESTRUCTIVE_SHELL, READ_ONLY_TOOLS }
