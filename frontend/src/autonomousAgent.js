/**
 * Autonomous task agent — give it a goal and it plans, executes each step on
 * its own through the normal agent loop (so every tool works), then self-checks
 * and reports. Orchestration is pure and injectable (plan / runStep / review),
 * so it is unit-testable with stubs.
 */

/** Parse an ordered step list out of a planner's reply (numbered or bulleted). */
export function parsePlan(text) {
  if (!text) return []
  const lines = String(text).split('\n')
  const steps = []
  for (const raw of lines) {
    const m = raw.match(/^\s*(?:\d+[.)]|[-*•])\s+(.*\S)\s*$/)
    if (m && m[1].length > 2) steps.push(m[1].trim())
  }
  // Fallback: if nothing matched, treat each non-empty line as a step.
  if (!steps.length) {
    for (const raw of lines) { const t = raw.trim(); if (t.length > 3) steps.push(t) }
  }
  return steps.slice(0, 12)   // cap runaway plans
}

/**
 * @param {object} opts
 * @param {string} opts.goal
 * @param {(goal:string)=>Promise<string>} opts.plan        returns raw plan text
 * @param {(step:string, i:number, prior:string)=>Promise<string>} opts.runStep
 * @param {(goal:string, transcript:string)=>Promise<string>} [opts.review]  final synthesis
 * @param {AbortSignal} [opts.signal]
 * @param {Function} [opts.onPlan] [opts.onStepStart] [opts.onStepDone] [opts.onStatus]
 */
export async function runAutonomousAgent({
  goal, plan, runStep, review, signal,
  onPlan, onStepStart, onStepDone, onStatus,
}) {
  const aborted = () => signal?.aborted

  onStatus?.('Planning…')
  const planText = await plan(goal)
  const steps = parsePlan(planText)
  onPlan?.(steps)
  if (!steps.length) return { steps: [], results: [], report: planText || 'Could not form a plan.' }

  const results = []
  for (let i = 0; i < steps.length; i++) {
    if (aborted()) break
    onStepStart?.(i, steps[i])
    onStatus?.(`Step ${i + 1}/${steps.length}…`)
    // Thread a compact summary of prior results so steps build on each other.
    const prior = results.map((r, j) => `Step ${j + 1} (${steps[j]}):\n${r}`).join('\n\n').slice(-6000)
    let output = ''
    try { output = await runStep(steps[i], i, prior) }
    catch (e) { output = `(step failed: ${e?.message || e})` }
    results.push(output)
    onStepDone?.(i, steps[i], output)
  }

  onStatus?.('Reviewing…')
  const transcript = steps.map((s, i) => `### Step ${i + 1}: ${s}\n${results[i] || ''}`).join('\n\n')
  let report = transcript
  if (review && !aborted()) {
    try { report = await review(goal, transcript) } catch { /* keep transcript */ }
  }
  return { steps, results, report }
}

/**
 * Real driver: wires runAutonomousAgent to the app's LLM via streamMessage.
 * Kept out of the pure core so tests never touch the network.
 */
export async function autonomousAgent(goal, cb = {}) {
  const { streamMessage } = await import('./api')
  const { getAgentById } = await import('./agents')
  const planner = await getAgentById('planner')

  const ask = (message, system, use_tools) => new Promise((resolve) => {
    let text = ''
    streamMessage(
      { message, messages: [], system_prompt: system, use_tools, use_web_search: use_tools,
        channel: `auto-${Math.random().toString(36).slice(2, 8)}` },
      (t) => { text += t; cb.onStepToken?.(t) },
      null, () => resolve(text), () => resolve(text),
    )
  })

  return runAutonomousAgent({
    goal,
    signal: cb.signal,
    plan: (g) => ask(
      `Goal: ${g}\n\nProduce a concise, ordered, numbered list of concrete steps to achieve this. One instruction per line. No preamble.`,
      planner?.system || 'You are a planning specialist. Output only a numbered list of concrete steps.',
      false,
    ),
    runStep: (step, i, prior) => ask(
      `${prior ? `Context from earlier steps:\n${prior}\n\n` : ''}Now do this step and return only its result:\n${step}`,
      'You are an execution specialist completing one step of a larger plan. Use tools as needed. Be concise and concrete.',
      true,
    ),
    review: (g, transcript) => ask(
      `Goal: ${g}\n\nHere is everything gathered across the steps:\n\n${transcript}\n\nWrite the final, complete answer to the goal. Synthesize; do not just restate the steps. Note anything still uncertain.`,
      'You are a synthesis specialist producing the final deliverable.',
      false,
    ),
    onPlan: cb.onPlan,
    onStepStart: cb.onStepStart,
    onStepDone: cb.onStepDone,
    onStatus: cb.onStatus,
  })
}
