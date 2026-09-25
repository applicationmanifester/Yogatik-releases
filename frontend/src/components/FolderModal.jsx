import React from 'react'
import { Folder } from 'lucide-react'
import { Modal } from './Modal'

/**
 * Folder Assignment Modal — organize a conversation into a folder.
 *
 * Extracted verbatim from App.jsx; gated at the render site there via
 * `{folderModalConv && <FolderModal ... />}` plus a defensive early-return here.
 *
 * Props:
 *  - conv:        { idx, conv, folder } snapshot driving the modal (null = closed)
 *  - onChange:    setter for that snapshot (same contract as setFolderModalConv)
 *  - allFolders:  every known folder name ("Existing Folders" chip list)
 *  - setConvFolder(idx, folder): commits the folder for conversation idx
 *  - showToast(msg): toast helper
 */
export function FolderModal({ conv, onChange, allFolders = [], setConvFolder, showToast }) {
  if (!conv) return null
  return (
        <Modal
          title="Organize Chat into Folder"
          icon={<Folder size={18} />}
          onClose={() => onChange(null)}
        >
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
              Assign <strong>"{conv.conv?.title || 'this chat'}"</strong> to a folder for easy categorization.
            </p>

            {allFolders.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                  Existing Folders:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {allFolders.map(f => (
                    <button
                      key={f}
                      type="button"
                      className="small-btn"
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        background: conv.folder === f ? 'var(--accent, #6366f1)' : 'rgba(255,255,255,0.06)',
                        color: conv.folder === f ? '#fff' : 'inherit',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                      }}
                      onClick={() => onChange(prev => ({ ...prev, folder: f }))}
                    >
                      <Folder size={12} /> {f}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                Folder Name:
              </label>
              <input
                type="text"
                autoFocus
                placeholder="e.g. Work, Research, Personal, Projects..."
                value={conv.folder || ''}
                onChange={e => onChange(prev => ({ ...prev, folder: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    setConvFolder(conv.idx, conv.folder)
                    showToast(conv.folder ? `Moved to folder "${conv.folder}"` : 'Folder cleared')
                    onChange(null)
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  background: 'var(--bg-input, rgba(255,255,255,0.05))',
                  border: '1px solid var(--border, rgba(255,255,255,0.15))',
                  borderRadius: '6px',
                  color: 'var(--text-primary, inherit)',
                  fontSize: '13px',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginTop: '6px' }}>
              {conv.conv?.folder && (
                <button
                  type="button"
                  className="small-btn"
                  style={{ color: '#ff6b6b' }}
                  onClick={() => {
                    setConvFolder(conv.idx, null)
                    showToast('Folder cleared')
                    onChange(null)
                  }}
                >
                  Clear Folder
                </button>
              )}
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
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
                    setConvFolder(conv.idx, conv.folder)
                    showToast(conv.folder ? `Moved to folder "${conv.folder}"` : 'Folder cleared')
                    onChange(null)
                  }}
                >
                  Save Folder
                </button>
              </div>
            </div>
          </div>
        </Modal>
  )
}
