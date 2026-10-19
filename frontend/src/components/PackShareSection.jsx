/**
 * Pack sharing — the "Export selected… / Import pack" section of SkillsPanel
 * (see packShare.js for the on-disk format). Self-contained: owns its agent
 * list + selection state and only consumes the panel's skill/workflow lists;
 * `onImported` lets the panel reload after a pack lands.
 *
 * Import never commits blind: a file whose items collide with anything already
 * visible opens a review modal showing per-item added / replaced / skipped +
 * why, with an Overwrite toggle; a collision-free pack commits straight away.
 */
import React from 'react'
import { Package, Share2, Upload } from 'lucide-react'
import { Modal } from './Modal'
import { getAgents } from '../agents'
import {
  exportPack, importPack, previewPack, readFilePack, downloadPack, packItemCount,
} from '../packShare'

const BADGE = {
  add: { label: 'new', color: '#10b981' },
  replace: { label: 'replaces existing', color: '#fb923c' },
  skip: { label: 'skipped', color: '#f87171' },
}

function CheckList({ label, items, selected, onToggle }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.04em', opacity: .85, marginBottom: 4 }}>
        {label} <span style={{ opacity: .6 }}>{items.length}</span>
      </div>
      <div style={{ maxHeight: 190, overflowY: 'auto', display: 'grid', gap: 3, padding: 2 }}>
        {items.map(item => (
          <label key={item.id} style={{
            display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, padding: '2px 6px',
            borderRadius: 5, cursor: 'pointer',
            background: selected.has(item.id) ? 'rgba(6,182,212,0.12)' : 'transparent',
            outline: selected.has(item.id) ? '1px solid rgba(6,182,212,0.35)' : '1px solid transparent',
          }}>
            <input type="checkbox" checked={selected.has(item.id)} onChange={() => onToggle(item.id)} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.id}>{item.name || item.id}</span>
          </label>
        ))}
        {!items.length && <div style={{ fontSize: 11, opacity: .5, padding: '2px 6px' }}>Nothing here yet.</div>}
      </div>
    </div>
  )
}

/**
 * Review-and-commit modal shown before an import with collisions, listing every
 * pack item and what will happen to it at the chosen Overwrite setting.
 */
function PackReviewModal({ review, onChangeOverwrite, onCancel, onCommit, busy }) {
  const counts = { add: 0, replace: 0, skip: 0 }
  for (const r of review.rows) counts[r.status] = (counts[r.status] || 0) + 1
  return (
    <Modal title="Import pack — review" icon={<Package size={16} />} onClose={onCancel}>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
        <b>{counts.add}</b> new · <b>{counts.replace}</b> replacing · <b>{counts.skip}</b> skipped.
        Skipped and malformed items are left untouched.
      </p>
      <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 4 }}>
        {review.rows.map((r, i) => (
          <div key={i} className="toggle-row" style={{ gap: 8 }}>
            <label title={r.id ? `id: ${r.id}` : 'no id'}>
              {r.name}
              <span className="personalise-sub">
                {r.collection}{r.id ? ` · ${r.id}` : ''}{r.reason ? ` — ${r.reason}` : ''}
              </span>
            </label>
            <span style={{
              fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
              background: `${BADGE[r.status].color}26`, color: BADGE[r.status].color, textTransform: 'uppercase',
            }}>
              {BADGE[r.status].label}
            </span>
          </div>
        ))}
      </div>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, margin: '10px 0' }}>
        <input type="checkbox" checked={review.overwrite} onChange={e => onChangeOverwrite(e.target.checked)} />
        Overwrite existing items with the pack&apos;s versions
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="small-btn" onClick={onCancel}>Cancel</button>
        <button className="small-btn btn-primary" disabled={busy || (counts.add + counts.replace) === 0} onClick={onCommit}>
          <Upload size={12} /> Import {counts.add + counts.replace} item{counts.add + counts.replace === 1 ? '' : 's'}
        </button>
      </div>
    </Modal>
  )
}

