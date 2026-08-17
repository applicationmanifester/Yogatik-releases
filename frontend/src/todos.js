/**
 * Per-chat task list. Long multi-step work drifted because nothing tracked what
 * had actually been done — the model would lose the thread halfway through.
 *
 * The open items are injected into the system prompt each turn, the same way
 * memoryBlock() injects saved memories, so the model is continually reminded of
 * its own plan without spending a tool call to look it up.
 *
 * Pure functions here; persistence lives in the tool.
 */

const STATUSES = ['pending', 'in_progress', 'completed']

let seq = 0
function newId() {
  seq += 1
  return `t${Date.now().toString(36)}${seq.toString(36)}`
}

export function normalizeTodos(input) {
  if (!Array.isArray(input)) return []
  const out = []
  for (const raw of input) {
    if (raw == null) continue
    const item = typeof raw === 'string' ? { text: raw } : raw
    const text = String(item.text ?? '').trim()
    if (!text) continue
    out.push({
      id: item.id || newId(),
      text,
      status: STATUSES.includes(item.status) ? item.status : 'pending',
    })
  }
  return out
}

/** Apply replace / add / update / remove to a list, returning a new list. */
export function applyTodoOps(list, ops = {}) {
  let next = Array.isArray(list) ? [...list] : []

  if (ops.replace) return normalizeTodos(ops.replace)

  if (ops.add) next = [...next, ...normalizeTodos(ops.add)]

  if (ops.update) {
    for (const u of ops.update) {
      if (!u?.id) continue
      const i = next.findIndex(t => t.id === u.id)
      if (i === -1) continue
      next[i] = {
        ...next[i],
        text: u.text != null ? String(u.text) : next[i].text,
        status: STATUSES.includes(u.status) ? u.status : next[i].status,
      }
    }
  }

  if (ops.remove) {
    const gone = new Set(ops.remove.map(String))
    next = next.filter(t => !gone.has(String(t.id)))
  }

  return next
}

export function summarizeTodos(list = []) {
  const s = { total: list.length, completed: 0, in_progress: 0, pending: 0 }
  for (const t of list) if (s[t.status] != null) s[t.status] += 1
  return s
}

/** Prompt block of OPEN items. Empty once everything is done, so a finished
 *  list stops costing tokens. */
export function todoBlock(list = []) {
  const open = list.filter(t => t.status !== 'completed')
  if (!open.length) return ''
  const lines = open.map(t => `- [${t.status === 'in_progress' ? '~' : ' '}] (${t.id}) ${t.text}`)
  return '\n\nTASK LIST for this conversation — keep it current with the `todo` tool as you ' +
    'work: mark an item in_progress when you start it and completed the moment it is done. ' +
    'Do not report the whole task finished while items remain open.\n' + lines.join('\n')
}
