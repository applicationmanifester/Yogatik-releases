/**
 * dagResolver.js — Topological DAG Wave Resolution for Multi-Agent Workflows.
 * Groups tasks into execution waves so independent sub-agents execute in parallel,
 * while dependent sub-agents wait for their prerequisites and automatically receive
 * upstream output context.
 */

/**
 * Resolves a list of tasks into sequential execution waves of parallel sub-tasks.
 *
 * @param {Array<object>} tasks - Array of { id?, agent, task, depends_on? }
 * @returns {Array<Array<{ item: object, index: number, id: string, dependsOn: string[] }>>}
 */
export function resolveTaskWaves(tasks = []) {
  if (!Array.isArray(tasks) || tasks.length === 0) return []

  // 1. Normalize tasks and assign stable IDs
  const normalized = tasks.map((t, idx) => {
    const id = String(t.id ?? idx).trim()
    let dependsOn = []
    if (Array.isArray(t.depends_on)) {
      dependsOn = t.depends_on.map(String)
    } else if (typeof t.depends_on === 'string' || typeof t.depends_on === 'number') {
      dependsOn = [String(t.depends_on)]
    }
    return {
      item: t,
      index: idx,
      id,
      dependsOn,
    }
  })

  // Fast path: If no task has dependencies, run everything in a single parallel wave
  const hasDependencies = normalized.some(t => t.dependsOn.length > 0)
  if (!hasDependencies) {
    return [normalized]
  }

  const waves = []
  const resolvedIds = new Set()
  const remaining = new Set(normalized)

  let safetyCounter = 0
  const maxIterations = normalized.length + 2

  while (remaining.size > 0 && safetyCounter < maxIterations) {
    safetyCounter++
    const currentWave = []

    for (const task of remaining) {
      const allDepsSatisfied = task.dependsOn.every(depId => resolvedIds.has(depId))
      if (allDepsSatisfied) {
        currentWave.push(task)
      }
    }

    if (currentWave.length === 0) {
      // Cycle or unresolved external dependency detected: drain remaining tasks into a final fallback wave
      waves.push(Array.from(remaining))
      break
    }

    for (const task of currentWave) {
      remaining.delete(task)
      resolvedIds.add(task.id)
    }

    waves.push(currentWave)
  }

  return waves
}

/**
 * Enriches a sub-agent's prompt with upstream outputs from its prerequisite tasks.
 *
 * @param {object} taskItem - The sub-agent task object
 * @param {string[]} dependsOn - Prerequisite task IDs
 * @param {Map<string, object>} resultsById - Map of taskId -> { agent, role, result }
 * @returns {string} Enriched task instruction prompt
 */
export function enrichTaskWithUpstream(taskItem, dependsOn = [], resultsById = new Map()) {
  const originalPrompt = taskItem.task || ''
  if (!dependsOn || dependsOn.length === 0) return originalPrompt

  const parentOutputs = []
  for (const depId of dependsOn) {
    const parentRes = resultsById.get(depId)
    if (parentRes) {
      const label = parentRes.agent || parentRes.role || `Task ${depId}`
      parentOutputs.push(`#### Output from ${label} (Task ID: ${depId}):\n${parentRes.result}`)
    }
  }

  if (parentOutputs.length === 0) return originalPrompt

  return `${originalPrompt}\n\n### Upstream Inputs & Context:\n${parentOutputs.join('\n\n')}`
}