export function PackShareSection({ skills = [], workflows = [], onImported }) {
  const [agents, setAgents] = React.useState([])
  const [sel, setSel] = React.useState({ skills: new Set(), workflows: new Set(), agents: new Set() })
  const [status, setStatus] = React.useState('')
  const [error, setError] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [review, setReview] = React.useState(null)   // { pack, overwrite, rows }
  const fileRef = React.useRef(null)

  // Agents are not one of the panel's two tabs, so the section loads them once
  // and reloads after every import that may have added or replaced some.
  const reloadAgents = React.useCallback(async () => { setAgents(await getAgents()) }, [])
  React.useEffect(() => { reloadAgents() }, [reloadAgents])

  const groups = React.useMemo(() => ([
    { key: 'skills', label: 'Skills', items: skills },
    { key: 'workflows', label: 'Workflows', items: workflows },
    { key: 'agents', label: 'Agents', items: agents },
  ]), [skills, workflows, agents])

  const selectedCount = React.useMemo(() => groups.reduce((n, g) => n + sel[g.key].size, 0), [groups, sel])

  const toggle = (key, id) => {
    setSel(prev => {
      const next = new Set(prev[key])
      if (next.has(id)) next.delete(id); else next.add(id)
      return { ...prev, [key]: next }
    })
  }

  const exportSel = async () => {
    setError(''); setBusy(true)
    try {
      const pack = await exportPack({
        skillIds: [...sel.skills], workflowIds: [...sel.workflows], agentIds: [...sel.agents],
      })
      downloadPack(pack)
      setSel({ skills: new Set(), workflows: new Set(), agents: new Set() })
      setStatus(`Downloaded a pack with ${packItemCount(pack)} item(s) — share the .yogatik-pack.json file.`)
    } catch (e) { setError(`Export failed: ${e?.message || e}`) }
    finally { setBusy(false) }
  }

  const commitImport = async (pack, overwrite) => {
    setBusy(true)
    try {
      const res = await importPack(pack, { overwrite })
      setReview(null)
      await reloadAgents()
      onImported?.()
      setStatus((res.added || res.replaced)
        ? `Imported ${res.added} new, ${res.replaced} replaced, ${res.skipped} skipped.`
        : `Nothing imported — all ${res.skipped} item(s) skipped.`)
    } catch (e) { setError(`Import failed: ${e?.message || e}`); setReview(null) }
    finally { setBusy(false) }
  }

  const importFile = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setError(''); setStatus(''); setBusy(true)
    try {
      const pack = await readFilePack(f)
      const res = await previewPack(pack)
      // Collisions (or anything skipped) get the review modal first; a clean
      // pack needs no confirmation and commits directly.
      if (res.items.some(r => r.status !== 'add')) setReview({ pack, overwrite: false, rows: res.items })
      else await commitImport(pack, false)
    } catch (e) { setError(`Import failed: ${e?.message || e}`) }
    finally { setBusy(false) }
  }

  const changeOverwrite = async (overwrite) => {
    // An await cannot live inside a setState updater (it must stay sync), so
    // resolve against the CURRENT review row first, then set once.
    const current = review
    if (!current) return
    try {
      const preview = await previewPack(current.pack, { overwrite })
      setReview(r => ({ ...r, overwrite, rows: preview.items }))
    } catch (e) { setError(`Import failed: ${e?.message || e}`); setReview(null) }
  }

  return (
    <div style={{ marginTop: 10, padding: 10, background: 'rgba(6, 182, 212, 0.08)', borderRadius: 8, border: '1px solid rgba(6, 182, 212, 0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#06b6d4', fontWeight: 600, fontSize: 13 }}>
        <Package size={14} /> Share as a pack
        <span style={{ marginLeft: 'auto', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 400 }}>
          {selectedCount ? `${selectedCount} selected` : 'bundle skills + workflows + agents'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 8 }}>
        {groups.map(g => (
          <CheckList
            key={g.key}
            label={g.label}
            items={g.items}
            selected={sel[g.key]}
            onToggle={id => toggle(g.key, id)}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="small-btn" disabled={busy || !selectedCount} title="Download the selected items as one .yogatik-pack.json file" onClick={exportSel}>
          <Share2 size={12} /> Export selected…
        </button>
        <button className="small-btn" disabled={busy} title="Import a shared .yogatik-pack.json file" onClick={() => fileRef.current?.click()}>
          <Upload size={12} /> Import pack
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importFile} />
        {busy && <span style={{ alignSelf: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>working…</span>}
      </div>
      {(status || error) && (
        <div
          aria-live="polite"
          title="Click to dismiss"
          style={{
            marginTop: 8, fontSize: 12, padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
            color: error ? '#f87171' : '#10b981',
            background: error ? 'rgba(248,113,113,0.1)' : 'rgba(16,185,129,0.1)',
          }}
          onClick={() => { setError(''); setStatus('') }}
        >
          {error || status}
        </div>
      )}
      {review && (
        <PackReviewModal
          review={review}
          busy={busy}
          onChangeOverwrite={changeOverwrite}
          onCancel={() => setReview(null)}
          onCommit={() => commitImport(review.pack, review.overwrite)}
        />
      )}
    </div>
  )
}
