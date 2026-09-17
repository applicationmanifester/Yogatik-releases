import React, { useCallback, useEffect, useState } from 'react'
import {
  GitBranch, RefreshCw, Plus, Minus, Check, Loader2, Sparkles, Undo2, AlertTriangle,
  FileDiff, History, Download, ArrowUp, ArrowDown, Archive, ArchiveRestore,
} from 'lucide-react'
import { parseUnifiedDiff, diffTexts } from '../workspace/diffModel'
import {
  gitStatus, gitDiff, gitLog, gitWrite, gitShowUntracked, GIT_CONFIRM_OPS,
  listJournal, revertJournalEntry, journalDiff,
} from '../tools/localFs'
import DiffView from './DiffView'

/**
 * ChangesPanel — two views of "what changed", because there are two answers and
 * they are not the same question.
 *
 *  • Git      — what changed since the last commit, from the repository's view.
 *  • Journal  — what THIS AGENT changed, in this chat, with the exact bytes it
 *               overwrote and a one-click restore. Git cannot answer that: an
 *               agent edit to an already-modified file is indistinguishable
 *               from the user's own work in `git status`, and an edit to an
 *               untracked or gitignored file does not appear there at all.
 *
 * The second one is the reason this panel exists. Reviewing an agent's work is
 * the safety-critical loop of the whole desktop app, and until now the journal
 * was reachable only through an `fs_undo` tool call the user had to think to ask
 * for.
 */

const OP_LABEL = {
  fs_write: 'wrote', fs_edit: 'edited', fs_multi_edit: 'edited', fs_delete: 'deleted',
  fs_move: 'moved', fs_copy: 'copied', fs_mkdir: 'created folder', fs_batch_write: 'wrote',
}

