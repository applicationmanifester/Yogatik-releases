import React, { useState, useEffect } from 'react'
import { 
  Terminal, Plus, Trash2, 
  RefreshCw, CheckCircle, AlertCircle, Zap,
  Code, Database, Cpu, Square, X
} from 'lucide-react'

/**
 * Sub-Agent Runner Panel - Manage isolated sub-agents with Python RPC
 */
export function SubAgentRunnerPanel({ isOpen, onClose, onToast }) {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [pythonCode, setPythonCode] = useState('# Python code here\nprint("Hello from sub-agent!")\nimport numpy as np\nprint(np.array([1,2,3]) * 2)')
  const [pythonFiles, setPythonFiles] = useState({})
  const [pythonOutput, setPythonOutput] = useState('')
  const [pythonPackages, setPythonPackages] = useState('numpy, pandas, requests')
  const [replTab, setReplTab] = useState('code')
  const [form, setForm] = useState({
    agentId: '',
    name: '',
    role: 'coder',
    systemPrompt: '',
    tools: [],
    model: '',
    provider: ''
  })

  useEffect(() => {
    if (isOpen) loadAgents()
  }, [isOpen])

  // Reset state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setShowCreate(false)
      setSelectedAgent(null)
      setPythonOutput('')
      setForm({ agentId: `sub_${Date.now().toString(36)}`, name: '', role: 'coder', systemPrompt: '', tools: [], model: '', provider: '' })
    }
  }, [isOpen])

  const loadAgents = async () => {
    setLoading(true)
    try {
      if (window.__YOGATIK_SUBAGENT__) {
        const result = await window.__YOGATIK_SUBAGENT__.list()
        if (result.success) setAgents(result.agents || [])
        else onToast?.(`Failed to load agents: ${result.error}`)
      }
    } catch (e) {
      onToast?.(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (window.__YOGATIK_SUBAGENT__) {
        const config = {
          name: form.name,
          role: form.role,
          systemPrompt: form.systemPrompt,
          tools: form.tools,
          model: form.model || undefined,
          provider: form.provider || undefined
        }
        const result = await window.__YOGATIK_SUBAGENT__.spawn(form.agentId, config)
        if (result.success) {
          onToast?.(`Sub-agent created: ${form.name}`)
          setShowCreate(false)
          resetForm()
          loadAgents()
        } else {
          onToast?.(`Failed: ${result.error}`)
        }
      }
    } catch (e) {
      onToast?.(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setForm({ agentId: `sub_${Date.now().toString(36)}`, name: '', role: 'coder', systemPrompt: '', tools: [], model: '', provider: '' })
  }

  const [confirmKillId, setConfirmKillId] = useState(null)
  const [confirmResetNS, setConfirmResetNS] = useState(false)

  const handleKill = async (agentId) => {
    try {
      if (window.__YOGATIK_SUBAGENT__) {
        const result = await window.__YOGATIK_SUBAGENT__.kill(agentId)
        if (result.success) {
          onToast?.('Sub-agent killed')
          loadAgents()
          if (selectedAgent?.id === agentId) setSelectedAgent(null)
        } else {
          onToast?.(`Failed: ${result.error}`)
        }
      }
    } catch (e) {
      onToast?.(`Error: ${e.message}`)
    } finally {
      setConfirmKillId(null)
    }
  }

  const selectAgent = (agent) => {
    setSelectedAgent(agent)
    setPythonOutput('')
  }

  const executePython = async () => {
    if (!selectedAgent) return
    setPythonOutput('Executing...')
    try {
      if (window.__YOGATIK_SUBAGENT__) {
        const files = {}
        for (const [name, content] of Object.entries(pythonFiles)) {
          if (content.trim()) files[name] = content
        }
        const result = await window.__YOGATIK_SUBAGENT__.python.execute(selectedAgent.id, pythonCode, files)
        if (result.success) {
          const { stdout, stderr, error, namespace_keys } = result.result
          let output = ''
          if (stdout) output += `STDOUT:\n${stdout}\n`
          if (stderr) output += `STDERR:\n${stderr}\n`
          if (error) output += `ERROR:\n${error}\n`
          if (namespace_keys) output += `\nNamespace: ${namespace_keys.join(', ')}`
          setPythonOutput(output || '(no output)')
        } else {
          setPythonOutput(`ERROR: ${result.error}`)
        }
      }
    } catch (e) {
      setPythonOutput(`ERROR: ${e.message}`)
    }
  }

  const installPackages = async () => {
    if (!selectedAgent) return
    const pkgs = pythonPackages.split(',').map(p => p.trim()).filter(Boolean)
    if (!pkgs.length) return
    setPythonOutput(`Installing: ${pkgs.join(', ')}...`)
    try {
      if (window.__YOGATIK_SUBAGENT__) {
        const result = await window.__YOGATIK_SUBAGENT__.python.install(selectedAgent.id, pkgs)
        if (result.success) {
          setPythonOutput(`Installed: ${result.result.installed.join(', ')}`)
        } else {
          setPythonOutput(`ERROR: ${result.error}`)
        }
      }
    } catch (e) {
      setPythonOutput(`ERROR: ${e.message}`)
    }
  }

  const resetNamespace = async () => {
    if (!selectedAgent || !confirmResetNS) return
    setConfirmResetNS(false)
    try {
      if (window.__YOGATIK_SUBAGENT__) {
        const result = await window.__YOGATIK_SUBAGENT__.python.reset(selectedAgent.id)
        if (result.success) {
          setPythonOutput('Namespace reset')
        } else {
          setPythonOutput(`ERROR: ${result.error}`)
        }
      }
    } catch (e) {
      onToast?.(`Error: ${e.message}`)
    }
  }

  const showNamespace = async () => {
    if (!selectedAgent) return
    try {
      if (window.__YOGATIK_SUBAGENT__) {
        const result = await window.__YOGATIK_SUBAGENT__.python.namespace(selectedAgent.id)
        if (result.success) {
          setPythonOutput(`Namespace:\n${JSON.stringify(result.result.keys, null, 2)}`)
        } else {
          setPythonOutput(`ERROR: ${result.error}`)
        }
      }
    } catch (e) {
      onToast?.(`Error: ${e.message}`)
    }
  }

  const formatStatus = (status) => {
    const colors = { ready: '#4ade80', working: '#f59e0b', error: '#f87171' }
    const icons = { ready: CheckCircle, working: Cpu, error: AlertCircle }
    const Icon = icons[status] || Square
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: colors[status] || '#9ca3af' }}>
        <Icon style={{ width: 12, height: 12 }} /> {status}
      </span>
    )
  }

  if (!isOpen) return null

  return (
    <div className="side-panel" role="dialog" aria-label="Sub-Agent Runner" aria-modal="true">
      <div className="side-panel-header">
        <h3 className="side-panel-title">
          <Terminal className="side-panel-icon" style={{color: '#06b6d4'}} />
          Sub-Agent Runner
        </h3>
        <button onClick={onClose} className="side-panel-close" aria-label="Close">×</button>
      </div>

      <div className="side-panel-content">
        {/* The runner spawns real OS processes, so the browser build has nothing
            behind these controls. Better to say it than to look functional. */}
        {!window.__YOGATIK_SUBAGENT__ && (
          <p className="tool-detail" style={{ marginBottom: 12 }}>
            Isolated sub-agents run as separate processes in the Yogatik desktop app.
            In the browser, use the Agents panel — it delegates in-page instead.
          </p>
        )}
        {/* Autonomous Workflow Presets (LangGraph / MetaGPT / CrewAI Style) */}
        <div style={{ marginBottom: 16, padding: 12, background: 'rgba(6, 182, 212, 0.08)', borderRadius: 8, border: '1px solid rgba(6, 182, 212, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: '#06b6d4', fontWeight: 600, fontSize: 13 }}>
            <Zap style={{ width: 14, height: 14 }} /> Autonomous Swarm & DAG Workflows
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
            <button
              type="button"
              className="side-panel-btn-small"
              style={{ textAlign: 'left', padding: '6px 8px', fontSize: 12, justifyContent: 'flex-start' }}
              onClick={() => {
                setForm({
                  agentId: `sub_pm_${Date.now().toString(36)}`,
                  name: 'Product Manager Agent',
                  role: 'planner',
                  systemPrompt: 'You are an autonomous Product Manager agent. Define specs, user stories, and acceptance criteria.',
                  tools: ['fs_find_files', 'fs_read_file', 'doc_export'],
                  model: '',
                  provider: ''
                })
                setShowCreate(true)
                onToast?.('Loaded MetaGPT-style PM Agent template')
              }}
            >
              🚀 SaaS MVP Loop
            </button>
            <button
              type="button"
              className="side-panel-btn-small"
              style={{ textAlign: 'left', padding: '6px 8px', fontSize: 12, justifyContent: 'flex-start' }}
              onClick={() => {
                setForm({
                  agentId: `sub_sec_${Date.now().toString(36)}`,
                  name: 'Security Auditor Agent',
                  role: 'auditor',
                  systemPrompt: 'You are a DevSecOps auditor. Perform AST regex scanning, dependency CVE checks, and differential diff reviews.',
                  tools: ['git_diff', 'fs_read_file', 'deepsec'],
                  model: '',
                  provider: ''
                })
                setShowCreate(true)
                onToast?.('Loaded Zero-Trust Security Auditor template')
              }}
            >
              🛡️ Security Audit
            </button>
            <button
              type="button"
              className="side-panel-btn-small"
              style={{ textAlign: 'left', padding: '6px 8px', fontSize: 12, justifyContent: 'flex-start' }}
              onClick={() => {
                setForm({
                  agentId: `sub_tdd_${Date.now().toString(36)}`,
                  name: 'TDD Engineer Agent',
                  role: 'coder',
                  systemPrompt: 'You are an autonomous TDD engineer. Write failing unit tests first, verify RED state, then write minimal code for GREEN.',
                  tools: ['fs_read_file', 'fs_write_file', 'terminal_run'],
                  model: '',
                  provider: ''
                })
                setShowCreate(true)
                onToast?.('Loaded TDD Engineer template')
              }}
            >
              🧪 TDD Refactor Loop
            </button>
          </div>
        </div>

        {/* Agents List */}
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12}}>
          <h4 className="side-panel-section-title">
            Active Sub-Agents ({agents.length})
            <button onClick={() => setShowCreate(true)} className="side-panel-btn-small">
              <Plus style={{width: 14, height: 14}} /> New Agent
            </button>
          </h4>
          <button onClick={loadAgents} disabled={loading} className="side-panel-btn-small">
            <RefreshCw style={{width: 14, height: 14, animation: loading ? 'spin 1s linear infinite' : 'none'}} />
          </button>
        </div>

        {showCreate && (
          <div className="side-panel-form-card">
            <h4 className="side-panel-form-title">
              Create Sub-Agent
              <button onClick={() => setShowCreate(false)} className="side-panel-close">×</button>
            </h4>
            <form onSubmit={handleCreate} className="side-panel-form">
              <div className="side-panel-field">
                <label className="side-panel-label">Agent ID *</label>
                <input type="text" value={form.agentId} onChange={(e) => setForm({...form, agentId: e.target.value})} placeholder="sub_data_analysis" className="side-panel-input" required />
              </div>
              <div className="side-panel-field">
                <label className="side-panel-label">Name *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="Data Analyst" className="side-panel-input" required />
              </div>
              <div className="side-panel-field">
                <label className="side-panel-label">Role</label>
                <select value={form.role} onChange={(e) => setForm({...form, role: e.target.value})} className="side-panel-select">
                  <option value="coder">Coder</option>
                  <option value="researcher">Researcher</option>
                  <option value="analyst">Analyst</option>
                  <option value="writer">Writer</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div className="side-panel-field">
                <label className="side-panel-label">System Prompt</label>
                <textarea value={form.systemPrompt} onChange={(e) => setForm({...form, systemPrompt: e.target.value})} placeholder="You are a specialist agent..." className="side-panel-textarea" style={{minHeight: 60}} />
              </div>
              <div className="side-panel-field">
                <label className="side-panel-label">Tools (comma-separated)</label>
                <input type="text" value={form.tools.join(', ')} onChange={(e) => setForm({...form, tools: e.target.value.split(',').map(t => t.trim()).filter(Boolean)})} placeholder="code_execute, web_search, chart" className="side-panel-input" />
              </div>
              <div className="side-panel-field">
                <label className="side-panel-label">Model (optional)</label>
                <input type="text" value={form.model} onChange={(e) => setForm({...form, model: e.target.value})} placeholder="llama-3.1-8b" className="side-panel-input" />
              </div>
              <div className="side-panel-field">
                <label className="side-panel-label">Provider (optional)</label>
                <input type="text" value={form.provider} onChange={(e) => setForm({...form, provider: e.target.value})} placeholder="ollama" className="side-panel-input" />
              </div>
              <div className="side-panel-form-actions">
                <button type="button" className="side-panel-btn-secondary" onClick={() => { setShowCreate(false); resetForm(); }}>
                  Cancel
                </button>
                <button type="submit" disabled={loading} className="side-panel-btn-primary">
                  {loading ? 'Creating...' : 'Create Agent'}
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="side-panel-loading"><RefreshCw className="side-panel-empty-icon" style={{animation: 'spin 1s linear infinite'}} /> Loading agents...</div>
        ) : agents.length === 0 ? (
          <div className="side-panel-empty">
            <Terminal className="side-panel-empty-icon" />
            <p>No sub-agents running</p>
            <button onClick={() => setShowCreate(true)} className="side-panel-btn-primary" style={{marginTop: 12}}>
              <Plus style={{width: 16, height: 16}} /> Create Your First Sub-Agent
            </button>
          </div>
        ) : (
          <div style={{display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16}}>
            {agents.map(agent => (
              <div key={agent.id} className="side-panel-job-card" style={{borderColor: selectedAgent?.id === agent.id ? '#a855f7' : 'var(--border)'}} onClick={() => selectAgent(agent)}>
                <div className="side-panel-job-main">
                  <div className="side-panel-job-info">
                    <div className="side-panel-job-header">
                      <span className="side-panel-job-name">{agent.config?.name || agent.id}</span>
                      {formatStatus(agent.status)}
                    </div>
                    <div className="side-panel-job-meta">
                      <span>Role: {agent.config?.role || '—'}</span>
                      <span>Messages: {agent.messageCount}</span>
                      <span>ID: {agent.id.slice(-8)}</span>
                    </div>
                    {agent.lastError && <div style={{fontSize: 12, color: '#f87171', marginTop: 8}}>Error: {agent.lastError}</div>}
                  </div>
                  <div className="side-panel-job-actions">
                    <button onClick={(e) => { e.stopPropagation(); handleKill(agent.id) }} className="side-panel-icon-btn" title="Kill" aria-label="Kill agent" style={{color: '#f87171', borderColor: '#f87171'}}>
                      <X style={{width: 16, height: 16}} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Python REPL for selected agent */}
        {selectedAgent && (
          <div style={{borderTop: '1px solid var(--border)', paddingTop: 16}}>
            <h4 className="side-panel-section-title">
              <Code style={{width: 18, height: 18}} /> Python REPL — {selectedAgent.config?.name || selectedAgent.id}
              <span style={{fontSize: 11, color: 'var(--text-muted)', fontWeight: 'normal'}}>
                ({agents.find(a => a.id === selectedAgent.id)?.status || 'unknown'})
              </span>
            </h4>
            
            <div style={{display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 4}}>
              <button onClick={() => setReplTab('code')} className="side-panel-btn-small" style={{borderBottom: replTab === 'code' ? '2px solid #a855f7' : 'none', padding: '8px 16px'}}>Code</button>
              <button onClick={() => setReplTab('files')} className="side-panel-btn-small" style={{borderBottom: replTab === 'files' ? '2px solid #a855f7' : 'none', padding: '8px 16px'}}>Files</button>
              <button onClick={() => setReplTab('packages')} className="side-panel-btn-small" style={{borderBottom: replTab === 'packages' ? '2px solid #a855f7' : 'none', padding: '8px 16px'}}>Packages</button>
            </div>

            {replTab === 'code' && (
              <div style={{marginBottom: 16}}>
                <textarea
                  value={pythonCode}
                  onChange={(e) => setPythonCode(e.target.value)}
                  placeholder="# Write Python code here\nprint('Hello!')"
                  className="side-panel-textarea"
                  style={{minHeight: 150, background: '#0d1117', fontFamily: 'monospace', fontSize: 13}}
                  spellCheck={false}
                />
                <div style={{display: 'flex', gap: 8, marginTop: 10}}>
                  <button onClick={executePython} className="side-panel-btn-primary"><Zap style={{width: 16, height: 16}} /> Run (Ctrl+Enter)</button>
                  <button onClick={showNamespace} className="side-panel-btn-secondary"><Database style={{width: 16, height: 16}} /> Show Namespace</button>
                  <button onClick={resetNamespace} className="side-panel-btn-secondary" style={{color: '#f87171', borderColor: '#f87171'}}><AlertCircle style={{width: 16, height: 16}} /> Reset Namespace</button>
                </div>
              </div>
            )}

            {replTab === 'files' && (
              <div style={{marginBottom: 16}}>
                <div style={{fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, padding: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 6}}>Files written here will be available to Python code execution</div>
                <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                  {Object.entries(pythonFiles).map(([name, content]) => (
                    <div key={name} style={{display: 'flex', gap: 8, alignItems: 'flex-start'}}>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => {
                          const newName = e.target.value
                          if (newName !== name) {
                            setPythonFiles(prev => {
                              const next = { ...prev }
                              delete next[name]
                              next[newName] = content
                              return next
                            })
                          }
                        }}
                        placeholder="filename.py"
                        className="side-panel-input"
                        style={{width: 150, fontFamily: 'monospace', fontSize: 12}}
                      />
                      <textarea
                        value={content}
                        onChange={(e) => setPythonFiles(prev => ({...prev, [name]: e.target.value}))}
                        placeholder="# File content"
                        className="side-panel-textarea"
                        style={{flex: 1, minHeight: 60, fontFamily: 'monospace', fontSize: 12}}
                      />
                      <button onClick={() => setPythonFiles(prev => { const next = {...prev}; delete next[name]; return next })} className="side-panel-icon-btn" title="Delete">
                        <Trash2 style={{width: 14, height: 14}} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setPythonFiles(prev => ({...prev, [`file_${Date.now()}.py`]: ''}))} className="side-panel-btn-small">
                    <Plus style={{width: 14, height: 14}} /> Add File
                  </button>
                </div>
              </div>
            )}

            {replTab === 'packages' && (
              <div style={{marginBottom: 16}}>
                <div className="side-panel-field">
                  <label className="side-panel-label">Packages to Install (comma-separated)</label>
                  <input
                    type="text"
                    value={pythonPackages}
                    onChange={(e) => setPythonPackages(e.target.value)}
                    placeholder="numpy, pandas, requests, matplotlib"
                    className="side-panel-input"
                  />
                  <div className="hint" style={{fontSize: 11, color: 'var(--text-muted)', marginTop: 4}}>Installed via micropip in the sub-agent's persistent Python environment</div>
                </div>
                <div style={{display: 'flex', gap: 8, marginTop: 10}}>
                  <button onClick={installPackages} className="side-panel-btn-primary"><Database style={{width: 16, height: 16}} /> Install</button>
                </div>
              </div>
            )}

            <div style={{borderTop: '1px solid var(--border)', paddingTop: 12}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8}}>
                <span>Output</span>
                <button onClick={() => setPythonOutput('')} className="side-panel-btn-small">Clear</button>
              </div>
              <pre style={{padding: 12, background: '#0d1117', border: '1px solid var(--border)', borderRadius: 8, color: '#e6edf3', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word'}}>
                {pythonOutput || '(no output yet)'}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SubAgentRunnerPanel