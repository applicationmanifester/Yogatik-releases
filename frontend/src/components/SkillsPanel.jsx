import React from 'react'
import { Sparkles, Plus, Trash2, Check, Download, Upload, Play, Workflow, X } from 'lucide-react'
import { Modal } from './Modal'
import {
  getSkills, upsertSkill, deleteSkill, getActiveSkillId, setActiveSkill, exportSkill, parseSkill,
} from '../skills'
import { getWorkflows, upsertWorkflow, deleteWorkflow, workflowVars } from '../workflows'

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Manage Skills (shape the assistant) and Workflows (multi-step runs). */
export function SkillsPanel({ onClose, onRunWorkflow, onUseStarter }) {
  const [tab, setTab] = React.useState('skills')
  const [skills, setSkills] = React.useState([])
  const [activeId, setActiveId] = React.useState(null)
  const [flows, setFlows] = React.useState([])
  const [editing, setEditing] = React.useState(null)   // skill draft
  const [flowEdit, setFlowEdit] = React.useState(null) // workflow draft
  const fileRef = React.useRef(null)

  const reload = async () => {
    setSkills(await getSkills()); setActiveId(await getActiveSkillId()); setFlows(await getWorkflows())
  }
  React.useEffect(() => { reload() }, [])

  const activate = async (id) => { await setActiveSkill(id === activeId ? null : id); reload() }

  const saveSkill = async () => {
    if (!editing?.name?.trim() || !editing?.system?.trim()) return
    await upsertSkill({
      ...editing,
      tools: (editing.toolsText || '').split(',').map(s => s.trim()).filter(Boolean),
      starters: (editing.startersText || '').split('\n').map(s => s.trim()).filter(Boolean),
    })
    setEditing(null); reload()
  }

  const [importError, setImportError] = React.useState('')

  const importFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    try { await upsertSkill(parseSkill(await f.text())); reload(); setImportError('') }
    catch (err) { setImportError(`Import failed: ${err.message}`) }
    e.target.value = ''
  }

  const saveFlow = async () => {
    if (!flowEdit?.name?.trim()) return
    await upsertWorkflow({
      ...flowEdit,
      steps: (flowEdit.stepsText || '').split('\n---\n').map(p => ({ prompt: p.trim() })).filter(s => s.prompt),
    })
    setFlowEdit(null); reload()
  }

  const [workflowVarsModal, setWorkflowVarsModal] = React.useState(null) // { wf, vars, values }

  const runFlow = (wf) => {
    const vars = workflowVars(wf)
    if (!vars.length) { onClose?.(); onRunWorkflow?.(wf, {}); return }
    setWorkflowVarsModal({ wf, vars, values: Object.fromEntries(vars.map(v => [v, ''])) })
  }

  return (
    <Modal title="Skills & Workflows" icon={<Sparkles size={16} />} onClose={onClose}>
      <div className="tab-row" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={tab === 'skills' ? 'active' : ''} onClick={() => setTab('skills')}><Sparkles size={12} /> Skills</button>
        <button className={tab === 'flows' ? 'active' : ''} onClick={() => setTab('flows')}><Workflow size={12} /> Workflows</button>
      </div>

      {tab === 'skills' && (
        <div className="personalise-group">
          <p className="personalise-hint">A skill shapes the assistant — its instructions, allowed tools and starter prompts. Activate one to apply it to every message.</p>
          {skills.map(s => (
            <div className="toggle-row" key={s.id}>
              <label title={s.description}>
                {s.name}{s.id === activeId && <span className="personalise-sub">● active</span>}
                <span className="personalise-sub">{s.description || `${s.tools?.length ? s.tools.length + ' tools · ' : ''}${s.starters?.length || 0} starters`}</span>
              </label>
              <span style={{ display: 'flex', gap: 4 }}>
                <button className="icon-btn" title={s.id === activeId ? 'Deactivate' : 'Activate'} onClick={() => activate(s.id)}><Check size={13} /></button>
                <button className="icon-btn" title="Export" onClick={() => download(`${s.name}.skill.json`, exportSkill(s))}><Download size={13} /></button>
                <button className="icon-btn" title="Edit" onClick={() => setEditing({ ...s, toolsText: (s.tools || []).join(', '), startersText: (s.starters || []).join('\n') })}><Sparkles size={13} /></button>
                <button className="icon-btn" title="Delete" onClick={async () => { await deleteSkill(s.id); reload() }}><Trash2 size={13} /></button>
              </span>
            </div>
          ))}
          {editing ? (
            <div className="skill-editor" style={{ marginTop: 10, display: 'grid', gap: 6 }}>
              <input placeholder="Skill name" value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} />
              <input placeholder="Short description" value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} />
              <textarea placeholder="System instructions — how the assistant should behave" rows={4} value={editing.system || ''} onChange={e => setEditing({ ...editing, system: e.target.value })} />
              <input placeholder="Allowed tools (comma-separated, blank = all)" value={editing.toolsText || ''} onChange={e => setEditing({ ...editing, toolsText: e.target.value })} />
              <textarea placeholder="Starter prompts, one per line (may use {{variables}})" rows={3} value={editing.startersText || ''} onChange={e => setEditing({ ...editing, startersText: e.target.value })} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="small-btn" onClick={saveSkill}><Check size={12} /> Save</button>
                <button className="small-btn" onClick={() => setEditing(null)}><X size={12} /> Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button className="small-btn" onClick={() => setEditing({ name: '', system: '' })}><Plus size={12} /> New skill</button>
              <button className="small-btn" onClick={() => fileRef.current?.click()}><Upload size={12} /> Import</button>
              <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importFile} />
            </div>
          )}
        </div>
      )}

      {tab === 'flows' && (
        <div className="personalise-group">
          <p className="personalise-hint">A workflow runs several prompts in order. Use {'{{last}}'} to reference the previous step and {'{{variables}}'} for inputs asked at run time. Separate steps with a line containing only ---</p>
          {flows.map(w => (
            <div className="toggle-row" key={w.id}>
              <label>{w.name}<span className="personalise-sub">{w.steps?.length || 0} steps{workflowVars(w).length ? ` · vars: ${workflowVars(w).join(', ')}` : ''}</span></label>
              <span style={{ display: 'flex', gap: 4 }}>
                <button className="icon-btn" title="Run" onClick={() => runFlow(w)}><Play size={13} /></button>
                <button className="icon-btn" title="Edit" onClick={() => setFlowEdit({ ...w, stepsText: (w.steps || []).map(s => s.prompt).join('\n---\n') })}><Workflow size={13} /></button>
                <button className="icon-btn" title="Delete" onClick={async () => { await deleteWorkflow(w.id); reload() }}><Trash2 size={13} /></button>
              </span>
            </div>
          ))}
          {flowEdit ? (
            <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
              <input placeholder="Workflow name" value={flowEdit.name || ''} onChange={e => setFlowEdit({ ...flowEdit, name: e.target.value })} />
              <textarea placeholder={'Step 1 prompt\n---\nStep 2 prompt (use {{last}})'} rows={6} value={flowEdit.stepsText || ''} onChange={e => setFlowEdit({ ...flowEdit, stepsText: e.target.value })} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="small-btn" onClick={saveFlow}><Check size={12} /> Save</button>
                <button className="small-btn" onClick={() => setFlowEdit(null)}><X size={12} /> Cancel</button>
              </div>
            </div>
          ) : (
            <button className="small-btn" style={{ marginTop: 10 }} onClick={() => setFlowEdit({ name: '', stepsText: '' })}><Plus size={12} /> New workflow</button>
          )}
        </div>
      )}
      {workflowVarsModal && (
        <Modal title={`Run: ${workflowVarsModal.wf.name}`} onClose={() => setWorkflowVarsModal(null)} footer={null}>
          <form onSubmit={e => {
            e.preventDefault()
            const values = workflowVarsModal.values
            setWorkflowVarsModal(null)
            onClose?.()
            onRunWorkflow?.(workflowVarsModal.wf, values)
          }} style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Fill in the workflow variables:</p>
            {workflowVarsModal.vars.map(v => (
              <label key={v} style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{v}</span>
                <input
                  autoFocus
                  value={workflowVarsModal.values[v] || ''}
                  onChange={e => setWorkflowVarsModal(m => ({ ...m, values: { ...m.values, [v]: e.target.value } }))}
                  style={{ padding: '6px 8px', borderRadius: 5, background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 13 }}
                />
              </label>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="small-btn" onClick={() => setWorkflowVarsModal(null)}>Cancel</button>
              <button type="submit" className="small-btn btn-primary">Run Workflow</button>
            </div>
          </form>
        </Modal>
      )}
    </Modal>
  )
}
