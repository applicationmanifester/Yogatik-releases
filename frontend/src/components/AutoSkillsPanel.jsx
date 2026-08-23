import React, { useState, useEffect } from 'react'
import { 
  Brain, Trash2, ArrowUp, Logs, 
  Lightbulb, Sparkles, HelpCircle
} from 'lucide-react'

/**
 * Auto-Skills Panel - View and manage auto-generated skills
 */
export function AutoSkillsPanel({ isOpen, onClose, onToast }) {
  const [pendingSkills, setPendingSkills] = useState([])
  const [learningLog, setLearningLog] = useState([])
  const [loading, setLoading] = useState(false)
  const [autoLearningEnabled, setAutoLearningEnabled] = useState(true)
  const [showLog, setShowLog] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadData()
      checkAutoLearning()
    }
  }, [isOpen])

  // Reset state when panel closes
  useEffect(() => {
    if (!isOpen) {
      setShowLog(false)
      setLoading(false)
    }
  }, [isOpen])

  // These handlers used to dispatch CustomEvents ('yogatik:auto-skills:*') with
  // an onResult callback in the detail — and nothing anywhere listened for them,
  // so every button was inert even once the panel was mounted. loadData was also
  // gated on __YOGATIK_SCHEDULER__, an unrelated bridge. autoSkills.js exports a
  // plain async API; call it.
  const loadData = async () => {
    setLoading(true)
    try {
      const { getPendingAutoSkills } = await import('../autoSkills')
      setPendingSkills(await getPendingAutoSkills())
    } catch (e) {
      onToast?.(`Could not load auto-skills: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const checkAutoLearning = async () => {
    try {
      const { getAutoSkillLearning } = await import('../autoSkills')
      setAutoLearningEnabled(await getAutoSkillLearning())
    } catch { /* leave the default */ }
  }

  const triggerLearning = async () => {
    setLoading(true)
    try {
      const { processConversationsForLearning } = await import('../autoSkills')
      const found = await processConversationsForLearning()
      onToast?.(found.length
        ? `Learning complete: ${found.length} new skill candidate${found.length === 1 ? '' : 's'}`
        : 'Nothing new to learn from yet — have a few more conversations first.')
      await loadData()
    } catch (e) {
      onToast?.(`Learning failed: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const loadLog = async () => {
    try {
      const { getLearningLog } = await import('../autoSkills')
      setLearningLog(await getLearningLog())
      setShowLog(true)
    } catch (e) {
      onToast?.(`Could not load the log: ${e.message}`)
    }
  }

  const promoteSkill = async (skillId) => {
    try {
      const { promoteAutoSkill } = await import('../autoSkills')
      const saved = await promoteAutoSkill(skillId)
      onToast?.(`Skill promoted: ${saved?.name || 'skill'}`)
      setPendingSkills(prev => prev.filter(s => s.id !== skillId))
    } catch (e) {
      onToast?.(`Could not promote: ${e.message}`)
    }
  }

  const [confirmDismissId, setConfirmDismissId] = useState(null)

  const dismissSkill = async (skillId) => {
    try {
      const { dismissAutoSkill } = await import('../autoSkills')
      await dismissAutoSkill(skillId)
      onToast?.('Skill dismissed')
      setPendingSkills(prev => prev.filter(s => s.id !== skillId))
    } catch (e) {
      onToast?.(`Could not dismiss: ${e.message}`)
    } finally {
      setConfirmDismissId(null)
    }
  }

  const toggleAutoLearning = async () => {
    const next = !autoLearningEnabled
    try {
      const { setAutoSkillLearning } = await import('../autoSkills')
      await setAutoSkillLearning(next)
      setAutoLearningEnabled(next)
      onToast?.(next ? 'Auto-skill learning enabled' : 'Auto-skill learning disabled')
    } catch (e) {
      onToast?.(`Could not change the setting: ${e.message}`)
    }
  }

  const formatConfidence = (confidence) => {
    const pct = Math.round(confidence * 100)
    const color = pct >= 80 ? '#4ade80' : pct >= 60 ? '#f59e0b' : '#f87171'
    return <span style={{ color, fontWeight: 600 }}>{pct}%</span>
  }

  if (!isOpen) return null

  return (
    <div className="side-panel" role="dialog" aria-label="Auto-Skill Generator" aria-modal="true">
      <div className="side-panel-header">
        <h3 className="side-panel-title">
          <Sparkles className="side-panel-icon" style={{color: '#a855f7'}} />
          Auto-Skill Generator
        </h3>
        <button onClick={onClose} className="side-panel-close" aria-label="Close">×</button>
      </div>

      <div className="side-panel-content">
        {/* Header Controls */}
        <div className="side-panel-field" style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 12}}>
          <label className="side-panel-label" style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer'}}>
            <input
              type="checkbox"
              checked={autoLearningEnabled}
              onChange={toggleAutoLearning}
              disabled={loading}
              style={{width: 16, height: 16, accentColor: '#a855f7'}}
            />
            <span>Auto-generate skills from successful conversations</span>
          </label>
          <div style={{display: 'flex', gap: 8}}>
            <button onClick={triggerLearning} disabled={loading} className="side-panel-btn-primary">
              <Lightbulb style={{width: 16, height: 16}} /> Learn Now
            </button>
            <button onClick={loadLog} className="side-panel-btn-secondary">
              <Logs style={{width: 16, height: 16}} /> Learning Log
            </button>
          </div>
        </div>

        {showLog ? (
          <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <h4 className="side-panel-section-title">Learning Log</h4>
              <button onClick={() => setShowLog(false)} className="side-panel-btn-secondary">Close</button>
            </div>
            {learningLog.length === 0 ? (
              <div className="side-panel-empty" style={{textAlign: 'center', padding: 40, color: 'var(--text-muted)'}}>
                <p>No learning events yet</p>
              </div>
            ) : (
              <div style={{display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflow: 'auto'}}>
                {learningLog.map(entry => (
                  <div key={entry.skillId} style={{padding: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 8}}>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                      <div style={{fontWeight: 600, fontSize: 14}}>{entry.name}</div>
                      <div style={{display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--text-muted)'}}>
                        <span>Confidence: {formatConfidence(entry.confidence)}</span>
                        <span>Tools: {entry.tools?.join(', ') || '—'}</span>
                        <span>{new Date(entry.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
            <h4 className="side-panel-section-title">
              Pending Auto-Skills ({pendingSkills.length})
              <HelpCircle className="side-panel-help-icon" title="Skills learned from your successful problem-solving sessions. Promote to make them permanent." />
            </h4>

            {loading ? (
              <div className="side-panel-loading"><span>Loading...</span></div>
            ) : pendingSkills.length === 0 ? (
              <div className="side-panel-empty">
                <Brain className="side-panel-empty-icon" />
                <p>No auto-skills generated yet</p>
                <button onClick={triggerLearning} className="side-panel-btn-primary" disabled={loading} style={{marginTop: 12}}>
                  <Lightbulb style={{width: 16, height: 16}} /> Analyze Conversations
                </button>
              </div>
            ) : (
              <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
                {pendingSkills.map(skill => (
                  <div key={skill.id} style={{background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, padding: 16}}>
                      <div style={{flex: 1, minWidth: 0}}>
                        <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap'}}>
                          <span style={{fontWeight: 600, fontSize: 15, color: 'var(--text-primary)'}}>{skill.name}</span>
                          <span style={{fontSize: 12, fontWeight: 600}}>
                            Confidence: {formatConfidence(skill.confidence)}
                          </span>
                        </div>
                        <div style={{fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8}}>{skill.description}</div>
                        <div style={{display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 11, color: 'var(--text-muted)', marginBottom: 8}}>
                          <span>Source: Conversation {skill.sourceConversation?.slice(-8)}</span>
                          <span>Tools: {skill.tools?.slice(0, 5).join(', ')}{skill.tools?.length > 5 ? '...' : ''}</span>
                          <span>{new Date(skill.createdAt).toLocaleString()}</span>
                        </div>
                        <div style={{fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 4}}>
                          <strong>System:</strong> {skill.system?.slice(0, 200)}...
                        </div>
                        <div style={{fontSize: 11, color: 'var(--text-muted)'}}>
                          <strong>Starters:</strong> {skill.starters?.slice(0, 2).join('; ')}
                        </div>
                      </div>
                      <div style={{display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0}}>
                        <button onClick={() => promoteSkill(skill.id)} disabled={loading} className="side-panel-btn-primary" style={{background: '#a855f7', padding: '8px 12px', fontSize: 12}} title="Promote to permanent skill">
                          <ArrowUp style={{width: 14, height: 14}} /> Promote
                        </button>
                        {confirmDismissId === skill.id ? (
                          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button className="side-panel-btn-small" style={{borderColor: '#f87171', color: '#f87171'}} onClick={() => dismissSkill(skill.id)}>Yes</button>
                            <button className="side-panel-btn-small" onClick={() => setConfirmDismissId(null)}>No</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmDismissId(skill.id)} className="side-panel-btn-small" style={{borderColor: '#f87171', color: '#f87171'}} title="Dismiss">
                            <Trash2 style={{width: 14, height: 14}} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default AutoSkillsPanel