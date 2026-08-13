import React from 'react'
import { Modal } from './Modal'
import { Download, Monitor, Smartphone, Check } from 'lucide-react'

export function DownloadModal({ isOpen, onClose, onInstallPwa, showPwa }) {
  if (!isOpen) return null

  // GitHub release download URL or fallback installer download link
  const desktopExeUrl = 'https://github.com/yogatik/yogatik/releases/latest/download/Yogatik-Setup.exe'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Get Yogatik App">
      <div className="download-modal-body" style={{ padding: '4px 0' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24, lineHeight: 1.5 }}>
          Choose your platform to install Yogatik. Download the Desktop app for full local folder access and offline AI, or install the lightweight Web App (PWA).
        </p>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
          gap: 20, 
          marginBottom: 20,
          alignItems: 'stretch' 
        }}>
          {/* Windows Desktop App Card */}
          <div style={{
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--accent)',
            borderRadius: 12,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}>
            <span style={{
              position: 'absolute',
              top: -10,
              right: 20,
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 10,
              textTransform: 'uppercase',
            }}>Recommended</span>
            
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <Monitor size={24} style={{ color: 'var(--accent)' }} />
                <div>
                  <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Desktop App (Windows)</h4>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Yogatik-Setup.exe · Electron</span>
                </div>
              </div>
              <ul style={{ margin: '16px 0', paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <li><strong style={{ color: 'var(--text-primary)' }}>Full Local Folder & Terminal Access:</strong> Read, write, search, edit files & execute terminal commands locally.</li>
                <li><strong style={{ color: 'var(--text-primary)' }}>AI Model Tracing & Attribution:</strong> See exact model tags, reasoning thoughts & step-by-step tool actions.</li>
                <li><strong style={{ color: 'var(--text-primary)' }}>Non-Blocking Multi-Tasking:</strong> High-performance async I/O keeps UI fluid during heavy tasks.</li>
              </ul>
            </div>

            <a
              href={desktopExeUrl}
              download="Yogatik-Setup.exe"
              className="btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '12px 16px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                color: '#fff',
                textDecoration: 'none',
                marginTop: 16,
                cursor: 'pointer',
              }}
            >
              <Download size={18} /> Download Yogatik.exe
            </a>
          </div>

          {/* Web App PWA Card */}
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <Smartphone size={24} style={{ color: 'var(--text-primary)' }} />
                <div>
                  <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Progressive Web App (PWA)</h4>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Browser · Instant Install</span>
                </div>
              </div>
              <ul style={{ margin: '16px 0', paddingLeft: 18, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <li><strong style={{ color: 'var(--text-primary)' }}>Instant Access:</strong> Runs in Chrome, Edge, Brave, and mobile browsers.</li>
                <li><strong style={{ color: 'var(--text-primary)' }}>Zero Download:</strong> Works directly in the browser with local storage.</li>
                <li><strong style={{ color: 'var(--text-primary)' }}>Home Screen Shortcut:</strong> Add to taskbar or mobile home screen.</li>
              </ul>
            </div>

            {showPwa ? (
              <button
                className="small-btn"
                onClick={() => { onInstallPwa(); onClose() }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '12px 16px',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  marginTop: 16,
                  cursor: 'pointer',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
              >
                <Smartphone size={18} /> Install Web App (PWA)
              </button>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0', marginTop: 16 }}>
                <Check size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} /> Running in browser / installed
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
