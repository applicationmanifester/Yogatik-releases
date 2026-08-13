import React, { useState, useEffect } from 'react'
import { 
  Clock, Plus, Trash2, Play, Pause, Edit, Logs, 
  Zap, RefreshCw, Calendar, HelpCircle,
} from 'lucide-react'

/**
 * Scheduler Panel - Manage cron jobs with natural language scheduling
 */
export function SchedulerPanel({ isOpen, onClose, onToast }) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [parsePreview, setParsePreview] = useState(null)
  const [form, setForm] = useState({
    name: '',
    schedule: '',
    type: 'workflow',
    description: '',
    payload: {}
  })
  const [payloadEditor, setPayloadEditor] = useState('{}')
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [logModalContent, setLogModalContent] = useState('')

  // Job types with descriptions
  const JOB_TYPES = [
    { value: 'workflow', label: 'Workflow', desc: 'Run a saved workflow', icon: '📋' },
    { value: 'skill', label: 'Skill', desc: 'Run with a specific skill', icon: '🧠' },
    { value: 'agent', label: 'Agent', desc: 'Run with a specific agent', icon: '🤖' },
    { value: 'backup', label: 'Backup', desc: 'Export all data as JSON', icon: '💾' },
    { value: 'briefing', label: 'Briefing', desc: 'Generate a research briefing', icon: '📰' },
    { value: 'custom', label: 'Custom', desc: 'Run arbitrary prompt', icon: '✨' },
  ]

  const TYPE_PAYLOAD_EXAMPLES = {
    workflow: { workflowId: 'wf_xxx', variables: { topic: 'AI news' } },
    skill: { skillId: 'skill_xxx', prompt: 'Research {{topic}}' },
    agent: { agentId: 'agent_researcher', task: 'Analyze {{topic}}' },
    backup: {},
    briefing: { topic: 'AI and tech news', format: 'markdown' },
    custom: { prompt: 'Your prompt here', model: '', provider: '', system_prompt: '' },
  }

  // Load jobs on mount
  useEffect(() => {
    if (isOpen) loadJobs()
  }, [isOpen])

  // Reset form when panel closes
  useEffect(() => {
    if (!isOpen) {
      setShowCreate(false)
      setEditingId(null)
      setParsePreview(null)
      setForm({ name: '', schedule: '', type: 'workflow', description: '', payload: {} })
      setPayloadEditor('{}')
    }
  }, [isOpen])

  const loadJobs = async () => {
    setLoading(true)
    try {
      if (window.__YOGATIK_SCHEDULER__) {
        const result = await window.__YOGATIK_SCHEDULER__.getJobs()
        if (result.success) setJobs(result.jobs)
        else onToast?.(`Failed to load jobs: ${result.error}`)
      }
    } catch (e) {
      onToast?.(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const parseSchedule = async (natural) => {
    if (!natural.trim()) return
    try {
      if (window.__YOGATIK_SCHEDULER__) {
        const result = await window.__YOGATIK_SCHEDULER__.parseSchedule(natural)
        setParsePreview(result)
      }
    } catch (e) {
      setParsePreview({ success: false, error: e.message })
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      let payload = {}
      try {
        payload = JSON.parse(payloadEditor || '{}')
      } catch {
        onToast?.('Invalid JSON in payload')
        setLoading(false)
        return
      }

      if (window.__YOGATIK_SCHEDULER__) {
        const jobData = { ...form, payload }
        const result = editingId
          ? await window.__YOGATIK_SCHEDULER__.updateJob(editingId, jobData)
          : await window.__YOGATIK_SCHEDULER__.createJob(jobData)
        
        if (result.success) {
          onToast?.(editingId ? 'Job updated' : 'Job created')
          setShowCreate(false)
          setEditingId(null)
          resetForm()
          loadJobs()
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
    setForm({ name: '', schedule: '', type: 'workflow', description: '', payload: {} })
    setPayloadEditor('{}')
    setParsePreview(null)
  }

  const startEdit = (job) => {
    setEditingId(job.id)
    setForm({
      name: job.name,
      schedule: job.scheduleNatural || job.cron,
      type: job.type,
      description: job.description || '',
      payload: job.payload
    })
    setPayloadEditor(JSON.stringify(job.payload || {}, null, 2))
    setShowCreate(true)
    parseSchedule(job.scheduleNatural || job.cron)
  }

  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const handleDelete = async (id) => {
    try {
      if (window.__YOGATIK_SCHEDULER__) {
        const result = await window.__YOGATIK_SCHEDULER__.deleteJob(id)
        if (result.success) {
          onToast?.('Job deleted')
          loadJobs()
        } else {
          onToast?.(`Failed: ${result.error}`)
        }
      }
    } catch (e) {
      onToast?.(`Error: ${e.message}`)
    } finally {
      setConfirmDeleteId(null)
    }
  }

  const handleToggle = async (job) => {
    try {
      if (window.__YOGATIK_SCHEDULER__) {
        const result = await window.__YOGATIK_SCHEDULER__.toggleJob(job.id)
        if (result.success) {
          onToast?.(result.job.enabled ? 'Job enabled' : 'Job disabled')
          loadJobs()
        } else {
          onToast?.(`Failed: ${result.error}`)
        }
      }
    } catch (e) {
      onToast?.(`Error: ${e.message}`)
    }
  }

  const handleRunNow = async (id) => {
    try {
      if (window.__YOGATIK_SCHEDULER__) {
        const result = await window.__YOGATIK_SCHEDULER__.runJobNow(id)
        if (result.success) {
          onToast?.('Job executed')
          loadJobs()
        } else {
          onToast?.(`Failed: ${result.error}`)
        }
      }
    } catch (e) {
      onToast?.(`Error: ${e.message}`)
    }
  }

  const handleViewLogs = async (id) => {
    try {
      if (window.__YOGATIK_SCHEDULER__) {
        const result = await window.__YOGATIK_SCHEDULER__.getJobLogs(id)
        if (result.success) {
          setLogModalContent(JSON.stringify(result.logs, null, 2))
          setLogModalOpen(true)
        } else {
          onToast?.(`Failed: ${result.error}`)
        }
      }
    } catch (e) {
      onToast?.(`Error: ${e.message}`)
    }
  }

  const formatNextRun = (isoString) => {
    if (!isoString) return '—'
    const date = new Date(isoString)
    const now = new Date()
    const diff = date - now
    if (diff < 0) return 'Overdue'
    if (diff < 60000) return 'In < 1 min'
    if (diff < 3600000) return `In ${Math.round(diff/60000)} min`
    if (diff < 86400000) return `In ${Math.round(diff/3600000)} hours`
    return date.toLocaleString()
  }

  const getBadgeStyle = (type) => {
    const colors = {
      workflow: '#8b5cf6',
      skill: '#06b6d4',
      agent: '#f59e0b',
      backup: '#84cc16',
      briefing: '#ec4899',
      custom: '#6366f1',
    }
    return { background: colors[type] || '#6366f1' }
  }

  if (!isOpen) return null

  return (
    <div className="side-panel" role="dialog" aria-label="Scheduler / Cron Daemon" aria-modal="true">
      <div className="side-panel-header">
        <h3 className="side-panel-title">
          <Zap className="side-panel-icon" />
          Scheduler / Cron Daemon
        </h3>
        <button onClick={onClose} className="side-panel-close" aria-label="Close">×</button>
      </div>

      <div className="side-panel-content">
        {/* Create/Edit Form */}
        {(showCreate || editingId) && (
          <div className="side-panel-form-card">
            <h4 className="side-panel-form-title">
              {editingId ? 'Edit Job' : 'Create Scheduled Job'}
              <button onClick={() => { setShowCreate(false); setEditingId(null); resetForm(); }} className="side-panel-close">×</button>
            </h4>
            
            <form onSubmit={handleSubmit} className="side-panel-form">
              <div className="side-panel-field">
                <label className="side-panel-label">Job Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({...form, name: e.target.value})}
                  placeholder="Daily AI News Briefing"
                  className="side-panel-input"
                  required
                />
              </div>

              <div className="side-panel-field">
                <label className="side-panel-label">
                  Schedule (natural language or cron) *
                  <HelpCircle className="side-panel-help-icon" />
                </label>
                <input
                  type="text"
                  value={form.schedule}
                  onChange={(e) => {
                    setForm({...form, schedule: e.target.value})
                    parseSchedule(e.target.value)
                  }}
                  placeholder="e.g., every day at 9am, weekly on monday 10:30, */15 * * * *"
                  className="side-panel-input"
                  required
                />
                {parsePreview && (
                  <div className={`side-panel-preview ${parsePreview.success ? 'success' : 'error'}`}>
                    {parsePreview.success
                      ? `✓ Parsed: ${parsePreview.cron} — Next: ${formatNextRun(parsePreview.nextRun)}`
                      : `✗ ${parsePreview.error}`}
                  </div>
                )}
                <div className="side-panel-examples">
                  {['every day at 9am', 'weekly on monday 10:30', 'every 30 minutes', 'monthly on the 1st at 8am', '0 2 * * *'].map(ex => (
                    <button
                      key={ex}
                      type="button"
                      className="side-panel-example-btn"
                      onClick={() => { setForm({...form, schedule: ex}); parseSchedule(ex) }}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              <div className="side-panel-field">
                <label className="side-panel-label">Job Type *</label>
                <select
                  value={form.type}
                  onChange={(e) => {
                    const newType = e.target.value
                    setForm({...form, type: newType})
                    const example = TYPE_PAYLOAD_EXAMPLES[newType]
                    if (example && Object.keys(example).length > 0) {
                      setPayloadEditor(JSON.stringify(example, null, 2))
                    } else {
                      setPayloadEditor('{}')
                    }
                  }}
                  className="side-panel-select"
                >
                  {JOB_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                </select>
              </div>

              <div className="side-panel-field">
                <label className="side-panel-label">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({...form, description: e.target.value})}
                  placeholder="Optional description"
                  className="side-panel-input"
                />
              </div>

              <div className="side-panel-field">
                <label className="side-panel-label">Payload (JSON)</label>
                <textarea
                  value={payloadEditor}
                  onChange={(e) => setPayloadEditor(e.target.value)}
                  placeholder="{}"
                  className="side-panel-textarea"
                />
              </div>

              <div className="side-panel-form-actions">
                <button type="button" className="side-panel-btn-secondary" onClick={() => { setShowCreate(false); setEditingId(null); resetForm(); }}>
                  Cancel
                </button>
                <button type="submit" className="side-panel-btn-primary" disabled={loading}>
                  {loading ? 'Saving…' : (editingId ? 'Update Job' : 'Create Job')}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Job List */}
        <div className="side-panel-job-list">
          <div className="side-panel-section-title">
            <Clock size={18} color="var(--accent)" />
            Scheduled Jobs
            <button className="side-panel-btn-small" onClick={() => { setShowCreate(true); setEditingId(null); resetForm(); }}>
              <Plus size={14} /> New Job
            </button>
          </div>

          {loading ? (
            <div className="side-panel-loading"><RefreshCw className="side-panel-empty-icon" style={{animation: 'spin 1s linear infinite'}} /> Loading jobs…</div>
          ) : jobs.length === 0 ? (
            <div className="side-panel-empty">
              <Calendar className="side-panel-empty-icon" />
              <p>No scheduled jobs yet</p>
              <button className="side-panel-btn-primary" style={{marginTop: 12}} onClick={() => { setShowCreate(true); setEditingId(null); resetForm(); }}>
                <Plus size={14} /> Create First Job
              </button>
            </div>
          ) : (
            jobs.map(job => (
              <div key={job.id} className="side-panel-job-card">
                <div className="side-panel-job-main">
                  <div className="side-panel-job-info">
                    <div className="side-panel-job-header">
                      <span className="side-panel-job-name">{job.name}</span>
                      <span className="side-panel-job-badge" style={getBadgeStyle(job.type)}>
                        {job.type}
                      </span>
                    </div>
                    <div className="side-panel-job-meta">
                      <span>🕐 {formatNextRun(job.nextRun)}</span>
                      <span>{job.enabled ? '✓ Enabled' : '⏸ Disabled'}</span>
                      <span>{job.scheduleNatural || job.cron}</span>
                    </div>
                    {job.description && <p className="side-panel-job-desc">{job.description}</p>}
                  </div>
                  <div className="side-panel-job-actions">
                    <button className="side-panel-icon-btn" onClick={() => handleToggle(job)} title={job.enabled ? 'Disable' : 'Enable'} aria-label={job.enabled ? 'Disable job' : 'Enable job'}>
                      {job.enabled ? <Pause size={16} /> : <Play size={16} />}
                    </button>
                    <button className="side-panel-icon-btn" onClick={() => handleRunNow(job.id)} title="Run now" aria-label="Run job now">
                      <Zap size={16} />
                    </button>
                    <button className="side-panel-icon-btn" onClick={() => handleViewLogs(job.id)} title="View logs" aria-label="View job logs">
                      <Logs size={16} />
                    </button>
                    <button className="side-panel-icon-btn" onClick={() => startEdit(job)} title="Edit" aria-label="Edit job">
                      <Edit size={16} />
                    </button>
                    <button className="side-panel-icon-btn" onClick={() => handleDelete(job.id)} title="Delete" aria-label="Delete job" style={{color: '#ef4444', borderColor: '#ef4444'}}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Log Modal */}
      {logModalOpen && (
        <div className="modal-overlay log-modal" onClick={() => setLogModalOpen(false)} role="dialog" aria-modal="true" aria-labelledby="log-modal-title">
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="side-panel-header" style={{borderBottom: '1px solid var(--border)', padding: '16px 20px'}}>
              <h3 className="side-panel-title" id="log-modal-title">
                <Logs className="side-panel-icon" />
                Job Logs
              </h3>
              <button onClick={() => setLogModalOpen(false)} className="side-panel-close" aria-label="Close">×</button>
            </div>
            <div className="side-panel-content">
              <pre className="log-modal-content">{logModalContent || 'No logs available'}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SchedulerPanel