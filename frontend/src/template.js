/**
 * Parameterized prompt variables — the reusable glue for skills and workflows.
 * A template uses {{name}} placeholders; fillTemplate substitutes them. Special
 * built-ins for workflows: {{last}} (previous step output) and {{stepN}}.
 */

/** Distinct variable names in a template, in first-seen order. */
export function extractVars(text) {
  const seen = new Set()
  for (const m of String(text || '').matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) seen.add(m[1])
  return [...seen]
}

/** Replace {{name}} with values[name]. Unknown vars are left blank (not literal). */
export function fillTemplate(text, values = {}) {
  return String(text || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name] ?? '') : '')
}

/** Vars a user must supply (excludes the workflow built-ins). */
export function userVars(text) {
  return extractVars(text).filter(v => v !== 'last' && !/^step\d+$/.test(v))
}
