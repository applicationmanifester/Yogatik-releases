import React from 'react'
import { Bot, Plus, Trash2, Check, Download, Upload, X, Play, Square, Users, Target } from 'lucide-react'
import { Modal } from './Modal'
import {
  getAgents, upsertAgent, deleteAgent, getActiveAgentId, setActiveAgent, exportAgent, parseAgent,
} from '../agents'
import { autonomousAgent } from '../autonomousAgent'
import { CopyButton } from './ToolResultCard'

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/**
 * Agents — named specialists (pick one per chat), plus the autonomous task
 * runner (goal → plan → execute → report). Sub-agent delegation happens
 * automatically via the spawn_agents tool; this panel manages the roster.
 */
export function AgentsPanel({ onClose, onToast, conversationId = null }) {
  const [tab, setTab] = React.useState('agents')
  const [agents, setAgents] = React.useState([])
  const [activeId, setActiveId] = React.useState(null)
  const [editing, setEditing] = React.useState(null)
  const fileRef = React.useRef(null)
  const [importError, setImportError] = React.useState('')

  // Autonomous run state
  const [goal, setGoal] = React.useState('')
  const [running, setRunning] = React.useState(false)
  const [plan, setPlan] = React.useState([])
  const [stepStatus, setStepStatus] = React.useState({})   // index -> 'run' | 'done'
  const [report, setReport] = React.useState('')
  const abortRef = React.useRef(null)

  // Scoped to THIS chat, inheriting the global default. Without the id the
  // panel read and wrote the single global key, so activating an agent here
  // changed the agent answering in every other open conversation.
  const reload = async () => { setAgents(await getAgents()); setActiveId(await getActiveAgentId(conversationId)) }
  React.useEffect(() => { reload() }, [conversationId])

  const activate = async (id) => { await setActiveAgent(id === activeId ? null : id, conversationId); reload() }

  const saveAgent = async () => {
    if (!editing?.name?.trim() || !editing?.system?.trim()) return
    await upsertAgent({
      ...editing,
      tools: (editing.toolsText || '').split(',').map(s => s.trim()).filter(Boolean),
      subAgents: (editing.subText || '').split(',').map(s => s.trim()).filter(Boolean),
    })
    setEditing(null); reload()
  }

  const importFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    try { await upsertAgent(parseAgent(await f.text())); reload(); onToast?.('Agent imported') }
    catch (err) { setImportError(`Import failed: ${err.message}`) }
    e.target.value = ''
  }

  const runGoal = async () => {
    if (!goal.trim() || running) return
    setRunning(true); setPlan([]); setStepStatus({}); setReport('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const { report: out } = await autonomousAgent(goal.trim(), {
        signal: controller.signal,
        onPlan: (steps) => setPlan(steps),
        onStepStart: (i) => setStepStatus(s => ({ ...s, [i]: 'run' })),
        onStepDone: (i) => setStepStatus(s => ({ ...s, [i]: 'done' })),
      })
      setReport(out || '(no result)')
    } catch (e) {
      setReport(`Failed: ${e?.message || e}`)
    } finally {
      setRunning(false); abortRef.current = null
    }
  }
  const stopGoal = () => { abortRef.current?.abort() }

  return (
    <Modal title="Agents" icon={<Bot size={16} />} onClose={onClose}>
      <div className="tab-row" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={tab === 'agents' ? 'active' : ''} onClick={() => setTab('agents')}><Users size={12} /> Agents</button>
        <button className={tab === 'auto' ? 'active' : ''} onClick={() => setTab('auto')}><Target size={12} /> Autonomous</button>
      </div>

      {tab === 'agents' && (
        <div className="personalise-group">
          <p className="personalise-hint">Pick an agent to specialise the assistant for this chat — its role and tools apply to every message. The General agent can also delegate to specialists automatically.</p>
          {agents.map(a => (
            <div className="toggle-row" key={a.id}>
              <label title={a.description}>
                {a.name}{a.id === activeId && <span className="personalise-sub">● active</span>}
                <span className="personalise-sub">{a.description || a.role}</span>
              </label>
              <span style={{ display: 'flex', gap: 4 }}>
                <button className="icon-btn" title={a.id === activeId ? 'Deactivate' : 'Use for this chat'} onClick={() => activate(a.id)}><Check size={13} /></button>
                <button className="icon-btn" title="Export" onClick={() => download(`${a.name}.agent.json`, exportAgent(a))}><Download size={13} /></button>
                <button className="icon-btn" title="Edit" onClick={() => setEditing({ ...a, toolsText: (a.tools || []).join(', '), subText: (a.subAgents || []).join(', ') })}><Bot size={13} /></button>
                <button className="icon-btn" title="Delete" onClick={async () => { await deleteAgent(a.id); reload() }}><Trash2 size={13} /></button>
              </span>
            </div>
          ))}
          {editing ? (
            <div className="skill-editor" style={{ marginTop: 10, display: 'grid', gap: 6 }}>
              <input placeholder="Agent name" value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} />
              <input placeholder="Role (e.g. researcher)" value={editing.role || ''} onChange={e => setEditing({ ...editing, role: e.target.value })} />
              <input placeholder="Short description" value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} />
              <textarea placeholder="System instructions — how this agent behaves" rows={4} value={editing.system || ''} onChange={e => setEditing({ ...editing, system: e.target.value })} />
              <input placeholder="Allowed tools (comma-separated, blank = all)" value={editing.toolsText || ''} onChange={e => setEditing({ ...editing, toolsText: e.target.value })} />
              <input placeholder="Model to pin (optional, blank = current chat model)" value={editing.model || ''} onChange={e => setEditing({ ...editing, model: e.target.value })} />
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={!!editing.canDelegate} onChange={e => setEditing({ ...editing, canDelegate: e.target.checked })} />
                Can delegate to sub-agents
              </label>
              {editing.canDelegate && (
                <input placeholder="Sub-agent roles it may spawn (comma-separated)" value={editing.subText || ''} onChange={e => setEditing({ ...editing, subText: e.target.value })} />
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="small-btn" onClick={saveAgent}><Check size={12} /> Save</button>
                <button className="small-btn" onClick={() => setEditing(null)}><X size={12} /> Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="small-btn" onClick={() => setEditing({ name: '', system: '', canDelegate: false })}><Plus size={12} /> New agent</button>
                <button className="small-btn" onClick={() => fileRef.current?.click()}><Upload size={12} /> Import</button>
                <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importFile} />
              </div>
              {importError && (
                <div style={{ fontSize: 12, color: '#f87171', background: 'rgba(248,113,113,0.1)', padding: '4px 8px', borderRadius: 4, cursor: 'pointer' }}
                  onClick={() => setImportError('')} title="Click to dismiss">{importError}</div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'auto' && (
        <div className="personalise-group">
          <p className="personalise-hint">Give the agent a goal. It plans the steps, executes each one with tools, then writes a final synthesized answer.</p>
          <textarea
            placeholder="e.g. Research the top 3 note-taking apps and recommend one for a student, with reasons."
            rows={3} value={goal} disabled={running}
            onChange={e => setGoal(e.target.value)}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            {running
              ? <button className="small-btn" onClick={stopGoal}><Square size={12} /> Stop</button>
              : <button className="small-btn" onClick={runGoal} disabled={!goal.trim()}><Play size={12} /> Run goal</button>}
          </div>

          {plan.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div className="personalise-sub" style={{ marginBottom: 6 }}>Plan</div>
              {plan.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, padding: '3px 0' }}>
                  <span style={{ opacity: .7, minWidth: 18 }}>
                    {stepStatus[i] === 'done' ? '✅' : stepStatus[i] === 'run' ? '⏳' : '•'}
                  </span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}

          {report && (
            <div style={{ marginTop: 14, position: 'relative' }}>
              <div className="personalise-sub" style={{ marginBottom: 6 }}>Final answer</div>
              <div className="code-output" style={{ whiteSpace: 'pre-wrap', maxHeight: 260, overflowY: 'auto', padding: 12, position: 'relative' }}>
                <CopyButton text={report} title="Copy" style={{
                  position: 'absolute', top: 6, right: 6, background: 'var(--bg-input)',
                  border: '1px solid var(--border)', borderRadius: 3, padding: '2px 6px', cursor: 'pointer',
                }} />
                {report}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