function relTime(ts) {
  const d = Date.now() - Number(ts || 0)
  if (d < 60000) return 'just now'
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`
  return new Date(Number(ts)).toLocaleDateString()
}

function shortPath(p, root) {
  const s = String(p || '').split('\\').join('/')
  const r = String(root || '').split('\\').join('/')
  if (r && s.startsWith(r + '/')) return s.slice(r.length + 1)
  return s
}

/* ────────────────────────────────── git ────────────────────────────────── */

function GitView() {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)          // { path, staged, untracked }
  const [diff, setDiff] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState([])
  const [err, setErr] = useState(null)
  const [confirm, setConfirm] = useState(null)   // { op, opts, label }
  const [newBranch, setNewBranch] = useState('')
  const [amend, setAmend] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [st, lg] = await Promise.all([gitStatus(), gitLog(15)])
    setStatus(st)
    setErr(st?.success ? null : st?.error || 'git is unavailable here.')
    setLog(lg?.success ? lg.commits : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openDiff = useCallback(async (file) => {
    setSel(file)
    setDiff({ loading: true })
    if (file.untracked) {
      // An untracked file has no git diff at all. Rendering "no changes" for a
      // brand-new file the agent just wrote would be the single most misleading
      // thing this panel could say, so it is shown as wholly added.
      const res = await gitShowUntracked(file.path)
      if (!res?.success) { setDiff({ error: res?.error || 'Could not read the file.' }); return }
      if (res.binary) { setDiff({ binary: true, hunks: [], added: 0, removed: 0 }); return }
      const d = diffTexts('', res.content)
      setDiff({ ...d, note: 'Untracked — the whole file is new.' })
      return
    }
    const res = await gitDiff({ path: file.path, staged: file.staged && !file.unstaged })
    if (!res?.success) { setDiff({ error: res?.error || 'Could not read the diff.' }); return }
    const files = parseUnifiedDiff(res.diff)
    const f = files[0]
    if (!f) { setDiff({ hunks: [], added: 0, removed: 0 }); return }
    setDiff({ hunks: f.hunks, added: f.added, removed: f.removed, binary: f.binary })
  }, [])

  const run = useCallback(async (op, opts = {}) => {
    setBusy(true)
    const res = await gitWrite(op, opts)
    setBusy(false)
    if (!res?.success) { setErr(res?.error || 'git command failed.'); return false }
    setErr(null)
    if (op === 'commit') { setMessage(''); setSel(null); setDiff(null) }
    await load()
    return true
  }, [load])

  /**
   * Anything that can lose work is asked about HERE, in the panel, before the
   * call is made. main refuses it without confirm:true regardless — but a
   * round-trip that comes back "needs confirmation" would look like a broken
   * button, and the user would learn to click twice reflexively, which defeats
   * the gate entirely.
   */
  const act = useCallback(async (op, paths, msg, extra = {}) => {
    const opts = { paths: paths || [], message: msg || '', ...extra }
    if (GIT_CONFIRM_OPS.has(op) || (op === 'commit' && extra.amend)) {
      setConfirm({ op, opts, label: extra.label || op })
      return false
    }
    return run(op, opts)
  }, [run])

  if (loading) return <div className="ws-empty sm"><Loader2 size={18} className="ws-spin" /><p>Reading repository…</p></div>

  if (!status?.success) {
    return (
      <div className="ws-empty">
        <GitBranch size={22} />
        <p>No git repository</p>
        <span>{err || 'This working folder is not a git repository, or git is not on PATH.'}</span>
        <button className="ws-primary-btn" onClick={load}>Retry</button>
      </div>
    )
  }

  const files = Array.isArray(status?.files) ? status.files : []
  const staged = files.filter(f => f.staged && !f.untracked)
  const changed = files.filter(f => (f.unstaged || f.untracked))

  const Row = ({ f, group }) => (
    <div
      className={`ws-change-row ${sel?.path === f.path ? 'selected' : ''}`}
      onClick={() => openDiff(f)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && openDiff(f)}
      title={f.path}
    >
      <span className={`ws-badge ${f.untracked ? 'git-U' : f.deleted ? 'git-D' : 'git-M'}`}>
        {f.untracked ? 'U' : f.deleted ? 'D' : f.renamed ? 'R' : 'M'}
      </span>
      <span className="ws-change-name">{f.path.split('/').pop()}</span>
      <span className="ws-change-dir">{f.path.split('/').slice(0, -1).join('/')}</span>
      {group === 'changed' && !f.untracked && (
        <button
          className="icon-btn danger"
          title="Discard changes to this file"
          aria-label={`Discard changes to ${f.path}`}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation()
            act('discard', [f.path], '', { label: `discard your changes to ${f.path.split('/').pop()}` })
          }}
        >
          <Undo2 size={12} />
        </button>
      )}
      <button
        className="icon-btn"
        title={group === 'staged' ? 'Unstage' : 'Stage'}
        aria-label={group === 'staged' ? 'Unstage' : 'Stage'}
        disabled={busy}
        onClick={(e) => { e.stopPropagation(); act(group === 'staged' ? 'unstage' : 'stage', [f.path]) }}
      >
        {group === 'staged' ? <Minus size={12} /> : <Plus size={12} />}
      </button>
    </div>
  )

  return (
    <div className="ws-changes">
      <div className="ws-toolbar">
        {/* A detached HEAD is not a branch, and calling it one is how people
            commit work that no ref points at. */}
        <select
          className="ws-branch-select"
          aria-label="Branch"
          value={status.detached ? '' : (status.branch || '')}
          disabled={busy}
          onChange={e => e.target.value && act('checkout', [], '', {
            name: e.target.value, label: `switch to ${e.target.value}`,
          })}
        >
          {status.detached && <option value="">detached HEAD</option>}
          {(Array.isArray(status?.branches) ? status.branches : []).map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        {/* Ahead/behind is the answer to "do I need to push", which the panel
            could not express at all while it parsed porcelain v1. */}
        {status.upstream && (status.ahead > 0 || status.behind > 0) && (
          <span className="ws-muted" title={`vs ${status.upstream}`}>
            {status.behind > 0 && <>↓{status.behind}</>}{status.ahead > 0 && <>↑{status.ahead}</>}
          </span>
        )}
        {status.stashes > 0 && <span className="ws-muted" title="Stashes">⚑{status.stashes}</span>}
        <span className="ws-muted">{status.summary.total} changed</span>

        <span className="ws-spacer" />
        <button className="icon-btn" title="Fetch from remote" aria-label="Fetch" disabled={busy}
          onClick={() => act('fetch')}><Download size={13} /></button>
        <button className="icon-btn" title="Pull (fast-forward only)" aria-label="Pull" disabled={busy}
          onClick={() => act('pull')}><ArrowDown size={13} /></button>
        <button className="icon-btn" title={status.upstream ? 'Push' : 'Push and set upstream'}
          aria-label="Push" disabled={busy}
          onClick={() => act(status.upstream ? 'push' : 'push_upstream')}><ArrowUp size={13} /></button>
        <button className="icon-btn" title="Stash all changes" aria-label="Stash" disabled={busy || !status.summary.total}
          onClick={() => act('stash_push')}><Archive size={13} /></button>
        <button className="icon-btn" title="Pop the latest stash" aria-label="Pop stash" disabled={busy || !status.stashes}
          onClick={() => act('stash_pop')}><ArchiveRestore size={13} /></button>
        <button className="icon-btn" title="Refresh" aria-label="Refresh git status" onClick={load}><RefreshCw size={13} /></button>
      </div>

      {/* Offering "commit" in the middle of an unresolved rebase is offering
          the wrong thing; git's own refusal arrives only after the message is
          typed. */}
      {status.operation && (
        <div className="ws-notice warn">
          <AlertTriangle size={13} /> A {status.operation} is in progress.
          {status.summary.conflicted > 0 && ` ${status.summary.conflicted} file(s) still conflict.`}
        </div>
      )}

      {err && <div className="ws-notice error">{err}</div>}

      {confirm && (
        <div className="ws-notice confirm">
          <AlertTriangle size={13} />
          <span>This will {confirm.label}. It cannot be undone from git.</span>
          <button className="ws-ghost-btn sm" onClick={() => setConfirm(null)}>Cancel</button>
          <button
            className="ws-danger-btn sm"
            onClick={() => { const c = confirm; setConfirm(null); run(c.op, { ...c.opts, confirm: true }) }}
          >Yes, {confirm.op.replace(/_/g, ' ')}</button>
        </div>
      )}

      <div className="ws-branch-new">
        <input
          value={newBranch}
          placeholder="New branch name…"
          aria-label="New branch name"
          onChange={e => setNewBranch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && newBranch.trim()) {
              act('create_branch', [], '', { name: newBranch.trim() }).then(() => setNewBranch(''))
            }
          }}
        />
        <button className="ws-ghost-btn sm" disabled={busy || !newBranch.trim()}
          onClick={() => act('create_branch', [], '', { name: newBranch.trim() }).then(() => setNewBranch(''))}>
          Create
        </button>
      </div>

      <div className="ws-commit">
        <textarea
          rows={2}
          value={message}
          placeholder="Commit message"
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && message.trim()) act('commit', [], message)
          }}
        />
        <div className="ws-commit-actions">
          <label className="ws-check" title="Replace the last commit instead of adding one">
            <input type="checkbox" checked={amend} onChange={e => setAmend(e.target.checked)} /> Amend
          </label>
          <button className="ws-ghost-btn" disabled={busy || !changed.length} onClick={() => act('stage_all')}>Stage all</button>
          <button className="ws-primary-btn sm"
            disabled={busy || !message.trim() || (!staged.length && !amend)}
            onClick={() => act('commit', [], message, amend ? { amend: true, label: 'rewrite the last commit' } : {})}>
            <Check size={12} /> {amend ? 'Amend' : 'Commit'} {staged.length ? `(${staged.length})` : ''}
          </button>
        </div>
      </div>

      <div className="ws-change-list">
        {staged.length > 0 && (
          <>
            <div className="ws-group-head">Staged <span>{staged.length}</span>
              <button className="icon-btn" title="Unstage all" aria-label="Unstage all" disabled={busy}
                onClick={() => act('unstage_all')}><Minus size={11} /></button>
            </div>
            {staged.map(f => <Row key={`s:${f.path}`} f={f} group="staged" />)}
          </>
        )}
        {changed.length > 0 && (
          <>
            <div className="ws-group-head">Changes <span>{changed.length}</span></div>
            {changed.map(f => <Row key={`c:${f.path}`} f={f} group="changed" />)}
          </>
        )}
        {!staged.length && !changed.length && (
          <div className="ws-empty sm"><Check size={18} /><p>Working tree clean</p></div>
        )}
      </div>

      {sel && (
        <div className="ws-diff-wrap">
          {diff?.loading && <div className="ws-empty sm"><Loader2 size={16} className="ws-spin" /><p>Reading diff…</p></div>}
          {diff?.error && <div className="ws-notice error">{diff.error}</div>}
          {diff && !diff.loading && !diff.error && (
            <DiffView
              title={sel.path}
              hunks={diff.hunks}
              added={diff.added}
              removed={diff.removed}
              binary={diff.binary}
              truncated={diff.truncated}
              note={diff.note}
            />
          )}
        </div>
      )}

      {log.length > 0 && !sel && (
        <div className="ws-log">
          <div className="ws-group-head"><History size={11} /> Recent commits</div>
          {log.map(c => (
            <div className="ws-log-row" key={c.hash} title={c.hash}>
              <code>{String(c.hash).slice(0, 7)}</code>
              <span className="ws-change-name">{c.subject}</span>
              <span className="ws-muted">{c.author} · {c.date}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────── journal ──────────────────────────────── */

function JournalView({ root }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState(null)
  const [diff, setDiff] = useState(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const list = await listJournal()
    setEntries(Array.isArray(list) ? list : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const open = useCallback(async (entry) => {
    setSel(entry)
    setDiff({ loading: true })
    const res = await journalDiff(entry.id)
    if (!res?.success) { setDiff({ error: res?.error || 'No comparison available for this entry.' }); return }
    if (res.binary) { setDiff({ binary: true, hunks: [], added: 0, removed: 0 }); return }
    if (res.tooLarge) { setDiff({ truncated: true, hunks: [], added: 0, removed: 0 }); return }
    const d = diffTexts(res.before, res.after)
    setDiff({
      ...d,
      note: res.beforeMissing
        ? 'This file did not exist before — everything here was created by the agent.'
        : res.afterMissing
          ? 'The file no longer exists on disk. Restore puts back the snapshot below.'
          : null,
    })
  }, [])

  const restore = useCallback(async (entry) => {
    setBusy(true)
    const res = await revertJournalEntry(entry.id)
    setBusy(false)
    setNotice(res?.success
      ? { tone: 'ok', text: `Restored ${shortPath(entry.target, root)}` }
      : { tone: 'error', text: res?.error || 'Could not restore.' })
    if (res?.success) { setSel(null); setDiff(null); load() }
  }, [load, root])

  if (loading) return <div className="ws-empty sm"><Loader2 size={18} className="ws-spin" /><p>Reading journal…</p></div>

  if (!entries.length) {
    return (
      <div className="ws-empty">
        <Sparkles size={22} />
        <p>No agent file changes yet</p>
        <span>Every file the agent writes, edits, moves or deletes is snapshotted first and listed here, with a diff and a one-click restore.</span>
      </div>
    )
  }

  return (
    <div className="ws-changes">
      <div className="ws-toolbar">
        <span className="ws-branch"><Sparkles size={12} /> Agent changes</span>
        <span className="ws-muted">{entries.length}</span>
        <button className="icon-btn" title="Refresh" aria-label="Refresh journal" onClick={load}><RefreshCw size={13} /></button>
      </div>

      {notice && <div className={`ws-notice ${notice.tone}`}>{notice.text}</div>}

      <div className="ws-change-list">
        {entries.map(e => (
          <div
            key={e.id}
            className={`ws-change-row ${sel?.id === e.id ? 'selected' : ''}`}
            onClick={() => open(e)}
            role="button"
            tabIndex={0}
            onKeyDown={ev => ev.key === 'Enter' && open(e)}
            title={e.target}
          >
            <span className="ws-badge git-M">{e.existed ? 'M' : 'A'}</span>
            <span className="ws-change-name">{shortPath(e.target, root).split('/').pop()}</span>
            <span className="ws-change-dir">{OP_LABEL[e.op] || e.op} · {relTime(e.ts)}</span>
            {e.skipped === 'too-large' && <AlertTriangle size={12} className="ws-warn" title={e.note} />}
            <button
              className="icon-btn"
              title="Restore this file to how it was before"
              aria-label="Restore"
              disabled={busy || e.skipped === 'too-large'}
              onClick={ev => { ev.stopPropagation(); restore(e) }}
            >
              <Undo2 size={12} />
            </button>
          </div>
        ))}
      </div>

      {sel && (
        <div className="ws-diff-wrap">
          {diff?.loading && <div className="ws-empty sm"><Loader2 size={16} className="ws-spin" /><p>Comparing…</p></div>}
          {diff?.error && <div className="ws-notice error">{diff.error}</div>}
          {diff && !diff.loading && !diff.error && (
            <DiffView
              title={shortPath(sel.target, root)}
              hunks={diff.hunks}
              added={diff.added}
              removed={diff.removed}
              binary={diff.binary}
              truncated={diff.truncated}
              note={diff.note}
              actions={(
                <button className="ws-ghost-btn sm" disabled={busy} onClick={() => restore(sel)}>
                  <Undo2 size={11} /> Restore
                </button>
              )}
            />
          )}
        </div>
      )}
    </div>
  )
}

/* ──────────────────────────────── wrapper ──────────────────────────────── */

export function ChangesPanel({ tab = 'git', onTab, root = null }) {
  return (
    <div className="ws-view">
      <div className="ws-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'git'} className={tab === 'git' ? 'active' : ''} onClick={() => onTab?.('git')}>
          <FileDiff size={12} /> Git
        </button>
        <button role="tab" aria-selected={tab === 'journal'} className={tab === 'journal' ? 'active' : ''} onClick={() => onTab?.('journal')}>
          <Sparkles size={12} /> Agent
        </button>
      </div>
      {tab === 'git' ? <GitView /> : <JournalView root={root} />}
    </div>
  )
}

export default ChangesPanel
