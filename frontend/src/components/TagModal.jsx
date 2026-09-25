import React from 'react'
import { Tag, X } from 'lucide-react'
import { Modal } from './Modal'

/**
 * Tag Assignment Modal — manage label-based tags on a conversation.
 *
 * Extracted verbatim from App.jsx; gated at the render site there via
 * `{tagModalConv && <TagModal ... />}` plus a defensive early-return here.
 *
 * Props:
 *  - conv:     { idx, conv, tags } snapshot driving the modal (null = closed)
 *  - onChange: setter for that snapshot (same contract as setTagModalConv)
 *  - allTags:  every known tag across chats ("Add from Existing Tags" list)
 *  - setConvTags(idx, tags): commits tags for conversation idx
 *  - showToast(msg): toast helper
 */
export function TagModal({ conv, onChange, allTags = [], setConvTags, showToast }) {
  if (!conv) return null
  return (
        <Modal
          title="Manage Chat Tags"
          icon={<Tag size={18} />}
          onClose={() => onChange(null)}
        >
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
              Tag <strong>"{conv.conv?.title || 'this chat'}"</strong> for quick label-based filtering.
            </p>

            {/* Current active tags on this conversation */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Active Tags:
              </label>
              {(conv.tags || []).length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  No tags added yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {(conv.tags || []).map(t => (
                    <span
                      key={t}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        borderRadius: '12px',
                        background: 'var(--accent, #6366f1)',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      #{t}
                      <button
                        type="button"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#fff',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                        onClick={() => {
                          onChange(prev => ({
                            ...prev,
                            tags: (prev.tags || []).filter(x => x !== t),
                          }))
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Suggested existing tags from other chats */}
            {allTags.filter(t => !(conv.tags || []).includes(t)).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                  Add from Existing Tags:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {allTags
                    .filter(t => !(conv.tags || []).includes(t))
                    .map(t => (
                      <button
                        key={t}
                        type="button"
                        className="small-btn"
                        style={{
                          padding: '3px 8px',
                          fontSize: '11px',
                          borderRadius: '12px',
                          background: 'rgba(255,255,255,0.06)',
                          border: '1px solid var(--border)',
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          onChange(prev => ({
                            ...prev,
                            tags: [...(prev.tags || []), t],
                          }))
                        }}
                      >
                        + #{t}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Input to add new tags */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Add New Tag:
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  id="new-tag-input"
                  type="text"
                  placeholder="e.g. priority, ai, draft, bug, feature..."
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      const val = e.target.value.trim().replace(/^#/, '')
                      if (val && !(conv.tags || []).includes(val)) {
                        onChange(prev => ({
                          ...prev,
                          tags: [...(prev.tags || []), val],
                        }))
                        e.target.value = ''
                      }
                    }
                  }}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    background: 'var(--bg-input, rgba(255,255,255,0.05))',
                    border: '1px solid var(--border, rgba(255,255,255,0.15))',
                    borderRadius: '6px',
                    color: 'var(--text-primary, inherit)',
                    fontSize: '13px',
                  }}
                />
                <button
                  type="button"
                  className="small-btn btn-primary"
                  onClick={() => {
                    const inputEl = document.getElementById('new-tag-input')
                    const val = inputEl?.value.trim().replace(/^#/, '')
                    if (val && !(conv.tags || []).includes(val)) {
                      onChange(prev => ({
                        ...prev,
                        tags: [...(prev.tags || []), val],
                      }))
                      if (inputEl) inputEl.value = ''
                    }
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
              <button
                type="button"
                className="small-btn"
                onClick={() => onChange(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="small-btn btn-primary"
                onClick={() => {
                  setConvTags(conv.idx, conv.tags || [])
                  showToast('Tags updated')
                  onChange(null)
                }}
              >
                Save Tags
              </button>
            </div>
          </div>
        </Modal>
  )
}
