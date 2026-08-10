/**
 * Workflows — a saved, ordered list of prompt steps run one after another. Each
 * step is a prompt (may use {{variables}} and {{last}} / {{stepN}} to reference
 * earlier output). Fully local; run through the normal agent so every tool works.
 *   { id, name, steps: [{ prompt }] }
 */
import { getSetting, setSetting } from './db'
import { fillTemplate, userVars } from './template'

const KEY = 'workflows'

export async function getWorkflows() { return (await getSetting(KEY, [])) || [] }
export async function saveWorkflows(list) { return setSetting(KEY, list || []) }

const slug = (s) => String(s || 'flow').replace(/[^a-z0-9]+/gi, '_').toLowerCase().replace(/^_+|_+$/g, '') || 'flow'

export async function upsertWorkflow(wf) {
  const list = await getWorkflows()
  const id = wf.id || `wf_${slug(wf.name)}_${Date.now().toString(36)}`
  const clean = {
    id,
    name: (wf.name || 'Untitled workflow').trim(),
    steps: (wf.steps || []).map(s => ({ prompt: String(s.prompt || '').trim() })).filter(s => s.prompt),
  }
  await saveWorkflows([...list.filter(w => w.id !== id), clean])
  return clean
}

export async function deleteWorkflow(id) {
  await saveWorkflows((await getWorkflows()).filter(w => w.id !== id))
}

/** All user-supplied variables across every step (for a fill-in form). */
export function workflowVars(wf) {
  const seen = new Set()
  for (const s of wf.steps || []) for (const v of userVars(s.prompt)) seen.add(v)
  return [...seen]
}

/**
 * Run a workflow. `runStep(prompt, index)` executes one step and returns its text
 * output (injected via the normal agent by the caller). Pure orchestration, so it
 * is testable with a stub. Returns [{ prompt, output }] per step.
 * @param {object} wf
 * @param {object} values  user variable values
 * @param {(prompt:string, index:number)=>Promise<string>} runStep
 */
export async function runWorkflow(wf, values, runStep, { signal } = {}) {
  const results = []
  const ctx = { ...values }
  for (let i = 0; i < (wf.steps || []).length; i++) {
    if (signal?.aborted) break
    ctx.last = i > 0 ? results[i - 1].output : ''
    ctx[`step${i}`] = ctx.last
    const prompt = fillTemplate(wf.steps[i].prompt, ctx)
    const output = await runStep(prompt, i)
    results.push({ prompt, output: output ?? '' })
  }
  return results
}
