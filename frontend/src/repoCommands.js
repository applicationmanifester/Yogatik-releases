/**
 * Repo-defined commands — skills that live in the project instead of the
 * database.
 *
 * Skills and workflows were per-device Dexie rows, so a team convention could
 * not be versioned, diffed or shared by cloning. `.yogatik/commands/*.md` fixes
 * that: the file IS the command, exactly as CLAUDE.md-style guidance is the
 * project's instructions.
 *
 * Command files come from a repository, i.e. untrusted content. They are merged
 * as SKILLS (prompt text the user chooses to activate), never auto-executed,
 * and a stored skill with the same id always wins so a repo cannot silently
 * overwrite something the user edited.
 */

import { isDesktop, listRoots } from './tools/localFs'

const COMMANDS_DIR = '.yogatik/commands'

/** Minimal frontmatter reader — enough for name/description/tools, no YAML dep. */
function readFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!m) return { meta: {}, body: text }
  const meta = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line.trim())
    if (kv) meta[kv[1].toLowerCase()] = kv[2].trim()
  }
  return { meta, body: text.slice(m[0].length) }
}

export function parseCommandFile(filename, text) {
  const { meta, body } = readFrontmatter(String(text ?? ''))
  const system = body.trim()
  if (!system) return null

  const base = String(filename).replace(/\.md$/i, '')
  return {
    name: meta.name || base,
    description: meta.description || '',
    system,
    tools: meta.tools ? meta.tools.split(',').map(s => s.trim()).filter(Boolean) : [],
    file: filename,
  }
}

/** Stable id from root + filename, so the same file keeps its identity. */
export function commandToSkill(cmd, rootPath) {
  if (!cmd) return null
  let hash = 0
  const key = `${rootPath}|${cmd.file}`
  for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0
  return {
    id: `repo:${cmd.file.replace(/\.md$/i, '')}:${(hash >>> 0).toString(36)}`,
    name: cmd.name,
    description: cmd.description,
    system: cmd.system,
    tools: cmd.tools,
    starters: [],
    fromRepo: true,
    source: rootPath,
  }
}

/** Stored skills win on id collision — never clobber a user's own edit. */
export function mergeRepoCommands(stored = [], repo = []) {
  const s = Array.isArray(stored) ? stored : []
  const r = Array.isArray(repo) ? repo : []
  const taken = new Set(s.map(x => x.id))
  return [...s, ...r.filter(x => x && !taken.has(x.id))]
}

/** Read `.yogatik/commands/*.md` from every folder bound to the active chat. */
export async function loadRepoCommands() {
  if (!isDesktop()) return []
  try {
    const core = window.__TAURI__?.core
    if (!core?.invoke) return []
    const { getWorkspaceCtx } = await import('./tools/localFs')
    const ctx = getWorkspaceCtx()

    const roots = await listRoots()
    const out = []
    for (const root of roots) {
      let entries = []
      try {
        entries = await core.invoke('fs_list', { path: `${root.path}/${COMMANDS_DIR}`, ctx }) || []
      } catch { continue } // no commands directory in this root
      for (const e of entries) {
        if (e.is_dir || !/\.md$/i.test(e.name)) continue
        try {
          const text = await core.invoke('fs_read', { path: e.path, maxBytes: 40000, ctx })
          const skill = commandToSkill(parseCommandFile(e.name, text), root.path)
          if (skill) out.push(skill)
        } catch { /* skip unreadable file */ }
      }
    }
    return out
  } catch {
    return []
  }
}
