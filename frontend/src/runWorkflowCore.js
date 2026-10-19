/**
 * runWorkflowCore.js — the ONE seam through which a saved workflow is run
 * against the app's own agent.
 *
 * Two callers share it, deliberately:
 *  - the manual run path (`App.runWorkflowNow`, invoked from SkillsPanel), and
 *  - the proactive scheduler (App's [proactive-scheduler] effect →
 *    backgroundWorkers.drainDueSchedules → runWorkflowById → here).
 *
 * "Do not duplicate the prompt plumbing" is the whole point of this module:
 * a scheduled step is an ORDINARY send() turn — it goes out through the same
 * send function, waits for its turn to settle the same way, and therefore still
 * passes through permissions.js + actionBoundary.js like any manually-run turn
 * (scheduler.js's own safety contract: scheduling is not a bypass).
 */

import { runWorkflow } from './workflows'

export const SETTLE_MIN_WAIT_MS = 900
export const SETTLE_POLL_MS = 300
export const SETTLE_TIMEOUT_MS = 180000

/**
 * Fire ONE prompt at the agent and resolve once the turn has settled.
 * `send(prompt)` dispatches the prompt on the app's real send path
 * (App passes sendRef.current); `isBusy()` reports whether a turn is still
 * streaming (App passes loadingRef). This is App's own settle probe, kept
 * verbatim here so a scheduled run behaves exactly like the manual Run button.
 */
export function createAgentPromptRunner({ send, isBusy = () => false } = {}) {
  if (typeof send !== 'function') {
    // Nowhere to send (teardown, unmounted app): give up immediately rather
    // than poll to the timeout with nothing running.
    return async () => ''
  }
  return (prompt) =>
    new Promise((resolve) => {
      send(prompt)
      const started = Date.now()
      const iv = setInterval(() => {
        const settled = !isBusy() && Date.now() - started > SETTLE_MIN_WAIT_MS
        if (settled || Date.now() - started > SETTLE_TIMEOUT_MS) {
          clearInterval(iv)
          resolve('')
        }
      }, SETTLE_POLL_MS)
    })
}

/**
 * Run a saved workflow against the agent: workflows.runWorkflow fills each
 * step's template ({{variables}}, {{last}}, {{stepN}}) and executes the steps
 * in order through `promptRunner` — one prompt per step, sequential, each
 * seeing the previous step's output. Returns [{ prompt, output }] per step.
 */
export async function executeWorkflowAgainstAgent(wf, values = {}, promptRunner) {
  return runWorkflow(wf, values, promptRunner)
}
