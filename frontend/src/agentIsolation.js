/**
 * Sub-agent workspace isolation.
 *
 * spawn_agents ran specialists in-process against the same conversation and the
 * same folders, so parallel agents could overwrite each other's files with no
 * trace of who did what.
 *
 * The per-chat roots subsystem makes the fix cheap: main resolves folders from
 * an opaque conversationId, so giving a sub-agent a DIFFERENT id gives it a
 * different workspace binding — no new plumbing in the main process at all.
 *
 * Isolation is OPT-IN. Defaulting it on would silently change what existing
 * spawn_agents calls can see, and an isolated agent starts with no folders
 * until one is bound to its key.
 */

/** Stable, traceable workspace key for one sub-agent. */
export function isolationKeyFor(parentId, agentId, index = 0) {
  return `sub:${parentId}:${agentId}:${index}`
}

/**
 * Decide the workspace each sub-agent runs in.
 * @returns [{ agentId, conversationId, isolated }]
 */
export function planIsolation(parentId, agentIds = [], { isolate = false } = {}) {
  return (agentIds || []).map((agentId, i) => ({
    agentId,
    conversationId: isolate ? isolationKeyFor(parentId, agentId, i) : parentId,
    isolated: !!isolate,
  }))
}

/**
 * Tools a sub-agent may not use. spawn_agents is always removed (no recursion);
 * an ISOLATED agent additionally cannot grant itself folders, since being able
 * to widen its own access would defeat the isolation.
 */
export function mergeIsolatedDisabled(disabled = [], { isolated = false } = {}) {
  const out = new Set(disabled || [])
  out.add('spawn_agents')
  if (isolated) out.add('fs_add_folder')
  return [...out]
}
